'use client';

import { useEffect, useState } from 'react';
import { api, type UsageRecord } from '@/lib/api';

function BarChart({
  data,
  dataKey,
  color,
  maxH = 120,
}: {
  data: UsageRecord[];
  dataKey: keyof UsageRecord;
  color: string;
  maxH?: number;
}) {
  const values = data.map((d) => d[dataKey] as number);
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-1" style={{ height: maxH }}>
      {data.map((d, i) => {
        const v = d[dataKey] as number;
        const h = Math.max((v / max) * maxH, 2);
        return (
          <div key={i} className="flex-1 group relative">
            <div className={`${color} rounded-t-sm transition-all`} style={{ height: `${h}px` }} />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
              {d.date}: {v}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AnalyticsPage() {
  const [usage, setUsage] = useState<UsageRecord[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .getUsage(days)
      .then(setUsage)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  const totals = usage.reduce(
    (acc, u) => ({
      calls: acc.calls + u.calls,
      minutes: acc.minutes + u.minutes,
      tokens: acc.tokens + u.llmTokens,
      ttsChars: acc.ttsChars + u.ttsChars,
    }),
    { calls: 0, minutes: 0, tokens: 0, ttsChars: 0 },
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Usage metrics and trends.</p>
        </div>
        <div className="flex gap-2">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${days === d ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-sm font-medium text-gray-500">Total Calls</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{totals.calls}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-sm font-medium text-gray-500">Total Minutes</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{totals.minutes}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-sm font-medium text-gray-500">LLM Tokens</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            {totals.tokens.toLocaleString()}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-sm font-medium text-gray-500">TTS Characters</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            {totals.ttsChars.toLocaleString()}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : usage.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          No usage data yet
        </div>
      ) : (
        <div className="grid gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Calls per Day</h3>
            <BarChart data={usage} dataKey="calls" color="bg-blue-500" />
            <div className="flex justify-between mt-2 text-xs text-gray-400">
              <span>{usage[0]?.date}</span>
              <span>{usage[usage.length - 1]?.date}</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Minutes per Day</h3>
            <BarChart data={usage} dataKey="minutes" color="bg-green-500" />
            <div className="flex justify-between mt-2 text-xs text-gray-400">
              <span>{usage[0]?.date}</span>
              <span>{usage[usage.length - 1]?.date}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
