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

function StatCard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</div>
        <div className="mt-1 text-2xl font-bold text-gray-900 leading-none">{value}</div>
        {sub && <div className="mt-1 text-xs text-gray-400">{sub}</div>}
      </div>
    </div>
  );
}

function formatDuration(sec: number | null): string {
  if (!sec) return '—';
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

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return <span className="text-gray-400 text-xs">—</span>;
  const styles =
    sentiment === 'positive'
      ? 'bg-green-50 text-green-700'
      : sentiment === 'negative'
        ? 'bg-red-50 text-red-700'
        : 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${styles}`}>
      <span
        className={`w-1 h-1 rounded-full ${
          sentiment === 'positive' ? 'bg-green-500' : sentiment === 'negative' ? 'bg-red-500' : 'bg-gray-400'
        }`}
      />
      {sentiment}
    </span>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getStats().then(setStats).catch((e) => setError(e.message));
    api.listCalls({ limit: '8' }).then(setCalls).catch(() => {});
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">Welcome back — here&apos;s what&apos;s happening.</p>
        </div>
        <Link
          href="/dashboard/agents/new"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          + New Agent
        </Link>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Calls"
          value={stats?.totalCalls ?? '—'}
          icon={
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          }
          color="bg-blue-50"
        />
        <StatCard
          label="Active Agents"
          value={stats?.agentCount ?? '—'}
          icon={
            <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
          color="bg-violet-50"
        />
        <StatCard
          label="Total Minutes"
          value={stats?.totalMinutes ?? '—'}
          sub="all time"
          icon={
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          color="bg-emerald-50"
        />
        <StatCard
          label="Avg Duration"
          value={stats ? formatDuration(stats.avgDurationSec) : '—'}
          sub="per call"
          icon={
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          }
          color="bg-amber-50"
        />
      </div>

      {/* Recent Calls */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent Calls</h2>
          <Link href="/dashboard/calls" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            View all →
          </Link>
        </div>
        {calls.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div className="text-sm font-medium text-gray-500">No calls yet</div>
            <div className="text-xs text-gray-400 mt-1">Create an agent and start a conversation.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/50">
                  <th className="px-6 py-3">Time</th>
                  <th className="px-6 py-3">Channel</th>
                  <th className="px-6 py-3">Duration</th>
                  <th className="px-6 py-3">Turns</th>
                  <th className="px-6 py-3">Sentiment</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {calls.map((c) => (
                  <tr key={c._id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-3.5 text-sm text-gray-700 whitespace-nowrap">
                      {formatTime(c.startedAt)}
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          c.channel === 'phone'
                            ? 'bg-violet-50 text-violet-700'
                            : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        {c.channel}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-sm text-gray-600 tabular-nums">
                      {formatDuration(c.durationSec)}
                    </td>
                    <td className="px-6 py-3.5 text-sm text-gray-600 tabular-nums">
                      {c.metrics.turnCount}
                    </td>
                    <td className="px-6 py-3.5">
                      <SentimentBadge sentiment={c.sentiment} />
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          c.status === 'active'
                            ? 'bg-green-50 text-green-700'
                            : c.status === 'completed'
                              ? 'bg-gray-100 text-gray-500'
                              : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <Link
                        href={`/dashboard/calls/${c._id}`}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
