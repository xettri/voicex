'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, type AgentWithStatus, type ModelSearchItem } from '@/lib/api';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ToastContainer, useToast } from '@/components/Toast';
import { cn } from '@/utils/cn';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

const baseCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-colors';

function ModelSelect({
  category,
  value,
  onChange,
  placeholder,
}: {
  category: 'llm' | 'tts' | 'stt';
  value: { providerId: string; modelId: string } | null;
  onChange: (item: ModelSearchItem) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ModelSearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback((q: string) => {
    setLoading(true);
    api.searchModels({ category, q, limit: 20 })
      .then((r) => setItems(r.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [category]);

  useEffect(() => {
    search('');
  }, [search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInput = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 200);
  };

  const selectedItem = items.find((i) => i.providerId === value?.providerId && i.modelId === value?.modelId);
  const displayLabel = selectedItem?.label ?? (value?.modelId || placeholder || 'Select...');

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(baseCls, 'text-left flex items-center justify-between')}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{displayLabel}</span>
        <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 18 }}>expand_more</span>
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              placeholder="Search models..."
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-56">
            {loading && <div className="px-3 py-2 text-xs text-gray-400">Searching...</div>}
            {!loading && items.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">No models found</div>}
            {items.map((item) => {
              const isSelected = item.providerId === value?.providerId && item.modelId === value?.modelId;
              return (
                <button
                  key={`${item.providerId}:${item.modelId}`}
                  type="button"
                  disabled={!item.allowed}
                  onClick={() => { onChange(item); setOpen(false); setQuery(''); }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 transition-colors',
                    isSelected ? 'bg-blue-50 text-blue-700' : item.allowed ? 'hover:bg-gray-50 text-gray-900' : 'text-gray-400 cursor-not-allowed bg-gray-50/50',
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{item.label}</span>
                      {item.source === 'custom' && (
                        <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">custom</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 truncate">{item.providerName} &middot; {item.modelId}</div>
                  </div>
                  {!item.allowed && item.requiredPlan && (
                    <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">{item.requiredPlan}+</span>
                  )}
                  {isSelected && <span className="material-symbols-outlined text-blue-600 shrink-0" style={{ fontSize: 16 }}>check</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function getStatusBadge(status: string, pauseReason?: string) {
  switch (status) {
    case 'paused_provider':
      return { label: 'Paused — provider', tooltip: pauseReason ?? 'A provider is disabled', color: 'bg-amber-50 text-amber-700' };
    case 'paused_plan':
      return { label: 'Paused — plan', tooltip: pauseReason ?? 'Model requires a higher plan', color: 'bg-amber-50 text-amber-700' };
    case 'inactive':
      return { label: 'Inactive', tooltip: '', color: 'bg-gray-100 text-gray-400' };
    default:
      return { label: 'Active', tooltip: '', color: 'bg-green-50 text-green-700' };
  }
}

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [agent, setAgent] = useState<AgentWithStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toasts, toast, dismiss } = useToast();

  useEffect(() => {
    api.getAgent(id).then(setAgent).catch(() => router.push('/dashboard/agents'));
  }, [id, router]);

  const update = useCallback((path: string, value: unknown) => {
    setAgent((prev) => {
      if (!prev) return prev;
      const copy = JSON.parse(JSON.stringify(prev)) as Record<string, unknown>;
      const parts = path.split('.');
      let obj = copy;
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]] as Record<string, unknown>;
      obj[parts[parts.length - 1]] = value;
      return copy as unknown as AgentWithStatus;
    });
    setSaved(false);
  }, []);

  const save = async () => {
    if (!agent) return;
    setSaving(true);
    try {
      const result = await api.updateAgent(id, {
        name: agent.name,
        persona: agent.persona,
        llmProviderId: agent.llmProviderId,
        llmModelId: agent.llmModelId,
        llmConfig: agent.llmConfig,
        ttsProviderId: agent.ttsProviderId,
        ttsModelId: agent.ttsModelId,
        ttsConfig: agent.ttsConfig,
        sttProviderId: agent.sttProviderId,
        thresholds: agent.thresholds,
        active: agent.active,
      });
      setAgent(result);
      setSaved(true);
      toast('Agent saved successfully');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save agent.';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteAgent(id);
      router.push('/dashboard/agents');
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (!agent) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  const statusBadge = getStatusBadge(agent.status, agent.pauseReason);
  const isPaused = agent.status === 'paused_provider' || agent.status === 'paused_plan';

  return (
    <div>
      {isPaused && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-500 mt-0.5 shrink-0" style={{ fontSize: 20 }}>pause_circle</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">{statusBadge.label}</p>
            <p className="text-sm text-amber-700 mt-1">{agent.pauseReason ?? 'This agent is paused. Edit the configuration to resolve.'}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/dashboard/agents')} className="text-gray-400 hover:text-gray-600">&larr;</button>
          <div>
            <input
              value={agent.name}
              onChange={(e) => update('name', e.target.value)}
              className="text-2xl font-bold text-gray-900 bg-transparent border-none outline-none p-0"
            />
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm text-gray-500">Agent Configuration</span>
              {agent.status !== 'active' && (
                <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold', statusBadge.color)} title={statusBadge.tooltip}>
                  {statusBadge.label.toUpperCase()}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowDeleteDialog(true)} className="px-4 py-2 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors">Delete</button>
          <button onClick={save} disabled={saving} className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="grid gap-6">
        <Section title="Persona">
          <Field label="System Prompt">
            <textarea value={agent.persona.systemPrompt} onChange={(e) => update('persona.systemPrompt', e.target.value)} rows={4} className={baseCls} />
          </Field>
          <Field label="Greeting Message">
            <input value={agent.persona.greeting} onChange={(e) => update('persona.greeting', e.target.value)} className={baseCls} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Personality">
              <select value={agent.persona.personality} onChange={(e) => update('persona.personality', e.target.value)} className={baseCls}>
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="casual">Casual</option>
                <option value="formal">Formal</option>
              </select>
            </Field>
            <Field label="Language">
              <select value={agent.persona.language} onChange={(e) => update('persona.language', e.target.value)} className={baseCls}>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="ja">Japanese</option>
                <option value="zh">Chinese</option>
              </select>
            </Field>
          </div>
          <Field label="Guardrails (one per line)">
            <textarea
              value={agent.persona.guardrails.join('\n')}
              onChange={(e) => update('persona.guardrails', e.target.value.split('\n').filter(Boolean))}
              rows={3} className={baseCls} placeholder="Never discuss competitors&#10;Don't make medical claims"
            />
          </Field>
        </Section>

        <div className="grid grid-cols-2 gap-6">
          <Section title="LLM">
            <Field label="Model">
              <ModelSelect
                category="llm"
                value={{ providerId: agent.llmProviderId, modelId: agent.llmModelId }}
                onChange={(item) => {
                  update('llmProviderId', item.providerId);
                  update('llmModelId', item.modelId);
                }}
                placeholder="Select LLM model..."
              />
            </Field>
            <Field label={`Temperature: ${agent.llmConfig.temperature}`}>
              <input type="range" min="0" max="1" step="0.1" value={agent.llmConfig.temperature} onChange={(e) => update('llmConfig.temperature', parseFloat(e.target.value))} className="w-full" />
            </Field>
            <Field label="Max Tokens">
              <input type="number" value={agent.llmConfig.maxTokens} onChange={(e) => update('llmConfig.maxTokens', parseInt(e.target.value) || 200)} className={baseCls} />
            </Field>
          </Section>

          <Section title="Voice">
            <Field label="Voice">
              <ModelSelect
                category="tts"
                value={{ providerId: agent.ttsProviderId, modelId: agent.ttsModelId }}
                onChange={(item) => {
                  update('ttsProviderId', item.providerId);
                  update('ttsModelId', item.modelId);
                }}
                placeholder="Select voice..."
              />
            </Field>
            <Field label={`Speed: ${agent.ttsConfig.speed}x`}>
              <input type="range" min="0.5" max="2" step="0.1" value={agent.ttsConfig.speed} onChange={(e) => update('ttsConfig.speed', parseFloat(e.target.value))} className="w-full" />
            </Field>
          </Section>
        </div>

        <Section title="Thresholds">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Silence Timeout (ms)">
              <input type="number" value={agent.thresholds.silenceTimeoutMs} onChange={(e) => update('thresholds.silenceTimeoutMs', parseInt(e.target.value) || 700)} className={baseCls} />
            </Field>
            <Field label="Max Call Duration (sec)">
              <input type="number" value={agent.thresholds.maxCallDurationSec} onChange={(e) => update('thresholds.maxCallDurationSec', parseInt(e.target.value) || 1800)} className={baseCls} />
            </Field>
            <Field label="Endpointing (ms)">
              <input type="number" value={agent.thresholds.endpointingMs} onChange={(e) => update('thresholds.endpointingMs', parseInt(e.target.value) || 200)} className={baseCls} />
            </Field>
            <Field label="Interruption Sensitivity">
              <select value={agent.thresholds.interruptionSensitivity} onChange={(e) => update('thresholds.interruptionSensitivity', e.target.value)} className={baseCls}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Status">
          <div className="flex items-center gap-3">
            <button
              onClick={() => update('active', !agent.active)}
              className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors', agent.active ? 'bg-blue-600' : 'bg-gray-300')}
            >
              <span className={cn('inline-block h-4 w-4 rounded-full bg-white transition-transform', agent.active ? 'translate-x-6' : 'translate-x-1')} />
            </button>
            <span className="text-sm text-gray-700">{agent.active ? 'Active' : 'Inactive'}</span>
          </div>
        </Section>
      </div>

      <ConfirmDialog
        open={showDeleteDialog} variant="danger"
        title={`Delete "${agent.name}"?`}
        description="This will permanently delete the agent and all its configuration. This action cannot be undone."
        confirmLabel="Delete agent" loading={deleting}
        onConfirm={handleDelete} onCancel={() => setShowDeleteDialog(false)}
      />
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
