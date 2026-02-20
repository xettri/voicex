# REST API Reference

All HTTP endpoints for the Voicex backend. Base URL: `http://localhost:3001/api`.

---

## Authentication

Most endpoints require authentication via **JWT token** or **API key**.

```bash
# JWT (dashboard login)
Authorization: Bearer <token>

# API key (external integration)
x-api-key: vx_<48_hex_chars>
```

---

## Public Endpoints

### Health Check

```
GET /api/health
```

```json
{ "status": "ok", "timestamp": 1708185600000 }
```

### List Public Plans

```
GET /api/plans
```

Returns plans where `public: true` and `custom: false`. For pricing pages.

```json
[
  {
    "slug": "free",
    "name": "Free",
    "description": "Get started with voice AI",
    "pricing": { "monthly": 0, "annual": 0, "maxDiscountPercent": 0 },
    "limits": { "maxAgents": 1, "maxConcurrentCalls": 2, "maxCallDurationSec": 300, "maxMonthlyMinutes": 60 },
    "features": { "customProviders": false, "maxCustomProviders": 0 }
  }
]
```

### Setup Status

```
GET /api/setup/status
```

Returns whether initial setup has been completed.

---

## Auth Endpoints

### Sign Up

```
POST /api/auth/signup
```

```json
{
  "name": "John Doe",
  "email": "john@company.com",
  "password": "min8chars",
  "orgName": "Acme Corp"
}
```

Creates an org (status: pending) + user (role: admin). Returns JWT.

### Sign In

```
POST /api/auth/signin
```

```json
{
  "email": "john@company.com",
  "password": "min8chars"
}
```

Returns user, organization (with status), and JWT.

### Get Current User

```
GET /api/auth/me
Authorization: Bearer <token>
```

Returns the authenticated user and their organization.

---

## Dashboard Endpoints

All require authentication. The middleware loads orgId, plan, and userId from the token.

### Organization

```
GET /api/dashboard/organization
```

Returns org info including `planSlug`, `planName`, and `limits`.

```
PATCH /api/dashboard/organization
```

Update org name. Body: `{ "name": "New Name" }`.

```
GET /api/dashboard/stats
```

Returns aggregate stats: total calls, active agents, total minutes, average duration.

### Plan

```
GET /api/dashboard/plan
```

Returns full plan details including models (llm/tts/stt arrays) and features.

```json
{
  "slug": "pro",
  "name": "Pro",
  "limits": { "maxAgents": 25, "maxConcurrentCalls": 50, "maxCallDurationSec": 3600, "maxMonthlyMinutes": 10000 },
  "models": {
    "llm": ["ollama/llama3.2:3b", "groq/llama-3.3-70b-versatile", "openai/gpt-4o-mini"],
    "tts": ["edge/en-US-AriaNeural", "elevenlabs/21m00Tcm4TlvDq8ikWAM", "openai/alloy"],
    "stt": ["deepgram/nova-2"]
  },
  "features": { "customProviders": true, "maxCustomProviders": 5 }
}
```

### Model Search

```
GET /api/dashboard/models/search?category=llm&query=gpt&skip=0&limit=10
```

Paginated search across all providers. Returns models sorted by: allowed first, then plan-gated.

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `category` | string | Yes | — | `llm`, `tts`, or `stt` |
| `query` | string | No | `""` | Search term (matches modelId and label) |
| `skip` | number | No | `0` | Pagination offset |
| `limit` | number | No | `10` | Page size |

```json
{
  "items": [
    {
      "providerId": "664a...",
      "providerKey": "openai",
      "providerName": "OpenAI",
      "modelId": "gpt-4o-mini",
      "label": "GPT-4o Mini",
      "source": "global",
      "allowed": true,
      "requiredPlan": null
    },
    {
      "providerId": "664a...",
      "providerKey": "openai",
      "providerName": "OpenAI",
      "modelId": "gpt-4o",
      "label": "GPT-4o",
      "source": "global",
      "allowed": false,
      "requiredPlan": "pro"
    }
  ],
  "total": 12,
  "skip": 0,
  "limit": 10
}
```

### Agents

**List agents:**

```
GET /api/dashboard/agents
```

Returns all agents with server-computed `status` and `pauseReason`.

```json
[
  {
    "_id": "664a...",
    "name": "Sales Bot",
    "llmProviderId": "664a...",
    "llmModelId": "llama-3.3-70b-versatile",
    "ttsProviderId": "664a...",
    "ttsModelId": "21m00Tcm4TlvDq8ikWAM",
    "sttProviderId": "664a...",
    "active": true,
    "status": "active",
    "pauseReason": null
  }
]
```

**Create agent:**

```
POST /api/dashboard/agents
Content-Type: application/json
```

```json
{
  "name": "Sales Bot",
  "persona": {
    "systemPrompt": "You are a sales assistant...",
    "greeting": "Hi! How can I help?",
    "personality": "friendly",
    "language": "en-US",
    "guardrails": "Keep responses short."
  },
  "llmProviderId": "664a...",
  "llmModelId": "llama-3.3-70b-versatile",
  "llmConfig": { "temperature": 0.4, "maxTokens": 200 },
  "ttsProviderId": "664a...",
  "ttsModelId": "21m00Tcm4TlvDq8ikWAM",
  "ttsConfig": { "speed": 1.0 },
  "sttProviderId": "664a...",
  "thresholds": {
    "silenceTimeoutMs": 700,
    "maxCallDurationSec": 1800,
    "interruptionSensitivity": "medium",
    "endpointingMs": 200
  }
}
```

**Validation:**
- Checks agent count against `plan.limits.maxAgents`
- Validates all provider IDs exist and belong to org or are global
- For global providers, checks plan allows the selected model

**Get agent:**

```
GET /api/dashboard/agents/:id
```

Returns single agent with `status` and `pauseReason`.

**Update agent:**

```
PATCH /api/dashboard/agents/:id
Content-Type: application/json
```

Partial update. Any subset of agent fields. Re-validates provider/model access.

**Delete agent:**

```
DELETE /api/dashboard/agents/:id
```

### Calls

**List calls:**

```
GET /api/dashboard/calls?agentId=...&status=completed&skip=0&limit=20
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | string | No | Filter by agent |
| `status` | string | No | `active`, `completed`, `failed` |
| `skip` | number | No | Pagination offset |
| `limit` | number | No | Page size (default 20) |

**Get call:**

```
GET /api/dashboard/calls/:id
```

Returns call with full transcript, summary, sentiment, and metrics.

**Count calls:**

```
GET /api/dashboard/calls/count
```

### Analytics

**Usage data:**

```
GET /api/dashboard/analytics/usage?days=30
```

Returns daily usage records (calls, minutes, tokens, TTS chars).

### API Keys

**List:**

```
GET /api/dashboard/api-keys
```

Returns keys with `keyPrefix`, `name`, `createdAt`, `lastUsedAt`. No hashes or raw keys.

**Create:**

```
POST /api/dashboard/api-keys
Content-Type: application/json
{ "name": "Production Key" }
```

Response includes `rawKey` — **shown only once**.

**Revoke:**

```
DELETE /api/dashboard/api-keys/:id
```

### Providers

**List provider registry:**

```
GET /api/dashboard/providers/registry
```

Returns catalog of supported provider types with available models.

**List providers:**

```
GET /api/dashboard/providers
GET /api/dashboard/providers?client=true
```

Without `client=true`: returns all providers (global + client). With `client=true`: returns only client-owned providers. Credentials are never included.

**Get provider:**

```
GET /api/dashboard/providers/:id
```

**Create client provider:**

```
POST /api/dashboard/providers
Content-Type: application/json
```

```json
{
  "category": "llm",
  "providerKey": "openai",
  "name": "My OpenAI",
  "credentials": { "apiKey": "sk-..." },
  "models": [{ "modelId": "gpt-4o", "label": "GPT-4o" }],
  "settings": {}
}
```

Checks: plan allows custom providers, under limit, name unique.

**Update client provider:**

```
PATCH /api/dashboard/providers/:id
Content-Type: application/json
{ "name": "Updated Name", "active": false }
```

**Delete client provider:**

```
DELETE /api/dashboard/providers/:id
```

Returns 409 with agent list if provider is in use.

---

## Error Responses

All errors follow this format:

```json
{ "error": "Human-readable error message" }
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request (missing fields, validation error) |
| 401 | Unauthorized (missing or invalid auth) |
| 403 | Forbidden (org pending, insufficient permissions) |
| 404 | Not found |
| 409 | Conflict (duplicate, provider in use) |
| 429 | Rate limited |
| 500 | Internal server error |

---

## Twilio Webhook

```
POST /api/twilio/voice?api_key=vx_...
```

Twilio sends this webhook when a call comes in. Returns TwiML that starts a Media Stream WebSocket connection. See [Twilio](./twilio) for details.
