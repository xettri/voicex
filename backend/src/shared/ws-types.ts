/** Client → Server WebSocket message types */
export type ClientMessage =
  | { type: "audio"; payload: string }
  | { type: "ping" };

/** Server → Client WebSocket message types */
export type ServerMessage =
  | { type: "connected"; sessionId: string; timestamp: number }
  | { type: "transcript"; payload: { text: string; isFinal: boolean; timestamp: number; role?: "user" | "assistant" } }
  | { type: "audio"; payload: string }
  | { type: "pong"; timestamp: number };

export function parseClientMessage(data: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(data) as unknown;
    if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
      return null;
    }
    const msg = parsed as Record<string, unknown>;
    if (msg.type === "audio" && typeof msg.payload === "string") {
      return { type: "audio", payload: msg.payload };
    }
    if (msg.type === "ping") {
      return { type: "ping" };
    }
    return null;
  } catch {
    return null;
  }
}
