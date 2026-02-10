import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { pipeline } from '@xenova/transformers';
import { WaveFile } from 'wavefile';
import dotenv from 'dotenv';
import { TranscriptionEvent } from '@voicex/shared';

dotenv.config();

const app = express();
const port = process.env.PORT || 3002;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'stt-service-whisper' });
});

const server = app.listen(port, () => {
  console.log(`STT Service (Whisper) listening on port ${port}`);
});

// STT Pipeline using Xenova Transformers (Pure JS/Wasm Whisper)
const TARGET_MODEL = 'Xenova/whisper-tiny.en';
let transcriber: any = null;

(async () => {
  console.log(`Loading Whisper model: ${TARGET_MODEL}...`);
  // 'automatic-speech-recognition' task
  transcriber = await pipeline('automatic-speech-recognition', TARGET_MODEL);
  console.log('Whisper model loaded successfully');
})();


const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected to STT Service');

  // We will accumulate audio chunks here and process them periodically or on silence detection
  // For MVP, we can just process chunks as they come if they represent complete phrases,
  // but typically streaming requires buffering.
  // Let's implement a simple buffering strategy: Transcribe every ~3 seconds of audio or when buffer is full.

  let audioBuffer: number[] = [];
  const SAMPLE_RATE = 16000;
  const CHUNK_DURATION_SEC = 3;
  const BUFFER_LIMIT = SAMPLE_RATE * CHUNK_DURATION_SEC;

  ws.on('message', async (message: Buffer) => {
    if (!transcriber) return;

    // Message is likely raw PCM 16-bit mono 16kHz from Audio Gateway
    // Only if it is binary
    if (Buffer.isBuffer(message)) {
      // Convert Buffer (Int16) to Float32 [-1, 1] for Transformers.js
      // Convert Buffer (Int16 LE) to Float32 [-1, 1] for Transformers.js
      // Safer way via readInt16LE to handle offset/endianness correctly
      for (let i = 0; i < message.byteLength; i += 2) {
        // Only read if we have 2 bytes available
        if (i + 1 < message.byteLength) {
          const int16 = message.readInt16LE(i);
          audioBuffer.push(int16 / 32768.0);
        }
      }

      console.log(`STT Buffer: ${audioBuffer.length} / ${BUFFER_LIMIT}`);

      // If buffer is large enough, transcribe
      if (audioBuffer.length >= BUFFER_LIMIT) {
        console.log('STT Buffer full, transcribing...');
        const inputAudio = new Float32Array(audioBuffer);
        audioBuffer = []; // Clear buffer immediately to capture next phrase

        // Compute RMS to check for silence
        let sumSq = 0;
        for (let i = 0; i < inputAudio.length; i++) sumSq += inputAudio[i] * inputAudio[i];
        const rms = Math.sqrt(sumSq / inputAudio.length);
        console.log(`Audio RMS: ${rms}`);

        if (rms < 0.01) {
          console.log('Audio is too quiet, skipping transcription (Silence)');
          return;
        }

        // Run inference
        try {
          console.log('Running pipeline inference...');
          // pipeline expects Float32Array suitable for 16kHz
          const output = await transcriber(inputAudio, {
            chunk_length_s: 30, // Whisper works on 30s chunks ideally
            stride_length_s: 5,
            language: 'english',
            task: 'transcribe',
            return_timestamps: false
          });

          const text = output.text;
          console.log('text:', text)
          if (text && text.trim().length > 0) {
            const event: TranscriptionEvent = {
              session_id: 'unknown',
              text: text.trim(),
              is_final: true, // In this simple chunking, we treat each inference as final for that chunk
              confidence: 1.0
            };
            ws.send(JSON.stringify({ type: 'transcript', ...event }));
          }
        } catch (err) {
          console.error('Transcription Error', err);
        }
      }
    }
  });

  ws.on('close', async () => {
    console.log('Client disconnected');

    if (transcriber && audioBuffer.length > 0) {
      console.log(`Flushing remaining ${audioBuffer.length} samples...`);
      const inputAudio = new Float32Array(audioBuffer);

      let sumSq = 0;
      for (let i = 0; i < inputAudio.length; i++) sumSq += inputAudio[i] * inputAudio[i];
      const rms = Math.sqrt(sumSq / inputAudio.length);
      console.log(`Flush Audio RMS: ${rms}`);

      try {
        const output = await transcriber(inputAudio, {
          chunk_length_s: 30,
          stride_length_s: 5,
          language: 'english',
          task: 'transcribe',
          return_timestamps: false
        });

        console.log('Flush Output Raw:', JSON.stringify(output));
        const text = output.text;
        if (text && text.trim().length > 0) {
          console.log('Final Flush Transcript:', text.trim());
        } else {
          console.warn('Final Flush Transcript EMPTY');
        }
      } catch (err) {
        console.error('Flush Transcription Error', err);
      }
    }
    audioBuffer = [];
  });
});
