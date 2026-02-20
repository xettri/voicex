# Deployment

Production deployment guide for Voicex.

---

## Production Architecture

```mermaid
graph TB
    subgraph Internet ["🌐 Internet"]
        USERS["👥 Users / Clients<br/><small>Browser, Mobile, Twilio</small>"]
    end

    subgraph Edge ["Edge Layer"]
        SSL["🔒 SSL Termination"]
        LB["⚖️ Load Balancer<br/><small>Nginx / AWS ALB / Cloudflare</small>"]
    end

    subgraph Compute ["Compute Cluster"]
        direction LR
        B1["🖥️ Backend 1<br/><small>:3001</small>"]
        B2["🖥️ Backend 2<br/><small>:3001</small>"]
        B3["🖥️ Backend N<br/><small>:3001</small>"]
    end

    subgraph Data ["Data Layer"]
        direction LR
        REDIS["⚡ Redis<br/><small>Rate limits · Sessions<br/>Conversation history</small>"]
        MONGO["🗄️ MongoDB<br/><small>Usage tracking<br/>Billing · Analytics</small>"]
    end

    subgraph AI ["AI Provider APIs"]
        direction LR
        DG["🎙️ Deepgram<br/><small>STT (Nova-2)</small>"]
        GRQ["🧠 Groq / OpenAI<br/><small>LLM</small>"]
        EL["🗣️ ElevenLabs / OpenAI<br/><small>TTS</small>"]
    end

    USERS -->|"HTTPS / WSS"| SSL
    SSL --> LB
    LB -->|"sticky sessions<br/><small>(ip_hash / cookie)</small>"| B1
    LB -->|"sticky sessions"| B2
    LB -->|"sticky sessions"| B3

    B1 <--> REDIS
    B2 <--> REDIS
    B3 <--> REDIS

    B1 <--> MONGO
    B2 <--> MONGO
    B3 <--> MONGO

    B1 -->|"WebSocket"| DG
    B1 --> GRQ
    B1 --> EL
    B2 --> DG
    B2 --> GRQ
    B2 --> EL

    style Internet fill:#1a1a2e,stroke:#e0e0e0,color:#e0e0e0
    style Edge fill:#f39c1220,stroke:#f39c12,color:#e0e0e0
    style Compute fill:#0f3460,stroke:#3498db,color:#e0e0e0
    style Data fill:#c0392b20,stroke:#e74c3c,color:#e0e0e0
    style AI fill:#8e44ad20,stroke:#9b59b6,color:#e0e0e0
    style USERS fill:#3498db,stroke:#3498db,color:#fff
    style SSL fill:#f39c12,stroke:#f39c12,color:#fff
    style LB fill:#f39c12,stroke:#f39c12,color:#fff
    style B1 fill:#2980b9,stroke:#2980b9,color:#fff
    style B2 fill:#2980b9,stroke:#2980b9,color:#fff
    style B3 fill:#2980b9,stroke:#2980b9,color:#fff
    style REDIS fill:#e74c3c,stroke:#e74c3c,color:#fff
    style MONGO fill:#27ae60,stroke:#27ae60,color:#fff
    style DG fill:#9b59b6,stroke:#9b59b6,color:#fff
    style GRQ fill:#9b59b6,stroke:#9b59b6,color:#fff
    style EL fill:#9b59b6,stroke:#9b59b6,color:#fff
```

---

## Request Flow

How a single voice session flows through the production stack:

```mermaid
sequenceDiagram
    participant C as 👤 Client
    participant LB as ⚖️ Load Balancer
    participant B as 🖥️ Backend
    participant R as ⚡ Redis
    participant DG as 🎙️ Deepgram
    participant LLM as 🧠 Groq
    participant TTS as 🗣️ ElevenLabs

    C->>LB: WSS connect
    LB->>B: Sticky route (ip_hash)
    B->>R: Check rate limit
    R-->>B: OK
    B->>B: Validate API key / JWT

    Note over B: Session created

    B->>DG: Open STT stream
    B->>R: Init conversation history

    loop Voice conversation
        C->>B: PCM audio (base64)
        B->>DG: Forward audio
        DG-->>B: Transcript
        B->>R: Load history
        R-->>B: Context
        B->>LLM: Prompt + context
        LLM-->>B: Token stream
        B->>TTS: Sentence text
        TTS-->>B: MP3 audio
        B->>C: Audio (base64)
        B->>R: Save to history
    end

    C->>B: Disconnect
    B->>DG: Close STT stream
```

---

## Environment Variables (Production)

```bash
NODE_ENV=production
PORT=3001

# ─── Required ───────────────────
DEEPGRAM_API_KEY=your_key
LLM_PROVIDER=groq
GROQ_API_KEY=your_key
ELEVENLABS_API_KEY=your_key

# ─── Auth ───────────────────────
API_KEYS=sk_live_client1,sk_live_client2
JWT_SECRET=your_min_32_char_secret_here
JWT_EXPIRES_IN=1h

# ─── Database ───────────────────
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/voicex
MONGODB_MAX_POOL_SIZE=50
REDIS_URL=redis://your-redis:6379

# ─── Security ──────────────────
CORS_ORIGIN=https://your-frontend.com

# ─── Twilio (optional) ─────────
TWILIO_APP_URL=https://api.your-domain.com
```

---

## Build & Run

```bash
cd backend
pnpm install --frozen-lockfile
pnpm run build
node dist/index.js
```

---

## Docker

### Dockerfile

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY backend/package.json backend/pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile --prod
COPY backend/dist ./dist
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

### Docker Compose (full stack)

```yaml
version: '3.9'
services:
  backend:
    build: .
    ports:
      - '3001:3001'
    env_file: .env
    depends_on:
      - redis
      - mongo
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    restart: unless-stopped

  mongo:
    image: mongo:7
    ports:
      - '27017:27017'
    volumes:
      - mongo_data:/data/db
    environment:
      MONGO_INITDB_DATABASE: voicex
    restart: unless-stopped

volumes:
  redis_data:
  mongo_data:
```

```bash
docker compose up -d
```

---

## Scaling

### Scaling Strategy

```mermaid
flowchart TD
    START["Single Instance<br/><small>1 backend, in-memory</small>"] --> Q1{"Need more\ncapacity?"}
    Q1 -->|"Yes"| REDIS_ADD["Add Redis<br/><small>Set REDIS_URL</small>"]
    REDIS_ADD --> Q2{"Need even\nmore?"}
    Q2 -->|"Yes"| MULTI["Multiple Instances<br/><small>Behind load balancer</small>"]
    MULTI --> LB_CFG["Configure sticky sessions<br/><small>ip_hash or cookie affinity</small>"]
    LB_CFG --> Q3{"Need global\nscale?"}
    Q3 -->|"Yes"| REGIONS["Multi-region<br/><small>Deploy close to users<br/>+ close to Deepgram/Groq</small>"]

    Q1 -->|"No"| DONE1["✅ You're good"]
    Q2 -->|"No"| DONE2["✅ You're good"]
    Q3 -->|"No"| DONE3["✅ You're good"]

    style START fill:#3498db,stroke:#3498db,color:#fff
    style REDIS_ADD fill:#e74c3c,stroke:#e74c3c,color:#fff
    style MULTI fill:#2980b9,stroke:#2980b9,color:#fff
    style LB_CFG fill:#f39c12,stroke:#f39c12,color:#fff
    style REGIONS fill:#9b59b6,stroke:#9b59b6,color:#fff
    style DONE1 fill:#27ae60,stroke:#27ae60,color:#fff
    style DONE2 fill:#27ae60,stroke:#27ae60,color:#fff
    style DONE3 fill:#27ae60,stroke:#27ae60,color:#fff
```

### Requirements for Horizontal Scaling

| Requirement         | Why                                                          | Config                        |
| ------------------- | ------------------------------------------------------------ | ----------------------------- |
| **Sticky sessions** | WebSocket connections must stay on the same instance         | Nginx `ip_hash` or ALB cookie |
| **Redis**           | Rate limits and conversation history shared across instances | Set `REDIS_URL`               |
| **MongoDB**         | Usage tracking and billing shared across instances           | Set `MONGODB_URI`             |
| **Health checks**   | Load balancer needs to detect unhealthy instances            | `GET /api/health`             |

### Nginx Configuration

```nginx
upstream voicex {
    ip_hash;
    server backend1:3001;
    server backend2:3001;
    server backend3:3001;
}

server {
    listen 443 ssl;
    server_name api.your-domain.com;

    ssl_certificate     /etc/ssl/certs/your-cert.pem;
    ssl_certificate_key /etc/ssl/private/your-key.pem;

    location / {
        proxy_pass http://voicex;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;    # 24h — keep WebSocket alive
        proxy_send_timeout 86400;
    }

    location /api/health {
        proxy_pass http://voicex;
        proxy_read_timeout 5s;
    }
}
```

---

## Health Check

```
GET /api/health
```

Returns:

```json
{
  "status": "ok",
  "timestamp": 1708185600000
}
```

Use for load balancer health checks and Kubernetes liveness/readiness probes.

---

## Monitoring

### Key Metrics

```mermaid
graph LR
    subgraph Metrics ["📊 What to Monitor"]
        direction TB
        M1["🔌 WebSocket connections<br/><small>Active voice sessions</small>"]
        M2["⏱️ Pipeline latency<br/><small>End-to-end turn time</small>"]
        M3["🧠 LLM latency<br/><small>Time to first token</small>"]
        M4["🗣️ TTS errors<br/><small>Failed audio generations</small>"]
        M5["🎙️ STT connection<br/><small>Deepgram open/close events</small>"]
        M6["💾 Redis health<br/><small>Connection pool + latency</small>"]
    end

    subgraph Logs ["📝 Log Lines to Watch"]
        direction TB
        L1["Pipeline finished { elapsed }"]
        L2["LLM done { llmMs }"]
        L3["TTS failed for chunk"]
        L4["Deepgram connection opened"]
        L5["Deepgram connection closed"]
        L6["Session created / destroyed"]
    end

    M1 ~~~ L6
    M2 ~~~ L1
    M3 ~~~ L2
    M4 ~~~ L3
    M5 ~~~ L4

    style Metrics fill:#0f3460,stroke:#3498db,color:#e0e0e0
    style Logs fill:#1a1a2e,stroke:#e0e0e0,color:#e0e0e0
```

**Recommended stack:** Pino JSON logs → Fluentd/Vector → Elasticsearch/Loki → Grafana

---

## Production Checklist

```mermaid
flowchart LR
    subgraph Security ["🔐 Security"]
        S1["API_KEYS set"]
        S2["JWT_SECRET ≥ 32 chars"]
        S3["CORS_ORIGIN set"]
        S4["SSL enabled"]
    end

    subgraph Infra ["🏗️ Infrastructure"]
        I1["NODE_ENV=production"]
        I2["Redis connected"]
        I3["MongoDB connected"]
        I4["Sticky sessions enabled"]
    end

    subgraph Ops ["📡 Operations"]
        O1["/api/health monitored"]
        O2["Log aggregation set up"]
        O3["Alerts on TTS failures"]
        O4["Backup strategy for MongoDB"]
    end

    style Security fill:#e74c3c20,stroke:#e74c3c,color:#e0e0e0
    style Infra fill:#3498db20,stroke:#3498db,color:#e0e0e0
    style Ops fill:#27ae6020,stroke:#27ae60,color:#e0e0e0
```

- [ ] Set `NODE_ENV=production`
- [ ] Set `API_KEYS` (don't leave auth open)
- [ ] Set `JWT_SECRET` (min 32 chars)
- [ ] Set `CORS_ORIGIN` to your frontend domain
- [ ] Set `MONGODB_URI` for session/usage tracking
- [ ] Set `REDIS_URL` for distributed rate limiting
- [ ] Configure SSL termination at load balancer
- [ ] Enable sticky sessions for WebSocket
- [ ] Set up log aggregation (backend uses Pino JSON logging)
- [ ] Monitor `/api/health` endpoint
- [ ] Set up alerts for TTS failures and high latency
- [ ] Configure auto-scaling based on WebSocket connection count
