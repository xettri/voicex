## PRODUCT DEFINITION

Build a **low-latency, human-like AI voice service** comparable to enterprise platforms like SoundHound and Nurix, but:

- Faster
- Cheaper
- LLM-native
- Self-serve
- SMB & developer friendly

This platform is a **service provider**, not a consumer app.

## LANGUAGE SCOPE

- **English only for v1**
- Architecture must support **future multilingual expansion** (Hindi, others)
- Language must be an explicit field in:
  - Session state
  - Knowledge base metadata
  - STT / TTS routing

No refactor should be required to add new languages later.

## CORE CAPABILITIES

### 1. Real-Time Voice Conversation

- Streaming audio input
- Streaming STT (partial + final)
- Streaming LLM output
- Streaming TTS audio
- Perceived latency < 1 second
- Natural turn-taking
- Interruption handling

### 2. Context & Memory

- Maintain short-term session context
- Trim context to control token usage
- No long-term memory in v1
- Context is workspace-isolated

### 3. Client-Owned Knowledge Base (KB)

Each client has:

- One workspace
- One or more knowledge bases

Clients can upload:

- PDF
- DOC / DOCX
- TXT
- URLs

Rules:

- KB uses RAG (retrieval-augmented generation)
- Chunking + embeddings + vector search
- No model training
- KB retrieval is optional per query
- When KB is active, answers must come **only from KB**
- If KB confidence is low → fallback response

### 4. Multi-Tenancy

- All data isolated by `workspace_id`
- KB, sessions, usage, billing are workspace-scoped
- No cross-workspace leakage under any condition
