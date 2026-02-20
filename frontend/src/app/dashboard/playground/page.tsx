'use client';

import { useEffect, useState } from 'react';
import { VoiceAssistant } from '@/components/VoiceAssistant';
import { api, type AgentWithStatus } from '@/lib/api';

function statusLabel(agent: AgentWithStatus) {
  switch (agent.status) {
    case 'paused_provider': return { label: 'Paused — provider', tooltip: agent.pauseReason ?? 'A provider is disabled', color: 'text-amber-600' };
    case 'paused_plan': return { label: 'Paused — plan', tooltip: agent.pauseReason ?? 'Model requires a higher plan', color: 'text-amber-600' };
    case 'inactive': return { label: 'Inactive', tooltip: '', color: 'text-gray-400' };
    default: return { label: 'Active', tooltip: '', color: 'text-green-600' };
  }
}

export default function PlaygroundPage() {
  const [agents, setAgents] = useState<AgentWithStatus[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');

  useEffect(() => {
    api
      .listAgents()
      .then((list) => {
        setAgents(list);
        const firstActive = list.find((a) => a.status === 'active');
        if (firstActive) setSelectedAgent(firstActive._id);
        else if (list.length > 0) setSelectedAgent(list[0]._id);
      })
      .catch(() => {});
  }, []);

  const agent = agents.find((a) => a._id === selectedAgent);
  const isPaused = agent?.status === 'paused_provider' || agent?.status === 'paused_plan';
  const info = agent ? statusLabel(agent) : null;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Playground</h1>
        <p className="text-sm text-gray-500 mt-0.5">Test your voice agents in real-time.</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-2 space-y-4">
          {agents.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <label className="block text-sm font-semibold text-gray-700 mb-3">Select Agent</label>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-colors"
              >
                {agents.map((a) => {
                  const paused = a.status === 'paused_provider' || a.status === 'paused_plan';
                  const suffix = paused ? ' (Paused)' : a.status === 'inactive' ? ' (Inactive)' : '';
                  return (
                    <option key={a._id} value={a._id} disabled={paused}>
                      {a.name}{suffix}
                    </option>
                  );
                })}
              </select>

              {agent && (
                <div className="mt-4 space-y-2 text-xs text-gray-500">
                  <div className="flex justify-between">
                    <span className="text-gray-400">LLM</span>
                    <span className="font-medium text-gray-700">{agent.llmModelId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">TTS</span>
                    <span className="font-medium text-gray-700">{agent.ttsModelId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Language</span>
                    <span className="font-medium text-gray-700 uppercase">{agent.persona.language}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Status</span>
                    {info && (
                      <span className={`font-medium ${info.color}`} title={info.tooltip}>
                        {info.label}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {isPaused && info && (
                <div className="mt-4 p-3 rounded-lg text-xs flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-700">
                  <span className="material-symbols-outlined shrink-0" style={{ fontSize: 16 }}>pause_circle</span>
                  <span>{info.tooltip} Edit the agent to resolve.</span>
                </div>
              )}
            </div>
          )}

          {agents.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <p className="text-sm text-amber-800 font-medium">No agents found</p>
              <p className="text-xs text-amber-600 mt-1">Create an agent first to start testing.</p>
            </div>
          )}

          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tips</div>
            <ul className="space-y-1.5 text-xs text-gray-500">
              <li className="flex gap-2"><span className="text-blue-500">&bull;</span> Speak clearly and wait for a response</li>
              <li className="flex gap-2"><span className="text-blue-500">&bull;</span> You can interrupt the assistant mid-sentence</li>
              <li className="flex gap-2"><span className="text-blue-500">&bull;</span> Session history is preserved per browser</li>
            </ul>
          </div>
        </div>

        <div className="lg:col-span-3">
          {isPaused ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <span className="material-symbols-outlined mb-3 text-amber-400" style={{ fontSize: 48 }}>pause_circle</span>
              <p className="text-sm font-semibold text-gray-700 mb-1">Agent paused</p>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">{info?.tooltip}</p>
            </div>
          ) : (
            <VoiceAssistant agentId={selectedAgent || undefined} />
          )}
        </div>
      </div>
    </div>
  );
}
