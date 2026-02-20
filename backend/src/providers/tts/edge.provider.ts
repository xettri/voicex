import { MsEdgeTTS, OUTPUT_FORMAT } from 'edge-tts-node';
import type { TTSProvider } from './tts.interface.js';

const VOICE = 'en-US-AriaNeural';

export function createEdgeTTSProvider(): TTSProvider {
  return {
    async streamAudio(
      text: string,
      onChunk: (audio: ArrayBuffer) => void,
      signal?: AbortSignal,
    ): Promise<void> {
      if (signal?.aborted) return;

      const tts = new MsEdgeTTS({});
      await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const readable = tts.toStream(text);

      const onAbort = (): void => {
        readable.destroy();
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      return new Promise<void>((resolve, reject) => {
        readable.on('data', (chunk: Buffer) => {
          if (signal?.aborted) return;
          const arr = new Uint8Array(chunk);
          onChunk(arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength));
        });
        readable.on('end', () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        });
        readable.on('error', (err: Error) => {
          signal?.removeEventListener('abort', onAbort);
          if (signal?.aborted) resolve();
          else reject(err);
        });
        readable.on('close', () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        });
      });
    },
  };
}
