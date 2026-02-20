'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoiceConnection } from '@/lib/useVoiceConnection';
import { useAudioPlayer } from './AudioPlayer';
import { AudioCapture } from './AudioCapture';
import { TranscriptDisplay } from './TranscriptDisplay';

interface VoiceAssistantProps {
  agentId?: string;
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2z" />
      <path d="M19 11a1 1 0 0 1 1 1 8 8 0 0 1-7 7.938V22h2a1 1 0 0 1 0 2H9a1 1 0 0 1 0-2h2v-2.062A8 8 0 0 1 4 12a1 1 0 0 1 2 0 6 6 0 0 0 12 0 1 1 0 0 1 1-1z" />
    </svg>
  );
}

function PhoneOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 8.25L12 12.75m0 0L7.5 8.25M12 12.75V3m0 9.75l4.5 4.5M12 12.75l-4.5 4.5M3 16.5c0 .966.784 1.75 1.75 1.75h14.5A1.75 1.75 0 0021 16.5V7.75A1.75 1.75 0 0019.25 6H4.75A1.75 1.75 0 003 7.75v8.75z" />
    </svg>
  );
}

function WaveformBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-center gap-0.5 h-6">
      {[3, 5, 8, 6, 9, 7, 4, 8, 5, 3, 6, 9, 5].map((h, i) => (
        <div
          key={i}
          className={`w-0.5 rounded-full transition-all ${active ? 'bg-blue-500' : 'bg-gray-300'}`}
          style={{
            height: active ? `${h * 2}px` : '4px',
            animationName: active ? 'wave' : 'none',
            animationDuration: `${0.4 + (i % 4) * 0.15}s`,
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: 'infinite',
            animationDirection: 'alternate',
          }}
        />
      ))}
    </div>
  );
}

export function VoiceAssistant({ agentId }: VoiceAssistantProps) {
  const [error, setError] = useState<string | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const { enqueueChunk, flushAccumulator, unlock, clearQueue } = useAudioPlayer();
  const { status, transcript, connect, disconnect, sendAudio } = useVoiceConnection({
    agentId,
    onAudioChunk: enqueueChunk,
    onAudioEnd: flushAccumulator,
    onAudioStop: clearQueue,
    onError: (msg) => setError(msg),
  });

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

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
    (chunk: ArrayBuffer) => sendAudio(chunk),
    [sendAudio],
  );

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <style>{`
        @keyframes wave {
          from { transform: scaleY(0.4); }
          to { transform: scaleY(1); }
        }
      `}</style>

      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center ${
              isConnected ? 'bg-blue-600' : isConnecting ? 'bg-yellow-500' : 'bg-gray-200'
            } transition-colors`}
          >
            <MicIcon className={`w-4 h-4 ${isConnected || isConnecting ? 'text-white' : 'text-gray-500'}`} />
          </div>
          <div>
            <div className="font-semibold text-gray-900 text-sm">Voice Assistant</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnected ? 'bg-green-500 animate-pulse' : isConnecting ? 'bg-yellow-500 animate-pulse' : 'bg-gray-300'
                }`}
              />
              <span className="text-xs text-gray-500 capitalize">{status}</span>
            </div>
          </div>
        </div>
        <WaveformBars active={isConnected} />
      </div>

      {/* Transcript area */}
      <div className="h-72 overflow-y-auto px-6 py-4 bg-gray-50">
        {transcript.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isConnected ? 'bg-blue-50' : 'bg-gray-100'}`}>
              <MicIcon className={`w-7 h-7 ${isConnected ? 'text-blue-500' : 'text-gray-400'}`} />
            </div>
            <div className="text-sm text-gray-400">
              {isConnected ? 'Listening... start speaking' : 'Connect to start a conversation'}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <TranscriptDisplay messages={transcript} />
            <div ref={transcriptEndRef} />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 my-3 px-4 py-2.5 bg-red-50 border border-red-100 rounded-lg flex items-center justify-between gap-3">
          <span className="text-sm text-red-700">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
        </div>
      )}

      {/* Controls */}
      <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
        <div className="text-xs text-gray-400">
          {isConnected ? 'Click end call to disconnect' : 'Click to start a voice session'}
        </div>
        <button
          onClick={isConnected ? handleDisconnect : handleConnect}
          disabled={isConnecting}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm transition-all shadow-sm ${
            isConnected
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : isConnecting
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isConnected ? (
            <>
              <PhoneOffIcon className="w-4 h-4" />
              End Call
            </>
          ) : isConnecting ? (
            <>
              <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <MicIcon className="w-4 h-4" />
              Start Call
            </>
          )}
        </button>
      </div>

      {isConnected && <AudioCapture onAudioChunk={handleAudioChunk} enabled={isConnected} />}
    </div>
  );
}
