# VoiceX — AI Agent Context

> This file provides project context for AI coding assistants (Cursor, Copilot, Codex, Windsurf, Cline, etc.).
> Read this before making any changes to understand the architecture, conventions, and patterns.

## What Is This

Real-time voice AI platform (comparable to SoundHound) with a SaaS dashboard, web calling, phone integration (Twilio), and an API for clients to embed voice agents into their own platforms.

## Stack

| Layer      | Tech                                                             |
| ---------- | ---------------------------------------------------------------- |
| Monorepo   | pnpm workspaces (`frontend`, `backend`, `docs`)                  |
| Backend    | Node.js + Express + TypeScript (ESM, `"type": "module"`)         |
| Frontend   | Next.js 14 (App Router) + Tailwind CSS                           |
| Database   | MongoDB 7 (primary) + Redis 7 (rate-limit, conversation history) |
| Realtime   | WebSocket (`ws` library) — `/ws/voice`, `/ws/twilio/stream`      |
| Docs       | VitePress                                                        |
| Containers | `docker-compose.yml` — backend, mongo, redis                     |

## Directory Map

```
backend/src/
  config/        — env.ts, voice.config.ts
  db/            — client.ts (Mongo connection), schema.ts (ALL interfaces + defaults)
  handlers/      — voice.handler.ts, twilio.handler.ts
  middleware/    — auth.ts, rate-limit.ts, api-limiter.ts
  providers/
    llm/         — groq, openai, ollama + factory + interface
    tts/         — elevenlabs, openai, edge, system + factory + interface
    stt/         — deepgram + interface
    call/        — websocket, twilio + interface
  repositories/  — one file per collection (agent, call, apikey, organization, user, platform-config, org-model-config, client-provider, etc.)
  routes/        — auth, dashboard, setup, health, twilio, index (aggregator)
  services/      — auth, voice-session, voice-pipeline, call-summary, context-manager
  shared/        — logger (pino), audio-utils, mp3-to-mulaw, errors, types, encryption (AES-256-GCM)
  ws/            — gateway.ts (WebSocket upgrade + auth + routing)
  scripts/       — seed.ts, seed-providers.ts

frontend/src/
  app/           — Next.js App Router pages
    dashboard/   — layout + pages: agents, agents/[id], calls, calls/[id], playground, settings, analytics, providers
    login/, signup/, pending/
  components/    — VoiceAssistant, TranscriptDisplay, AudioCapture, AudioPlayer, ConfirmDialog, Toast, SearchableSelect
  lib/           — api.ts (HTTP client), useVoiceConnection.ts (WS hook), ws-types.ts

docs/src/        — VitePress markdown (getting-started, architecture, websocket-api, admin-scripts, etc.)
scripts/         — seed.sh, seed-providers.sh (bash runners for backend seeds)
```

## Key Conventions

- **ESM only** — all backend imports use `.js` extensions (`import x from './foo.js'`)
- **No classes** — everything is factory functions (`createXxxProvider(...)`)
- **Provider pattern** — each provider implements an interface (e.g., `LLMProvider`, `TTSProvider`, `STTProvider`); a factory function selects which one based on config
- **Repository pattern** — pure functions accepting `(db: Db, ...)`, no ORM
- **Schema in one file** — `backend/src/db/schema.ts` has ALL TypeScript interfaces, defaults, and plan limits
- **Frontend API** — single `api.ts` with typed `request<T>()` helper; auto-handles JWT + API key auth + 401/403 redirects
- **Styling** — Tailwind only, light mode forced, explicit `text-gray-900 bg-white` on form inputs
- **No native dialogs** — use `ConfirmDialog` component, never `window.confirm()`
- **Notifications** — use `useToast()` hook + `ToastContainer` component

## Authentication (Two Modes)

1. **Dashboard users** — email/password → JWT (`vx_token` in localStorage) → `Authorization: Bearer` header
2. **API integrations** — `vx_` prefixed API keys → `x-api-key` header

Auth middleware in `dashboard.routes.ts` checks Bearer first, falls back to API key.
WebSocket gateway (`ws/gateway.ts`) accepts both via query params (`?token=` or `?api_key=`).

### Signup Flow

Signup → org created with `status: 'pending'` → admin manually activates in DB → user can sign in.
First-time setup: `POST /api/setup` creates initial org + admin key (one-time, no auth needed).

## Database Collections

| Collection          | Key Fields                                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `organizations`     | name, plan (`free`/`starter`/`pro`/`enterprise`), status (`pending`/`active`), ownerEmail, limits                                               |
| `users`             | orgId, email, passwordHash (scrypt), name, role (`admin`/`member`)                                                                              |
| `agents`            | orgId, name, persona, voice `{provider, voiceId, speed, configId?}`, llm `{provider, model, temperature, maxTokens, configId?}`, stt?, active   |
| `calls`             | orgId, agentId, sessionId, channel, status, metrics, transcript, summary, sentiment                                                             |
| `api_keys`          | orgId, keyHash (sha256), keyPrefix, name, scopes, revokedAt                                                                                     |
| `platform_config`   | type: `'models'`, llm[] (each with `plans: PlanTier[]`), tts[] (each with `plans: PlanTier[]`)                                                  |
| `org_model_config`  | orgId, llmOverrides[], ttsOverrides[] — per-org model grants/revocations                                                                        |
| `provider_registry` | category (`llm`/`tts`/`stt`), providerKey, displayName, requiresKey, models[], settings[] — read-only catalog                                   |
| `client_providers`  | orgId, category, providerKey, name, credentials (AES-256-GCM encrypted), models[], settings, active — client-owned provider configs              |
| `daily_usage`       | orgId, date, calls, minutes, ttsChars, llmTokens                                                                                                |

## Model Access (Two-Layer + Client Providers)

**Global** (`platform_config`) — every model the platform supports; each entry has a `plans` array declaring which plan tiers include it by default.

**Per-org** (`org_model_config`) — overrides per organization: `{ provider, id, enabled }` to grant models above the plan or revoke models the plan includes.

**Client providers** (`client_providers`) — clients can bring their own API keys for any supported provider. Credentials are encrypted at rest with AES-256-GCM (key: `ENCRYPTION_KEY` env var). When an agent has a `configId` on its llm/voice/stt settings, the voice session service decrypts the client's credentials at runtime and uses them instead of platform keys.

Resolution: `getEffectiveModels(db, orgId)` filters global models by the org's plan, then applies org overrides.

Enforced at: dashboard API (agent create/update returns 403), WebSocket gateway (session start rejects with 4003), frontend (dropdown shows both platform and custom provider options with group headers).

Delete guard: client providers cannot be deleted if any agents reference them (`findAgentsUsingProvider` check).

### Plan Defaults

| Plan             | LLM                                 | TTS                                     |
| ---------------- | ----------------------------------- | --------------------------------------- |
| free             | ollama/llama3.2:3b                  | edge TTS (Aria, Guy)                    |
| starter          | free + groq/llama-3.3-70b-versatile | free + elevenlabs (Rachel, Sarah, Adam) |
| pro / enterprise | all models                          | all voices                              |

## Voice Pipeline

```
Browser mic → WebSocket → Deepgram STT → LLM (streaming) → TTS (streaming) → WebSocket → Browser speaker
```

Key files: `voice-session.service.ts` (orchestrator), `voice-pipeline.service.ts` (STT→LLM→TTS chain).
Providers receive model/voice params from agent config — never hardcoded.

## Running

```bash
pnpm dev                  # frontend + backend concurrently
pnpm dev:backend          # backend only (tsx watch, port 3001)
pnpm dev:frontend         # frontend only (next dev, port 3000)
./scripts/seed.sh         # seed DB (add-only, idempotent, safe to re-run)
./scripts/seed-providers.sh  # seed provider registry (add-only, idempotent)
```

## Seed / Test Credentials

Run `./scripts/seed.sh` once to create: test org (pro plan), user `test@voicex.dev` / `test1234`, API key (printed on first run), and a default agent.

## Environment Variables (backend/.env)

Critical: `MONGODB_URI`, `DEEPGRAM_API_KEY`, `JWT_SECRET`, `ENCRYPTION_KEY` (64-char hex for AES-256-GCM)
Provider keys: `GROQ_API_KEY`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `OLLAMA_BASE_URL`
Optional: `REDIS_URL`, `TWILIO_APP_URL`, `CORS_ORIGIN`, `API_KEYS`

See `backend/.env.example` for the full list.
