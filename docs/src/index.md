---
layout: home
hero:
  name: Voicex
  text: Real-time AI Voice Agent Platform
  tagline: Build, deploy, and manage AI voice agents with sub-second latency. SaaS dashboard, multi-tenant auth, relational provider architecture, plan-based access control.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Architecture
      link: /architecture

features:
  - icon: ⚡
    title: Sub-Second Latency
    details: Streaming STT → LLM → TTS pipeline. The AI starts speaking before finishing its thought. Typical first-audio in ~800ms.
  - icon: 🤖
    title: Multi-Agent Support
    details: Create multiple AI agents with different personas, LLM models, TTS voices, and behavior thresholds. Each agent is independently configurable.
  - icon: 🔐
    title: Multi-Tenant SaaS
    details: Organizations, users, JWT auth, API keys, plan-based access control. Full dashboard for managing agents, calls, providers, and analytics.
  - icon: 🧩
    title: Pluggable Providers
    details: Unified provider architecture for LLM (Groq, OpenAI, Ollama), TTS (ElevenLabs, OpenAI, Edge), and STT (Deepgram). Bring your own API keys.
  - icon: 📊
    title: Plan & Billing System
    details: Four tiers (Free → Enterprise) with model access control, agent limits, custom provider support, and Redis-cached plan lookups.
  - icon: 📞
    title: Phone & Web Calling
    details: Browser-based voice via WebSocket and phone calls via Twilio Media Streams. Same pipeline, different transports.
---

## Documentation

| Section | Description |
|---------|-------------|
| [Getting Started](./getting-started) | Install, configure, seed data, and run locally in 10 minutes |
| [Architecture](./architecture) | System overview, voice pipeline, data flow diagrams |
| [Database Schema](./database) | All collections, fields, indexes, relationships, and defaults |
| [Authentication](./authentication) | Signup/signin flow, JWT tokens, API keys, org status lifecycle |
| [Providers](./providers) | Unified provider system — global vs client, encryption, registry |
| [Plans & Billing](./plans-and-billing) | Plan tiers, model access, features, Redis caching, pricing |
| [Frontend](./frontend) | Next.js dashboard — pages, components, contexts, voice UI |
| [REST API](./rest-api) | All HTTP endpoints with request/response examples |
| [WebSocket API](./websocket-api) | Voice protocol, message types, audio format, reconnection |
| [Environment Variables](./environment) | Every env var with description, defaults, and examples |
| [Admin Scripts](./admin-scripts) | Seed scripts, migrations, mongosh commands, bash helpers |
| [Deployment](./deployment) | Docker, Nginx, scaling, production checklist |
| [Client Integration](./client-integration) | Embed voice in your app — WebSocket + REST from client code |
| [Twilio](./twilio) | Phone call integration via Twilio Media Streams |

## Quick Start

```bash
git clone <your-repo-url> voicex
cd voicex
pnpm install

# Configure
cp backend/.env.example backend/.env.local
# Edit backend/.env.local with your API keys

# Seed database (plans, providers, test data)
bash scripts/seed-plans.sh
bash scripts/seed-global-providers.sh
bash scripts/seed.sh

# Run
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) → Sign in with `a@a.dev` / `12345678` (test account).

## How It Works

```
User speaks → Deepgram STT → LLM (Groq/OpenAI/Ollama) → TTS (ElevenLabs/OpenAI/Edge) → User hears AI
```

The entire pipeline streams in real-time. Each sentence is spoken as soon as it's generated — while the LLM continues producing the next sentence.
