# Pricing & Costs

Cost breakdown for each provider and optimization strategies.

## Provider Costs

### STT (Speech-to-Text)

| Provider     | Cost        | Free Tier              | Notes    |
| ------------ | ----------- | ---------------------- | -------- |
| **Deepgram** | $0.0058/min | $200 credit (~34K min) | Required |

### LLM (Language Model)

| Provider   | Cost                 | Free Tier           | Model                |
| ---------- | -------------------- | ------------------- | -------------------- |
| **Ollama** | Free (self-hosted)   | Unlimited           | llama3.2:3b          |
| **Groq**   | ~$0.05-0.08/M tokens | Free tier available | llama-3.1-8b-instant |
| **OpenAI** | ~$0.15-0.60/M tokens | —                   | gpt-4o-mini          |

### TTS (Text-to-Speech)

| Provider       | Cost            | Free Tier       | Quality             | Production?   |
| -------------- | --------------- | --------------- | ------------------- | ------------- |
| **ElevenLabs** | ~$0.30/1K chars | 10K chars/month | Best (most natural) | Yes           |
| **OpenAI**     | $15/1M chars    | —               | Good                | Yes           |
| **Edge TTS**   | Free            | Unlimited       | Decent              | No — dev only |
| **System**     | Free (local)    | Unlimited       | Basic               | No            |

::: warning
Edge TTS is free but uses an unofficial Microsoft endpoint with no SLA, no uptime guarantee, and no rate limit documentation. **Do not use in production.** It can be throttled or discontinued at any time.
:::

---

## Cost Tiers

### Dev / Testing (Zero Cost)

Everything free. Good for local development and testing only.

```bash
DEEPGRAM_API_KEY=...        # $200 free credit
LLM_PROVIDER=ollama         # Free local
# Edge TTS fallback — no key needed (dev only)
```

**Monthly cost:** $0
**Limitations:** Ollama latency (1-3s), Edge TTS not production-safe

### Production (Recommended)

Fast responses with reliable, SLA-backed providers.

```bash
DEEPGRAM_API_KEY=...
LLM_PROVIDER=groq
GROQ_API_KEY=...
ELEVENLABS_API_KEY=...
```

**Monthly cost estimate (1000 minutes):**
| Service | Cost |
|---------|------|
| Deepgram | $5.80 |
| Groq | ~$0.50 |
| ElevenLabs | ~$15-30 |
| **Total** | **~$21-36** |

### Production (Budget)

Lower cost with OpenAI TTS instead of ElevenLabs.

```bash
DEEPGRAM_API_KEY=...
LLM_PROVIDER=groq
GROQ_API_KEY=...
OPENAI_API_KEY=...          # Used for TTS
```

**Monthly cost estimate (1000 minutes):**
| Service | Cost |
|---------|------|
| Deepgram | $5.80 |
| Groq | ~$0.50 |
| OpenAI TTS | ~$8-15 |
| **Total** | **~$14-21** |

### Premium

Best quality across every layer.

```bash
DEEPGRAM_API_KEY=...
LLM_PROVIDER=groq
GROQ_API_KEY=...
ELEVENLABS_API_KEY=...
```

---

## Cost Optimization Tips

1. **Use Groq over OpenAI for LLM** — 3-10x cheaper with comparable quality for voice
2. **Use ElevenLabs for TTS** — best quality, reliable, and 10K chars/month free to start
3. **Keep LLM replies short** — the system prompt limits replies to 1-3 sentences. Shorter replies = less TTS cost
4. **Set `max_tokens`** — LLM providers are configured with `max_tokens: 150` to prevent runaway responses
5. **Monitor usage** — with `MONGODB_URI` set, usage is tracked per client in the `usage` collection
