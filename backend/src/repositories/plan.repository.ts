import { ObjectId, type Db } from 'mongodb';
import type { Plan, PlanLimits, PlanFeatures } from '../db/schema.js';

const COL = 'plans';

// ---------------------------------------------------------------------------
// Redis + L1 cache
// ---------------------------------------------------------------------------

interface CachedPlan extends Plan {
  modelSets: { llm: Set<string>; tts: Set<string>; stt: Set<string> };
}

let redisClient: {
  get: (k: string) => Promise<string | null>;
  set: (k: string, v: string, opt: string, ttl: number) => Promise<unknown>;
  del: (k: string) => Promise<unknown>;
} | null = null;

const REDIS_PREFIX = 'plan:';
const REDIS_TTL = 600; // 10 min
const L1_TTL = 60_000; // 1 min
const l1 = new Map<string, { plan: CachedPlan; expiresAt: number }>();

export async function initPlanCacheRedis(url: string): Promise<void> {
  const { createClient } = await import('redis');
  const client = createClient({ url }) as unknown as typeof redisClient & {
    on: (e: string, cb: (err: Error) => void) => void;
    connect: () => Promise<void>;
  };
  client!.on('error', (err: Error) => console.error('Redis plan cache error:', err));
  await client!.connect();
  redisClient = client;
}

function hydrate(doc: Plan): CachedPlan {
  return {
    ...doc,
    modelSets: {
      llm: new Set(doc.models.llm),
      tts: new Set(doc.models.tts),
      stt: new Set(doc.models.stt),
    },
  };
}

export async function getPlanCached(db: Db, planId: ObjectId): Promise<CachedPlan | null> {
  const key = planId.toHexString();

  const l1Hit = l1.get(key);
  if (l1Hit && l1Hit.expiresAt > Date.now()) return l1Hit.plan;

  if (redisClient) {
    try {
      const raw = await redisClient.get(REDIS_PREFIX + key);
      if (raw) {
        const parsed = JSON.parse(raw) as Plan;
        const plan = hydrate(parsed);
        l1.set(key, { plan, expiresAt: Date.now() + L1_TTL });
        return plan;
      }
    } catch { /* fall through to DB */ }
  }

  const doc = await db.collection<Plan>(COL).findOne({ _id: planId });
  if (!doc) return null;

  const plan = hydrate(doc);
  if (redisClient) {
    try { await redisClient.set(REDIS_PREFIX + key, JSON.stringify(doc), 'EX', REDIS_TTL); }
    catch { /* non-critical */ }
  }
  l1.set(key, { plan, expiresAt: Date.now() + L1_TTL });
  return plan;
}

export function invalidatePlanCache(planId: ObjectId): void {
  const key = planId.toHexString();
  l1.delete(key);
  if (redisClient) {
    redisClient.del(REDIS_PREFIX + key).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// O(1) access checks
// ---------------------------------------------------------------------------

export function isModelAllowed(
  plan: CachedPlan,
  type: 'llm' | 'tts' | 'stt',
  provider: string,
  id: string,
): boolean {
  return plan.modelSets[type].has(`${provider}/${id}`);
}

export function getPlanLimits(plan: CachedPlan): PlanLimits {
  return plan.limits;
}

export function getPlanFeatures(plan: CachedPlan): PlanFeatures {
  return plan.features ?? { customProviders: false, maxCustomProviders: 0 };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function getPlanBySlug(db: Db, slug: string): Promise<Plan | null> {
  return db.collection<Plan>(COL).findOne({ slug });
}

export async function getPlanById(db: Db, planId: ObjectId): Promise<Plan | null> {
  return db.collection<Plan>(COL).findOne({ _id: planId });
}

export async function listPublicPlans(db: Db): Promise<Plan[]> {
  return db
    .collection<Plan>(COL)
    .find({ public: true, custom: false })
    .sort({ 'pricing.monthly': 1 })
    .project<Plan>({
      slug: 1, name: 1, description: 1, pricing: 1, limits: 1,
      models: 1, public: 1, custom: 1,
    })
    .toArray();
}

export async function listAllPlans(db: Db): Promise<Plan[]> {
  return db.collection<Plan>(COL).find().sort({ 'pricing.monthly': 1 }).toArray();
}

export async function createPlan(db: Db, plan: Omit<Plan, '_id' | 'createdAt' | 'updatedAt'>): Promise<Plan> {
  const now = new Date();
  const doc: Plan = { ...plan, createdAt: now, updatedAt: now };
  const result = await db.collection<Plan>(COL).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updatePlan(
  db: Db,
  planId: ObjectId,
  update: Partial<Pick<Plan, 'name' | 'description' | 'pricing' | 'limits' | 'models' | 'public'>>,
): Promise<boolean> {
  const result = await db.collection<Plan>(COL).updateOne(
    { _id: planId },
    { $set: { ...update, updatedAt: new Date() } },
  );
  if (result.matchedCount > 0) invalidatePlanCache(planId);
  return result.matchedCount > 0;
}
