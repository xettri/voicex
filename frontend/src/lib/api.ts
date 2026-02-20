export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('vx_token');
    if (token) {
      h['Authorization'] = `Bearer ${token}`;
    } else {
      const key = localStorage.getItem('vx_api_key');
      if (key) h['x-api-key'] = key;
    }
  }
  return h;
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/dashboard${path}`, {
    ...opts,
    headers: { ...getHeaders(), ...opts?.headers },
  });
  if (res.status === 401 || res.status === 403) {
    const body = await res.json().catch(() => ({}));
    if (typeof window !== 'undefined') {
      if (body.status === 'pending') {
        window.location.href = '/pending';
        throw new Error('pending');
      }
      localStorage.removeItem('vx_token');
      localStorage.removeItem('vx_user');
      window.location.href = '/login';
    }
    throw new Error(body.error ?? 'Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  orgId: string;
  orgName: string;
  plan: string;
  role: string;
}

export const auth = {
  signup: (data: { name: string; email: string; password: string; orgName?: string }) =>
    fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(async (res) => {
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body as { status: string; message: string };
    }),

  signin: (data: { email: string; password: string }) =>
    fetch(`${API_BASE}/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(async (res) => {
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body as { token: string; user: AuthUser };
    }),

  me: () =>
    fetch(`${API_BASE}/auth/me`, {
      headers: {
        Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('vx_token') ?? '' : ''}`,
      },
    }).then(async (res) => {
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body as { user: AuthUser; orgStatus: string };
    }),
};

// ---------------------------------------------------------------------------
// Plan (public)
// ---------------------------------------------------------------------------

export interface PublicPlan {
  slug: string;
  name: string;
  description: string;
  pricing: {
    monthly: number;
    monthlyMaxDiscount: number;
    annual: number;
    annualMaxDiscount: number;
  };
  limits: {
    maxAgents: number;
    maxConcurrentCalls: number;
    maxCallDurationSec: number;
    maxMonthlyMinutes: number;
  };
}

export function getPublicPlans(): Promise<PublicPlan[]> {
  return fetch(`${API_BASE}/plans`)
    .then((res) => res.json());
}

// ---------------------------------------------------------------------------
// Plan context (authenticated — includes model keys + features)
// ---------------------------------------------------------------------------

export interface PlanFeatures {
  customProviders: boolean;
  maxCustomProviders: number;
}

export interface PlanInfo {
  slug: string;
  name: string;
  description: string;
  limits: {
    maxAgents: number;
    maxConcurrentCalls: number;
    maxCallDurationSec: number;
    maxMonthlyMinutes: number;
  };
  pricing: {
    monthly: number;
    monthlyMaxDiscount: number;
    annual: number;
    annualMaxDiscount: number;
  };
  models: {
    llm: string[];
    tts: string[];
    stt: string[];
  };
  features: PlanFeatures;
}

// ---------------------------------------------------------------------------
// Model search (paginated)
// ---------------------------------------------------------------------------

export interface ModelSearchItem {
  providerId: string;
  providerKey: string;
  providerName: string;
  modelId: string;
  label: string;
  description: string;
  category: string;
  source: 'platform' | 'custom';
  allowed: boolean;
  requiredPlan?: string;
}

export interface ModelSearchResult {
  items: ModelSearchItem[];
  total: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Dashboard API
// ---------------------------------------------------------------------------

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
    request<{
      _id: string; name: string; planSlug: string; planName: string;
      limits: Record<string, number>;
    }>('/organization'),

  updateOrganization: (data: Record<string, unknown>) =>
    request('/organization', { method: 'PATCH', body: JSON.stringify(data) }),

  getPlan: () => request<PlanInfo>('/plan'),

  searchModels: (params: { category: string; q?: string; skip?: number; limit?: number }) => {
    const qs = new URLSearchParams({ category: params.category });
    if (params.q) qs.set('q', params.q);
    if (params.skip) qs.set('skip', String(params.skip));
    if (params.limit) qs.set('limit', String(params.limit));
    return request<ModelSearchResult>(`/models/search?${qs.toString()}`);
  },

  listAgents: () => request<AgentWithStatus[]>('/agents'),
  getAgent: (id: string) => request<AgentWithStatus>(`/agents/${id}`),
  createAgent: (data: Record<string, unknown>) =>
    request<AgentWithStatus>('/agents', { method: 'POST', body: JSON.stringify(data) }),
  updateAgent: (id: string, data: Record<string, unknown>) =>
    request<AgentWithStatus>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
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

  getProviderRegistry: () => request<ProviderRegistryEntry[]>('/providers/registry'),
  listProviders: (params?: { category?: string; client?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', params.category);
    if (params?.client) qs.set('client', 'true');
    const q = qs.toString();
    return request<ProviderRecord[]>(`/providers${q ? `?${q}` : ''}`);
  },
  createProvider: (data: {
    category: string; providerKey: string; name: string;
    credentials: Record<string, string>;
    models?: Array<{ modelId: string; label: string; description: string }>;
    settings?: Record<string, unknown>;
  }) =>
    request<ProviderRecord>('/providers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateProvider: (id: string, data: Record<string, unknown>) =>
    request(`/providers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProvider: (id: string) =>
    request<{ ok: boolean } | { error: string; agents: { id: string; name: string }[] }>(
      `/providers/${id}`,
      { method: 'DELETE' },
    ),
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  llmProviderId: string;
  llmModelId: string;
  llmConfig: { temperature: number; maxTokens: number };
  ttsProviderId: string;
  ttsModelId: string;
  ttsConfig: { speed: number };
  sttProviderId: string;
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

export interface AgentWithStatus extends Agent {
  status: 'active' | 'inactive' | 'paused_provider' | 'paused_plan';
  pauseReason?: string;
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

export interface ProviderSettingDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  placeholder?: string;
}

export interface ProviderRegistryEntry {
  _id: string;
  category: 'llm' | 'tts' | 'stt';
  providerKey: string;
  displayName: string;
  requiresKey: boolean;
  models: string[];
  settings: ProviderSettingDef[];
}

export interface ProviderModelRecord {
  modelId: string;
  label: string;
  description: string;
}

export interface ProviderRecord {
  _id: string;
  orgId: string | null;
  category: 'llm' | 'tts' | 'stt';
  providerKey: string;
  name: string;
  models: ProviderModelRecord[];
  settings: Record<string, unknown>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
