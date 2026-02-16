"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseServerMessage } from "./ws-types";

function getWsUrl(): string {
  const base = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/ws/voice";
  const params = new URLSearchParams();
  const apiKey = process.env.NEXT_PUBLIC_API_KEY;
  if (apiKey) params.set("api_key", apiKey);
  if (typeof window !== "undefined") {
    const sid = localStorage.getItem("voicex_session_id");
    if (sid) params.set("session_id", sid);
  }
  const qs = params.toString();
  return qs ? `${base}${base.includes("?") ? "&" : "?"}${qs}` : base;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface TranscriptMessage {
  text: string;
  isFinal: boolean;
  timestamp: number;
  role?: "user" | "assistant";
}

const MAX_TRANSCRIPT = 100;
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 3;

export function useVoiceConnection(options?: {
  onAudioChunk?: (base64: string) => void;
  onAudioStop?: () => void;
  onError?: (message: string) => void;
}): {
  status: ConnectionStatus;
  transcript: TranscriptMessage[];
  connect: () => void;
  disconnect: () => void;
  sendAudio: (chunk: ArrayBuffer) => void;
} {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const onAudioChunkRef = useRef(options?.onAudioChunk);
  const onAudioStopRef = useRef(options?.onAudioStop);
  const onErrorRef = useRef(options?.onError);
  const intentionalDisconnectRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  onAudioChunkRef.current = options?.onAudioChunk;
  onAudioStopRef.current = options?.onAudioStop;
  onErrorRef.current = options?.onError;

  const clearReconnectTimer = useCallback((): void => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connectWs = useCallback((): void => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    const url = getWsUrl();
    const ws = new WebSocket(url);

    ws.onopen = (): void => {
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event: MessageEvent<string>): void => {
      const msg = parseServerMessage(event.data);
      if (!msg) return;

      if (msg.type === "connected") {
        wsRef.current = ws;
        setStatus("connected");
        if (typeof window !== "undefined" && msg.historyKey) {
          localStorage.setItem("voicex_session_id", msg.historyKey);
        }
      } else if (msg.type === "transcript") {
        setTranscript((prev) => {
          const next = [...prev, msg.payload];
          return next.length > MAX_TRANSCRIPT ? next.slice(-MAX_TRANSCRIPT) : next;
        });
      } else if (msg.type === "audio") {
        onAudioChunkRef.current?.(msg.payload);
      } else if (msg.type === "audioStop") {
        onAudioStopRef.current?.();
      } else if (msg.type === "error") {
        onErrorRef.current?.(msg.payload.message);
      }
    };

    ws.onclose = (): void => {
      wsRef.current = null;
      setStatus("disconnected");

      // Auto-reconnect if not intentional
      if (!intentionalDisconnectRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        const delay = RECONNECT_DELAY_MS * reconnectAttemptsRef.current;
        reconnectTimerRef.current = setTimeout(() => {
          connectWs();
        }, delay);
      }
    };

    ws.onerror = (): void => {
      // onclose will fire after this
    };

    wsRef.current = ws;
  }, []);

  const connect = useCallback((): void => {
    intentionalDisconnectRef.current = false;
    reconnectAttemptsRef.current = 0;
    clearReconnectTimer();
    connectWs();
  }, [connectWs, clearReconnectTimer]);

  const disconnect = useCallback((): void => {
    intentionalDisconnectRef.current = true;
    clearReconnectTimer();
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
    setTranscript([]);
  }, [clearReconnectTimer]);

  const sendAudio = useCallback((chunk: ArrayBuffer): void => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    const bytes = new Uint8Array(chunk);
    const base64 = btoa(String.fromCharCode.apply(null, Array.from(bytes)));
    wsRef.current.send(JSON.stringify({ type: "audio", payload: base64 }));
  }, []);

  useEffect((): (() => void) => {
    return (): void => {
      intentionalDisconnectRef.current = true;
      clearReconnectTimer();
      wsRef.current?.close();
    };
  }, [clearReconnectTimer]);

  return { status, transcript, connect, disconnect, sendAudio };
}
