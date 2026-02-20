/**
 * Seed script for VoiceX
 *
 * Strictly additive — never modifies existing data (except migrations).
 * If a record exists, it is skipped. Only missing data is inserted.
 * Safe to run multiple times.
 *
 * IMPORTANT: Run seed-plans.ts and seed-global-providers.ts first.
 */

import 'dotenv/config';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { createHash, randomBytes, scryptSync } from 'crypto';
import type {
  Organization,
  User,
  ApiKeyDoc,
  Agent,
  Plan,
  Provider,
} from '../db/schema.js';
import {
  DEFAULT_AGENT_PERSONA,
  DEFAULT_LLM_CONFIG,
  DEFAULT_TTS_CONFIG,
  DEFAULT_AGENT_THRESHOLDS,
} from '../db/schema.js';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/voicex';

const TEST_ORG_NAME = 'VoiceX Test Org';
const TEST_USER_EMAIL = 'a@a.dev';
const TEST_USER_PASSWORD = '12345678';
const TEST_USER_NAME = 'Test Admin';

function log(msg: string) { console.log(`[seed] ${msg}`); }
function added(msg: string) { console.log(`[seed]   + ${msg}`); }
function skipped(msg: string) { console.log(`[seed]   - ${msg}`); }

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

// ---------------------------------------------------------------------------
// 1. Indexes
// ---------------------------------------------------------------------------

async function ensureIndexes(db: Db) {
  log('Indexes...');

  await Promise.all([
    db.collection('plans').createIndex({ slug: 1 }, { unique: true }),
    db.collection('plans').createIndex({ public: 1, custom: 1 }),
    db.collection('organizations').createIndex({ name: 1 }),
    db.collection('organizations').createIndex({ ownerEmail: 1 }),
    db.collection('organizations').createIndex({ status: 1 }),
    db.collection('organizations').createIndex({ planId: 1 }),
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('users').createIndex({ orgId: 1 }),
    db.collection('api_keys').createIndex({ orgId: 1 }),
    db.collection('api_keys').createIndex({ keyHash: 1 }, { unique: true }),
    db.collection('api_keys').createIndex({ keyPrefix: 1 }),
    db.collection('agents').createIndex({ orgId: 1, active: 1 }),
    db.collection('agents').createIndex({ orgId: 1, createdAt: -1 }),
    db.collection('agents').createIndex({ llmProviderId: 1 }),
    db.collection('agents').createIndex({ ttsProviderId: 1 }),
    db.collection('agents').createIndex({ sttProviderId: 1 }),
    db.collection('calls').createIndex({ orgId: 1, createdAt: -1 }),
    db.collection('calls').createIndex({ orgId: 1, agentId: 1, createdAt: -1 }),
    db.collection('calls').createIndex({ sessionId: 1 }, { unique: true }),
    db.collection('calls').createIndex({ status: 1 }),
    db.collection('calls').createIndex({ orgId: 1, status: 1 }),
    db.collection('daily_usage').createIndex({ orgId: 1, date: -1 }),
    db.collection('daily_usage').createIndex({ orgId: 1, date: 1 }, { unique: true }),
    db.collection('providers').createIndex({ orgId: 1, category: 1 }),
    db.collection('providers').createIndex(
      { orgId: 1, category: 1, providerKey: 1, name: 1 },
      { unique: true },
    ),
    db.collection('providers').createIndex({ orgId: 1, active: 1 }),
    db.collection('provider_registry').createIndex(
      { category: 1, providerKey: 1 },
      { unique: true },
    ),
  ]);

  added('All indexes ensured');
}

// ---------------------------------------------------------------------------
// 2. Migration: orgs with string plan → planId
// ---------------------------------------------------------------------------

async function migrateOrgPlans(db: Db) {
  log('Migrate orgs from plan string to planId...');

  const orgsWithOldPlan = await db
    .collection('organizations')
    .find({ plan: { $exists: true, $type: 'string' } })
    .toArray();

  if (orgsWithOldPlan.length === 0) {
    skipped('No orgs with legacy plan string');
    return;
  }

  const plans = await db.collection<Plan>('plans').find().toArray();
  const slugToId = new Map<string, ObjectId>();
  for (const p of plans) {
    if (p._id) slugToId.set(p.slug, p._id);
  }

  const freePlanId = slugToId.get('free');
  if (!freePlanId) {
    console.error('[seed] ERROR: No "free" plan found. Run seed-plans first.');
    return;
  }

  for (const org of orgsWithOldPlan) {
    const oldPlanSlug = (org as unknown as { plan: string }).plan;
    const planId = slugToId.get(oldPlanSlug) ?? freePlanId;

    await db.collection('organizations').updateOne(
      { _id: org._id },
      {
        $set: { planId, updatedAt: new Date() },
        $unset: { plan: '', limits: '' },
      },
    );
    added(`Org "${org.name}": plan "${oldPlanSlug}" → planId ${planId.toHexString()}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Backfill orgs missing new fields
// ---------------------------------------------------------------------------

async function backfillOrganizations(db: Db) {
  log('Organization backfill...');

  const noStatus = await db
    .collection('organizations')
    .updateMany(
      { status: { $exists: false } },
      { $set: { status: 'active' } },
    );
  if (noStatus.modifiedCount > 0) {
    added(`Added status='active' to ${noStatus.modifiedCount} orgs missing it`);
  } else {
    skipped('All orgs already have status');
  }

  const noEmail = await db
    .collection('organizations')
    .updateMany(
      { ownerEmail: { $exists: false } },
      { $set: { ownerEmail: '' } },
    );
  if (noEmail.modifiedCount > 0) {
    added(`Added ownerEmail to ${noEmail.modifiedCount} orgs missing it`);
  } else {
    skipped('All orgs already have ownerEmail');
  }
}

// ---------------------------------------------------------------------------
// 4. Migrate agents from inline config to provider FK references
// ---------------------------------------------------------------------------

async function migrateAgents(db: Db) {
  log('Migrate agents from inline config to provider FKs...');

  const legacyAgents = await db.collection('agents').find({
    llmProviderId: { $exists: false },
    'llm.provider': { $exists: true },
  }).toArray();

  if (legacyAgents.length === 0) {
    skipped('No legacy agents to migrate');
    return;
  }

  const globalProviders = await db.collection<Provider>('providers').find({ orgId: null }).toArray();
  const providerLookup = new Map<string, ObjectId>();
  for (const p of globalProviders) {
    const key = `${p.category}/${p.providerKey}`;
    if (p._id) providerLookup.set(key, p._id);
  }

  const defaultSttId = providerLookup.get('stt/deepgram');
  if (!defaultSttId) {
    console.error('[seed] ERROR: No global STT provider found. Run seed-global-providers first.');
    return;
  }

  for (const agent of legacyAgents) {
    const llm = agent.llm as { provider: string; model: string; temperature?: number; maxTokens?: number; configId?: string };
    const voice = agent.voice as { provider: string; voiceId: string; speed?: number; configId?: string };
    const stt = agent.stt as { configId?: string } | undefined;

    let llmProvId: ObjectId | undefined;
    let ttsProvId: ObjectId | undefined;
    let sttProvId: ObjectId | undefined;

    if (llm.configId) {
      try { llmProvId = new ObjectId(llm.configId); } catch { /* fallback below */ }
    }
    if (!llmProvId) {
      llmProvId = providerLookup.get(`llm/${llm.provider}`);
    }

    if (voice.configId) {
      try { ttsProvId = new ObjectId(voice.configId); } catch { /* fallback below */ }
    }
    if (!ttsProvId) {
      ttsProvId = providerLookup.get(`tts/${voice.provider}`);
    }

    if (stt?.configId) {
      try { sttProvId = new ObjectId(stt.configId); } catch { /* fallback */ }
    }
    if (!sttProvId) sttProvId = defaultSttId;

    if (!llmProvId || !ttsProvId || !sttProvId) {
      console.warn(`[seed] Could not resolve all providers for agent "${agent.name}", skipping`);
      continue;
    }

    await db.collection('agents').updateOne(
      { _id: agent._id },
      {
        $set: {
          llmProviderId: llmProvId,
          llmModelId: llm.model,
          llmConfig: { temperature: llm.temperature ?? 0.4, maxTokens: llm.maxTokens ?? 200 },
          ttsProviderId: ttsProvId,
          ttsModelId: voice.voiceId,
          ttsConfig: { speed: voice.speed ?? 1.0 },
          sttProviderId: sttProvId,
          updatedAt: new Date(),
        },
        $unset: { llm: '', voice: '', stt: '' },
      },
    );
    added(`Agent "${agent.name}": migrated to provider FKs`);
  }
}

// ---------------------------------------------------------------------------
// 5. Migrate client_providers to unified providers collection
// ---------------------------------------------------------------------------

async function migrateClientProviders(db: Db) {
  log('Migrate client_providers to unified providers collection...');

  const collections = await db.listCollections({ name: 'client_providers' }).toArray();
  if (collections.length === 0) {
    skipped('No client_providers collection');
    return;
  }

  const oldDocs = await db.collection('client_providers').find().toArray();
  if (oldDocs.length === 0) {
    skipped('No client_providers to migrate');
    return;
  }

  let migrated = 0;
  for (const doc of oldDocs) {
    const existing = await db.collection('providers').findOne({
      orgId: doc.orgId,
      category: doc.category,
      providerKey: doc.providerKey,
      name: doc.name,
    });
    if (existing) continue;

    const models = Array.isArray(doc.models)
      ? doc.models.map((m: string | { modelId: string; label: string; description: string }) =>
          typeof m === 'string' ? { modelId: m, label: m, description: '' } : m,
        )
      : [];

    await db.collection('providers').insertOne({
      orgId: doc.orgId,
      category: doc.category,
      providerKey: doc.providerKey,
      name: doc.name,
      credentials: doc.credentials,
      models,
      settings: doc.settings ?? {},
      active: doc.active ?? true,
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    });
    migrated++;
  }

  if (migrated > 0) added(`Migrated ${migrated} client providers`);
  else skipped('All client providers already migrated');
}

// ---------------------------------------------------------------------------
// 6. Dummy test org
// ---------------------------------------------------------------------------

async function seedTestOrg(db: Db): Promise<string | null> {
  log('Test org...');

  const existingUser = await db.collection<User>('users').findOne({ email: TEST_USER_EMAIL });
  if (existingUser) {
    skipped(`User ${TEST_USER_EMAIL} already exists`);
    return null;
  }

  const proPlan = await db.collection<Plan>('plans').findOne({ slug: 'pro' });
  if (!proPlan?._id) {
    console.error('[seed] ERROR: No "pro" plan found. Run seed-plans first.');
    return null;
  }

  const globalLLM = await db.collection<Provider>('providers').findOne({ orgId: null, category: 'llm', providerKey: 'ollama' });
  const globalTTS = await db.collection<Provider>('providers').findOne({ orgId: null, category: 'tts', providerKey: 'edge' });
  const globalSTT = await db.collection<Provider>('providers').findOne({ orgId: null, category: 'stt', providerKey: 'deepgram' });

  if (!globalLLM?._id || !globalTTS?._id || !globalSTT?._id) {
    console.error('[seed] ERROR: Global providers not found. Run seed-global-providers first.');
    return null;
  }

  const now = new Date();
  const org: Organization = {
    name: TEST_ORG_NAME,
    planId: proPlan._id,
    status: 'active',
    ownerEmail: TEST_USER_EMAIL,
    createdAt: now,
    updatedAt: now,
  };
  const orgResult = await db.collection<Organization>('organizations').insertOne(org);
  const orgId = orgResult.insertedId;
  added(`Org: ${TEST_ORG_NAME} (plan: pro)`);

  const user: User = {
    orgId,
    email: TEST_USER_EMAIL,
    passwordHash: hashPassword(TEST_USER_PASSWORD),
    name: TEST_USER_NAME,
    role: 'admin',
    createdAt: now,
  };
  await db.collection<User>('users').insertOne(user);
  added(`User: ${TEST_USER_EMAIL}`);

  const rawKey = `vx_${randomBytes(24).toString('hex')}`;
  const apiKey: ApiKeyDoc = {
    orgId,
    keyHash: hashApiKey(rawKey),
    keyPrefix: rawKey.slice(0, 10),
    name: 'Test Key',
    scopes: ['voice'],
    lastUsedAt: null,
    createdAt: now,
    revokedAt: null,
  };
  await db.collection<ApiKeyDoc>('api_keys').insertOne(apiKey);
  added(`API Key: ${rawKey.slice(0, 10)}...`);

  const agent: Agent = {
    orgId,
    name: 'Test Agent',
    persona: DEFAULT_AGENT_PERSONA,
    llmProviderId: globalLLM._id,
    llmModelId: 'llama3.2:3b',
    llmConfig: DEFAULT_LLM_CONFIG,
    ttsProviderId: globalTTS._id,
    ttsModelId: 'en-US-AriaNeural',
    ttsConfig: DEFAULT_TTS_CONFIG,
    sttProviderId: globalSTT._id,
    thresholds: DEFAULT_AGENT_THRESHOLDS,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection<Agent>('agents').insertOne(agent);
  added('Agent: Test Agent');

  return rawKey;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  VoiceX — Seed Script (add-only)');
  console.log('═══════════════════════════════════════════');
  console.log(`  DB: ${MONGODB_URI.replace(/\/\/[^@]+@/, '//***@')}`);
  console.log('');

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();

    await ensureIndexes(db);
    await migrateOrgPlans(db);
    await backfillOrganizations(db);
    await migrateAgents(db);
    await migrateClientProviders(db);
    const apiKey = await seedTestOrg(db);

    console.log('');
    log('Done. No existing data was modified.');

    if (apiKey) {
      console.log('');
      console.log('───────────────────────────────────────────');
      console.log('  Test credentials (save these):');
      console.log('───────────────────────────────────────────');
      console.log(`  Email:    ${TEST_USER_EMAIL}`);
      console.log(`  Password: ${TEST_USER_PASSWORD}`);
      console.log(`  API Key:  ${apiKey}`);
      console.log(`  Org:      ${TEST_ORG_NAME} (pro plan)`);
      console.log('───────────────────────────────────────────');
    }

    console.log('');
  } catch (err) {
    console.error('[seed] FATAL:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
