'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type ApiKeyRecord, type AuthUser } from '@/lib/api';
import { usePlan } from '@/lib/plan-context';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const inputCls =
  'w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-colors';

export default function SettingsPage() {
  const router = useRouter();
  const { plan } = usePlan();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [org, setOrg] = useState<{ name: string; planSlug: string; planName: string } | null>(null);
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRecord | null>(null);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('vx_user');
    if (stored) {
      try { setUser(JSON.parse(stored) as AuthUser); } catch { /* ignore */ }
    }
    api.getOrganization().then(setOrg).catch(() => {});
    api.listApiKeys().then(setKeys).catch(() => {});
  }, []);

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    const result = await api.createApiKey(newKeyName.trim());
    setCreatedKey(result.key);
    setNewKeyName('');
    api.listApiKeys().then(setKeys);
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await api.revokeApiKey(revokeTarget._id);
      api.listApiKeys().then(setKeys);
    } finally {
      setRevoking(false);
      setRevokeTarget(null);
    }
  };

  const copyKey = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = () => {
    localStorage.removeItem('vx_token');
    localStorage.removeItem('vx_user');
    localStorage.removeItem('vx_api_key');
    localStorage.removeItem('vx_org_id');
    localStorage.removeItem('vx_org_name');
    localStorage.removeItem('voicex_session_id');
    router.push('/login');
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Settings</h1>

      <div className="grid gap-6 max-w-2xl">

        {/* Current session */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-1">Account</h3>
          <p className="text-xs text-gray-500 mb-4">Your profile and active organization.</p>

          {user || org ? (
            <div className="space-y-3">
              {user && (
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-blue-600">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{user.name}</div>
                    <div className="text-xs text-gray-500">{user.email}</div>
                    <div className="text-xs text-gray-400 mt-0.5 capitalize">{user.role}</div>
                  </div>
                </div>
              )}
              {org && (
                <div className="flex items-center justify-between p-4 bg-green-50 border border-green-100 rounded-lg">
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">Organization</div>
                    <div className="text-sm font-semibold text-gray-900">{org.name}</div>
                    <span className="text-xs capitalize bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-600 font-medium mt-1 inline-block">
                      {org.planName} plan
                    </span>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-700">
              Could not load account info.
            </div>
          )}
        </div>

        {/* Provider Configurations */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-gray-900">Provider Configurations</h3>
            {plan?.features?.customProviders && (
              <Link
                href="/dashboard/providers"
                className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                Manage
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
              </Link>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Connect your own API keys for LLM, TTS, and STT providers.
          </p>
          {plan?.features?.customProviders ? (
            <Link
              href="/dashboard/providers"
              className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors group"
            >
              <span className="material-symbols-outlined text-gray-400 group-hover:text-blue-500" style={{ fontSize: 24 }}>hub</span>
              <div>
                <div className="text-sm font-medium text-gray-900 group-hover:text-blue-700">Custom Providers</div>
                <div className="text-xs text-gray-500">
                  {plan.features.maxCustomProviders === 999 ? 'Unlimited' : `Up to ${plan.features.maxCustomProviders}`} custom provider configurations
                </div>
              </div>
            </Link>
          ) : (
            <div className="p-4 bg-purple-50 border border-purple-100 rounded-lg">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-purple-500 mt-0.5" style={{ fontSize: 20 }}>lock</span>
                <div>
                  <div className="text-sm font-medium text-purple-800">Upgrade to add custom providers</div>
                  <p className="text-xs text-purple-600 mt-1">
                    Custom providers let you use your own API keys for LLM, TTS, and STT services. Available on Starter plan and above.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* API Keys */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-1">API Keys</h3>
          <p className="text-xs text-gray-500 mb-4">
            Create keys for your apps and integrations. Keys are shown once — store them securely.
          </p>

          {createdKey && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-green-800">New API Key Created</div>
                <button
                  onClick={() => copyKey(createdKey)}
                  className="text-xs font-medium text-green-700 hover:text-green-800 flex items-center gap-1"
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <code className="block text-xs bg-white border border-green-200 px-3 py-2 rounded-lg font-mono break-all text-gray-800">
                {createdKey}
              </code>
              <div className="text-xs text-green-600 mt-2 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                Copy and save this key — you won&apos;t see it again.
              </div>
              <button
                onClick={() => setCreatedKey(null)}
                className="mt-2 text-xs text-green-700 font-medium hover:text-green-800 underline"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="flex gap-2 mb-4">
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Key name (e.g. Production, Mobile App)"
              className={inputCls}
              onKeyDown={(e) => e.key === 'Enter' && createKey()}
            />
            <button
              onClick={createKey}
              disabled={!newKeyName.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0 transition-colors"
            >
              Create
            </button>
          </div>

          {keys.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-400">
              No API keys yet. Create one above.
            </div>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div
                  key={k._id}
                  className={`flex items-center justify-between p-3.5 rounded-lg border ${
                    k.revokedAt ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                      {k.name}
                      {k.revokedAt && (
                        <span className="text-xs font-normal text-red-500 bg-red-50 px-1.5 py-0.5 rounded">revoked</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 font-mono mt-0.5">{k.keyPrefix}••••••••••••••••</div>
                    {k.lastUsedAt && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        Last used {new Date(k.lastUsedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  {!k.revokedAt && (
                    <button
                      onClick={() => setRevokeTarget(k)}
                      className="text-xs text-red-500 font-medium hover:text-red-700 shrink-0 ml-4 px-2.5 py-1 rounded hover:bg-red-50 transition-colors"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sign out */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-1">Sign Out</h3>
          <p className="text-xs text-gray-500 mb-4">
            Clear your session and return to the login page.
          </p>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            Sign out
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={!!revokeTarget}
        variant="danger"
        title="Revoke API key?"
        description={
          revokeTarget
            ? `"${revokeTarget.name}" (${revokeTarget.keyPrefix}••••) will stop working immediately. Any integrations using this key will break.`
            : undefined
        }
        confirmLabel="Revoke key"
        loading={revoking}
        onConfirm={confirmRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
