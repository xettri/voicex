import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
// Mock library import for now or use fetch/axios for real API
// import ElevenLabs from 'elevenlabs-node'; 

dotenv.config();

const app = express();
const port = process.env.PORT || 3004;

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'tts-service' }));

const server = app.listen(port, () => {
  console.log(`TTS Service listening on port ${port}`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  console.log('Orchestrator connected to TTS Service');

  ws.on('message', async (message: string) => {
    try {
      const { text, voiceId, sessionId } = JSON.parse(message.toString());
      console.log(`Synthesizing for session ${sessionId}: ${text}`);

      // TODO: Call ElevenLabs websocket or API stream
      // For MVP, lets mock header and audio data
      // In real impl, we connect to ElevenLabs WS here

      // Mock Audio Chunk
      ws.send(JSON.stringify({
        type: 'audio_chunk',
        sessionId,
        data: 'base64_audio_data_mock' // In reality, sending binary is better for latency
      }));

    } catch (e) {
      console.error('TTS Error', e);
    }
  });
});
