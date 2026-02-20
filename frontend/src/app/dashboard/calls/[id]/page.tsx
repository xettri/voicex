'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, type CallRecord } from '@/lib/api';

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-xs font-medium text-gray-500 uppercase">{label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{value}</div>
    </div>
  );
}

export default function CallDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [call, setCall] = useState<CallRecord | null>(null);

  useEffect(() => {
    api
      .getCall(params.id as string)
      .then(setCall)
      .catch(() => router.push('/dashboard/calls'));
  }, [params.id, router]);

  if (!call) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  const dur = call.durationSec
    ? `${Math.floor(call.durationSec / 60)}m ${call.durationSec % 60}s`
    : '-';

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => router.push('/dashboard/calls')}
          className="text-gray-400 hover:text-gray-600"
        >
          &larr;
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Call Detail</h1>
          <div className="text-sm text-gray-500 mt-0.5">
            {new Date(call.startedAt).toLocaleString()} &middot; {call.channel} &middot;{' '}
            {call.status}
          </div>
        </div>
      </div>

      {call.summary && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 mb-6">
          <h3 className="font-semibold text-blue-900 mb-2">Summary</h3>
          <p className="text-blue-800 text-sm leading-relaxed">{call.summary}</p>
          {call.sentiment && (
            <div className="mt-3 flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${call.sentiment === 'positive' ? 'bg-green-400' : call.sentiment === 'negative' ? 'bg-red-400' : 'bg-gray-400'}`}
              />
              <span className="text-xs font-medium text-blue-700 capitalize">{call.sentiment}</span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Duration" value={dur} />
        <MetricCard label="TTFB" value={call.metrics.ttfbMs ? `${call.metrics.ttfbMs}ms` : '-'} />
        <MetricCard label="Turns" value={call.metrics.turnCount} />
        <MetricCard label="Tokens" value={call.metrics.totalTokens} />
        <MetricCard label="TTS Chars" value={call.metrics.ttsChars} />
        <MetricCard label="Interruptions" value={call.metrics.interruptions} />
        <MetricCard label="Channel" value={call.channel} />
        <MetricCard
          label="Avg Latency"
          value={call.metrics.avgLatencyMs ? `${call.metrics.avgLatencyMs}ms` : '-'}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Transcript</h3>
        {call.transcript.length === 0 ? (
          <div className="text-gray-400 text-sm">No transcript available</div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {call.transcript.map((t, i) => (
              <div
                key={i}
                className={`flex gap-3 ${t.role === 'assistant' ? '' : 'flex-row-reverse'}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    t.role === 'assistant'
                      ? 'bg-gray-100 text-gray-800 rounded-bl-md'
                      : 'bg-blue-600 text-white rounded-br-md'
                  }`}
                >
                  {t.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
