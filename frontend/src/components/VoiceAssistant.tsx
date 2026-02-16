"use client";

import { useCallback, useState } from "react";
import { useVoiceConnection } from "@/lib/useVoiceConnection";
import { useAudioPlayer } from "./AudioPlayer";
import { AudioCapture } from "./AudioCapture";
import { TranscriptDisplay } from "./TranscriptDisplay";

export function VoiceAssistant() {
  const [error, setError] = useState<string | null>(null);
  const { enqueue, unlock, clearQueue } = useAudioPlayer();
  const { status, transcript, connect, disconnect, sendAudio } = useVoiceConnection({
    onAudioChunk: enqueue,
    onAudioStop: clearQueue,
    onError: (msg) => setError(msg),
  });

  const handleConnect = useCallback(() => {
    setError(null);
    unlock();
    connect();
  }, [connect, unlock]);

  const handleDisconnect = useCallback(() => {
    setError(null);
    clearQueue();
    disconnect();
  }, [disconnect, clearQueue]);

  const handleAudioChunk = useCallback(
    (chunk: ArrayBuffer) => {
      sendAudio(chunk);
    },
    [sendAudio]
  );

  const isConnected = status === "connected";

  return (
    <div className="flex flex-col gap-6 max-w-md mx-auto p-6 border rounded-lg shadow-lg bg-white">
      <h1 className="text-xl font-semibold">Voice Assistant</h1>

      {error && (
        <div className="px-4 py-2 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
          {error}
        </div>
      )}

      <div className="flex gap-4 items-center">
        <button
          onClick={isConnected ? handleDisconnect : handleConnect}
          disabled={status === "connecting"}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            isConnected
              ? "bg-red-500 hover:bg-red-600 text-white"
              : "bg-green-500 hover:bg-green-600 text-white"
          } disabled:opacity-50`}
        >
          {status === "connecting"
            ? "Connecting..."
            : isConnected
              ? "Disconnect"
              : "Connect"}
        </button>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              status === "connected"
                ? "bg-green-500 animate-pulse"
                : status === "connecting"
                  ? "bg-yellow-500 animate-pulse"
                  : "bg-gray-400"
            }`}
          />
          <span className="text-sm text-gray-600">{status}</span>
        </div>
      </div>

      <div className="border rounded p-4 min-h-[120px] max-h-[400px] overflow-y-auto bg-gray-50">
        <TranscriptDisplay messages={transcript} />
      </div>

      {isConnected && (
        <AudioCapture onAudioChunk={handleAudioChunk} enabled={isConnected} />
      )}
    </div>
  );
}
