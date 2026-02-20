'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type CallRecord } from '@/lib/api';

interface Stats {
  totalCalls: number;
  activeCalls: number;
  totalMinutes: number;
  avgDurationSec: number;
  agentCount: number;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="text-sm font-medium text-gray-500">{label}</div>
      <div className="mt-2 text-3xl font-bold text-gray-900">{value}</div>
      {sub && <div className="mt-1 text-sm text-gray-400">{sub}</div>}
    </div>
  );
}

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

function SentimentDot({ sentiment }: { sentiment: string | null }) {
  const color =
    sentiment === 'positive'
      ? 'bg-green-400'
      : sentiment === 'negative'
        ? 'bg-red-400'
        : 'bg-gray-300';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getStats()
      .then(setStats)
      .catch((e) => setError(e.message));
    api
      .listCalls({ limit: '8' })
      .then(setCalls)
      .catch(() => {});
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Link
          href="/dashboard/agents"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create Agent
        </Link>
      </div>

      {error && <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard label="Total Calls" value={stats?.totalCalls ?? '-'} />
        <StatCard label="Active Agents" value={stats?.agentCount ?? '-'} />
        <StatCard label="Total Minutes" value={stats?.totalMinutes ?? '-'} />
        <StatCard label="Avg Duration" value={stats ? formatDuration(stats.avgDurationSec) : '-'} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent Calls</h2>
          <Link href="/dashboard/calls" className="text-sm text-blue-600 hover:text-blue-700">
            View all
          </Link>
        </div>
        {calls.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            No calls yet. Create an agent and start a conversation.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Time</th>
                <th className="px-6 py-3">Channel</th>
                <th className="px-6 py-3">Duration</th>
                <th className="px-6 py-3">Turns</th>
                <th className="px-6 py-3">Sentiment</th>
                <th className="px-6 py-3">Status</th>
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
                  <td className="px-6 py-4">
                    <SentimentDot sentiment={c.sentiment} />
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${c.status === 'active' ? 'bg-green-50 text-green-700' : c.status === 'completed' ? 'bg-gray-100 text-gray-600' : 'bg-red-50 text-red-700'}`}
                    >
                      {c.status}
                    </span>
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
