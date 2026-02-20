# Getting Started

Get Voicex running locally in 10 minutes — from zero to a working voice agent.

---

## Prerequisites

| Requirement | Purpose | Install |
|-------------|---------|---------|
| **Node.js 18+** | Runtime | [nodejs.org](https://nodejs.org) |
| **pnpm** | Package manager | `npm install -g pnpm` |
| **MongoDB** | Database | Local, Docker, or [Atlas](https://cloud.mongodb.com) (free tier) |
| **Deepgram API key** | Speech-to-text | [console.deepgram.com](https://console.deepgram.com/) ($200 free credit) |

**Optional but recommended:**

| Requirement | Purpose |
|-------------|---------|
| Redis | Distributed rate limiting, plan caching, conversation history |
| Groq API key | Fast LLM (~200ms), free tier at [console.groq.com](https://console.groq.com/) |
| ElevenLabs API key | High-quality TTS, 10K chars/month free at [elevenlabs.io](https://elevenlabs.io/) |

---

## 1. Clone & Install

```bash
git clone <your-repo-url> voicex
cd voicex
pnpm install
```

---

## 2. Configure Environment

```bash
cp backend/.env.example backend/.env.local
```

Edit `backend/.env.local`:

```bash
# ─── Required ───────────────────────────────────────────────
DEEPGRAM_API_KEY=your_deepgram_key
MONGODB_URI=mongodb://localhost:27017/voicex
JWT_SECRET=your_min_32_char_secret_here_please

# ─── LLM (pick one) ────────────────────────────────────────
# Option A: Groq (recommended — free, fast, ~200ms first token)
GROQ_API_KEY=your_groq_key

# Option B: OpenAI
# OPENAI_API_KEY=your_openai_key

# Option C: Ollama (free, local, slower)
# OLLAMA_BASE_URL=http://localhost:11434

# ─── TTS (optional — Edge TTS is free fallback for dev) ────
# ELEVENLABS_API_KEY=your_elevenlabs_key

# ─── Encryption (for provider credentials at rest) ─────────
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your_64_char_hex_string

# ─── Optional ──────────────────────────────────────────────
# REDIS_URL=redis://localhost:6379
# CORS_ORIGIN=http://localhost:3000
```

See [Environment Variables](./environment) for the full reference.

---

## 3. Start MongoDB

Pick one approach:

**Docker (easiest):**

```bash
docker run -d --name voicex-mongo -p 27017:27017 mongo:7
```

**Local install:**

```bash
# macOS
brew services start mongodb-community

# Linux
sudo systemctl start mongod
```

**MongoDB Atlas (cloud):**

Use your connection string as `MONGODB_URI`.

---

## 4. Seed the Database

Voicex requires seed data: plans, global providers, and (optionally) test data. Run these scripts **in order**:

```bash
# Step 1: Seed the 4 standard plans (free, starter, pro, enterprise)
bash scripts/seed-plans.sh

# Step 2: Seed global providers (LLM, TTS, STT — reads API keys from .env.local)
bash scripts/seed-global-providers.sh

# Step 3: Seed provider registry (catalog of supported provider types)
# + test organization (a@a.dev / 12345678) + test agent
bash scripts/seed.sh
```

All scripts are **idempotent** — safe to run multiple times. They skip existing records.

**What gets created:**

| Script | Creates |
|--------|---------|
| `seed-plans.sh` | 4 plans: free, starter, pro, enterprise |
| `seed-global-providers.sh` | 7 global providers: Ollama, Groq, OpenAI (LLM) + Edge, ElevenLabs, OpenAI (TTS) + Deepgram (STT) |
| `seed.sh` | Provider registry, test org (`TestOrg`, pro plan), test user (`a@a.dev` / `12345678`), test agent, DB indexes |

---

## 5. Run

```bash
pnpm dev
```

This starts both frontend and backend:

| Service | URL |
|---------|-----|
| Frontend (Dashboard) | [http://localhost:3000](http://localhost:3000) |
| Backend API | [http://localhost:3001/api](http://localhost:3001/api) |
| WebSocket (Voice) | `ws://localhost:3001/ws/voice` |
| Health Check | [http://localhost:3001/api/health](http://localhost:3001/api/health) |

---

## 6. First Login

1. Open [http://localhost:3000](http://localhost:3000)
2. Sign in with the test account: **`a@a.dev`** / **`12345678`**
3. You'll see the dashboard with a pre-configured test agent

---

## 7. Try a Voice Call

1. Go to **Playground** in the sidebar
2. Select the test agent from the dropdown
3. Click **Start Call**
4. Allow microphone access
5. Start talking — the AI responds in real-time

---

## Project Structure

```
voicex/
├── frontend/                        # Next.js 14 (port 3000)
│   └── src/
│       ├── app/                     # Pages (login, signup, dashboard/*)
│       ├── components/              # VoiceAssistant, Toast, ConfirmDialog
│       ├── lib/                     # API client, plan context, voice hook
│       └── utils/                   # cn() class utility
│
├── backend/                         # Node.js + Express + WS (port 3001)
│   └── src/
│       ├── db/                      # Schema definitions, DB connection
│       ├── repositories/            # Data access layer (9 repos)
│       ├── routes/                  # REST API endpoints
│       ├── services/                # Voice session, pipeline, auth
│       ├── handlers/                # WebSocket connection handlers
│       ├── ws/                      # WebSocket gateway
│       ├── middleware/              # Auth, rate limiting
│       ├── providers/               # STT, LLM, TTS, Call channel providers
│       ├── shared/                  # Logger, encryption, errors, audio
│       ├── config/                  # Environment config (Zod)
│       └── scripts/                 # Seed & migration scripts
│
├── docs/src/                        # This documentation
└── scripts/                         # Bash wrappers for seed scripts
```

---

## Zero-Cost Setup

Run everything for free (with some trade-offs):

```bash
DEEPGRAM_API_KEY=your_key          # $200 free credit = ~34,000 minutes
MONGODB_URI=mongodb://localhost:27017/voicex
JWT_SECRET=at_least_32_characters_long_secret
ENCRYPTION_KEY=<generate_64_hex>
# LLM: Ollama (free, local) — install from https://ollama.ai
OLLAMA_BASE_URL=http://localhost:11434
# TTS: Edge TTS auto-fallback (no key needed, dev only)
```

```bash
ollama pull llama3.2:3b
```

**Trade-offs:** Ollama has higher latency (1-3s) compared to Groq (~200ms). Edge TTS is unofficial and not production-safe.

---

## Creating a Real Account

The test account is for development. To create a real organization:

1. Go to [http://localhost:3000/signup](http://localhost:3000/signup)
2. Fill in name, email, password, org name
3. You'll be redirected to the **Pending** page
4. Activate the org in MongoDB:

```bash
mongosh mongodb://localhost:27017/voicex --eval '
  db.organizations.updateOne(
    { ownerEmail: "your@email.com" },
    { $set: { status: "active", updatedAt: new Date() } }
  )
'
```

5. Sign in at [http://localhost:3000/login](http://localhost:3000/login)

See [Authentication](./authentication) for the full auth flow and [Admin Scripts](./admin-scripts) for more management commands.

---

## What's Next?

| Goal | Read |
|------|------|
| Understand the system design | [Architecture](./architecture) |
| Learn the database schema | [Database Schema](./database) |
| Set up providers and models | [Providers](./providers) |
| Understand plans and billing | [Plans & Billing](./plans-and-billing) |
| Build the frontend | [Frontend](./frontend) |
| Integrate from your app | [Client Integration](./client-integration) |
| Deploy to production | [Deployment](./deployment) |
