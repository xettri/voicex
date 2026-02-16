---
layout: home
hero:
  name: Voicex
  text: Real-time AI Voice Assistant
  tagline: Sub-second voice conversations powered by Deepgram, Groq, and ElevenLabs
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
    details: Groq LLM (~200ms) + ElevenLabs streaming TTS. The AI starts speaking before finishing its thought.
  - icon: 🎤
    title: Real-Time STT
    details: Deepgram Nova-2 with speech_final detection, endpointing, and utterance end for instant turn detection.
  - icon: 🔇
    title: Echo Suppression
    details: Smart muting prevents the mic from picking up the assistant's voice. No feedback loops.
  - icon: 🧠
    title: Conversation Memory
    details: Maintains context across the session. Redis-backed for persistence across reconnects.
  - icon: 📞
    title: Phone Support
    details: Twilio Media Streams integration for phone call AI assistants.
  - icon: 🔐
    title: Multi-Tenant Auth
    details: API keys + JWT tokens. Per-client usage tracking with MongoDB.
---

## Quick Start

```bash
# Install
pnpm install

# Configure (edit with your API keys)
cp backend/.env.example backend/.env.local

# Run
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), click **Connect**, and start talking.

## How It Works

```
🎤 User speaks → Deepgram STT → Groq/OpenAI LLM → ElevenLabs/OpenAI TTS → 🔊 AI speaks
```

The entire pipeline streams in real-time. The AI starts generating audio while still producing text, giving near-instant responses.
