'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PlanProvider } from '@/lib/plan-context';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: 'dashboard' },
  { href: '/dashboard/agents', label: 'Agents', icon: 'group' },
  { href: '/dashboard/calls', label: 'Calls', icon: 'call' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: 'bar_chart' },
  { href: '/dashboard/playground', label: 'Playground', icon: 'play_circle' },
  { href: '/dashboard/settings', label: 'Settings', icon: 'settings' },
];

function MIcon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined shrink-0 ${className}`} style={{ fontSize: 'inherit' }}>
      {name}
    </span>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('vx_token');
    // Legacy fallback for API key access
    const apiKey = localStorage.getItem('vx_api_key');
    if (!token && !apiKey) {
      router.replace('/login');
    } else {
      setReady(true);
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('vx_token');
    localStorage.removeItem('vx_user');
    localStorage.removeItem('vx_api_key');
    localStorage.removeItem('vx_org_id');
    localStorage.removeItem('vx_org_name');
    localStorage.removeItem('voicex_session_id');
    router.push('/login');
  };

  if (!ready) return null;

  return (
    <PlanProvider>
    <div className="flex h-screen bg-gray-50" style={{ colorScheme: 'light' }}>
      {/* Sidebar */}
      <aside className="w-60 bg-gray-950 text-gray-400 flex flex-col shrink-0 border-r border-gray-800">
        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b border-gray-800/80">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white text-base">
              <MIcon name="mic" />
            </div>
            <span className="text-base font-bold text-white tracking-tight">VoiceX</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const active =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                }`}
              >
                <MIcon name={item.icon} className="text-xl" />
                {item.label}
                {active && (
                  <span className="ml-auto w-1 h-1 rounded-full bg-blue-500" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-gray-800/80 space-y-1">
          <Link
            href="/dashboard/settings"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-gray-500 hover:bg-gray-800/60 hover:text-gray-300 transition-colors"
          >
            <MIcon name="settings" className="text-base" />
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors"
          >
            <MIcon name="logout" className="text-base" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center px-6 shrink-0">
          <div className="flex-1" />
          <Link
            href="/dashboard/playground"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 transition-colors"
          >
            <MIcon name="mic" className="text-sm" />
            Try Voice
          </Link>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-8 max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
    </PlanProvider>
  );
}
