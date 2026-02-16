# WebSocket API

The voice assistant communicates over WebSocket. All messages are JSON.

## Connection

```
ws://localhost:3001/ws/voice
```

### Query Parameters

| Param | Required | Description |
|-------|----------|-------------|
| `api_key` | No* | API key for authentication |
| `token` | No* | JWT token for authentication |
| `session_id` | No | Resume a previous conversation session |

*Required if `API_KEYS` is configured on the server.

### Example

```javascript
const ws = new WebSocket("ws://localhost:3001/ws/voice?api_key=your_key&session_id=abc123");
```

---

## Server → Client Messages

### `connected`

Sent immediately after successful connection.

```json
{
  "type": "connected",
  "sessionId": "uuid-here",
  "historyKey": "session-key-for-reconnect",
  "timestamp": 1708000000000
}
```

Save `historyKey` to resume the conversation later via `session_id` query param.

### `transcript`

Real-time transcription of user or assistant speech.

```json
{
  "type": "transcript",
  "payload": {
    "text": "Hello, how are you?",
    "isFinal": true,
    "timestamp": 1708000000000,
    "role": "user"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | Transcribed text |
| `isFinal` | boolean | `true` = finalized, `false` = interim (may change) |
| `role` | `"user"` \| `"assistant"` | Who said it |
| `timestamp` | number | Unix timestamp in ms |

### `audio`

Base64-encoded MP3 audio of the assistant's response.

```json
{
  "type": "audio",
  "payload": "SUQzBAAAAAAAI1RTU0UAAAA..."
}
```

Decode with `atob()` and play with `AudioContext.decodeAudioData()`.

### `audioStop`

Sent when the assistant is interrupted. Client should immediately stop audio playback.

```json
{
  "type": "audioStop"
}
```

### `error`

```json
{
  "type": "error",
  "payload": {
    "message": "Failed to start speech recognition"
  }
}
```

### `pong`

Response to client `ping`.

```json
{
  "type": "pong",
  "timestamp": 1708000000000
}
```

---

## Client → Server Messages

### `audio`

Send microphone audio as base64-encoded PCM (16-bit, 16kHz, mono).

```json
{
  "type": "audio",
  "payload": "base64-encoded-pcm-data"
}
```

### `ping`

Keep-alive ping.

```json
{
  "type": "ping"
}
```

---

## Full Client Example

```javascript
// Connect
const ws = new WebSocket("ws://localhost:3001/ws/voice");

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case "connected":
      console.log("Connected:", msg.sessionId);
      // Save for reconnection
      localStorage.setItem("session_id", msg.historyKey);
      break;

    case "transcript":
      const { text, isFinal, role } = msg.payload;
      console.log(`[${role}] ${text}${isFinal ? "" : "..."}`);
      break;

    case "audio":
      // Decode and play MP3
      const bytes = Uint8Array.from(atob(msg.payload), c => c.charCodeAt(0));
      audioContext.decodeAudioData(bytes.buffer).then(buffer => {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(0);
      });
      break;

    case "audioStop":
      // Stop any playing audio immediately
      currentSource?.stop();
      break;

    case "error":
      console.error("Error:", msg.payload.message);
      break;
  }
};

// Send audio from microphone
function sendAudio(pcmArrayBuffer) {
  const bytes = new Uint8Array(pcmArrayBuffer);
  const base64 = btoa(String.fromCharCode(...bytes));
  ws.send(JSON.stringify({ type: "audio", payload: base64 }));
}
```

---

## Audio Format

| Direction | Format | Sample Rate | Encoding |
|-----------|--------|-------------|----------|
| Client → Server | PCM 16-bit | 16kHz | Linear16, base64 |
| Server → Client | MP3 | 24kHz | Complete MP3 file, base64 |

The server sends one complete MP3 file per sentence. Use `decodeAudioData()` to decode.
