# Admin Scripts & Management

Seed scripts, migrations, mongosh commands, and bash helpers for managing Voicex.

---

## Seed Scripts

Voicex requires seed data to function. Run these scripts **in order** after setting up your environment.

### 1. Seed Plans

Creates the 4 standard plans (free, starter, pro, enterprise) with model access, limits, pricing, and features.

```bash
bash scripts/seed-plans.sh
```

**Source:** `backend/src/scripts/seed-plans.ts`

**What it does:**
- Creates plans if they don't exist
- Backfills `features` field on existing plans if missing
- Never modifies existing plan data (idempotent)

### 2. Seed Global Providers

Creates platform-owned providers with encrypted credentials from your env vars.

```bash
bash scripts/seed-global-providers.sh
```

**Source:** `backend/src/scripts/seed-global-providers.ts`

**Reads these env vars:**
- `GROQ_API_KEY` → Groq LLM provider
- `OPENAI_API_KEY` → OpenAI LLM + TTS providers
- `ELEVENLABS_API_KEY` → ElevenLabs TTS provider
- `DEEPGRAM_API_KEY` → Deepgram STT provider
- `OLLAMA_BASE_URL` → Ollama LLM provider (no key needed)
- `ENCRYPTION_KEY` → for encrypting credentials

**Creates 7 providers** (all with `orgId: null`):

| Category | Key | Name |
|----------|-----|------|
| llm | ollama | Ollama (Local) |
| llm | groq | Groq Cloud |
| llm | openai | OpenAI |
| tts | edge | Edge TTS (Free) |
| tts | elevenlabs | ElevenLabs |
| tts | openai | OpenAI TTS |
| stt | deepgram | Deepgram |

Skips existing providers. Safe to run multiple times.

### 3. Seed Provider Registry + Test Data

Seeds the provider registry catalog and creates a test organization with a test user and agent.

```bash
bash scripts/seed.sh
```

**Source:** `backend/src/scripts/seed.ts`

**What it does:**
1. Ensures all database indexes
2. Seeds the `provider_registry` collection (catalog of supported provider types)
3. Runs migrations (org plans, agent configs, client providers)
4. Creates a test organization:
   - Org: `TestOrg` (pro plan, status: active)
   - User: `a@a.dev` / `12345678` (admin)
   - Agent: `Default Agent` (uses Ollama LLM, Edge TTS, Deepgram STT)
   - API Key: printed to console

---

## Migrations

The `seed.ts` script includes several migration functions that run automatically:

### `migrateOrgPlans`

Migrates organizations from old `plan` string field to `planId` ObjectId reference.

```
Before: { plan: "pro", limits: {...} }
After:  { planId: ObjectId("..."), limits: {...} }
```

### `migrateAgents`

Migrates agents from old embedded config to relational FK structure.

```
Before: { llm: { provider: "groq", model: "llama-3.3-70b-versatile" }, voice: {...} }
After:  { llmProviderId: ObjectId("..."), llmModelId: "llama-3.3-70b-versatile", llmConfig: {...} }
```

### `migrateClientProviders`

Moves documents from the deprecated `client_providers` collection into the unified `providers` collection.

All migrations are idempotent — they skip records that have already been migrated.

---

## MongoDB Admin Commands

Connect to MongoDB:

```bash
# Local
mongosh mongodb://localhost:27017/voicex

# Docker
docker exec -it voicex-mongo-1 mongosh voicex

# Remote / Atlas
mongosh "mongodb+srv://<user>:<pass>@cluster.mongodb.net/voicex"
```

### Organization Management

**View pending accounts:**

```javascript
db.organizations.find({ status: "pending" }).pretty()
```

**Activate by email:**

```javascript
db.organizations.updateOne(
  { ownerEmail: "client@company.com" },
  { $set: { status: "active", updatedAt: new Date() } }
)
```

**Activate by org name:**

```javascript
db.organizations.updateOne(
  { name: "Acme Corp" },
  { $set: { status: "active", updatedAt: new Date() } }
)
```

**Suspend a client:**

```javascript
db.organizations.updateOne(
  { ownerEmail: "client@company.com" },
  { $set: { status: "pending", updatedAt: new Date() } }
)
```

**Bulk activate all pending:**

```javascript
db.organizations.updateMany(
  { status: "pending" },
  { $set: { status: "active", updatedAt: new Date() } }
)
```

### Plan Management

**Change a client's plan:**

```javascript
// Get the target plan
const plan = db.plans.findOne({ slug: "pro" })

// Update the org
db.organizations.updateOne(
  { ownerEmail: "client@company.com" },
  { $set: { planId: plan._id, updatedAt: new Date() } }
)
```

**View all plans:**

```javascript
db.plans.find({}, { slug: 1, name: 1, "limits": 1, "features": 1 }).pretty()
```

**Create a custom plan for a specific client:**

```javascript
db.plans.insertOne({
  slug: "acme-custom",
  name: "Acme Custom",
  description: "Custom plan for Acme Corp",
  custom: true,
  public: false,
  pricing: { monthly: 199, annual: 1990, maxDiscountPercent: 20 },
  limits: { maxAgents: 50, maxConcurrentCalls: 100, maxCallDurationSec: 7200, maxMonthlyMinutes: 50000 },
  models: {
    llm: ["ollama/llama3.2:3b", "groq/llama-3.3-70b-versatile", "openai/gpt-4o-mini", "openai/gpt-4o"],
    tts: ["edge/en-US-AriaNeural", "elevenlabs/21m00Tcm4TlvDq8ikWAM", "openai/alloy"],
    stt: ["deepgram/nova-2"]
  },
  features: { customProviders: true, maxCustomProviders: 20 },
  createdAt: new Date(),
  updatedAt: new Date()
})
```

### API Key Management

**List active keys for a client:**

```javascript
const org = db.organizations.findOne({ ownerEmail: "client@company.com" })
db.api_keys.find({ orgId: org._id, revokedAt: null }).pretty()
```

**Revoke all keys for an org:**

```javascript
const org = db.organizations.findOne({ ownerEmail: "client@company.com" })
db.api_keys.updateMany(
  { orgId: org._id, revokedAt: null },
  { $set: { revokedAt: new Date() } }
)
```

### Provider Management

**View global providers:**

```javascript
db.providers.find({ orgId: null }, { credentials: 0 }).pretty()
```

**View client providers for an org:**

```javascript
const org = db.organizations.findOne({ ownerEmail: "client@company.com" })
db.providers.find({ orgId: org._id }, { credentials: 0 }).pretty()
```

**Disable a global provider:**

```javascript
db.providers.updateOne(
  { orgId: null, providerKey: "groq", category: "llm" },
  { $set: { active: false, updatedAt: new Date() } }
)
```

**Re-enable:**

```javascript
db.providers.updateOne(
  { orgId: null, providerKey: "groq", category: "llm" },
  { $set: { active: true, updatedAt: new Date() } }
)
```

### Agent Inspection

**List agents with their provider references:**

```javascript
const org = db.organizations.findOne({ ownerEmail: "client@company.com" })
db.agents.find({ orgId: org._id }, {
  name: 1, active: 1, llmProviderId: 1, llmModelId: 1,
  ttsProviderId: 1, ttsModelId: 1, sttProviderId: 1
}).pretty()
```

**Find agents using a specific provider:**

```javascript
const providerId = ObjectId("YOUR_PROVIDER_ID")
db.agents.find({
  $or: [
    { llmProviderId: providerId },
    { ttsProviderId: providerId },
    { sttProviderId: providerId }
  ]
}, { name: 1, orgId: 1 }).pretty()
```

### Usage & Stats

**Total usage for a client:**

```javascript
const org = db.organizations.findOne({ ownerEmail: "client@company.com" })
db.daily_usage.aggregate([
  { $match: { orgId: org._id } },
  { $group: {
    _id: null,
    totalCalls: { $sum: "$calls" },
    totalMinutes: { $sum: "$minutes" },
    totalTokens: { $sum: "$llmTokens" }
  }}
])
```

**Active calls right now:**

```javascript
db.calls.find({ status: "active" }).pretty()
```

### Password Reset

No self-service password reset yet. Manual process:

```bash
# Generate hash for temporary password
node -e "
const {scryptSync, randomBytes} = require('crypto');
const salt = randomBytes(16).toString('hex');
const hash = scryptSync('TempPass123!', salt, 64).toString('hex');
console.log(salt + ':' + hash);
"
```

```javascript
db.users.updateOne(
  { email: "client@company.com" },
  { $set: { passwordHash: "<output_from_above>" } }
)
```

### Delete a Client (Irreversible)

```javascript
const org = db.organizations.findOne({ ownerEmail: "client@company.com" })
const orgId = org._id

db.calls.deleteMany({ orgId })
db.agents.deleteMany({ orgId })
db.api_keys.deleteMany({ orgId })
db.daily_usage.deleteMany({ orgId })
db.providers.deleteMany({ orgId })  // client providers only
db.users.deleteMany({ orgId })
db.organizations.deleteOne({ _id: orgId })

print("Deleted org:", org.name)
```

### Database Health Check

```javascript
print("Organizations:", db.organizations.countDocuments())
print("  - active:   ", db.organizations.countDocuments({ status: "active" }))
print("  - pending:  ", db.organizations.countDocuments({ status: "pending" }))
print("Users:        ", db.users.countDocuments())
print("Agents:       ", db.agents.countDocuments())
print("Providers:    ", db.providers.countDocuments())
print("  - global:   ", db.providers.countDocuments({ orgId: null }))
print("  - client:   ", db.providers.countDocuments({ orgId: { $ne: null } }))
print("Plans:        ", db.plans.countDocuments())
print("Calls total:  ", db.calls.countDocuments())
print("Calls active: ", db.calls.countDocuments({ status: "active" }))
print("API keys:     ", db.api_keys.countDocuments({ revokedAt: null }))
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Seed plans | `bash scripts/seed-plans.sh` |
| Seed providers | `bash scripts/seed-global-providers.sh` |
| Seed test data | `bash scripts/seed.sh` |
| Activate client | `db.organizations.updateOne({ ownerEmail: "..." }, { $set: { status: "active" } })` |
| Change plan | Get plan by slug, then update org's `planId` |
| Disable provider | `db.providers.updateOne({ providerKey: "..." }, { $set: { active: false } })` |
| Find agents for provider | `db.agents.find({ $or: [{ llmProviderId: id }, ...] })` |
| Health check | Run the queries in the health check section |
| Delete client | Run the deletion block (irreversible) |
