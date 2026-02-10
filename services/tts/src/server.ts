
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import say from 'say';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { AudioChunk } from '@voicex/shared';

dotenv.config();

const app = express();
const port = process.env.PORT || 3004;
const TEMP_DIR = path.join(__dirname, 'temp_audio');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'tts-service-say' }));

const server = app.listen(port, () => {
  console.log(`TTS Service (Say.js) listening on port ${port}`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  console.log('Orchestrator connected to TTS Service');

  ws.on('message', async (message: string) => {
    try {
      const { text, voiceId, sessionId } = JSON.parse(message.toString());
      console.log(`Synthesizing for session ${sessionId}: ${text}`);

      const tempFile = path.join(TEMP_DIR, `${uuidv4()}.wav`);

      // Use 'say' to export to WAV
      // Note: 'say' on macOS exports aiff by default unless specified. 
      // We'll export to aiff then convert or just send raw bytes.
      // Let's rely on say.export(text, voice, speed, filename, callback)

      say.export(text, voiceId || 'Samantha', 1.0, tempFile, (err) => {
        if (err) {
          console.error('Say Export Error:', err);
          return;
        }

        fs.readFile(tempFile, (readErr, data) => {
          if (readErr) {
            console.error('Read Error', readErr);
            return;
          }

          // Send Audio Chunk
          const audioChunk: AudioChunk = {
            session_id: sessionId,
            data: data.toString('base64'),
            timestamp: Date.now()
          };

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'audio_chunk',
              sessionId,
              data: data.toString('base64')
            }));
          }

          // Cleanup
          fs.unlink(tempFile, () => { });
        });
      });

    } catch (e) {
      console.error('TTS Error', e);
    }
  });
});
