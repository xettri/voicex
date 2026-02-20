import type { WebSocket } from "ws";
import { createLogger } from "../../shared/logger.js";
import { createStreamingMulawConverter, type StreamingMulawConverter } from "../../shared/mp3-to-mulaw.js";
import type { CallChannel } from "./call.interface.js";

const logger = createLogger("TwilioProvider");
const MULAW_CHUNK_SIZE = 640;

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
  let converter: StreamingMulawConverter | null = null;
  let markCounter = 0;

  const sendMedia = (payloadBase64: string): void => {
    if (closed || !streamSid) return;
    try {
      ws.send(JSON.stringify({ event: "media", streamSid, media: { payload: payloadBase64 } }));
    } catch {
      /* ignore */
    }
  };

  const sendMark = (): void => {
    if (closed || !streamSid) return;
    markCounter++;
    try {
      ws.send(JSON.stringify({ event: "mark", streamSid, mark: { name: `sent-${markCounter}` } }));
    } catch {
      /* ignore */
    }
  };

  const destroyConverter = (): void => {
    if (converter) {
      converter.destroy();
      converter = null;
    }
  };

  const ensureConverter = (): StreamingMulawConverter => {
    if (converter) return converter;

    converter = createStreamingMulawConverter(
      (mulawChunk) => {
        for (let i = 0; i < mulawChunk.length; i += MULAW_CHUNK_SIZE) {
          const slice = mulawChunk.subarray(i, Math.min(i + MULAW_CHUNK_SIZE, mulawChunk.length));
          sendMedia(slice.toString("base64"));
        }
      },
      () => {
        sendMark();
        converter = null;
      },
      (err) => {
        logger.error("Streaming mulaw conversion error", err);
        converter = null;
      }
    );

    return converter;
  };

  ws.on("message", (data: Buffer) => {
    const msg = parseTwilioMessage(data.toString());
    if (!msg) return;

    if (msg.event === "start") {
      streamSid = msg.streamSid;
      logger.info("Twilio stream started", { streamSid });
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
    destroyConverter();
    onCloseCb?.();
  };

  ws.on("close", handleClose);
  ws.on("error", () => handleClose());

  return {
    sendAudio(chunk: ArrayBuffer) {
      const conv = ensureConverter();
      conv.write(Buffer.from(chunk));
    },
    sendAudioComplete() {
      if (converter) {
        converter.end();
      }
    },
    sendAudioStop() {
      destroyConverter();
      if (streamSid && !closed) {
        try {
          ws.send(JSON.stringify({ event: "clear", streamSid }));
        } catch { /* ignore */ }
      }
    },
    sendTranscript(_text, _isFinal, _role?) {
      /* Twilio doesn't support transcript in stream */
    },
    sendError(message) {
      logger.info("Twilio error", { message });
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
      destroyConverter();
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      onCloseCb?.();
    },
  };
}
