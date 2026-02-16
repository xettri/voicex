# Environment Variables

All configuration is done through environment variables. The backend reads from `backend/.env` and `backend/.env.local` (local overrides).

---

## Required

| Variable | Description | Get it at |
|----------|-------------|-----------|
| `DEEPGRAM_API_KEY` | Speech-to-text API key | [console.deepgram.com](https://console.deepgram.com/) |

Plus at least one LLM provider (see below).

---

## LLM Provider

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `ollama` | Which LLM to use: `groq`, `openai`, or `ollama` |
| `GROQ_API_KEY` | — | Groq API key. [console.groq.com](https://console.groq.com/) |
| `OPENAI_API_KEY` | — | OpenAI API key. [platform.openai.com](https://platform.openai.com/) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |

**Selection logic:** Uses the provider set by `LLM_PROVIDER`. Falls back to whichever key is available: OpenAI → Groq → Ollama.

**Models used:**
| Provider | Model | Latency |
|----------|-------|---------|
| Groq | `llama-3.1-8b-instant` | ~200ms first token |
| OpenAI | `gpt-4o-mini` | ~500ms first token |
| Ollama | `llama3.2:3b` | 1-3s first token |

---

## TTS Provider

| Variable | Default | Description |
|----------|---------|-------------|
| `ELEVENLABS_API_KEY` | — | ElevenLabs API key. [elevenlabs.io](https://elevenlabs.io/) |
| `OPENAI_API_KEY` | — | Also used for OpenAI TTS if set |
| `SYSTEM_TTS_CMD` | — | System command for local TTS (see below) |
| `SYSTEM_TTS_EXT` | — | Output file extension for system TTS |

**Selection priority:** System TTS → ElevenLabs → OpenAI → Edge TTS (dev fallback only).

**System TTS examples:**
```bash
# macOS
SYSTEM_TTS_CMD=say,-o,{out},--data-format=LEF32@22050,{text}
SYSTEM_TTS_EXT=wav

# Linux
SYSTEM_TTS_CMD=espeak,-w,{out},{text}
SYSTEM_TTS_EXT=wav
```

> **Tip:** For production, use ElevenLabs (best quality) or OpenAI TTS. Edge TTS uses an unofficial endpoint with no SLA — only suitable for dev/testing.

---

## Server

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development`, `production`, or `test` |
| `PORT` | `3001` | Backend HTTP/WS server port |
| `LOG_LEVEL` | — | `trace`, `debug`, `info`, `warn`, or `error` |
| `CORS_ORIGIN` | `*` | Allowed CORS origin. Set to your frontend URL in production |

---

## Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `API_KEYS` | — | Comma-separated API keys for client auth. Example: `key1,key2,key3` |
| `JWT_SECRET` | — | Secret for signing JWT tokens (min 32 chars). Required for `/api/auth/token` |
| `JWT_EXPIRES_IN` | `1h` | JWT token expiry. Examples: `1h`, `30m`, `7d` |

> **Note:** If `API_KEYS` is empty, authentication is disabled (open access). Set at least one key in production.

---

## Database & Cache

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | — | MongoDB connection string. Enables session tracking and usage metrics |
| `MONGODB_MAX_POOL_SIZE` | `50` | MongoDB connection pool size per backend instance |
| `REDIS_URL` | — | Redis URL. Enables distributed rate limiting and conversation history |

> **Note:** Both are optional. Without MongoDB, sessions/usage aren't tracked. Without Redis, rate limiting is in-memory (single instance only) and conversation history is in-memory (lost on restart).

---

## Twilio (Phone Calls)

| Variable | Default | Description |
|----------|---------|-------------|
| `TWILIO_APP_URL` | — | Your backend's public URL. Example: `https://api.voicex.com` |

Required for Twilio phone call support. See [Twilio Setup](./twilio.md).

---

## Frontend

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3001/ws/voice` | WebSocket server URL |
| `NEXT_PUBLIC_API_KEY` | — | API key to include in WebSocket connection |

Set in `frontend/.env.local`.

---

## Example: Minimal `.env.local`

```bash
DEEPGRAM_API_KEY=your_deepgram_key
LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_key
```

This gives you: Deepgram STT + Groq LLM + Edge TTS fallback. Fast and low cost. For production, add `ELEVENLABS_API_KEY` for reliable TTS.

---

## Example: Premium `.env.local`

```bash
DEEPGRAM_API_KEY=your_deepgram_key
LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_key
ELEVENLABS_API_KEY=your_elevenlabs_key
API_KEYS=sk_live_client1,sk_live_client2
JWT_SECRET=your_min_32_char_secret_here_abc
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/voicex
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=https://your-app.com
```
