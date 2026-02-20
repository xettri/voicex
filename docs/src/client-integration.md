# Client Integration

How to integrate Voicex voice AI into your application — from your backend or frontend.

---

## Overview

Voicex provides two integration methods:

| Method | Use Case | Transport |
|--------|----------|-----------|
| **WebSocket** | Browser/app voice | Direct WebSocket to `/ws/voice` |
| **Twilio webhook** | Phone calls | Twilio → webhook → Media Streams |

**Authentication:** Clients authenticate with API keys created via the dashboard.

---

## Getting an API Key

1. Sign in to the dashboard at `https://your-voicex.com`
2. Go to **Settings** → **API Keys**
3. Click **Create API Key**
4. Copy the key (shown only once): `vx_a1b2c3d4e5f6...`

---

## Browser Voice Integration (WebSocket)

### Step 1: Connect

```javascript
const API_KEY = 'vx_a1b2c3d4e5f6...';
const AGENT_ID = '664a...';  // optional, uses default agent if omitted
const SESSION_ID = localStorage.getItem('voicex_session_id');

const params = new URLSearchParams({ api_key: API_KEY });
if (AGENT_ID) params.set('agent_id', AGENT_ID);
if (SESSION_ID) params.set('session_id', SESSION_ID);

const ws = new WebSocket(`wss://api.your-voicex.com/ws/voice?${params}`);
```

### Step 2: Handle Messages

```javascript
const audioContext = new AudioContext({ sampleRate: 24000 });

ws.onmessage = async (event) => {
  // Binary frames = audio
  if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
    const buffer = event.data instanceof Blob
      ? await event.data.arrayBuffer()
      : event.data;
    const decoded = await audioContext.decodeAudioData(buffer);
    const source = audioContext.createBufferSource();
    source.buffer = decoded;
    source.connect(audioContext.destination);
    source.start(0);
    return;
  }

  // JSON frames = control messages
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case 'connected':
      console.log('Connected to agent:', msg.agentName);
      localStorage.setItem('voicex_session_id', msg.historyKey);
      startMicrophone();
      break;

    case 'transcript':
      const { role, text, isFinal } = msg.payload;
      updateTranscript(role, text, isFinal);
      break;

    case 'audioStop':
      stopAllAudio();  // user interrupted
      break;

    case 'audioEnd':
      // assistant finished speaking
      break;

    case 'error':
      console.error('Voicex error:', msg.payload.message);
      break;
  }
};
```

### Step 3: Capture and Send Microphone Audio

```javascript
async function startMicrophone() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 16000,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }
  });

  const context = new AudioContext({ sampleRate: 16000 });
  const source = context.createMediaStreamSource(stream);

  // Use ScriptProcessorNode (simpler) or AudioWorklet (better)
  const processor = context.createScriptProcessor(4096, 1, 1);
  source.connect(processor);
  processor.connect(context.destination);

  processor.onaudioprocess = (e) => {
    if (ws.readyState !== WebSocket.OPEN) return;

    const float32 = e.inputBuffer.getChannelData(0);
    const pcm16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));
    }
    ws.send(pcm16.buffer);
  };
}
```

### Audio Format

| Direction | Format | Sample Rate | Encoding |
|-----------|--------|-------------|----------|
| Client → Server | PCM 16-bit | 16kHz mono | Raw binary |
| Server → Client | MP3 | 24kHz | Binary (one MP3 per sentence) |

---

## REST API Integration

Use the REST API for managing agents, calls, and settings programmatically.

### Authentication

```bash
# Using API key header
curl -H "x-api-key: vx_a1b2c3d4e5f6..." \
  https://api.your-voicex.com/api/dashboard/agents
```

### Common Operations

**List agents:**

```bash
curl -H "x-api-key: vx_..." \
  https://api.your-voicex.com/api/dashboard/agents
```

**Get org stats:**

```bash
curl -H "x-api-key: vx_..." \
  https://api.your-voicex.com/api/dashboard/stats
```

**List recent calls:**

```bash
curl -H "x-api-key: vx_..." \
  "https://api.your-voicex.com/api/dashboard/calls?limit=10"
```

**Get call transcript:**

```bash
curl -H "x-api-key: vx_..." \
  https://api.your-voicex.com/api/dashboard/calls/CALL_ID
```

See [REST API Reference](./rest-api) for all endpoints.

---

## Twilio Integration (Phone Calls)

Clients use their own Twilio account. No need to share Twilio keys with Voicex.

### Step 1: Get API Key

Get a `vx_...` API key from the Voicex dashboard.

### Step 2: Configure Twilio Webhook

In [Twilio Console](https://console.twilio.com) → Phone Numbers → Voice Configuration:

- **A call comes in:** Webhook
- **URL:** `https://api.your-voicex.com/api/twilio/voice?api_key=vx_a1b2c3d4e5f6...`
- **Method:** POST

### Step 3: Call Flow

```
Caller → Twilio → POST /api/twilio/voice → TwiML (Media Stream)
                                         ↓
                              /ws/twilio/stream (WebSocket)
                                         ↓
                           STT → LLM → TTS → Caller hears AI
```

See [Twilio Setup](./twilio) for detailed instructions.

---

## Agent Selection

### Specific Agent

Pass `agent_id` as a query parameter:

```
ws://host/ws/voice?api_key=vx_...&agent_id=664a1234abcd...
```

### Default Agent

If `agent_id` is omitted, the system uses the org's first active agent (sorted by creation date).

### Multiple Agents

Create multiple agents via the dashboard for different use cases:

- Sales bot (aggressive persona, fast responses)
- Support bot (patient persona, detailed answers)
- Receptionist (greeting-focused, call routing)

Each agent has its own:
- System prompt and persona
- LLM model and temperature
- TTS voice and speed
- Interruption sensitivity and silence thresholds

---

## Session Persistence

Conversations persist across reconnections:

1. First connection: server returns `historyKey` in the `connected` message
2. Save this key (e.g., in localStorage or your session store)
3. On reconnect: pass it as `session_id` query param
4. Server loads previous messages from Redis (24h TTL)
5. AI continues the conversation with full context

```javascript
// Save on first connect
const historyKey = connectedMsg.historyKey;

// Use on subsequent connections
const ws = new WebSocket(`wss://host/ws/voice?api_key=vx_...&session_id=${historyKey}`);
```

---

## Error Handling

### WebSocket Close Codes

| Code | Meaning | Action |
|------|---------|--------|
| 4001 | Unauthorized | Check API key |
| 4003 | Model not allowed | Agent uses a model above your plan |
| 4004 | Provider not found/inactive | A provider is disabled |
| 4005 | Agent not found | Invalid agent_id |
| 4029 | Rate limited (30/min) | Back off and retry |
| 1000 | Normal close | Clean disconnect |

### Reconnection Strategy

Implement exponential backoff:

```javascript
let attempts = 0;
const MAX_ATTEMPTS = 3;

function connect() {
  const ws = new WebSocket(url);

  ws.onopen = () => { attempts = 0; };

  ws.onclose = (event) => {
    if (event.code === 4001) return; // don't retry auth errors

    if (attempts < MAX_ATTEMPTS) {
      const delay = Math.min(1000 * Math.pow(2, attempts), 10000);
      attempts++;
      setTimeout(connect, delay);
    }
  };
}
```
