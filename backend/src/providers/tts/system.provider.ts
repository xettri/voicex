import { execFile } from 'child_process';
import { readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createLogger } from '../../shared/logger.js';
import type { TTSProvider } from './tts.interface.js';

const logger = createLogger('SystemTTS');

/**
 * Generic system TTS using a configurable shell command.
 * Examples:
 *   macOS: say,-o,{out},--data-format=LEF32@22050,{text}  (ext: wav)
 *   Linux: espeak,-w,{out},{text}  (ext: wav)
 */
export interface SystemTTSConfig {
  /** Comma-separated args: cmd,arg1,arg2,... Use {out} for output path, {text} for text. */
  cmd: string;
  /** Output file extension (aiff, wav, etc.) */
  ext: string;
}

export function createSystemTTSProvider(config: SystemTTSConfig): TTSProvider {
  const parts = config.cmd.split(',').map((p) => p.trim());
  if (parts.length < 2 || !parts.includes('{out}') || !parts.includes('{text}')) {
    throw new Error(
      'SYSTEM_TTS_CMD must be comma-separated with {out} and {text} placeholders. Example: say,-o,{out},{text}',
    );
  }

  return {
    async streamAudio(
      text: string,
      onChunk: (audio: ArrayBuffer) => void,
      signal?: AbortSignal,
    ): Promise<void> {
      if (signal?.aborted) return;

      const tmpPath = join(
        tmpdir(),
        `voicex-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.${config.ext}`,
      );
      try {
        const args = parts.slice(1).map((p) => {
          if (p === '{out}') return tmpPath;
          if (p === '{text}') return text;
          return p;
        });

        await new Promise<void>((resolve, reject) => {
          const child = execFile(parts[0], args, (err) => {
            if (err) reject(err);
            else resolve();
          });
          const onAbort = (): void => {
            child.kill('SIGKILL');
            resolve();
          };
          signal?.addEventListener('abort', onAbort, { once: true });
          child.on('exit', () => signal?.removeEventListener('abort', onAbort));
        });

        if (signal?.aborted) return;
        const buf = await readFile(tmpPath);
        logger.info('System TTS done', { bytes: buf.length });
        onChunk(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      } catch (err) {
        if (signal?.aborted) return;
        logger.error('System TTS failed', { err, text: text.slice(0, 50) });
        throw err;
      } finally {
        await unlink(tmpPath).catch(() => {});
      }
    },
  };
}
