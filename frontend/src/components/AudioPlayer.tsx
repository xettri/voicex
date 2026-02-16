"use client";

import { useCallback, useRef } from "react";

export function useAudioPlayer() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<ArrayBuffer[]>([]);
  const playingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isStoppedRef = useRef(false);

  const getContext = useCallback((): AudioContext => {
    let ctx = audioContextRef.current;
    if (!ctx || ctx.state === "closed") {
      ctx = new AudioContext();
      audioContextRef.current = ctx;
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }, []);

  /** Call on user gesture to unlock audio playback */
  const unlock = useCallback((): void => {
    isStoppedRef.current = false;
    getContext();
  }, [getContext]);

  const playNext = useCallback((): void => {
    if (isStoppedRef.current) return;
    if (playingRef.current || queueRef.current.length === 0) return;
    const chunk = queueRef.current.shift();
    if (!chunk || chunk.byteLength === 0) return;

    playingRef.current = true;
    const ctx = getContext();

    ctx.decodeAudioData(chunk.slice(0))
      .then((buffer) => {
        if (isStoppedRef.current) {
          playingRef.current = false;
          return;
        }
        const source = ctx.createBufferSource();
        currentSourceRef.current = source;
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => {
          currentSourceRef.current = null;
          playingRef.current = false;
          playNext();
        };
        source.start(0);
      })
      .catch((err) => {
        console.error("Audio decode failed", err);
        playingRef.current = false;
        // Try next chunk
        playNext();
      });
  }, [getContext]);

  const enqueue = useCallback((base64: string): void => {
    isStoppedRef.current = false;
    const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    if (binary.byteLength === 0) return;
    queueRef.current.push(binary.buffer);
    playNext();
  }, [playNext]);

  /** Immediately stop all playback and clear queue (for interrupt) */
  const clearQueue = useCallback((): void => {
    isStoppedRef.current = true;
    queueRef.current.length = 0;
    try {
      currentSourceRef.current?.stop();
    } catch {
      /* already stopped */
    }
    currentSourceRef.current = null;
    playingRef.current = false;
  }, []);

  return { enqueue, unlock, clearQueue };
}
