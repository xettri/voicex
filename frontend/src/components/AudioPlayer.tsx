'use client';

import { useCallback, useRef } from 'react';

const MIN_DECODE_BYTES = 2048;

export function useAudioPlayer() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const playQueueRef = useRef<AudioBuffer[]>([]);
  const playingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isStoppedRef = useRef(false);
  const accumulatorRef = useRef<Uint8Array[]>([]);
  const accumulatedBytesRef = useRef(0);

  const getContext = useCallback((): AudioContext => {
    let ctx = audioContextRef.current;
    if (!ctx || ctx.state === 'closed') {
      ctx = new AudioContext();
      audioContextRef.current = ctx;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }, []);

  const unlock = useCallback((): void => {
    isStoppedRef.current = false;
    getContext();
  }, [getContext]);

  const playNext = useCallback((): void => {
    if (isStoppedRef.current) return;
    if (playingRef.current || playQueueRef.current.length === 0) return;
    const audioBuffer = playQueueRef.current.shift();
    if (!audioBuffer) return;

    playingRef.current = true;
    const ctx = getContext();
    const source = ctx.createBufferSource();
    currentSourceRef.current = source;
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.onended = () => {
      currentSourceRef.current = null;
      playingRef.current = false;
      playNext();
    };
    source.start(0);
  }, [getContext]);

  const tryDecodeAndQueue = useCallback((): void => {
    if (accumulatorRef.current.length === 0) return;

    const totalLen = accumulatedBytesRef.current;
    const combined = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of accumulatorRef.current) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    accumulatorRef.current = [];
    accumulatedBytesRef.current = 0;

    const ctx = getContext();
    ctx
      .decodeAudioData(combined.buffer.slice(0))
      .then((decoded) => {
        if (isStoppedRef.current) return;
        playQueueRef.current.push(decoded);
        playNext();
      })
      .catch(() => {
        /* incomplete data — will retry with more data on next chunk or flush */
      });
  }, [getContext, playNext]);

  const enqueueChunk = useCallback(
    (chunk: ArrayBuffer): void => {
      if (isStoppedRef.current) isStoppedRef.current = false;
      if (chunk.byteLength === 0) return;

      accumulatorRef.current.push(new Uint8Array(chunk));
      accumulatedBytesRef.current += chunk.byteLength;

      if (accumulatedBytesRef.current >= MIN_DECODE_BYTES) {
        tryDecodeAndQueue();
      }
    },
    [tryDecodeAndQueue],
  );

  const flushAccumulator = useCallback((): void => {
    if (accumulatedBytesRef.current > 0) {
      tryDecodeAndQueue();
    }
  }, [tryDecodeAndQueue]);

  const clearQueue = useCallback((): void => {
    isStoppedRef.current = true;
    playQueueRef.current.length = 0;
    accumulatorRef.current = [];
    accumulatedBytesRef.current = 0;
    try {
      currentSourceRef.current?.stop();
    } catch {
      /* already stopped */
    }
    currentSourceRef.current = null;
    playingRef.current = false;
  }, []);

  return { enqueueChunk, flushAccumulator, unlock, clearQueue };
}
