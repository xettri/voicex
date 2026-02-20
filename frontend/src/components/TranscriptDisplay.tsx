'use client';

import type { TranscriptMessage } from '@/lib/useVoiceConnection';

interface TranscriptDisplayProps {
  messages: TranscriptMessage[];
}

export function TranscriptDisplay({ messages }: TranscriptDisplayProps) {
  if (messages.length === 0) {
    return (
      <p className="text-gray-400 text-sm text-center py-8">Speak to see transcript here...</p>
    );
  }

  return (
    <div className="space-y-2">
      {messages.map((m, i) => {
        const isAssistant = m.role === 'assistant';
        return (
          <div key={i} className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                isAssistant
                  ? 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-xs'
                  : m.isFinal
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-blue-400/60 text-white rounded-br-sm italic'
              }`}
            >
              {m.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
