import express from 'express';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { SessionState, Message } from '@voicex/shared';

dotenv.config();

const app = express();
const port = process.env.PORT || 3005;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const LLM_SERVICE_URL = process.env.LLM_SERVICE_URL || 'http://localhost:3003';
const TTS_SERVICE_URL = process.env.TTS_SERVICE_URL || 'ws://localhost:3004';

// Redis Client
const redisClient = createClient({ url: REDIS_URL });
redisClient.on('error', (err) => console.log('Redis Client Error', err));

(async () => {
  if (process.env.USE_REDIS === 'true') {
    await redisClient.connect();
    console.log('Connected to Redis');
  }
})();

// Active Sessions Map (SessionID -> Gateway WebSocket)
const sessions: Map<string, WebSocket> = new Map();

// TTS Client (Shared Connection)
let ttsClient: WebSocket;

function connectToTTS() {
  ttsClient = new WebSocket(TTS_SERVICE_URL);

  ttsClient.on('open', () => {
    console.log('Connected to TTS Service');
  });

  ttsClient.on('message', (data: RawData) => {
    try {
      const message = JSON.parse(data.toString());
      // Expected: { type: 'audio_chunk', sessionId: '...', data: '...' }
      if (message.type === 'audio_chunk' && message.sessionId) {
        const gatewayWs = sessions.get(message.sessionId);
        if (gatewayWs && gatewayWs.readyState === WebSocket.OPEN) {
          gatewayWs.send(JSON.stringify(message));
        }
      }
    } catch (e) {
      console.error('Error handling TTS message', e);
    }
  });

  ttsClient.on('close', () => {
    console.log('TTS Connection Closed. Reconnecting in 1s...');
    setTimeout(connectToTTS, 1000);
  });

  ttsClient.on('error', (err) => {
    console.error('TTS Client Error', err);
  });
}

connectToTTS();

const server = app.listen(port, () => {
  console.log(`Orchestrator Service listening on port ${port}`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  let currentSessionId: string | null = null;
  console.log('Gateway connected to Orchestrator');

  ws.on('message', async (message: RawData) => {
    try {
      const event = JSON.parse(message.toString());

      if (event.type === 'session_start') {
        const sessionId = event.sessionId || uuidv4();
        currentSessionId = sessionId;
        sessions.set(sessionId, ws);

        console.log(`Session ${sessionId} registered`);
        ws.send(JSON.stringify({ type: 'session_created', sessionId }));
      }
      else if (event.type === 'user_transcript') {
        const { sessionId, text, isFinal } = event;
        console.log(`[${sessionId}] User: ${text} (Final: ${isFinal})`);

        if (isFinal) {
          // 1. Call LLM (Stream)
          // messages = getHistory(sessionId) + user message
          // For MVP, just send user message

          try {
            const response = await fetch(`${LLM_SERVICE_URL}/chat/completions/stream`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: [{ role: 'user', content: text }],
                model: 'gpt-4o-mini'
              })
            });

            if (!response.body) return;

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value);
              // Log raw SSE chunk
              // console.log('LLM Chunk:', chunk);

              // Parse SSE (data: "...")
              const lines = chunk.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.slice(6);
                  if (jsonStr === '[DONE]') break;
                  try {
                    const json = JSON.parse(jsonStr);
                    const content = json.content;
                    if (content) {
                      buffer += content;
                      // Check for sentence end
                      if (content.match(/[.!?]/)) {
                        console.log(`[${sessionId}] Sending Sentence to TTS: ${buffer}`);
                        // Send to TTS
                        if (ttsClient.readyState === WebSocket.OPEN) {
                          ttsClient.send(JSON.stringify({
                            text: buffer,
                            voiceId: 'default',
                            sessionId
                          }));
                        }
                        buffer = '';
                      }
                    }
                  } catch (e) { }
                }
              }
            }
            // Send remaining buffer
            if (buffer.trim()) {
              console.log(`[${sessionId}] Sending Remaining to TTS: ${buffer}`);
              if (ttsClient.readyState === WebSocket.OPEN) {
                ttsClient.send(JSON.stringify({
                  text: buffer,
                  voiceId: 'default',
                  sessionId
                }));
              }
            }

          } catch (llmError) {
            console.error('LLM Request Error', llmError);
          }
        }
      }

    } catch (e) {
      console.error('Orchestrator Message Error', e);
    }
  });

  ws.on('close', () => {
    if (currentSessionId) {
      console.log(`Session ${currentSessionId} disconnected`);
      sessions.delete(currentSessionId);
    }
  });
});
