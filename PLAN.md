# MASTER PROMPT — AI-Native Multilingual Voice Platform (English v1)

## ROLE & INSTRUCTIONS

You are an **expert AI systems architect and full-stack engineer**.

Your task is to **design and scaffold a production-grade, AI-native voice platform**.  
This is **not a demo** and **not a toy project**.  
Assume this will be deployed at scale and monetized as a SaaS.

Follow all requirements strictly.  
Do NOT simplify core systems.  
Prefer **Node.js + TypeScript** unless stated otherwise.

---

## PRODUCT GOAL

Build a **low-latency, human-like AI voice service** comparable to enterprise platforms like SoundHound or Nurix, but:

- Faster
- Cheaper
- LLM-native
- Self-serve
- SMB & developer friendly

This platform is a **service provider**, not an end-user application.

---

## SUPPORTED CLIENT INTEGRATIONS

Clients can integrate in two ways:

### 1. Phone Calls

- Via Twilio / SIP / Plivo-style providers
- Audio streamed via WebSockets
- Each call maps to exactly **one session**

### 2. In-App Voice

- Web or mobile SDK
- WebRTC or WebSocket streaming
- Same backend pipeline as phone calls

You **do not** own the client UI.  
You only provide APIs and services.

---

## LANGUAGE SCOPE

- **English ONLY for v1**
- Architecture must support **future multilingual expansion** (Hindi, others)
- Language must be an explicit field in:
  - Session state
  - Knowledge base metadata
  - STT/TTS routing

No refactor should be needed to add languages later.

---

## CORE CAPABILITIES (MANDATORY)

### 1. Real-Time Voice Conversation

- Streaming audio input
- Streaming transcription (partial + final)
- Streaming LLM output (tokens)
- Streaming TTS audio
- Perceived latency < 1 second
- Natural turn-taking
- Interruption handling

---

### 2. Conversation Context & Memory

- Maintain **short-term session memory**
- Trim context to control token usage
- No long-term memory in v1
- Context must be workspace-isolated

---

### 3. Client-Owned Knowledge Base (KB)

Each client has:

- One **workspace**
- One or more **Knowledge Bases**

Clients can upload:

- PDF
- DOC / DOCX
- TXT
- URLs

KB rules:

- Implemented using **RAG (retrieval-augmented generation)**
- Chunking + embeddings + vector search
- **NO model training**
- KB retrieval is optional per query
- When KB is active, AI must answer **only from KB**
- If KB confidence is low → graceful fallback

---

### 4. Multi-Tenancy

- All data isolated by `workspace_id`
- KB, sessions, usage, billing are workspace-scoped
- No cross-workspace leakage under any condition

---

## REQUIRED SERVICES (LOGICAL SEPARATION)

You must design these as **separate logical services**:

1. `audio-gateway`
2. `stt-service`
3. `conversation-orchestrator` (CORE IP)
4. `kb-ingestion`
5. `kb-retriever`
6. `llm-service`
7. `tts-service`
8. `audio-egress`
9. `dashboard-api`
10. `billing-service`

All services must be **stateless**.  
Session state must live in Redis / KV store.

---

## STREAMING PIPELINE (STRICT)

→ User Speech
→ Audio Gateway
→ Streaming STT
→ Conversation Orchestrator
→ (Optional) KB Retrieval
→ LLM (Streaming Tokens)
→ TTS (Streaming Audio)
→ User Hears Response

Rules:

- STT must emit partial + final transcripts
- LLM must stream tokens
- TTS must begin audio playback before full text is generated

---

## CONVERSATION ORCHESTRATOR (MOST IMPORTANT)

This service is the **core intelligence**.

### Responsibilities

- Session lifecycle management
- Turn-taking logic
- Silence detection
- Interruption handling
- Context trimming
- Decide when to:
  - Query KB
  - Call LLM
  - Respond directly
- Safety & fallback logic
- Language routing (future)

### Session State Schema

```json
{
  "session_id": "uuid",
  "workspace_id": "uuid",
  "language": "en",
  "conversation_history": [
    { "role": "user", "text": "..." },
    { "role": "assistant", "text": "..." }
  ],
  "active_kb_ids": ["kb_1"],
  "plan": "free | pro | business"
}
```
