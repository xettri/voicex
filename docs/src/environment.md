# Environment Variables

All backend configuration is done through environment variables. The backend reads from `backend/.env` and `backend/.env.local` (local overrides).

Frontend variables go in `frontend/.env.local`.

---

## Backend Variables

### Required

| Variable | Description | Get it at |
|----------|-------------|-----------|
| `DEEPGRAM_API_KEY` | Speech-to-text API key | [console.deepgram.com](https://console.deepgram.com/) |
| `MONGODB_URI` | MongoDB connection string | Local, Docker, or [Atlas](https://cloud.mongodb.com) |
| `JWT_SECRET` | JWT signing key (min 32 chars) | Generate a strong random string |
| `ENCRYPTION_KEY` | AES-256 key for provider credentials (64-char hex) | See below |

**Generate ENCRYPTION_KEY:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### LLM Provider

At least one LLM provider is needed.

| Variable | Default | Description |
|----------|---------|-------------|
| `GROQ_API_KEY` | — | Groq API key. [console.groq.com](https://console.groq.com/) |
| `OPENAI_API_KEY` | — | OpenAI API key. [platform.openai.com](https://platform.openai.com/) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL (free, local) |

These are used by the `seed-global-providers.sh` script to populate global provider credentials.

---

### TTS Provider

| Variable | Default | Description |
|----------|---------|-------------|
| `ELEVENLABS_API_KEY` | — | ElevenLabs API key. [elevenlabs.io](https://elevenlabs.io/) |
| `OPENAI_API_KEY` | — | Also used for OpenAI TTS if set |
| `SYSTEM_TTS_CMD` | — | System command for local TTS |
| `SYSTEM_TTS_EXT` | — | Output file extension for system TTS |

If no TTS key is set, **Edge TTS** is used as a free fallback (dev/testing only).

**System TTS examples:**

```bash
# macOS
SYSTEM_TTS_CMD=say,-o,{out},--data-format=LEF32@22050,{text}
SYSTEM_TTS_EXT=wav

# Linux
SYSTEM_TTS_CMD=espeak,-w,{out},{text}
SYSTEM_TTS_EXT=wav
```

---

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development`, `production`, or `test` |
| `PORT` | `3001` | Backend HTTP/WS server port |
| `LOG_LEVEL` | — | Pino log level: `trace`, `debug`, `info`, `warn`, `error` |
| `CORS_ORIGIN` | `*` | Allowed CORS origin. Set to your frontend URL in production |

---

### Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `API_KEYS` | — | Comma-separated legacy API keys (for dev fallback) |
| `JWT_SECRET` | — | **Required.** Secret for signing JWT tokens (min 32 chars) |
| `JWT_EXPIRES_IN` | `1h` | JWT token expiry. Examples: `1h`, `30m`, `7d` |

> **Note:** `API_KEYS` is a legacy env-based auth method. In production, use the database-backed API keys created via the dashboard.

---

### Database & Cache

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | — | **Required.** MongoDB connection string |
| `MONGODB_MAX_POOL_SIZE` | `100` | MongoDB connection pool size per instance |
| `REDIS_URL` | — | Redis URL for caching, rate limiting, conversation history |

**Redis is optional.** Without it:
- Rate limiting is in-memory (single instance only)
- Conversation history is in-memory (lost on restart)
- Plan cache is in-memory only (no L2 cache)

---

### Security

| Variable | Default | Description |
|----------|---------|-------------|
| `ENCRYPTION_KEY` | Dev fallback | 64-char hex string (32 bytes) for AES-256-GCM encryption |

If not set in development, a deterministic fallback key is derived from a hardcoded string (with a console warning). **Always set in production.**

---

### Twilio (Phone Calls)

| Variable | Default | Description |
|----------|---------|-------------|
| `TWILIO_APP_URL` | — | Backend's public URL (e.g., `https://api.voicex.com`) |

Required for Twilio phone call support. See [Twilio Setup](./twilio).

---

## Frontend Variables

Set in `frontend/.env.local`.

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api` | Backend API base URL |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3001/ws/voice` | WebSocket voice URL |
| `NEXT_PUBLIC_API_KEY` | — | API key for WebSocket auth (dev convenience) |

---

## Example Configurations

### Minimal (Development)

```bash
# backend/.env.local
DEEPGRAM_API_KEY=your_deepgram_key
MONGODB_URI=mongodb://localhost:27017/voicex
JWT_SECRET=development_secret_at_least_32_chars
ENCRYPTION_KEY=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2
GROQ_API_KEY=your_groq_key
```

### Full Production

```bash
# backend/.env.local
NODE_ENV=production
PORT=3001

# Required
DEEPGRAM_API_KEY=your_deepgram_key
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/voicex
JWT_SECRET=your_production_min_32_char_secret
ENCRYPTION_KEY=your_64_char_hex_production_key

# LLM + TTS keys (for global providers)
GROQ_API_KEY=your_groq_key
OPENAI_API_KEY=your_openai_key
ELEVENLABS_API_KEY=your_elevenlabs_key

# Infrastructure
REDIS_URL=redis://your-redis:6379
CORS_ORIGIN=https://your-frontend.com

# Twilio (optional)
TWILIO_APP_URL=https://api.your-domain.com
```

### Zero-Cost (Dev)

```bash
# backend/.env.local
DEEPGRAM_API_KEY=your_key        # $200 free credit
MONGODB_URI=mongodb://localhost:27017/voicex
JWT_SECRET=at_least_32_characters_long_secret
ENCRYPTION_KEY=<generate_64_hex>
OLLAMA_BASE_URL=http://localhost:11434
# No TTS key → Edge TTS fallback (dev only)
```
