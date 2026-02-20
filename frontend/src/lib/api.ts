const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const key = localStorage.getItem('vx_api_key');
    if (key) h['x-api-key'] = key;
    const orgId = localStorage.getItem('vx_org_id');
    if (orgId) h['x-org-id'] = orgId;
  }
  return h;
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/dashboard${path}`, {
    ...opts,
    headers: { ...getHeaders(), ...opts?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getStats: () =>
    request<{
      totalCalls: number;
      activeCalls: number;
      totalMinutes: number;
      avgDurationSec: number;
      agentCount: number;
    }>('/stats'),
  getOrganization: () =>
    request<{ _id: string; name: string; plan: string; limits: Record<string, number> }>(
      '/organization',
    ),
  updateOrganization: (data: Record<string, unknown>) =>
    request('/organization', { method: 'PATCH', body: JSON.stringify(data) }),

  listAgents: () => request<Agent[]>('/agents'),
  getAgent: (id: string) => request<Agent>(`/agents/${id}`),
  createAgent: (data: Record<string, unknown>) =>
    request<Agent>('/agents', { method: 'POST', body: JSON.stringify(data) }),
  updateAgent: (id: string, data: Record<string, unknown>) =>
    request(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAgent: (id: string) => request(`/agents/${id}`, { method: 'DELETE' }),

  listCalls: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<CallRecord[]>(`/calls${qs}`);
  },
  getCall: (id: string) => request<CallRecord>(`/calls/${id}`),

  getUsage: (days?: number) =>
    request<UsageRecord[]>(`/analytics/usage${days ? `?days=${days}` : ''}`),

  listApiKeys: () => request<ApiKeyRecord[]>('/api-keys'),
  createApiKey: (name: string) =>
    request<ApiKeyRecord & { key: string }>('/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  revokeApiKey: (id: string) => request(`/api-keys/${id}`, { method: 'DELETE' }),
};

export interface Agent {
  _id: string;
  name: string;
  persona: {
    systemPrompt: string;
    greeting: string;
    personality: string;
    language: string;
    guardrails: string[];
  };
  voice: { provider: string; voiceId: string; speed: number };
  llm: { provider: string; model: string; temperature: number; maxTokens: number };
  thresholds: {
    silenceTimeoutMs: number;
    maxCallDurationSec: number;
    interruptionSensitivity: string;
    endpointingMs: number;
  };
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CallRecord {
  _id: string;
  agentId: string;
  sessionId: string;
  channel: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  metrics: {
    ttfbMs: number | null;
    avgLatencyMs: number | null;
    totalTokens: number;
    ttsChars: number;
    interruptions: number;
    turnCount: number;
  };
  summary: string | null;
  sentiment: string | null;
  transcript: Array<{ role: string; content: string; timestamp: string }>;
}

export interface UsageRecord {
  date: string;
  calls: number;
  minutes: number;
  ttsChars: number;
  llmTokens: number;
}

export interface ApiKeyRecord {
  _id: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}
