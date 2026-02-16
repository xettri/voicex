# Voicex - AI Voice Assistant

Real-time AI voice assistant for conversational use cases. Web first; call center (phone) planned.

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- [Deepgram API key](https://console.deepgram.com/) (for speech-to-text)

### Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Backend: copy `.env.example` to `.env` and configure:
   ```bash
   cp backend/.env.example backend/.env
   # Required: DEEPGRAM_API_KEY (speech-to-text, $200 free credit)
   # TTS: Edge TTS is FREE by default. Add ELEVENLABS or OPENAI for premium.
   # LLM: Ollama (free) | Groq (free/cheap) | OpenAI. See docs/PRICING.md
   ```

3. Run both frontend and backend:
   ```bash
   pnpm dev
   ```

4. Open http://localhost:3000 and click **Connect** to start the voice assistant.

### Project Structure

- `frontend/` - Next.js 14 app (port 3000)
- `backend/` - Node.js WebSocket server (port 3001)

### TypeScript

Both frontend and backend use strict TypeScript (`strict: true`). The backend enforces `@typescript-eslint/no-explicit-any` and typed WebSocket message parsing. JSON from external APIs is validated via typed parsers (`parseClientMessage`, `parseOllamaToken`, etc.).

### Environment

| Variable | Location | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_WS_URL` | frontend/.env.local | WebSocket URL (default: ws://localhost:3001/ws/voice) |
| `DEEPGRAM_API_KEY` | backend/.env | Required for speech-to-text ($200 free) |
| `LLM_PROVIDER` | backend/.env | `ollama` (free) \| `groq` (free/cheap) \| `openai` |
| `GROQ_API_KEY` | backend/.env | For Groq LLM (free tier) |
| `OPENAI_API_KEY` | backend/.env | For OpenAI LLM and/or TTS |
| `ELEVENLABS_API_KEY` | backend/.env | For premium TTS (optional) |
| `SYSTEM_TTS_CMD` | backend/.env | System TTS: `say,-o,{out},--data-format=LEF32@22050,{text}` (macOS) or `espeak,-w,{out},{text}` (Linux) |
| `SYSTEM_TTS_EXT` | backend/.env | With SYSTEM_TTS_CMD: `wav` (AIFF fails in Chrome/Firefox) |
| `PORT` | backend/.env | Backend port (default: 3001) |

See [docs/PRICING.md](docs/PRICING.md) for cost strategy.
