
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

// Configuration
const GATEWAY_URL = 'ws://localhost:3001';
const SAMPLE_AUDIO_FILE = path.join(process.cwd(), 'scripts', 'test_audio.wav'); // You need to provide this or I can generate a dummy one

// Helper to get audio data (Real file or Silence)
function getAudioData() {
  if (fs.existsSync(SAMPLE_AUDIO_FILE)) {
    console.log(`Loading audio from ${SAMPLE_AUDIO_FILE}`);
    // Read file and skip 44-byte WAV header to send raw PCM
    const fileBuffer = fs.readFileSync(SAMPLE_AUDIO_FILE);
    if (fileBuffer.length > 44) {
      const rawAudio = fileBuffer.subarray(44);
      // Pad with 1s of silence to allow STT to catch up end of file
      const padding = Buffer.alloc(16000 * 2);
      return Buffer.concat([rawAudio, padding]);
    }
    return fileBuffer;
  }

  console.log('Sample file not found, generating silence...');
  const header = Buffer.alloc(44);
  const duration = 3;
  const sampleRate = 16000;
  const numSamples = duration * sampleRate;
  const buffer = Buffer.alloc(numSamples * 2);
  return buffer;
}


const ws = new WebSocket(GATEWAY_URL);

ws.on('open', () => {
  console.log('Connected to Audio Gateway');

  // 1. Send Session Start
  ws.send(JSON.stringify({ type: 'session_start' }));

  // 2. Simulate Audio Stream
  console.log('Streaming audio...');
  const audioData = getAudioData();

  // Send in chunks
  const chunkSize = 4096;
  for (let i = 0; i < audioData.length; i += chunkSize) {
    const chunk = audioData.subarray(i, i + chunkSize);
    ws.send(chunk);
  }

  // In a real test, you'd want actual speech audio to test STT/LLM response
  console.log('Audio streaming complete (Silence). Expecting valid connection handling but no STT output unless you use real speech file.');
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    console.log('Received:', msg);
    if (msg.type === 'audio_chunk') {
      console.log(`Received Audio Chunk: ${msg.data.slice(0, 20)}...`);
    }
  } catch (e) {
    // Might be binary audio
    if (Buffer.isBuffer(data)) {
      console.log(`Received Binary Data (Buffer): ${data.length} bytes`);
    } else if (Array.isArray(data)) {
      const totalLength = data.reduce((acc, buf) => acc + buf.length, 0);
      console.log(`Received Binary Data (Buffer[]): ${totalLength} bytes`);
    } else {
      // ArrayBuffer
      console.log(`Received Binary Data (ArrayBuffer): ${(data as ArrayBuffer).byteLength} bytes`);
    }
  }
});

ws.on('close', () => console.log('Disconnected'));
ws.on('error', (e) => console.error('Error:', e));
