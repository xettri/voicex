# Providers

Voicex uses a pluggable provider architecture for STT, LLM, and TTS. Each layer can be swapped independently.

## STT (Speech-to-Text)

Only Deepgram is supported. It's required.

| Provider | Model | Cost | Latency | Notes |
|----------|-------|------|---------|-------|
| **Deepgram** | Nova-2 | $0.0058/min | ~100ms | $200 free credit |

**Features enabled:**
- `interim_results` — show partial transcriptions in real-time
- `endpointing: 300` — detect 300ms silence as end-of-speech
- `utterance_end_ms: 1000` — fallback end-of-utterance detection
- `vad_events` — voice activity detection for fast interrupt
- `speech_final` — instant trigger when speaker finishes

```bash
DEEPGRAM_API_KEY=your_key
```

Get your key at [console.deepgram.com](https://console.deepgram.com/).

---

## LLM (Language Model)

Three providers supported. Set `LLM_PROVIDER` to choose.

| Provider | Model | Cost | First Token | Best For |
|----------|-------|------|-------------|----------|
| **Groq** | llama-3.1-8b-instant | Free tier / ~$0.05/M tokens | ~200ms | Production (fast + cheap) |
| **OpenAI** | gpt-4o-mini | ~$0.15-0.60/M tokens | ~500ms | Premium quality |
| **Ollama** | llama3.2:3b | Free (local) | 1-3s | Dev, privacy, offline |

### Groq (Recommended)

Fastest cloud LLM. Free tier available.

```bash
LLM_PROVIDER=groq
GROQ_API_KEY=your_key
```

Get your key at [console.groq.com](https://console.groq.com/).

### OpenAI

Best quality, higher latency and cost.

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key
```

### Ollama

Free and local. Requires [Ollama](https://ollama.ai) installed.

```bash
ollama pull llama3.2:3b
```

```bash
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
```

::: warning
Ollama has significantly higher latency (1-3s first token) compared to cloud providers. Not recommended for production unless privacy is a requirement.
:::

### Fallback Logic

If the configured provider's key is missing, Voicex falls back: **OpenAI → Groq → Ollama**.

---

## TTS (Text-to-Speech)

Four providers supported. Selected automatically by priority based on available keys.

| Provider | Cost | Quality | Latency | Format |
|----------|------|---------|---------|--------|
| **ElevenLabs** | ~$0.30/1K chars | Best (most natural) | ~300ms | MP3 stream |
| **OpenAI** | $15/1M chars | Good | ~400ms | MP3 stream |
| **Edge TTS** | Free | Decent (Microsoft voices) | ~200ms | MP3 stream |
| **System** | Free | Basic | ~500ms+ | WAV file |

### ElevenLabs (Best Quality)

Most natural-sounding voices. Uses `eleven_turbo_v2` model for low latency.

```bash
ELEVENLABS_API_KEY=your_key
```

Default voice: `tVeibrRmkweME2rrFZAs`. Change in `backend/src/providers/tts/elevenlabs.provider.ts`.

Browse voices at [elevenlabs.io/voice-library](https://elevenlabs.io/voice-library).

### OpenAI TTS

Good quality, uses `tts-1` model with `alloy` voice.

```bash
OPENAI_API_KEY=your_key
```

### Edge TTS (Dev/Testing Only)

Microsoft's free TTS. No API key needed. Uses `en-US-AriaNeural` voice.

This is the default fallback when no TTS key is configured.

::: danger Not for production
Edge TTS uses an unofficial Microsoft endpoint (`wss://speech.platform.bing.com`) that is not covered by any SLA. It can be rate-limited, throttled, or discontinued without notice. **Do not rely on it in production.** Use ElevenLabs or OpenAI TTS for production deployments.
:::

### System TTS (Local)

Uses the OS text-to-speech command. Slow (writes to disk) but fully offline.

```bash
# macOS
SYSTEM_TTS_CMD=say,-o,{out},--data-format=LEF32@22050,{text}
SYSTEM_TTS_EXT=wav

# Linux
SYSTEM_TTS_CMD=espeak,-w,{out},{text}
SYSTEM_TTS_EXT=wav
```

::: warning
System TTS has the highest latency because it spawns a process, writes to a temp file, then reads it back. Not recommended for production.
:::

### Selection Priority

```
System TTS (if configured) → ElevenLabs → OpenAI → Edge TTS
```

---

## Recommended Stacks

### Production (Recommended)

```bash
DEEPGRAM_API_KEY=...        # STT — $200 free credit
LLM_PROVIDER=groq
GROQ_API_KEY=...            # LLM — free tier
ELEVENLABS_API_KEY=...      # TTS — best quality, 10K chars/month free
```

### Premium

```bash
DEEPGRAM_API_KEY=...        # STT
LLM_PROVIDER=openai
OPENAI_API_KEY=...          # LLM + TTS
ELEVENLABS_API_KEY=...      # TTS (overrides OpenAI)
```

### Dev / Testing Only

```bash
DEEPGRAM_API_KEY=...        # STT — $200 free credit
LLM_PROVIDER=ollama         # LLM — free local
# TTS — Edge TTS fallback (no key needed, dev only)
```

::: warning
Edge TTS uses an unofficial Microsoft endpoint with no SLA. Only use for local development and testing. For production, always configure ElevenLabs or OpenAI TTS.
:::
