'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type AgentWithStatus } from '@/lib/api';

function statusBadge(agent: AgentWithStatus) {
  switch (agent.status) {
    case 'paused_provider':
      return { label: 'Paused', tooltip: agent.pauseReason ?? 'A provider is disabled', color: 'bg-amber-50 text-amber-700' };
    case 'paused_plan':
      return { label: 'Paused', tooltip: agent.pauseReason ?? 'Model requires a higher plan', color: 'bg-amber-50 text-amber-700' };
    case 'inactive':
      return { label: 'Inactive', tooltip: '', color: 'bg-gray-100 text-gray-400' };
    default:
      return { label: 'Active', tooltip: '', color: 'bg-green-50 text-green-700' };
  }
}

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .listAgents()
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const agent = await api.createAgent({ name: name.trim() });
      router.push(`/dashboard/agents/${agent._id}`);
    } catch {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure AI voice agents with custom personas and providers.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          + New Agent
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-1">Create New Agent</h3>
          <p className="text-xs text-gray-500 mb-4">You can configure the full persona, voice, and LLM settings after creation.</p>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Agent name (e.g. Sales Assistant)"
              className="flex-1 px-3.5 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-colors"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={creating || !name.trim()}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setName(''); }}
              className="px-4 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 border border-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : agents.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 24 }}>group</span>
          </div>
          <div className="text-sm font-medium text-gray-600 mb-1">No agents yet</div>
          <div className="text-xs text-gray-400 mb-4">Create your first voice agent to get started.</div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Create Agent
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {agents.map((agent) => {
            const info = statusBadge(agent);
            const isIssue = agent.status === 'paused_provider' || agent.status === 'paused_plan';
            const avatarColor = isIssue ? 'bg-amber-400' : agent.active ? 'bg-blue-600' : 'bg-gray-300';
            const borderColor = isIssue ? 'border-amber-200 hover:border-amber-300' : 'border-gray-200 hover:border-blue-300';

            return (
              <Link
                key={agent._id}
                href={`/dashboard/agents/${agent._id}`}
                className={`bg-white rounded-xl border p-5 hover:shadow-sm transition-all group ${borderColor}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 ${avatarColor}`}>
                      {agent.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {agent.name}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                        <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                          {agent.llmModelId}
                        </span>
                        <span className="text-gray-300">&middot;</span>
                        <span>{agent.ttsModelId}</span>
                        <span className="text-gray-300">&middot;</span>
                        <span className="uppercase">{agent.persona.language}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${info.color}`}
                      title={isIssue ? info.tooltip : undefined}
                    >
                      {info.label}
                    </span>
                    <span className="text-gray-300 group-hover:text-blue-400 transition-colors text-lg">&rarr;</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
