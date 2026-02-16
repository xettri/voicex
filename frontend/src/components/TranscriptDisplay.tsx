"use client";

import type { TranscriptMessage } from "@/lib/useVoiceConnection";

interface TranscriptDisplayProps {
  messages: TranscriptMessage[];
}

export function TranscriptDisplay({ messages }: TranscriptDisplayProps) {
  if (messages.length === 0) {
    return (
      <p className="text-gray-500 text-sm text-center py-8">
        Speak to see transcript here...
      </p>
    );
  }

  return (
    <div className="space-y-2 max-h-48 overflow-y-auto">
      {messages.map((m, i) => (
        <p
          key={i}
          className={`text-sm ${
            m.role === "assistant"
              ? "text-blue-700 font-medium"
              : m.isFinal
                ? "text-gray-900 font-medium"
                : "text-gray-500 italic"
          }`}
        >
          {m.text}
        </p>
      ))}
    </div>
  );
}
