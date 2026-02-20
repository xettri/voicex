import { spawn, type ChildProcess } from "child_process";
import { createRequire } from "module";
import { createLogger } from "./logger.js";

const require = createRequire(import.meta.url);
const ffmpegPath: string = require("ffmpeg-static");
const logger = createLogger("Mp3ToMulaw");

export function convertMp3ToMulaw(mp3Buffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const ff = spawn(ffmpegPath, [
      "-loglevel", "error",
      "-i", "pipe:0",
      "-acodec", "pcm_mulaw",
      "-ar", "8000",
      "-ac", "1",
      "-f", "mulaw",
      "pipe:1",
    ], { stdio: ["pipe", "pipe", "ignore"] });

    ff.stdin.on("error", reject);
    ff.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    ff.stdout.on("end", () => resolve(Buffer.concat(chunks)));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code !== 0) reject(new Error(`ffmpeg exited with ${code}`));
    });

    ff.stdin.write(mp3Buffer);
    ff.stdin.end();
  });
}

export interface StreamingMulawConverter {
  write(mp3Chunk: Buffer): void;
  end(): void;
  destroy(): void;
}

export function createStreamingMulawConverter(
  onMulawChunk: (chunk: Buffer) => void,
  onEnd: () => void,
  onError: (err: Error) => void
): StreamingMulawConverter {
  let ff: ChildProcess | null = null;
  let destroyed = false;

  try {
    ff = spawn(ffmpegPath, [
      "-loglevel", "error",
      "-f", "mp3",
      "-i", "pipe:0",
      "-acodec", "pcm_mulaw",
      "-ar", "8000",
      "-ac", "1",
      "-f", "mulaw",
      "pipe:1",
    ], { stdio: ["pipe", "pipe", "ignore"] });
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
    return { write() {}, end() {}, destroy() {} };
  }

  ff.stdout!.on("data", (chunk: Buffer) => {
    if (!destroyed) onMulawChunk(chunk);
  });

  ff.stdout!.on("end", () => {
    if (!destroyed) onEnd();
  });

  ff.on("error", (err) => {
    if (!destroyed) onError(err);
  });

  ff.on("close", (code) => {
    if (!destroyed && code !== 0 && code !== null) {
      logger.error("Streaming ffmpeg exited", { code });
    }
  });

  ff.stdin!.on("error", () => {});

  return {
    write(mp3Chunk: Buffer) {
      if (destroyed || !ff?.stdin?.writable) return;
      try {
        ff.stdin.write(mp3Chunk);
      } catch {
        /* ignore */
      }
    },
    end() {
      if (destroyed || !ff?.stdin?.writable) return;
      try {
        ff.stdin.end();
      } catch {
        /* ignore */
      }
    },
    destroy() {
      destroyed = true;
      try {
        ff?.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    },
  };
}
