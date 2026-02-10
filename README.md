# VoiceX (Open Source Edition)

This branch uses a fully local, open-source stack for voice AI.

## Prerequisites

1.  **Node.js** (v18+) & **pnpm**
2.  **Ollama** (for LLM)
    - Install from [ollama.com](https://ollama.com)
    - Run: `ollama pull llama3.2` (or your preferred model)
    - Start server: `ollama serve`
3.  **Vosk Model** (for STT)
    - The service expects a model at `models/vosk/vosk-model-small-en-us-0.15`.
    - Run this to download:
      ```bash
      mkdir -p models/vosk
      curl -L https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip -o model.zip
      unzip model.zip -d models/vosk
      rm model.zip
      ```

## Services

- **STT**: Vosk (running locally in Node.js)
- **LLM**: Ollama (running locally)
- **TTS**: Say.js (uses macOS system TTS) or Piper (optional)
- **KB**: LanceDB (embedded vector DB) + Xenova Transformers (local embedding)

## Running

```bash
pnpm install
pnpm dev
```

The system will start 6 services concurrently.
Connect via WebSocket to `ws://localhost:3001` (Audio Gateway).
