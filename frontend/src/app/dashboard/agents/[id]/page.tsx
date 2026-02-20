'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, type Agent } from '@/lib/api';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none';
const selectCls = inputCls;

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [agent, setAgent] = useState<Agent | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .getAgent(id)
      .then(setAgent)
      .catch(() => router.push('/dashboard/agents'));
  }, [id, router]);

  const update = useCallback((path: string, value: unknown) => {
    setAgent((prev) => {
      if (!prev) return prev;
      const copy = JSON.parse(JSON.stringify(prev)) as Record<string, unknown>;
      const parts = path.split('.');
      let obj = copy;
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]] as Record<string, unknown>;
      obj[parts[parts.length - 1]] = value;
      return copy as unknown as Agent;
    });
    setSaved(false);
  }, []);

  const save = async () => {
    if (!agent) return;
    setSaving(true);
    try {
      await api.updateAgent(id, {
        persona: agent.persona,
        voice: agent.voice,
        llm: agent.llm,
        thresholds: agent.thresholds,
        name: agent.name,
        active: agent.active,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this agent?')) return;
    await api.deleteAgent(id);
    router.push('/dashboard/agents');
  };

  if (!agent) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/agents')}
            className="text-gray-400 hover:text-gray-600"
          >
            &larr;
          </button>
          <div>
            <input
              value={agent.name}
              onChange={(e) => update('name', e.target.value)}
              className="text-2xl font-bold text-gray-900 bg-transparent border-none outline-none p-0"
            />
            <div className="text-sm text-gray-500 mt-0.5">Agent Configuration</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDelete}
            className="px-4 py-2 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="grid gap-6">
        <Section title="Persona">
          <Field label="System Prompt">
            <textarea
              value={agent.persona.systemPrompt}
              onChange={(e) => update('persona.systemPrompt', e.target.value)}
              rows={4}
              className={inputCls}
            />
          </Field>
          <Field label="Greeting Message">
            <input
              value={agent.persona.greeting}
              onChange={(e) => update('persona.greeting', e.target.value)}
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Personality">
              <select
                value={agent.persona.personality}
                onChange={(e) => update('persona.personality', e.target.value)}
                className={selectCls}
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="casual">Casual</option>
                <option value="formal">Formal</option>
              </select>
            </Field>
            <Field label="Language">
              <select
                value={agent.persona.language}
                onChange={(e) => update('persona.language', e.target.value)}
                className={selectCls}
              >
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
              onChange={(e) =>
                update('persona.guardrails', e.target.value.split('\n').filter(Boolean))
              }
              rows={3}
              className={inputCls}
              placeholder="Never discuss competitors&#10;Don't make medical claims"
            />
          </Field>
        </Section>

        <div className="grid grid-cols-2 gap-6">
          <Section title="LLM">
            <Field label="Provider">
              <select
                value={agent.llm.provider}
                onChange={(e) => update('llm.provider', e.target.value)}
                className={selectCls}
              >
                <option value="groq">Groq</option>
                <option value="openai">OpenAI</option>
                <option value="ollama">Ollama</option>
              </select>
            </Field>
            <Field label="Model">
              <input
                value={agent.llm.model}
                onChange={(e) => update('llm.model', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label={`Temperature: ${agent.llm.temperature}`}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={agent.llm.temperature}
                onChange={(e) => update('llm.temperature', parseFloat(e.target.value))}
                className="w-full"
              />
            </Field>
            <Field label="Max Tokens">
              <input
                type="number"
                value={agent.llm.maxTokens}
                onChange={(e) => update('llm.maxTokens', parseInt(e.target.value) || 200)}
                className={inputCls}
              />
            </Field>
          </Section>

          <Section title="Voice">
            <Field label="TTS Provider">
              <select
                value={agent.voice.provider}
                onChange={(e) => update('voice.provider', e.target.value)}
                className={selectCls}
              >
                <option value="elevenlabs">ElevenLabs</option>
                <option value="openai">OpenAI</option>
                <option value="edge">Edge TTS</option>
              </select>
            </Field>
            <Field label="Voice ID">
              <input
                value={agent.voice.voiceId}
                onChange={(e) => update('voice.voiceId', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label={`Speed: ${agent.voice.speed}x`}>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={agent.voice.speed}
                onChange={(e) => update('voice.speed', parseFloat(e.target.value))}
                className="w-full"
              />
            </Field>
          </Section>
        </div>

        <Section title="Thresholds">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Silence Timeout (ms)">
              <input
                type="number"
                value={agent.thresholds.silenceTimeoutMs}
                onChange={(e) =>
                  update('thresholds.silenceTimeoutMs', parseInt(e.target.value) || 700)
                }
                className={inputCls}
              />
            </Field>
            <Field label="Max Call Duration (sec)">
              <input
                type="number"
                value={agent.thresholds.maxCallDurationSec}
                onChange={(e) =>
                  update('thresholds.maxCallDurationSec', parseInt(e.target.value) || 1800)
                }
                className={inputCls}
              />
            </Field>
            <Field label="Endpointing (ms)">
              <input
                type="number"
                value={agent.thresholds.endpointingMs}
                onChange={(e) =>
                  update('thresholds.endpointingMs', parseInt(e.target.value) || 200)
                }
                className={inputCls}
              />
            </Field>
            <Field label="Interruption Sensitivity">
              <select
                value={agent.thresholds.interruptionSensitivity}
                onChange={(e) => update('thresholds.interruptionSensitivity', e.target.value)}
                className={selectCls}
              >
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
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${agent.active ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${agent.active ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
            <span className="text-sm text-gray-700">{agent.active ? 'Active' : 'Inactive'}</span>
          </div>
        </Section>
      </div>
    </div>
  );
}
