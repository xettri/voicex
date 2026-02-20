'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type Agent } from '@/lib/api';

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
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
          <p className="text-sm text-gray-500 mt-1">
            Configure AI voice agents with custom personas and behavior.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          New Agent
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Create New Agent</h3>
          <div className="flex gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Agent name (e.g. Sales Assistant)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <button
              onClick={handleCreate}
              disabled={creating || !name.trim()}
              className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading agents...</div>
      ) : agents.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-gray-400 mb-4">No agents yet</div>
          <button
            onClick={() => setShowCreate(true)}
            className="text-blue-600 text-sm font-medium hover:text-blue-700"
          >
            Create your first agent
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {agents.map((agent) => (
            <Link
              key={agent._id}
              href={`/dashboard/agents/${agent._id}`}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm ${agent.active ? 'bg-blue-600' : 'bg-gray-400'}`}
                  >
                    {agent.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{agent.name}</div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {agent.llm.provider} / {agent.voice.provider} / {agent.persona.language}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${agent.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {agent.active ? 'Active' : 'Inactive'}
                  </span>
                  <span className="text-gray-400 text-sm">&rarr;</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
