# Getting Started

Get Voicex running locally in 5 minutes.

## Prerequisites

- **Node.js 18+**
- **pnpm** — `npm install -g pnpm`
- **Deepgram API key** — [console.deepgram.com](https://console.deepgram.com/) (free $200 credit)

## 1. Install

```bash
git clone <your-repo-url> voicex
cd voicex
pnpm install
```

## 2. Configure

```bash
cp backend/.env.example backend/.env.local
```

Edit `backend/.env.local`:

```bash
# ─── Required ───────────────────────────────────────────────
DEEPGRAM_API_KEY=your_deepgram_key

# ─── LLM (pick one) ────────────────────────────────────────
# Option A: Groq (recommended — free, fast, ~200ms first token)
LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_key

# Option B: OpenAI
# LLM_PROVIDER=openai
# OPENAI_API_KEY=your_openai_key

# Option C: Ollama (free, local, slower)
# LLM_PROVIDER=ollama
# OLLAMA_BASE_URL=http://localhost:11434

# ─── TTS (pick one — required for production) ─────────────
# Option A: ElevenLabs (recommended — best quality)
ELEVENLABS_API_KEY=your_elevenlabs_key

# Option B: OpenAI TTS
# OPENAI_API_KEY=your_openai_key

# If no TTS key is set, Edge TTS is used as fallback (dev/testing only)
```

## 3. Run

```bash
pnpm dev
```

This starts both:

| Service      | URL                                                                  |
| ------------ | -------------------------------------------------------------------- |
| Frontend     | [http://localhost:3000](http://localhost:3000)                       |
| Backend      | [http://localhost:3001](http://localhost:3001)                       |
| WebSocket    | `ws://localhost:3001/ws/voice`                                       |
| Health Check | [http://localhost:3001/api/health](http://localhost:3001/api/health) |

## 4. Use

1. Open [http://localhost:3000](http://localhost:3000)
2. Click **Connect**
3. Allow microphone access
4. Start talking!

## Zero-Cost Setup

Run everything for free:

```bash
DEEPGRAM_API_KEY=your_key   # $200 free credit = ~34,000 minutes
LLM_PROVIDER=ollama          # Free, runs locally
OLLAMA_BASE_URL=http://localhost:11434
# No TTS key needed — Edge TTS is used as dev fallback
```

Install Ollama first:

```bash
# Install: https://ollama.ai
ollama pull llama3.2:3b
```

::: tip
Local Ollama has higher latency (1-3s) compared to Groq (~200ms). For the best experience, get a free Groq key at [console.groq.com](https://console.groq.com).
:::

::: warning
The zero-cost setup uses Edge TTS, which relies on an unofficial Microsoft endpoint. This is fine for local development but **not suitable for production**. For production, always set `ELEVENLABS_API_KEY` or `OPENAI_API_KEY`.
:::

## Project Structure

```
voicex/
├── frontend/                 # Next.js 14 (port 3000)
│   └── src/
│       ├── components/       # VoiceAssistant, AudioCapture, AudioPlayer
│       └── lib/              # useVoiceConnection hook, WS types
├── backend/                  # Node.js + Express + WebSocket (port 3001)
│   └── src/
│       ├── providers/
│       │   ├── stt/          # Deepgram speech-to-text
│       │   ├── llm/          # Groq, OpenAI, Ollama
│       │   ├── tts/          # ElevenLabs, OpenAI, Edge, System
│       │   └── call/         # WebSocket, Twilio channels
│       ├── services/         # Voice pipeline, session management
│       ├── handlers/         # WebSocket + Twilio connection handlers
│       ├── middleware/        # Auth, rate limiting
│       ├── repositories/     # MongoDB sessions, usage, history
│       └── config/           # Environment, voice config
└── docs/                     # This documentation (VitePress)
```
