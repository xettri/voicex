/** Server → Client WebSocket message types (text frames; binary frames = raw audio) */
export type ServerMessage =
  | { type: "connected"; sessionId: string; historyKey?: string; timestamp: number }
  | { type: "transcript"; payload: { text: string; isFinal: boolean; timestamp: number; role?: "user" | "assistant" } }
  | { type: "audioEnd" }
  | { type: "audioStop" }
  | { type: "pong"; timestamp: number }
  | { type: "error"; payload: { message: string } };

export function parseServerMessage(data: string): ServerMessage | null {
  try {
    const parsed = JSON.parse(data) as unknown;
    if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
      return null;
    }
    const msg = parsed as Record<string, unknown>;
    const type = msg.type as string;

    if (type === "connected" && typeof msg.sessionId === "string" && typeof msg.timestamp === "number") {
      const historyKey = typeof msg.historyKey === "string" ? msg.historyKey : undefined;
      return { type: "connected", sessionId: msg.sessionId, historyKey, timestamp: msg.timestamp };
    }
    if (type === "transcript" && msg.payload && typeof msg.payload === "object") {
      const p = msg.payload as Record<string, unknown>;
      if (typeof p.text === "string" && typeof p.isFinal === "boolean" && typeof p.timestamp === "number") {
        const role = p.role === "assistant" ? "assistant" : "user";
        return { type: "transcript", payload: { text: p.text, isFinal: p.isFinal, timestamp: p.timestamp, role } };
      }
    }
    if (type === "audioEnd") {
      return { type: "audioEnd" };
    }
    if (type === "audioStop") {
      return { type: "audioStop" };
    }
    if (type === "pong" && typeof msg.timestamp === "number") {
      return { type: "pong", timestamp: msg.timestamp };
    }
    if (type === "error" && msg.payload && typeof msg.payload === "object") {
      const p = msg.payload as Record<string, unknown>;
      if (typeof p.message === "string") {
        return { type: "error", payload: { message: p.message } };
      }
    }
    return null;
  } catch {
    return null;
  }
}
