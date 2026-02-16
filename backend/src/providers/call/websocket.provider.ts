import type { WebSocket, RawData } from "ws";
import { parseClientMessage } from "../../shared/ws-types.js";
import type { CallChannel } from "./call.interface.js";

export function createWebSocketCallChannel(ws: WebSocket): CallChannel {
  let onAudioCb: ((chunk: ArrayBuffer) => void) | null = null;
  let onCloseCb: (() => void) | null = null;
  let closed = false;
  const audioBuffer: ArrayBuffer[] = [];

  const sendJson = (data: unknown): void => {
    if (closed) return;
    try {
      ws.send(JSON.stringify(data));
    } catch {
      /* ignore */
    }
  };

  ws.on("message", (data: RawData, isBinary: boolean) => {
    if (isBinary) {
      // Binary frame = raw audio from client
      const buf = Buffer.from(data as Buffer);
      const ab = new ArrayBuffer(buf.byteLength);
      new Uint8Array(ab).set(buf);
      onAudioCb?.(ab);
      return;
    }
    const msg = parseClientMessage(data.toString());
    if (!msg) {
      sendJson({ type: "error", payload: { message: "Invalid message" } });
      return;
    }
    if (msg.type === "audio") {
      const binary = Uint8Array.from(atob(msg.payload), (c) => c.charCodeAt(0));
      onAudioCb?.(binary.buffer);
    } else if (msg.type === "ping") {
      sendJson({ type: "pong", timestamp: Date.now() });
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
      audioBuffer.push(chunk);
    },
    sendAudioComplete() {
      if (audioBuffer.length === 0) return;
      const totalLen = audioBuffer.reduce((sum, b) => sum + b.byteLength, 0);
      const combined = new Uint8Array(totalLen);
      let offset = 0;
      for (const buf of audioBuffer) {
        combined.set(new Uint8Array(buf), offset);
        offset += buf.byteLength;
      }
      audioBuffer.length = 0;
      const base64 = Buffer.from(combined).toString("base64");
      sendJson({ type: "audio", payload: base64 });
    },
    sendAudioStop() {
      audioBuffer.length = 0;
      sendJson({ type: "audioStop" });
    },
    sendTranscript(text, isFinal, role) {
      sendJson({ type: "transcript", payload: { text, isFinal, timestamp: Date.now(), role: role ?? "user" } });
    },
    sendError(message) {
      sendJson({ type: "error", payload: { message } });
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
