import express from 'express';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { SessionState, AudioChunk } from '@voicex/shared';

dotenv.config();

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'audio-gateway' });
});

const server = app.listen(port, () => {
  console.log(`Audio Gateway listening on port ${port}`);
});

// WebSocket Server for Audio Streaming
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket, req) => {
  const sessionId = uuidv4();
  console.log(`New client connected. Session ID: ${sessionId}`);

  // Basic session initialization (In reality, this would fetch from Orchestrator)
  const session: SessionState = {
    session_id: sessionId,
    workspace_id: 'default-workspace', // TODO: Extract from auth/headers
    language: 'en',
    conversation_history: [],
    active_kb_ids: [],
    plan: 'free',
  };

  // Connect to downstream services
  const sttWs = new WebSocket(`ws://localhost:${process.env.STT_PORT || 3002}`);
  const orchWs = new WebSocket(`ws://localhost:${process.env.ORCHESTRATOR_PORT || 3005}`);

  const active = {
    stt: false,
    orch: false
  };

  sttWs.on('open', () => {
    console.log(`Session ${sessionId} connected to STT`);
    active.stt = true;
  });

  orchWs.on('open', () => {
    console.log(`Session ${sessionId} connected to Orchestrator`);
    active.orch = true;
    // Initialize Session
    orchWs.send(JSON.stringify({
      type: 'session_start',
      sessionId,
      workspaceId: session.workspace_id
    }));
  });

  // Handle messages from STT (Transcripts)
  sttWs.on('message', (data: Buffer) => {
    const event = JSON.parse(data.toString());
    if (event.type === 'transcript') {
      // Forward to Orchestrator
      if (active.orch) {
        orchWs.send(JSON.stringify({
          type: 'user_transcript',
          sessionId,
          text: event.text,
          isFinal: event.is_final
        }));
      }
    }
  });

  // Handle messages from Orchestrator (TTS Audio / Control)
  orchWs.on('message', (data: Buffer) => {
    const event = JSON.parse(data.toString());

    if (event.type === 'audio_chunk') {
      // Forward audio to client
      ws.send(event.data); // Assuming pre-encoded or raw buffer
    } else if (event.type === 'control') {
      // Handle control messages (e.g. session end)
    }
  });

  ws.on('message', (activeMessage: RawData) => {
    // Check if it's a control message (JSON)
    let message: Buffer;
    if (Buffer.isBuffer(activeMessage)) {
      message = activeMessage;
    } else if (Array.isArray(activeMessage)) {
      message = Buffer.concat(activeMessage);
    } else {
      message = Buffer.from(activeMessage as ArrayBuffer);
    }

    const isBuffer = true; // We converted it to buffer above

    // Simple heuristic: If it looks like JSON, it might be control. 
    // But for now, let's assume if it parses as JSON object it is control.
    try {
      const text = message.toString();
      if (text.trim().startsWith('{')) {
        console.log(`Received control: ${text}`);
        if (active.orch) orchWs.send(message);
        return;
      }
    } catch (e) { }

    // It's audio data -> Forward to STT
    if (active.stt) {
      sttWs.send(message);
    }
  });

  ws.on('close', () => {
    console.log(`Session ${sessionId} closed`);
    if (sttWs.readyState === WebSocket.OPEN) sttWs.close();
    if (orchWs.readyState === WebSocket.OPEN) orchWs.close();
  });
});
