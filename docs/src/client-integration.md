# Client Integration

How to integrate Voicex into your app or connect Twilio phone numbers.

## Overview

- **Your API keys:** You (Voicex) issue API keys to clients
- **Client's Twilio:** Clients use their own Twilio account and phone numbers
- **You provide:** AI (STT, LLM, TTS). Clients pay Twilio for calls; they pay you for AI usage

---

## Authentication

### Option A: API Key (Direct)

Use the API key in the URL:

```
ws://localhost:3001/ws/voice?api_key=YOUR_API_KEY
```

For Twilio webhook:
```
http://localhost:3001/api/twilio/voice?api_key=YOUR_API_KEY
```

### Option B: JWT Token (Recommended)

Get a short-lived token, then use it:

**Request token:**

```bash
curl -X POST http://localhost:3001/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"api_key": "YOUR_API_KEY"}'
```

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

**Use token:**

```
ws://localhost:3001/ws/voice?token=eyJhbGciOiJIUzI1NiIs...
```

::: tip
Tokens expire (default 1h). Refresh before expiry. API keys don't expire but are long-lived secrets — don't expose them in client-side code.
:::

---

## WebSocket (Browser / App)

For in-app voice (web or mobile):

```javascript
// 1. Get token
const res = await fetch("http://localhost:3001/api/auth/token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ api_key: "YOUR_API_KEY" }),
});
const { token } = await res.json();

// 2. Connect WebSocket
const sessionId = localStorage.getItem("voicex_session_id") ?? crypto.randomUUID();
const ws = new WebSocket(
  `ws://localhost:3001/ws/voice?token=${token}&session_id=${sessionId}`
);

// 3. Handle messages
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "connected" && msg.historyKey) {
    localStorage.setItem("voicex_session_id", msg.historyKey);
  }
  if (msg.type === "transcript") console.log(msg.payload.role, msg.payload.text);
  if (msg.type === "audio") playAudio(msg.payload);
  if (msg.type === "audioStop") stopAudio();
  if (msg.type === "error") console.error(msg.payload.message);
};

// 4. Send microphone audio (base64 PCM 16kHz)
ws.send(JSON.stringify({ type: "audio", payload: base64Chunk }));
```

See [WebSocket API](./websocket-api) for full protocol details.

---

## Twilio Integration (Phone Calls)

Clients use their own Twilio account. No need to share Twilio keys with you.

### Step 1: Get API key

You issue an API key (e.g. `sk_live_abc123`) to the client.

### Step 2: Configure Twilio webhook

In [Twilio Console](https://console.twilio.com) → Phone Numbers → Voice Configuration:

- **A call comes in:** Webhook
- **URL:** `http://localhost:3001/api/twilio/voice?api_key=sk_live_abc123`

### Step 3: Flow

1. Caller dials the Twilio number
2. Twilio POSTs to your webhook URL (with `api_key` in the URL)
3. Server validates the key and returns TwiML for Media Streams
4. Twilio streams audio → STT → LLM → TTS → audio streamed back
5. Caller hears the AI assistant

---

## API Reference

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/health` | GET | None | Health check |
| `/api/auth/token` | POST | api_key (body or Bearer) | Get JWT token |
| `/api/twilio/voice` | POST | api_key or token (query) | Twilio webhook |
| `/ws/voice` | WebSocket | api_key or token (query) | Browser voice |
| `/ws/twilio/stream` | WebSocket | api_key or token (query) | Twilio Media Streams |

---

## Server Configuration

```bash
# API keys you issue to clients (comma-separated)
API_KEYS=sk_live_client1,sk_live_client2

# Required for token API
JWT_SECRET=min_32_characters_secret_here
JWT_EXPIRES_IN=1h

# Public URL for Twilio TwiML
TWILIO_APP_URL=http://localhost:3001
```
