import type { WebSocket } from "ws";
import { createLogger } from "../../shared/logger.js";
import { convertMp3ToMulaw } from "../../shared/mp3-to-mulaw.js";
import type { CallChannel } from "./call.interface.js";

const logger = createLogger("TwilioProvider");

interface TwilioMediaMessage {
  event: "media";
  media: { payload: string; track?: string };
  streamSid: string;
}

interface TwilioStartMessage {
  event: "start";
  start: { streamSid: string; mediaFormat?: { encoding: string; sampleRate: number } };
  streamSid: string;
}

interface TwilioStopMessage {
  event: "stop";
  streamSid: string;
}

function parseTwilioMessage(data: string): TwilioMediaMessage | TwilioStartMessage | TwilioStopMessage | null {
  try {
    const msg = JSON.parse(data) as Record<string, unknown>;
    if (msg.event === "media" && msg.media && typeof (msg.media as Record<string, unknown>).payload === "string") {
      return msg as unknown as TwilioMediaMessage;
    }
    if (msg.event === "start" && msg.streamSid) {
      return msg as unknown as TwilioStartMessage;
    }
    if (msg.event === "stop" && msg.streamSid) {
      return msg as unknown as TwilioStopMessage;
    }
    return null;
  } catch {
    return null;
  }
}

export function createTwilioCallChannel(ws: WebSocket): CallChannel {
  let streamSid: string | null = null;
  let onAudioCb: ((chunk: ArrayBuffer) => void) | null = null;
  let onCloseCb: (() => void) | null = null;
  let closed = false;
  const mp3Buffer: Buffer[] = [];

  const sendMedia = (payloadBase64: string): void => {
    if (closed || !streamSid) return;
    try {
      ws.send(JSON.stringify({ event: "media", streamSid, media: { payload: payloadBase64 } }));
    } catch {
      /* ignore */
    }
  };

  ws.on("message", (data: Buffer) => {
    const msg = parseTwilioMessage(data.toString());
    if (!msg) return;

    if (msg.event === "start") {
      streamSid = msg.streamSid;
      return;
    }

    if (msg.event === "media" && msg.media.track === "inbound") {
      const payload = Buffer.from(msg.media.payload, "base64");
      onAudioCb?.(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength));
      return;
    }

    if (msg.event === "stop") {
      handleClose();
    }
  });

  const handleClose = (): void => {
    if (closed) return;
    closed = true;
    onCloseCb?.();
  };

  ws.on("close", handleClose);
  ws.on("error", () => handleClose());

  return {
    sendAudio(chunk: ArrayBuffer) {
      mp3Buffer.push(Buffer.from(chunk));
    },
    sendAudioStop() {
      mp3Buffer.length = 0;
      // Send clear event to stop Twilio playback
      if (streamSid && !closed) {
        try {
          ws.send(JSON.stringify({ event: "clear", streamSid }));
        } catch { /* ignore */ }
      }
    },
    async sendAudioComplete() {
      if (mp3Buffer.length === 0) return;
      const mp3 = Buffer.concat(mp3Buffer);
      mp3Buffer.length = 0;
      try {
        const mulaw = await convertMp3ToMulaw(mp3);
        const payload = mulaw.toString("base64");
        const chunkSize = 1024;
        for (let i = 0; i < mulaw.length; i += chunkSize) {
          const slice = mulaw.subarray(i, Math.min(i + chunkSize, mulaw.length));
          sendMedia(slice.toString("base64"));
        }
      } catch (err) {
        logger.error("Failed to convert TTS to mulaw", err);
        this.sendError("Audio conversion failed");
      }
    },
    sendTranscript(_text, _isFinal, _role?) {
      /* Twilio doesn't support transcript in stream; skip */
    },
    sendError(message) {
        logger.info("Twilio error", { message });
      /* Twilio stream has no error message type; we log */
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
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      onCloseCb?.();
    },
  };
}
