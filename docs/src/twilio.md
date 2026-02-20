# Twilio Setup

Connect phone calls to the AI assistant via Twilio Media Streams.

## How It Works

```
Caller → Twilio → POST /api/twilio/voice → TwiML (Connect to Media Stream)
                                          ↓
                                 /ws/twilio/stream (WebSocket)
                                          ↓
                            Audio: mulaw 8kHz ↔ STT → LLM → TTS
```

1. Caller dials a Twilio number
2. Twilio sends a webhook to your server
3. Server responds with TwiML that starts a Media Stream
4. Audio is streamed bidirectionally over WebSocket
5. Backend runs the same STT → LLM → TTS pipeline (with mulaw conversion)

## Prerequisites

- A [Twilio account](https://www.twilio.com/try-twilio) with a phone number
- Your backend accessible from the internet (for the webhook)

## Configuration

Set in `backend/.env.local`:

```bash
# Your backend's public URL (no trailing slash)
TWILIO_APP_URL=http://localhost:3001

# API keys for auth (Twilio webhook includes the key in the URL)
API_KEYS=sk_live_abc123
```

::: warning
For production, `TWILIO_APP_URL` must be an HTTPS URL accessible from the internet. Use ngrok for local testing:

```bash
ngrok http 3001
# Then set TWILIO_APP_URL=https://abc123.ngrok.io
```

:::

## Twilio Console Setup

1. Go to [Twilio Console](https://console.twilio.com) → Phone Numbers → Manage → Active Numbers
2. Click your phone number
3. Under **Voice Configuration**:
   - **A call comes in:** Webhook
   - **URL:** `http://localhost:3001/api/twilio/voice?api_key=sk_live_abc123`
   - **Method:** POST

## Audio Format

Twilio Media Streams use **mulaw encoding at 8kHz**. The backend automatically:

- Converts incoming mulaw to the format Deepgram expects
- Converts outgoing MP3 (from TTS) to mulaw for Twilio playback

## Testing Locally

1. Install [ngrok](https://ngrok.com/):

   ```bash
   ngrok http 3001
   ```

2. Set the ngrok URL:

   ```bash
   TWILIO_APP_URL=https://abc123.ngrok.io
   ```

3. Update Twilio webhook URL to use the ngrok URL:

   ```
   https://abc123.ngrok.io/api/twilio/voice?api_key=sk_live_abc123
   ```

4. Call your Twilio number!

## Multi-Tenant

Each client configures their own Twilio number's webhook to point to your server with their unique API key:

```
https://your-server.com/api/twilio/voice?api_key=CLIENT_SPECIFIC_KEY
```

Usage is tracked per client via MongoDB when `MONGODB_URI` is set.
