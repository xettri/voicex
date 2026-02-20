# Architecture

How Voicex is structured — from the database layer to real-time voice streaming.

---

## High-Level System Overview

Voicex is a multi-tenant SaaS platform with two main subsystems:

1. **Dashboard** — REST API + Next.js frontend for managing agents, providers, calls, and settings.
2. **Voice Engine** — WebSocket-based real-time pipeline for STT → LLM → TTS conversations.

```mermaid
graph TB
    subgraph Client ["Browser / Mobile"]
        DASH["Dashboard UI<br/><small>Next.js 14 · React · Tailwind</small>"]
        MIC["Microphone<br/><small>AudioWorklet · PCM 16kHz</small>"]
        SPK["Speaker<br/><small>AudioContext · MP3 decode</small>"]
    end

    subgraph Server ["Backend Server (Node.js + Express)"]
        REST["REST API<br/><small>Dashboard routes · Auth</small>"]
        GW["WebSocket Gateway<br/><small>Voice + Twilio streams</small>"]
        VS["Voice Session<br/><small>Per-connection orchestrator</small>"]
        VP["Voice Pipeline<br/><small>LLM → TTS sentence queue</small>"]
        AUTH["Auth Middleware<br/><small>JWT + API Key validation</small>"]
        RL["Rate Limiter<br/><small>Redis / in-memory</small>"]
        REPO["Repositories<br/><small>Agent · Provider · Plan · Call</small>"]
    end

    subgraph Data ["Data Layer"]
        MONGO["MongoDB<br/><small>Orgs · Users · Agents · Providers<br/>Plans · Calls · Usage</small>"]
        REDIS["Redis<br/><small>Plan cache · Rate limits<br/>Conversation history</small>"]
    end

    subgraph AI ["AI Provider APIs"]
        DG["Deepgram<br/><small>Nova-2 STT</small>"]
        LLM["LLM<br/><small>Groq · OpenAI · Ollama</small>"]
        TTS["TTS<br/><small>ElevenLabs · OpenAI · Edge</small>"]
    end

    DASH -->|"HTTP"| REST
    MIC -->|"PCM audio WS"| GW
    GW --> SPK

    REST --> AUTH
    GW --> AUTH
    AUTH --> REPO
    GW --> RL
    GW --> VS
    VS --> VP

    REPO <--> MONGO
    VS <--> REDIS
    RL <--> REDIS

    VS --> DG
    VP --> LLM
    VP --> TTS
```

---

## Project Structure

```
voicex/
├── frontend/                        # Next.js 14 (port 3000)
│   └── src/
│       ├── app/                     # App Router pages
│       │   ├── login/               # Sign in
│       │   ├── signup/              # Sign up
│       │   ├── pending/             # Account pending verification
│       │   └── dashboard/           # Protected dashboard
│       │       ├── agents/          # Agent list + detail/edit
│       │       ├── calls/           # Call list + detail
│       │       ├── playground/      # Live voice testing
│       │       ├── analytics/       # Usage charts
│       │       ├── settings/        # Account, API keys, provider link
│       │       └── providers/       # Custom provider management
│       ├── components/              # VoiceAssistant, Toast, ConfirmDialog, etc.
│       ├── lib/                     # API client, plan context, voice hook
│       └── utils/                   # cn() class utility
│
├── backend/                         # Node.js + Express + WS (port 3001)
│   └── src/
│       ├── db/                      # schema.ts (interfaces), client.ts (connection)
│       ├── repositories/            # Data access: agent, provider, plan, call, user, org, apikey
│       ├── routes/                  # REST endpoints: auth, dashboard, health, setup, twilio
│       ├── services/                # Voice session, pipeline, context, call summary, auth
│       ├── handlers/                # WebSocket connection handlers (voice, twilio)
│       ├── ws/                      # WebSocket gateway (routing, auth, rate limit)
│       ├── middleware/              # Auth, rate-limit, API limiter
│       ├── providers/               # STT (Deepgram), LLM (Groq/OpenAI/Ollama), TTS (ElevenLabs/OpenAI/Edge/System), Call channels
│       ├── shared/                  # Logger, errors, encryption, audio utils, WS types
│       ├── config/                  # Environment (Zod), voice config
│       └── scripts/                 # Seed plans, seed providers, seed test data, migrations
│
├── docs/                            # This documentation (VitePress)
│   └── src/
│
└── scripts/                         # Bash helpers for seed scripts
```

---

## Backend Component Map

```mermaid
graph TB
    subgraph Entry ["Entry Point"]
        IDX["index.ts<br/><small>Init DB, Redis, HTTP+WS server<br/>Graceful shutdown</small>"]
        APP["app.ts<br/><small>Express app + middleware</small>"]
        SRV["server.ts<br/><small>HTTP server + WS upgrade</small>"]
    end

    subgraph Routes ["REST API Routes"]
        AUTH_R["auth.routes.ts<br/><small>signup, signin, /me</small>"]
        DASH_R["dashboard.routes.ts<br/><small>agents, providers, calls<br/>models, analytics, api-keys</small>"]
        SETUP_R["setup.routes.ts<br/><small>one-time setup</small>"]
        HEALTH_R["health.routes.ts"]
        TWILIO_R["twilio.routes.ts"]
    end

    subgraph WS_Layer ["WebSocket Layer"]
        GWY["gateway.ts<br/><small>Auth, rate-limit, agent resolve<br/>Route to handler</small>"]
        VH["voice.handler.ts<br/><small>Web voice sessions</small>"]
        TH["twilio.handler.ts<br/><small>Twilio media streams</small>"]
    end

    subgraph Services ["Core Services"]
        VSS["voice-session.service.ts<br/><small>Session lifecycle, interrupts<br/>Call tracking, history</small>"]
        VPS["voice-pipeline.service.ts<br/><small>LLM → sentence buffer → TTS<br/>Streaming orchestration</small>"]
        CMS["context-manager.service.ts<br/><small>Context window, token budget<br/>Conversation summary</small>"]
        CSS["call-summary.service.ts<br/><small>Post-call summary + sentiment</small>"]
        AS["auth.service.ts<br/><small>Password hashing, JWT sign/verify</small>"]
    end

    subgraph Repos ["Repositories"]
        AR["agent.repository.ts"]
        PR["provider.repository.ts<br/><small>CRUD, encryption, model search<br/>Agent status computation</small>"]
        PLR["plan.repository.ts<br/><small>CRUD, Redis cache, model access</small>"]
        CR["call.repository.ts"]
        UR["user.repository.ts"]
        OR["organization.repository.ts"]
        AKR["apikey.repository.ts"]
        CHR["conversation-history.repository.ts<br/><small>Redis / in-memory</small>"]
    end

    subgraph Providers ["AI Providers"]
        STT_P["STT: Deepgram"]
        LLM_P["LLM: Groq, OpenAI, Ollama"]
        TTS_P["TTS: ElevenLabs, OpenAI, Edge, System"]
        CALL_P["Call: WebSocket, Twilio channels"]
    end

    IDX --> APP
    IDX --> SRV
    SRV --> GWY

    APP --> AUTH_R
    APP --> DASH_R
    APP --> SETUP_R
    APP --> HEALTH_R
    APP --> TWILIO_R

    DASH_R --> AR
    DASH_R --> PR
    DASH_R --> PLR
    DASH_R --> CR
    DASH_R --> AKR
    AUTH_R --> UR
    AUTH_R --> OR
    AUTH_R --> AS

    GWY --> VH
    GWY --> TH
    VH --> VSS
    TH --> VSS
    VSS --> VPS
    VSS --> CHR
    VSS --> CR
    VSS --> STT_P
    VPS --> LLM_P
    VPS --> TTS_P
    VSS --> CALL_P
```

---

## Real-Time Voice Pipeline

The core pipeline processes a single conversational turn. Each stage streams data to the next — the AI starts speaking before it finishes thinking.

```mermaid
flowchart LR
    A["User Speaks"] --> B["Deepgram STT"]
    B --> C{"speech_final?"}
    C -->|"No"| B
    C -->|"Yes"| D["LLM Streaming"]
    D --> E["Sentence Buffer"]
    E --> F{"Sentence\ncomplete?"}
    F -->|"No"| E
    F -->|"Yes (.!?)"| G["TTS Generate"]
    G --> H["Send to Client"]
    D -->|"more tokens"| E
    H --> I["Browser Playback"]
```

### Detailed Data Flow (One Turn)

```mermaid
sequenceDiagram
    participant User as Browser
    participant WS as WebSocket
    participant Session as Voice Session
    participant STT as Deepgram
    participant LLM as Groq/OpenAI
    participant TTS as TTS Provider
    participant Speaker as Browser

    User->>WS: PCM audio chunks (binary)
    WS->>Session: onAudio(buffer)
    Session->>STT: stream audio

    loop Real-time transcription
        STT-->>Session: interim transcript
    end

    STT->>Session: final transcript (speech_final=true)
    Session->>Session: interrupt() if assistant speaking

    Note over Session,LLM: Pipeline starts

    Session->>LLM: system prompt + history + user text

    loop Token streaming
        LLM-->>Session: token
        Session->>Session: buffer tokens

        alt Sentence complete (.!? or 60+ chars)
            Session->>TTS: sentence text
            TTS-->>Session: MP3 audio chunks
            Session->>Session: combine chunks → full MP3
            Session->>WS: audio message (base64 MP3)
            WS->>Speaker: play audio
        end
    end

    Note over Session: Pipeline complete
    Session->>Session: 800ms cooldown
    Session->>Session: assistantSpeaking = false
```

---

## Interrupt & Echo Suppression

When the user starts talking while the assistant is speaking, the system immediately stops and listens.

```mermaid
stateDiagram-v2
    [*] --> Listening: Session starts

    Listening --> Processing: speech_final received
    Processing --> Speaking: First audio sent to client
    Speaking --> Interrupting: User speaks (STT event)
    Interrupting --> Listening: Cleanup complete

    Speaking --> Cooldown: Pipeline finishes
    Cooldown --> Listening: 800ms elapsed

    state Processing {
        [*] --> LLM_Streaming
        LLM_Streaming --> Sentence_Buffer
        Sentence_Buffer --> TTS_Generate
        TTS_Generate --> Send_Audio
        Send_Audio --> LLM_Streaming: more tokens
    }

    state Interrupting {
        [*] --> Send_AudioStop
        Send_AudioStop --> Abort_LLM
        Abort_LLM --> Abort_TTS
        Abort_TTS --> Clear_Queue
    }
```

**Echo suppression:** While `assistantSpeaking = true`, ALL STT events are suppressed. After the pipeline finishes, an 800ms cooldown prevents tail-end speaker audio from triggering false interrupts.

**Interruption sensitivity levels:**

| Level | Min chars to trigger | Use case |
|-------|---------------------|----------|
| `low` | 5 characters | Formal conversations, reduce false interrupts |
| `medium` (default) | 2 characters | Balanced |
| `high` | 1 character | Fast-paced, customer support |

---

## Abort Chain

Every async operation accepts `AbortSignal` so nothing leaks when the user interrupts.

```mermaid
flowchart TB
    SPEAK["User starts speaking"] --> INT["interrupt()"]

    INT --> STOP["channel.sendAudioStop()<br/><small>Client stops playback + clears queue</small>"]
    INT --> ABORT["abortController.abort()<br/><small>Signal propagates everywhere</small>"]

    ABORT --> ALLM["LLM fetch aborted<br/><small>HTTP stream cancelled</small>"]
    ABORT --> ATTS["TTS stream destroyed<br/><small>Process killed / reader cancelled</small>"]
    ABORT --> ACHAIN["TTS chain rejected<br/><small>Pending sentences skipped</small>"]

    STOP --> CLIENT["Client receives audioStop"]
    CLIENT --> CLEAR["AudioPlayer.clearQueue()<br/><small>Stop current source, empty queue</small>"]

    INT --> NEW["New AbortController created"]
    NEW --> PIPE["pipeline.run(newText, signal)<br/><small>Fresh pipeline starts</small>"]
```

---

## Data Architecture

See [Database Schema](./database) for full details. Here's the relationship overview:

```mermaid
erDiagram
    plans ||--o{ organizations : "planId"
    organizations ||--o{ users : "orgId"
    organizations ||--o{ agents : "orgId"
    organizations ||--o{ providers : "orgId (client-owned)"
    organizations ||--o{ api_keys : "orgId"
    organizations ||--o{ calls : "orgId"
    organizations ||--o{ daily_usage : "orgId"

    providers ||--o{ agents : "llmProviderId / ttsProviderId / sttProviderId"
    agents ||--o{ calls : "agentId"

    providers {
        ObjectId _id PK
        ObjectId orgId FK "null = global"
        string category "llm | tts | stt"
        string providerKey
        string credentials "AES-256-GCM encrypted"
    }

    agents {
        ObjectId _id PK
        ObjectId orgId FK
        ObjectId llmProviderId FK
        string llmModelId
        ObjectId ttsProviderId FK
        string ttsModelId
        ObjectId sttProviderId FK
    }

    plans {
        ObjectId _id PK
        string slug UK
        object models "llm/tts/stt arrays"
        object features "customProviders etc"
    }

    organizations {
        ObjectId _id PK
        ObjectId planId FK
        string status "pending | active"
    }
```

### Key Relationships

| From | To | Field | Description |
|------|------|-------|-------------|
| `organizations` | `plans` | `planId` | Which plan the org is on |
| `agents` | `providers` | `llmProviderId` | Which LLM provider the agent uses |
| `agents` | `providers` | `ttsProviderId` | Which TTS provider the agent uses |
| `agents` | `providers` | `sttProviderId` | Which STT provider the agent uses |
| `providers` | `organizations` | `orgId` | Owner org (`null` = global/platform provider) |
| `calls` | `agents` | `agentId` | Which agent handled the call |

---

## Provider Architecture

Providers are stored in a single unified `providers` collection. There are two types:

| Type | `orgId` | Who manages | Example |
|------|---------|------------|---------|
| **Global** | `null` | Platform admin | Groq, OpenAI, Ollama, ElevenLabs, Edge, Deepgram |
| **Client** | `<orgId>` | Client via dashboard | Client's own OpenAI key, custom ElevenLabs voice |

When an agent references a provider (e.g., `llmProviderId`), the system:
1. Fetches the provider document
2. If global (`orgId: null`), checks the org's plan allows the selected model
3. If client-owned, allows it (client providers bypass plan model checks)
4. Decrypts credentials at runtime using AES-256-GCM

See [Providers](./providers) for full details.

---

## Agent Status Computation

Agent status is computed **server-side** by checking three conditions:

```mermaid
flowchart TD
    START["Agent loaded"] --> A{"agent.active?"}
    A -->|"No"| INACTIVE["status: inactive"]
    A -->|"Yes"| B{"All providers active?"}
    B -->|"No"| PAUSED_PROV["status: paused_provider<br/><small>pauseReason: Provider X is disabled</small>"]
    B -->|"Yes"| C{"Global models<br/>allowed by plan?"}
    C -->|"No"| PAUSED_PLAN["status: paused_plan<br/><small>pauseReason: Model X requires Pro plan</small>"]
    C -->|"Yes"| ACTIVE["status: active"]
```

| Status | Meaning | User action |
|--------|---------|-------------|
| `active` | Agent is fully operational | None |
| `inactive` | Agent is manually deactivated | Toggle active on |
| `paused_provider` | A referenced provider is disabled | Edit agent to use different provider, or re-enable provider |
| `paused_plan` | A global model requires a higher plan | Upgrade plan or switch to a model included in current plan |

---

## Latency Breakdown

Where time goes in a typical voice turn:

| Stage | Provider | Typical Latency |
|-------|----------|----------------|
| STT endpointing | Deepgram | ~300ms |
| LLM first token | Groq | ~150-250ms |
| TTS first audio | ElevenLabs | ~200-300ms |
| Network + decode | WebSocket | ~50-100ms |
| **Total to first audio** | | **~700-950ms** |

---

## Startup Sequence

```mermaid
sequenceDiagram
    participant IDX as index.ts
    participant DB as MongoDB
    participant R as Redis
    participant SRV as HTTP Server
    participant GW as WS Gateway

    IDX->>IDX: Load env vars (Zod validation)
    IDX->>IDX: Setup error handlers
    IDX->>DB: initDb(MONGODB_URI)
    DB-->>IDX: Connected + indexes created

    par Redis clients
        IDX->>R: Init rate-limit client
        IDX->>R: Init conversation-history client
        IDX->>R: Init plan-cache client
    end

    IDX->>SRV: Create HTTP server + Express app
    IDX->>GW: Create WebSocket gateway
    IDX->>SRV: server.listen(PORT)

    Note over IDX: Registers SIGTERM/SIGINT handlers
    Note over IDX: Graceful shutdown: close WS → close HTTP → close DB (10s timeout)
```
