import type { WebSocket, RawData } from 'ws';
import { parseClientMessage } from '../../shared/ws-types.js';
import type { CallChannel } from './call.interface.js';

const STREAM_CHUNK_SIZE = 4096;

export function createWebSocketCallChannel(ws: WebSocket): CallChannel {
  let onAudioCb: ((chunk: ArrayBuffer) => void) | null = null;
  let onCloseCb: (() => void) | null = null;
  let closed = false;
  let audioBuffer: Buffer[] = [];
  let bufferedBytes = 0;

  const sendJson = (data: unknown): void => {
    if (closed) return;
    try {
      ws.send(JSON.stringify(data));
    } catch {
      /* ignore */
    }
  };

  const sendBinary = (data: Buffer): void => {
    if (closed) return;
    try {
      ws.send(data, { binary: true });
    } catch {
      /* ignore */
    }
  };

  const flushAudioBuffer = (): void => {
    if (audioBuffer.length === 0) return;
    const combined = Buffer.concat(audioBuffer);
    audioBuffer = [];
    bufferedBytes = 0;
    sendBinary(combined);
  };

  ws.on('message', (data: RawData, isBinary: boolean) => {
    if (isBinary) {
      const buf = Buffer.from(data as Buffer);
      const ab = new ArrayBuffer(buf.byteLength);
      new Uint8Array(ab).set(buf);
      onAudioCb?.(ab);
      return;
    }
    const msg = parseClientMessage(data.toString());
    if (!msg) {
      sendJson({ type: 'error', payload: { message: 'Invalid message' } });
      return;
    }
    if (msg.type === 'audio') {
      const binary = Uint8Array.from(atob(msg.payload), (c) => c.charCodeAt(0));
      onAudioCb?.(binary.buffer);
    } else if (msg.type === 'ping') {
      sendJson({ type: 'pong', timestamp: Date.now() });
    }
  });

  const handleClose = (): void => {
    if (closed) return;
    closed = true;
    audioBuffer = [];
    bufferedBytes = 0;
    onCloseCb?.();
  };

  ws.on('close', handleClose);
  ws.on('error', () => handleClose());

  return {
    sendAudio(chunk: ArrayBuffer) {
      audioBuffer.push(Buffer.from(chunk));
      bufferedBytes += chunk.byteLength;
      if (bufferedBytes >= STREAM_CHUNK_SIZE) {
        flushAudioBuffer();
      }
    },
    sendAudioComplete() {
      flushAudioBuffer();
      sendJson({ type: 'audioEnd' });
    },
    sendAudioStop() {
      audioBuffer = [];
      bufferedBytes = 0;
      sendJson({ type: 'audioStop' });
    },
    sendTranscript(text, isFinal, role) {
      sendJson({
        type: 'transcript',
        payload: { text, isFinal, timestamp: Date.now(), role: role ?? 'user' },
      });
    },
    sendError(message) {
      sendJson({ type: 'error', payload: { message } });
    },
    onAudio(cb) {
      onAudioCb = cb;
    },
    onClose(cb) {
      onCloseCb = cb;
    },
    close() {
      if (closed) return;
      closed = true;
      audioBuffer = [];
      bufferedBytes = 0;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      onCloseCb?.();
    },
  };
}
