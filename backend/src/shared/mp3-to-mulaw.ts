import { spawn } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const ffmpegPath: string = require("ffmpeg-static");

/**
 * Convert MP3 buffer to mu-law 8kHz mono (for Twilio).
 */
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
