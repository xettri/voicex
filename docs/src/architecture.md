# Architecture

How Voicex processes voice in real-time — from microphone to speaker in under a second.

---

## High-Level System Overview

```mermaid
graph TB
    subgraph Client ["🖥️ Browser Client"]
        MIC["🎤 Microphone<br/><small>AudioWorklet · PCM 16kHz</small>"]
        SPK["🔊 Speaker<br/><small>AudioContext · MP3 decode</small>"]
        UI["📱 React UI<br/><small>VoiceAssistant component</small>"]
    end

    subgraph Server ["⚙️ Backend Server"]
        GW["🔌 WebSocket Gateway<br/><small>ws + Express</small>"]
        VS["🧩 Voice Session<br/><small>Per-connection orchestrator</small>"]
        VP["⛓️ Voice Pipeline<br/><small>LLM → TTS sentence queue</small>"]
        AUTH["🔐 Auth Middleware<br/><small>API Key + JWT</small>"]
        RL["🚦 Rate Limiter<br/><small>Redis / in-memory</small>"]
        HIST["💾 History<br/><small>Redis / in-memory</small>"]
    end

    subgraph Providers ["☁️ External Providers"]
        DG["🎙️ Deepgram<br/><small>Nova-2 STT</small>"]
        LLM["🧠 LLM<br/><small>Groq · OpenAI · Ollama</small>"]
        TTS["🗣️ TTS<br/><small>ElevenLabs · OpenAI</small>"]
    end

    MIC -->|"PCM audio<br/>(base64 WS)"| GW
    GW --> AUTH
    AUTH --> VS
    VS -->|"audio stream"| DG
    DG -->|"transcript"| VS
    VS -->|"user text + history"| VP
    VP -->|"token stream"| LLM
    LLM -->|"tokens"| VP
    VP -->|"sentence text"| TTS
    TTS -->|"MP3 chunks"| VP
    VP -->|"complete MP3"| VS
    VS -->|"audio<br/>(base64 WS)"| GW
    GW --> SPK
    VS <-->|"context"| HIST
    GW --> RL

    style Client fill:#1a1a2e,stroke:#16213e,color:#e0e0e0
    style Server fill:#0f3460,stroke:#16213e,color:#e0e0e0
    style Providers fill:#533483,stroke:#16213e,color:#e0e0e0
    style MIC fill:#e94560,stroke:#e94560,color:#fff
    style SPK fill:#e94560,stroke:#e94560,color:#fff
    style DG fill:#13a84f,stroke:#13a84f,color:#fff
    style LLM fill:#f5a623,stroke:#f5a623,color:#fff
    style TTS fill:#6c5ce7,stroke:#6c5ce7,color:#fff
```

---

## Real-Time Voice Pipeline

The core pipeline processes a single conversational turn. Each stage streams data to the next — the AI starts speaking before it finishes thinking.

```mermaid
flowchart LR
    A["🎤 User Speaks"] --> B["📡 Deepgram STT"]
    B --> C{"speech_final?"}
    C -->|"No"| B
    C -->|"Yes"| D["🧠 LLM Streaming"]
    D --> E["📝 Sentence Buffer"]
    E --> F{"Sentence\ncomplete?"}
    F -->|"No (< 60 chars)"| E
    F -->|"Yes (.!?)"| G["🗣️ TTS Generate"]
    G --> H["🔊 Send to Client"]
    D -->|"more tokens"| E
    H --> I["▶️ Browser Playback"]

    style A fill:#e94560,stroke:#e94560,color:#fff
    style B fill:#13a84f,stroke:#13a84f,color:#fff
    style D fill:#f5a623,stroke:#f5a623,color:#fff
    style G fill:#6c5ce7,stroke:#6c5ce7,color:#fff
    style I fill:#e94560,stroke:#e94560,color:#fff
    style C fill:#16213e,stroke:#e0e0e0,color:#e0e0e0
    style F fill:#16213e,stroke:#e0e0e0,color:#e0e0e0
```

---

## Detailed Data Flow (One Turn)

```mermaid
sequenceDiagram
    participant User as 🎤 Browser
    participant WS as 🔌 WebSocket
    participant Session as 🧩 Voice Session
    participant STT as 🎙️ Deepgram
    participant LLM as 🧠 Groq/OpenAI
    participant TTS as 🗣️ TTS Provider
    participant Speaker as 🔊 Browser

    User->>WS: PCM audio chunks (base64)
    WS->>Session: onAudio(buffer)
    Session->>STT: stream audio

    loop Real-time transcription
        STT-->>Session: interim transcript
    end

    STT->>Session: final transcript (speech_final=true)
    Session->>Session: interrupt() if assistant speaking

    Note over Session,LLM: Pipeline starts

    Session->>LLM: prompt + history + user text

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

When the user starts talking while the assistant is speaking, the system must immediately stop and listen. This is the most critical real-time behavior.

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

    note right of Speaking
        All STT events suppressed
        while assistant is speaking
        (echo suppression)
    end note

    note right of Cooldown
        STT still suppressed during
        cooldown to avoid tail-end
        echo from speakers
    end note
```

---

## Abort Chain

Every async operation accepts `AbortSignal` so nothing leaks when the user interrupts.

```mermaid
flowchart TB
    SPEAK["🎤 User starts speaking"] --> INT["interrupt()"]

    INT --> STOP["channel.sendAudioStop()<br/><small>Client stops playback + clears queue</small>"]
    INT --> ABORT["abortController.abort()<br/><small>Signal propagates everywhere</small>"]

    ABORT --> ALLM["❌ LLM fetch aborted<br/><small>HTTP stream cancelled</small>"]
    ABORT --> ATTS["❌ TTS stream destroyed<br/><small>Process killed / reader cancelled</small>"]
    ABORT --> ACHAIN["❌ TTS chain rejected<br/><small>Pending sentences skipped</small>"]

    STOP --> CLIENT["Client receives audioStop"]
    CLIENT --> CLEAR["AudioPlayer.clearQueue()<br/><small>Stop current source, empty queue</small>"]

    INT --> NEW["New AbortController created"]
    NEW --> PIPE["pipeline.run(newText, signal)<br/><small>Fresh pipeline starts</small>"]

    style SPEAK fill:#e94560,stroke:#e94560,color:#fff
    style INT fill:#f39c12,stroke:#f39c12,color:#fff
    style STOP fill:#3498db,stroke:#3498db,color:#fff
    style ABORT fill:#e74c3c,stroke:#e74c3c,color:#fff
    style ALLM fill:#2c3e50,stroke:#e74c3c,color:#e0e0e0
    style ATTS fill:#2c3e50,stroke:#e74c3c,color:#e0e0e0
    style ACHAIN fill:#2c3e50,stroke:#e74c3c,color:#e0e0e0
    style CLIENT fill:#2c3e50,stroke:#3498db,color:#e0e0e0
    style CLEAR fill:#2c3e50,stroke:#3498db,color:#e0e0e0
    style NEW fill:#27ae60,stroke:#27ae60,color:#fff
    style PIPE fill:#27ae60,stroke:#27ae60,color:#fff
```

---

## Provider Selection

Providers are chosen based on environment configuration and available API keys.

```mermaid
flowchart TD
    subgraph STT ["Speech-to-Text"]
        S1["Deepgram Nova-2<br/><small>Required — no fallback</small>"]
    end

    subgraph LLM_Select ["LLM Selection"]
        L0{"LLM_PROVIDER<br/>env var"}
        L0 -->|"groq"| L1["⚡ Groq<br/><small>llama-3.1-8b-instant</small>"]
        L0 -->|"openai"| L2["🧠 OpenAI<br/><small>gpt-4o-mini</small>"]
        L0 -->|"ollama"| L3["🏠 Ollama<br/><small>llama3.2:3b (local)</small>"]
        L0 -->|"not set"| L4{"Fallback chain"}
        L4 -->|"OPENAI_API_KEY?"| L2
        L4 -->|"GROQ_API_KEY?"| L1
        L4 -->|"default"| L3
    end

    subgraph TTS_Select ["TTS Selection"]
        T0{"Priority order"}
        T0 -->|"1st"| T1["💻 System TTS<br/><small>SYSTEM_TTS_CMD set?</small>"]
        T0 -->|"2nd"| T2["🎵 ElevenLabs<br/><small>ELEVENLABS_API_KEY set?</small>"]
        T0 -->|"3rd"| T3["🗣️ OpenAI TTS<br/><small>OPENAI_API_KEY set?</small>"]
        T0 -->|"4th"| T4["⚠️ Edge TTS<br/><small>Dev fallback only (unofficial)</small>"]
    end

    style S1 fill:#13a84f,stroke:#13a84f,color:#fff
    style L1 fill:#f5a623,stroke:#f5a623,color:#fff
    style L2 fill:#f5a623,stroke:#f5a623,color:#fff
    style L3 fill:#f5a623,stroke:#f5a623,color:#fff
    style T1 fill:#6c5ce7,stroke:#6c5ce7,color:#fff
    style T2 fill:#6c5ce7,stroke:#6c5ce7,color:#fff
    style T3 fill:#6c5ce7,stroke:#6c5ce7,color:#fff
    style T4 fill:#6c5ce7,stroke:#6c5ce7,color:#fff
```

---

## WebSocket Message Flow

All client-server communication happens over a single WebSocket connection.

```mermaid
flowchart LR
    subgraph Client_Out ["Client → Server"]
        CO1["🎤 audio<br/><small>{ type: 'audio', data: base64 }</small>"]
        CO2["⚙️ config<br/><small>{ type: 'config', ... }</small>"]
    end

    subgraph Server_Out ["Server → Client"]
        SO1["🔊 audio<br/><small>{ type: 'audio', data: base64 }</small>"]
        SO2["📝 transcript<br/><small>{ type: 'transcript', role, text }</small>"]
        SO3["⏹️ audioStop<br/><small>{ type: 'audioStop' }</small>"]
        SO4["❌ error<br/><small>{ type: 'error', message }</small>"]
    end

    style CO1 fill:#e94560,stroke:#e94560,color:#fff
    style CO2 fill:#3498db,stroke:#3498db,color:#fff
    style SO1 fill:#27ae60,stroke:#27ae60,color:#fff
    style SO2 fill:#f5a623,stroke:#f5a623,color:#fff
    style SO3 fill:#e74c3c,stroke:#e74c3c,color:#fff
    style SO4 fill:#95a5a6,stroke:#95a5a6,color:#fff
```

---

## Backend Component Map

```mermaid
graph TB
    subgraph Entry ["Entry Point"]
        IDX["index.ts<br/><small>HTTP + WS server</small>"]
        APP["app.ts<br/><small>Express app</small>"]
    end

    subgraph Routes ["Routes"]
        RT["routes/index.ts"]
        AR["routes/auth.routes.ts"]
    end

    subgraph WebSocket ["WebSocket Layer"]
        GWY["ws/gateway.ts<br/><small>Connection handler</small>"]
    end

    subgraph Services ["Core Services"]
        VSS["voice-session.service.ts<br/><small>Session lifecycle + interrupt</small>"]
        VPS["voice-pipeline.service.ts<br/><small>LLM + TTS orchestration</small>"]
    end

    subgraph STT_P ["STT Providers"]
        DGP["deepgram.provider.ts"]
    end

    subgraph LLM_P ["LLM Providers"]
        GRP["groq.provider.ts"]
        OAP["openai.provider.ts"]
        OLP["ollama.provider.ts"]
    end

    subgraph TTS_P ["TTS Providers"]
        ELP["elevenlabs.provider.ts"]
        OTP["openai-tts.provider.ts"]
        EDP["edge.provider.ts"]
        SYP["system.provider.ts"]
    end

    subgraph Middleware ["Middleware"]
        AUM["auth.ts"]
        RLM["rate-limit.ts"]
    end

    subgraph Storage ["Storage"]
        CHR["conversation-history.ts<br/><small>Redis / in-memory</small>"]
    end

    IDX --> APP
    IDX --> GWY
    APP --> RT
    RT --> AR
    GWY --> AUM
    GWY --> RLM
    GWY --> VSS
    VSS --> VPS
    VSS --> DGP
    VSS --> CHR
    VPS --> GRP
    VPS --> OAP
    VPS --> OLP
    VPS --> ELP
    VPS --> OTP
    VPS --> EDP
    VPS --> SYP

    style Entry fill:#1a1a2e,stroke:#16213e,color:#e0e0e0
    style Services fill:#0f3460,stroke:#16213e,color:#e0e0e0
    style STT_P fill:#13a84f20,stroke:#13a84f,color:#e0e0e0
    style LLM_P fill:#f5a62320,stroke:#f5a623,color:#e0e0e0
    style TTS_P fill:#6c5ce720,stroke:#6c5ce7,color:#e0e0e0
    style Middleware fill:#e9456020,stroke:#e94560,color:#e0e0e0
    style Storage fill:#3498db20,stroke:#3498db,color:#e0e0e0
```

---

## Frontend Component Map

```mermaid
graph TB
    subgraph UI ["React UI"]
        VA["VoiceAssistant.tsx<br/><small>Main component + controls</small>"]
    end

    subgraph Audio ["Audio Layer"]
        AC["AudioCapture.tsx<br/><small>Mic → PCM via AudioWorklet</small>"]
        AP["AudioPlayer.tsx<br/><small>MP3 decode → speaker queue</small>"]
    end

    subgraph Connection ["Connection"]
        VC["useVoiceConnection.ts<br/><small>WebSocket + auto-reconnect</small>"]
        WT["ws-types.ts<br/><small>Message types + parser</small>"]
    end

    subgraph Browser_API ["Browser APIs"]
        GM["getUserMedia<br/><small>echoCancellation: true</small>"]
        AW["AudioWorklet<br/><small>PCM processing</small>"]
        CTX["AudioContext<br/><small>decodeAudioData + playback</small>"]
        WSA["WebSocket API<br/><small>Binary + JSON messages</small>"]
    end

    VA --> AC
    VA --> AP
    VA --> VC
    VC --> WT
    AC --> GM
    AC --> AW
    AP --> CTX
    VC --> WSA

    style UI fill:#1a1a2e,stroke:#16213e,color:#e0e0e0
    style Audio fill:#e9456020,stroke:#e94560,color:#e0e0e0
    style Connection fill:#3498db20,stroke:#3498db,color:#e0e0e0
    style Browser_API fill:#27ae6020,stroke:#27ae60,color:#e0e0e0
```

---

## Deployment Architecture

```mermaid
graph TB
    subgraph Internet ["🌐 Internet"]
        USERS["👥 Users"]
    end

    subgraph LB ["Load Balancer"]
        NGINX["Nginx<br/><small>SSL termination · sticky sessions</small>"]
    end

    subgraph Backend_Cluster ["Backend Cluster"]
        B1["Backend 1<br/><small>:3001</small>"]
        B2["Backend 2<br/><small>:3002</small>"]
        B3["Backend N<br/><small>:300N</small>"]
    end

    subgraph Data ["Data Layer"]
        REDIS["Redis<br/><small>Rate limits · sessions · history</small>"]
        MONGO["MongoDB<br/><small>Usage tracking · analytics</small>"]
    end

    subgraph External ["External APIs"]
        DG2["Deepgram"]
        GROQ2["Groq"]
        EL2["ElevenLabs"]
    end

    USERS -->|"HTTPS/WSS"| NGINX
    NGINX --> B1
    NGINX --> B2
    NGINX --> B3
    B1 <--> REDIS
    B2 <--> REDIS
    B3 <--> REDIS
    B1 <--> MONGO
    B2 <--> MONGO
    B3 <--> MONGO
    B1 --> DG2
    B1 --> GROQ2
    B1 --> EL2

    style Internet fill:#1a1a2e,stroke:#16213e,color:#e0e0e0
    style LB fill:#f5a62320,stroke:#f5a623,color:#e0e0e0
    style Backend_Cluster fill:#0f3460,stroke:#16213e,color:#e0e0e0
    style Data fill:#e9456020,stroke:#e94560,color:#e0e0e0
    style External fill:#533483,stroke:#16213e,color:#e0e0e0
```

---

## Latency Breakdown

Where time goes in a typical voice turn:

```mermaid
gantt
    title Typical Turn Latency (~800ms total)
    dateFormat X
    axisFormat %L ms

    section STT
    Deepgram endpointing     :done, stt, 0, 300

    section LLM
    Groq first token          :active, llm, 300, 500

    section TTS
    ElevenLabs first audio    :tts1, 500, 700

    section Playback
    Browser starts playing    :crit, play, 700, 800
```

| Stage                    | Provider   | Typical Latency |
| ------------------------ | ---------- | --------------- |
| STT endpointing          | Deepgram   | ~300ms          |
| LLM first token          | Groq       | ~150-250ms      |
| TTS first audio          | ElevenLabs | ~200-300ms      |
| Network + decode         | WebSocket  | ~50-100ms       |
| **Total to first audio** |            | **~700-950ms**  |

---

## Key Design Decisions

### Echo Suppression

When the assistant is speaking, the mic picks up audio from speakers. Without handling, this creates a feedback loop:

```mermaid
flowchart LR
    A["🔊 Assistant speaks"] --> B["🎤 Mic picks up"]
    B --> C["📡 Deepgram transcribes"]
    C --> D["🧠 Triggers new pipeline"]
    D --> E["❌ Interrupts assistant"]
    E --> A

    style A fill:#e74c3c,stroke:#e74c3c,color:#fff
    style E fill:#e74c3c,stroke:#e74c3c,color:#fff
```

**Solution:** While `assistantSpeaking = true`, ALL STT events are suppressed. After the pipeline finishes, an 800ms cooldown prevents the tail end of speaker audio from triggering false interrupts.

### Sentence-Level Audio Streaming

TTS providers return streaming MP3 chunks, but individual chunks aren't decodable by browsers. The solution is sentence-level buffering:

```mermaid
flowchart LR
    T1["token"] --> T2["token"] --> T3["token."] --> S1["✅ Sentence 1<br/><small>Send to TTS</small>"]
    T4["token"] --> T5["token!"] --> S2["✅ Sentence 2<br/><small>Send to TTS</small>"]

    S1 --> TTS1["TTS chunks → combine → complete MP3"]
    S2 --> TTS2["TTS chunks → combine → complete MP3"]

    TTS1 --> PLAY["▶️ Play sentence 1"]
    TTS2 --> PLAY2["▶️ Play sentence 2"]

    style S1 fill:#27ae60,stroke:#27ae60,color:#fff
    style S2 fill:#27ae60,stroke:#27ae60,color:#fff
    style PLAY fill:#e94560,stroke:#e94560,color:#fff
    style PLAY2 fill:#e94560,stroke:#e94560,color:#fff
```

Audio starts playing before the full LLM response is generated. Each sentence plays as soon as its TTS is ready — while the LLM continues generating the next sentence.
