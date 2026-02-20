'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  api,
  type ProviderRegistryEntry,
  type ProviderRecord,
} from '@/lib/api';
import { usePlan } from '@/lib/plan-context';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ToastContainer, useToast } from '@/components/Toast';

type Category = 'llm' | 'tts' | 'stt';

const CATEGORY_LABELS: Record<Category, string> = {
  llm: 'LLM (Language Models)',
  tts: 'TTS (Text-to-Speech)',
  stt: 'STT (Speech-to-Text)',
};

const CATEGORY_COLORS: Record<Category, string> = {
  llm: 'bg-purple-100 text-purple-700',
  tts: 'bg-green-100 text-green-700',
  stt: 'bg-sky-100 text-sky-700',
};

function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[category]}`}>
      {category.toUpperCase()}
    </span>
  );
}

interface AddFormProps {
  registry: ProviderRegistryEntry[];
  onCreated: () => void;
  onCancel: () => void;
  toast: (msg: string, variant?: 'success' | 'error' | 'info') => void;
}

function AddProviderForm({ registry, onCreated, onCancel, toast }: AddFormProps) {
  const [category, setCategory] = useState<Category>('llm');
  const [providerKey, setProviderKey] = useState('');
  const [name, setName] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const filteredProviders = registry.filter((r) => r.category === category);
  const selectedProvider = filteredProviders.find((r) => r.providerKey === providerKey);

  useEffect(() => {
    if (filteredProviders.length > 0 && !filteredProviders.find((p) => p.providerKey === providerKey)) {
      setProviderKey(filteredProviders[0].providerKey);
    }
  }, [category, filteredProviders, providerKey]);

  useEffect(() => {
    setCredentials({});
    setSelectedModels(selectedProvider?.models ?? []);
  }, [providerKey, selectedProvider]);

  const handleSave = async () => {
    if (!name.trim()) { toast('Name is required', 'error'); return; }
    if (selectedProvider) {
      const missing = selectedProvider.settings.filter((s) => s.required && !credentials[s.key]?.trim());
      if (missing.length > 0) { toast(`Missing required fields: ${missing.map((s) => s.label).join(', ')}`, 'error'); return; }
    }

    setSaving(true);
    try {
      await api.createProvider({
        category, providerKey, name: name.trim(), credentials,
        models: selectedModels.map((m) => ({ modelId: m, label: m, description: '' })),
      });
      toast('Provider configuration saved');
      onCreated();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-colors';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Add Provider Configuration</h3>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={inputCls}>
            {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Provider</label>
          <select value={providerKey} onChange={(e) => setProviderKey(e.target.value)} className={inputCls}>
            {filteredProviders.map((p) => (
              <option key={p.providerKey} value={p.providerKey}>
                {p.displayName} {p.requiresKey ? '' : '(no key required)'}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Configuration Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`My ${selectedProvider?.displayName ?? 'Provider'} Config`} className={inputCls} />
        <p className="mt-1 text-xs text-gray-400">Give this configuration a recognizable name</p>
      </div>

      {selectedProvider && selectedProvider.settings.length > 0 && (
        <div className="mb-4 space-y-3">
          <label className="block text-sm font-medium text-gray-700">Credentials</label>
          {selectedProvider.settings.map((s) => (
            <div key={s.key}>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {s.label} {s.required && <span className="text-red-400">*</span>}
              </label>
              <input
                type={s.key.toLowerCase().includes('key') ? 'password' : 'text'}
                value={credentials[s.key] ?? ''}
                onChange={(e) => setCredentials((p) => ({ ...p, [s.key]: e.target.value }))}
                placeholder={s.placeholder} className={inputCls}
              />
            </div>
          ))}
        </div>
      )}

      {selectedProvider && selectedProvider.models.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Models</label>
          <div className="flex flex-wrap gap-2">
            {selectedProvider.models.map((model) => {
              const active = selectedModels.includes(model);
              return (
                <button
                  key={model} type="button"
                  onClick={() => setSelectedModels((prev) => active ? prev.filter((m) => m !== model) : [...prev, model])}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${active ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'}`}
                >
                  {model}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
}

export default function ProvidersPage() {
  const { plan } = usePlan();
  const [registry, setRegistry] = useState<ProviderRegistryEntry[]>([]);
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProviderRecord | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toasts, toast, dismiss } = useToast();

  const canUseCustom = plan?.features?.customProviders ?? false;
  const maxCustom = plan?.features?.maxCustomProviders ?? 0;

  const load = useCallback(async () => {
    try {
      const [reg, cp] = await Promise.all([
        api.getProviderRegistry(),
        api.listProviders({ client: true }),
      ]);
      setRegistry(reg);
      setProviders(cp);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await api.deleteProvider(deleteTarget._id);
      if ('error' in result) { setDeleteError(result.error); return; }
      toast('Provider configuration deleted');
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async (p: ProviderRecord) => {
    try {
      await api.updateProvider(p._id, { active: !p.active });
      setProviders((prev) => prev.map((item) => (item._id === p._id ? { ...item, active: !item.active } : item)));
      toast(p.active ? 'Provider disabled' : 'Provider enabled');
    } catch {
      toast('Failed to update provider', 'error');
    }
  };

  const grouped = (Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    items: providers.filter((p) => p.category === cat),
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!canUseCustom) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Provider Configurations</h1>
          <p className="text-sm text-gray-500 mt-1">Connect your own API keys for LLM, TTS, and STT providers</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center max-w-lg mx-auto">
          <span className="material-symbols-outlined text-purple-400 mb-4" style={{ fontSize: 48 }}>lock</span>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Upgrade to Use Custom Providers</h2>
          <p className="text-sm text-gray-500 mb-6">
            Custom providers let you bring your own API keys for LLM, TTS, and STT services.
            This feature is available on the Starter plan and above.
          </p>
          <Link href="/dashboard/settings" className="px-6 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors inline-block">
            View Plans
          </Link>
        </div>
      </div>
    );
  }

  const atLimit = providers.length >= maxCustom;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Provider Configurations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Connect your own API keys for LLM, TTS, and STT providers
            <span className="text-gray-400 ml-1">({providers.length}/{maxCustom === 999 ? '∞' : maxCustom})</span>
          </p>
        </div>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            disabled={atLimit}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            title={atLimit ? `Limit reached (${maxCustom})` : undefined}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            Add Provider
          </button>
        )}
      </div>

      {showAdd && (
        <div className="mb-8">
          <AddProviderForm
            registry={registry}
            onCreated={() => { setShowAdd(false); load(); }}
            onCancel={() => setShowAdd(false)}
            toast={toast}
          />
        </div>
      )}

      {providers.length === 0 && !showAdd ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <span className="material-symbols-outlined text-gray-300 mb-4" style={{ fontSize: 48 }}>hub</span>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">No provider configurations yet</h3>
          <p className="text-sm text-gray-500 mb-4">
            Add your own API keys to use custom LLM, TTS, or STT providers with your agents.
          </p>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            Add your first provider
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.filter((g) => g.items.length > 0).map((g) => (
            <div key={g.category}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{g.label}</h2>
              <div className="grid gap-3">
                {g.items.map((p) => (
                  <div
                    key={p._id}
                    className={`bg-white rounded-xl border p-4 flex items-center gap-4 transition-colors ${p.active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900 text-sm">{p.name}</span>
                        <CategoryBadge category={p.category} />
                        <span className="text-xs text-gray-400 font-mono">{p.providerKey}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {p.models.map((m) => (
                          <span key={m.modelId} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600 font-mono">
                            {m.label || m.modelId}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggle(p)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${p.active ? 'bg-blue-600' : 'bg-gray-300'}`}
                      title={p.active ? 'Disable' : 'Enable'}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${p.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>

                    <button
                      onClick={() => { setDeleteError(null); setDeleteTarget(p); }}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                      title="Delete"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget} variant="danger"
        title={`Delete "${deleteTarget?.name}"?`}
        description={deleteError ?? 'This will permanently remove this provider configuration. Agents using it will need to be updated.'}
        confirmLabel="Delete" loading={deleting}
        onConfirm={handleDelete} onCancel={() => { setDeleteTarget(null); setDeleteError(null); }}
      />
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
