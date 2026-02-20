'use client';

import { useEffect, useState } from 'react';
import { api, type ApiKeyRecord } from '@/lib/api';

export default function SettingsPage() {
  const [org, setOrg] = useState<{ name: string; plan: string } | null>(null);
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [orgIdInput, setOrgIdInput] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrgIdInput(localStorage.getItem('vx_org_id') ?? '');
    }
    api
      .getOrganization()
      .then(setOrg)
      .catch(() => {});
    api
      .listApiKeys()
      .then(setKeys)
      .catch(() => {});
  }, []);

  const connectOrg = () => {
    if (orgIdInput.trim()) {
      localStorage.setItem('vx_org_id', orgIdInput.trim());
      window.location.reload();
    }
  };

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    const result = await api.createApiKey(newKeyName.trim());
    setCreatedKey(result.key);
    setNewKeyName('');
    api.listApiKeys().then(setKeys);
  };

  const revokeKey = async (id: string) => {
    if (!confirm('Revoke this API key?')) return;
    await api.revokeApiKey(id);
    api.listApiKeys().then(setKeys);
  };

  const inputCls =
    'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none';

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Settings</h1>

      <div className="grid gap-6 max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Connect Organization</h3>
          <div className="flex gap-3">
            <input
              value={orgIdInput}
              onChange={(e) => setOrgIdInput(e.target.value)}
              placeholder="Organization ID"
              className={inputCls}
            />
            <button
              onClick={connectOrg}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shrink-0"
            >
              Connect
            </button>
          </div>
          {org && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <div className="text-sm font-medium text-gray-900">{org.name}</div>
              <div className="text-xs text-gray-500 mt-1">
                Plan: <span className="font-medium capitalize">{org.plan}</span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">API Keys</h3>

          {createdKey && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="text-sm font-medium text-green-800 mb-1">API Key Created</div>
              <code className="text-xs bg-green-100 px-2 py-1 rounded font-mono break-all">
                {createdKey}
              </code>
              <div className="text-xs text-green-600 mt-2">
                Copy this key now. You won&apos;t see it again.
              </div>
              <button
                onClick={() => setCreatedKey(null)}
                className="mt-2 text-xs text-green-700 font-medium hover:text-green-800"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="flex gap-3 mb-4">
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Key name (e.g. Production)"
              className={inputCls}
              onKeyDown={(e) => e.key === 'Enter' && createKey()}
            />
            <button
              onClick={createKey}
              disabled={!newKeyName.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0"
            >
              Create
            </button>
          </div>

          {keys.length === 0 ? (
            <div className="text-sm text-gray-400">No API keys</div>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div
                  key={k._id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900">{k.name}</div>
                    <div className="text-xs text-gray-500 font-mono">{k.keyPrefix}...</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {k.revokedAt ? (
                      <span className="text-xs text-red-600 font-medium">Revoked</span>
                    ) : (
                      <button
                        onClick={() => revokeKey(k._id)}
                        className="text-xs text-red-600 font-medium hover:text-red-700"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
