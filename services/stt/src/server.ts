import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3002;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'stt-service' });
});

const server = app.listen(port, () => {
  console.log(`STT Service listening on port ${port}`);
});

// Deepgram Client
const deepgram = createClient(process.env.DEEPGRAM_API_KEY || '');

// WebSocket Server for Internal Audio Streaming
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  console.log('Orchestrator/Gateway connected to STT Service');

  let deepgramLive: any = null;

  try {
    deepgramLive = deepgram.listen.live({
      model: 'nova-2',
      language: 'en-US',
      smart_format: true,
      interim_results: true,
      punctuate: true,
      encoding: 'linear16',
      sample_rate: 16000,
    }); // check SDK docs for correct usage

    // Listen for open event
    deepgramLive.on(LiveTranscriptionEvents.Open, () => {
      console.log('Connected to Deepgram');
    });

    deepgramLive.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      const transcript = data.channel.alternatives[0].transcript;
      if (transcript && data.is_final) {
        console.log('Final Transcript:', transcript);
        // Send back to client
        ws.send(JSON.stringify({ type: 'transcript', text: transcript, is_final: true }));
      } else if (transcript) {
        // Partial
        ws.send(JSON.stringify({ type: 'transcript', text: transcript, is_final: false }));
      }
    });

    deepgramLive.on(LiveTranscriptionEvents.Error, (err: any) => {
      console.error('Deepgram Error:', err);
    });

    deepgramLive.on(LiveTranscriptionEvents.Close, () => {
      console.log('Deepgram connection closed');
    });

  } catch (e) {
    console.error('Failed to start Deepgram stream', e);
    ws.close();
    return;
  }

  ws.on('message', (message: Buffer) => {
    // Forward audio to Deepgram
    if (deepgramLive && deepgramLive.getReadyState() === 1) { // 1 = OPEN
      deepgramLive.send(message);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from STT Service');
    if (deepgramLive) {
      deepgramLive.finish();
    }
  });
});
