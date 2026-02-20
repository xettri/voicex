'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type CallRecord } from '@/lib/api';

function formatDuration(sec: number | null): string {
  if (!sec) return '-';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CallsPage() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'completed' | 'active'>('all');

  useEffect(() => {
    const params: Record<string, string> = { limit: '50' };
    if (filter !== 'all') params.status = filter;
    api
      .listCalls(params)
      .then(setCalls)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Call History</h1>
          <p className="text-sm text-gray-500 mt-1">
            View transcripts, summaries, and performance metrics for all calls.
          </p>
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'completed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading...</div>
        ) : calls.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">No calls found</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="px-6 py-3">Time</th>
                <th className="px-6 py-3">Channel</th>
                <th className="px-6 py-3">Duration</th>
                <th className="px-6 py-3">Turns</th>
                <th className="px-6 py-3">TTFB</th>
                <th className="px-6 py-3">Tokens</th>
                <th className="px-6 py-3">Sentiment</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {calls.map((c) => (
                <tr key={c._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-700">{formatTime(c.startedAt)}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${c.channel === 'phone' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}
                    >
                      {c.channel}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {formatDuration(c.durationSec)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{c.metrics.turnCount}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {c.metrics.ttfbMs ? `${c.metrics.ttfbMs}ms` : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {c.metrics.totalTokens || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${c.sentiment === 'positive' ? 'bg-green-400' : c.sentiment === 'negative' ? 'bg-red-400' : 'bg-gray-300'}`}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${c.status === 'active' ? 'bg-green-50 text-green-700' : c.status === 'completed' ? 'bg-gray-100 text-gray-600' : 'bg-red-50 text-red-700'}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/dashboard/calls/${c._id}`}
                      className="text-blue-600 text-sm hover:text-blue-700"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
