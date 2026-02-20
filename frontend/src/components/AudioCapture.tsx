'use client';

import { useCallback, useEffect, useRef } from 'react';

interface AudioCaptureProps {
  onAudioChunk: (chunk: ArrayBuffer) => void;
  enabled: boolean;
}

const BUFFER_SIZE = 2048;

export function AudioCapture({ onAudioChunk, enabled }: AudioCaptureProps) {
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const startCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);

      // Try AudioWorklet first (lower latency), fall back to ScriptProcessor
      try {
        const workletCode = `
          class PCMProcessor extends AudioWorkletProcessor {
            constructor() { super(); this._buffer = []; }
            process(inputs) {
              const input = inputs[0]?.[0];
              if (!input) return true;
              const pcm16 = new Int16Array(input.length);
              for (let i = 0; i < input.length; i++) {
                pcm16[i] = Math.max(-32768, Math.min(32767, input[i] * 32768));
              }
              this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
              return true;
            }
          }
          registerProcessor('pcm-processor', PCMProcessor);
        `;
        const blob = new Blob([workletCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        await audioContext.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);

        const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
        workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
          onAudioChunk(e.data);
        };
        source.connect(workletNode);
        workletNode.connect(audioContext.destination);
        workletRef.current = workletNode;
      } catch {
        // Fallback: ScriptProcessorNode (deprecated but widely supported)
        const processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            pcm16[i] = Math.max(-32768, Math.min(32767, input[i] * 32768));
          }
          onAudioChunk(pcm16.buffer);
        };
        source.connect(processor);
        processor.connect(audioContext.destination);
        processorRef.current = processor;
      }
    } catch (err) {
      console.error('Failed to start capture:', err);
    }
  }, [onAudioChunk]);

  const stopCapture = useCallback(() => {
    workletRef.current?.disconnect();
    workletRef.current = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (enabled) {
      startCapture();
    } else {
      stopCapture();
    }
    return stopCapture;
  }, [enabled, startCapture, stopCapture]);

  return null;
}
