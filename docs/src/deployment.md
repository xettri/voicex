# Deployment

Production deployment guide for Voicex.

---

## Production Architecture

```mermaid
graph TB
    subgraph Internet ["Internet"]
        USERS["Users / Clients<br/><small>Browser, Mobile, Twilio</small>"]
    end

    subgraph Edge ["Edge Layer"]
        SSL["SSL Termination"]
        LB["Load Balancer<br/><small>Nginx / AWS ALB / Cloudflare</small>"]
    end

    subgraph Frontend_Cluster ["Frontend"]
        FE["Next.js<br/><small>Static/SSR</small>"]
    end

    subgraph Compute ["Backend Cluster"]
        B1["Backend 1<br/><small>:3001</small>"]
        B2["Backend 2<br/><small>:3001</small>"]
        B3["Backend N<br/><small>:3001</small>"]
    end

    subgraph Data ["Data Layer"]
        REDIS["Redis<br/><small>Plan cache · Rate limits<br/>Conversation history</small>"]
        MONGO["MongoDB<br/><small>Orgs · Agents · Providers<br/>Plans · Calls · Usage</small>"]
    end

    subgraph AI ["AI Provider APIs"]
        DG["Deepgram STT"]
        GRQ["Groq / OpenAI LLM"]
        EL["ElevenLabs / OpenAI TTS"]
    end

    USERS -->|"HTTPS / WSS"| SSL
    SSL --> LB
    LB --> FE
    LB -->|"sticky sessions"| B1
    LB -->|"sticky sessions"| B2
    LB -->|"sticky sessions"| B3

    B1 <--> REDIS
    B2 <--> REDIS
    B3 <--> REDIS

    B1 <--> MONGO
    B2 <--> MONGO
    B3 <--> MONGO

    B1 --> DG
    B1 --> GRQ
    B1 --> EL
```

---

## Environment Variables (Production)

```bash
NODE_ENV=production
PORT=3001

# ─── Required ────────────────────
DEEPGRAM_API_KEY=your_key
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/voicex
JWT_SECRET=your_production_min_32_char_secret
ENCRYPTION_KEY=your_64_char_hex_key

# ─── LLM + TTS (for global providers) ────
GROQ_API_KEY=your_key
OPENAI_API_KEY=your_key
ELEVENLABS_API_KEY=your_key

# ─── Infrastructure ─────────────
REDIS_URL=redis://your-redis:6379
CORS_ORIGIN=https://your-frontend.com

# ─── Twilio (optional) ──────────
TWILIO_APP_URL=https://api.your-domain.com
```

See [Environment Variables](./environment) for the full reference.

---

## Build & Run

### Backend

```bash
cd backend
pnpm install --frozen-lockfile
pnpm run build
node dist/index.js
```

### Frontend

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm run build
pnpm start
```

### Seed Database (First Deploy)

```bash
bash scripts/seed-plans.sh
bash scripts/seed-global-providers.sh
bash scripts/seed.sh
```

---

## Docker

### Backend Dockerfile

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY backend/package.json backend/pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile --prod
COPY backend/dist ./dist
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

### Docker Compose (Full Stack)

```yaml
version: '3.9'
services:
  frontend:
    build:
      context: .
      dockerfile: frontend/Dockerfile
    ports:
      - '3000:3000'
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:3001/api
    depends_on:
      - backend

  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    ports:
      - '3001:3001'
    env_file: backend/.env.local
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

### Requirements for Horizontal Scaling

| Requirement | Why | Config |
|-------------|-----|--------|
| **Sticky sessions** | WebSocket connections must stay on the same instance | Nginx `ip_hash` or ALB cookie |
| **Redis** | Rate limits, plan cache, and conversation history shared across instances | Set `REDIS_URL` |
| **MongoDB** | All persistent data shared across instances | Set `MONGODB_URI` |
| **Health checks** | Load balancer needs to detect unhealthy instances | `GET /api/health` |

### Nginx Configuration

```nginx
upstream voicex_backend {
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
        proxy_pass http://voicex_backend;
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
        proxy_pass http://voicex_backend;
        proxy_read_timeout 5s;
    }
}
```

---

## Health Check

```
GET /api/health
```

```json
{ "status": "ok", "timestamp": 1708185600000 }
```

Use for load balancer health checks and Kubernetes liveness/readiness probes.

---

## Monitoring

### Key Metrics to Watch

| Metric | Source | Why |
|--------|--------|-----|
| WebSocket connections | Server logs | Active voice sessions |
| Pipeline latency | `Pipeline finished { elapsed }` log | End-to-end turn time |
| LLM latency | `LLM done { llmMs }` log | Time to first token |
| TTS failures | `TTS failed` log | Audio generation errors |
| STT connection status | `Deepgram connection opened/closed` | STT health |
| Redis latency | Redis client | Cache performance |
| MongoDB query time | MongoDB profiler | DB performance |

**Recommended logging stack:** Pino JSON logs → Fluentd/Vector → Elasticsearch/Loki → Grafana

---

## Production Checklist

### Security

- [ ] Set `NODE_ENV=production`
- [ ] Set `JWT_SECRET` (min 32 chars, cryptographically random)
- [ ] Set `ENCRYPTION_KEY` (64-char hex, cryptographically random)
- [ ] Set `CORS_ORIGIN` to your frontend domain
- [ ] SSL/TLS enabled at load balancer
- [ ] API keys use database-backed keys (not env `API_KEYS`)

### Infrastructure

- [ ] MongoDB connected (with connection pooling)
- [ ] Redis connected (for distributed operations)
- [ ] Sticky sessions enabled for WebSocket
- [ ] Health check monitoring (`GET /api/health`)

### Data

- [ ] Plans seeded (`bash scripts/seed-plans.sh`)
- [ ] Global providers seeded (`bash scripts/seed-global-providers.sh`)
- [ ] Provider registry seeded (`bash scripts/seed.sh`)
- [ ] MongoDB indexes created (automatic on startup)

### Operations

- [ ] Log aggregation configured (Pino JSON logging)
- [ ] Alerts on TTS failures and high latency
- [ ] MongoDB backup strategy
- [ ] Auto-scaling based on WebSocket connection count
- [ ] Redis persistence configured (AOF or RDB)

---

## Graceful Shutdown

The backend handles `SIGTERM` and `SIGINT`:

1. Close all WebSocket connections
2. Close HTTP server (stop accepting new connections)
3. Close MongoDB connection
4. Close Redis connections
5. Exit process

**Timeout:** 10 seconds. If shutdown takes longer, the process is force-killed.

This ensures clean container restarts in Docker/Kubernetes environments.
