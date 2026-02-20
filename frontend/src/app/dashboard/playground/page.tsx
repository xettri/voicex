'use client';

import { useEffect, useState } from 'react';
import { VoiceAssistant } from '@/components/VoiceAssistant';
import { api, type Agent } from '@/lib/api';

export default function PlaygroundPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');

  useEffect(() => {
    api
      .listAgents()
      .then((list) => {
        setAgents(list);
        if (list.length > 0 && !selectedAgent) setSelectedAgent(list[0]._id);
      })
      .catch(() => {});
  }, [selectedAgent]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Playground</h1>
        <p className="text-sm text-gray-500 mt-1">Test your voice agents in real-time.</p>
      </div>

      {agents.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Agent</label>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            {agents.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <VoiceAssistant />
    </div>
  );
}
