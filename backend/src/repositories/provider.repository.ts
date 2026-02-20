import { ObjectId, type Db } from 'mongodb';
import type { Provider, ProviderCategory, ProviderModel, ProviderRegistry, Plan } from '../db/schema.js';
import { encrypt, decrypt } from '../shared/encryption.js';

const COL = 'providers';

// ---------------------------------------------------------------------------
// Registry (read-only template catalog)
// ---------------------------------------------------------------------------

export async function listRegistry(db: Db): Promise<ProviderRegistry[]> {
  return db.collection<ProviderRegistry>('provider_registry').find().toArray();
}

// ---------------------------------------------------------------------------
// Provider queries
// ---------------------------------------------------------------------------

export async function listProviders(
  db: Db,
  orgId: ObjectId,
  category?: ProviderCategory,
): Promise<Omit<Provider, 'credentials'>[]> {
  const filter: Record<string, unknown> = {
    $or: [{ orgId: null }, { orgId }],
  };
  if (category) filter.category = category;
  const docs = await db
    .collection<Provider>(COL)
    .find(filter)
    .sort({ orgId: 1, createdAt: -1 })
    .toArray();
  return docs.map(({ credentials: _, ...rest }) => rest);
}

export async function listClientProviders(
  db: Db,
  orgId: ObjectId,
  category?: ProviderCategory,
): Promise<Omit<Provider, 'credentials'>[]> {
  const filter: Record<string, unknown> = { orgId };
  if (category) filter.category = category;
  const docs = await db.collection<Provider>(COL).find(filter).sort({ createdAt: -1 }).toArray();
  return docs.map(({ credentials: _, ...rest }) => rest);
}

export async function getProvider(db: Db, id: ObjectId): Promise<Provider | null> {
  return db.collection<Provider>(COL).findOne({ _id: id });
}

export async function getProviderSafe(
  db: Db,
  orgId: ObjectId,
  id: ObjectId,
): Promise<Omit<Provider, 'credentials'> | null> {
  const doc = await db.collection<Provider>(COL).findOne({
    _id: id,
    $or: [{ orgId: null }, { orgId }],
  });
  if (!doc) return null;
  const { credentials: _, ...safe } = doc;
  return safe;
}

export async function getProviderDecrypted(
  db: Db,
  providerId: ObjectId,
): Promise<{ provider: Provider; decryptedCredentials: Record<string, string> } | null> {
  const doc = await db.collection<Provider>(COL).findOne({ _id: providerId, active: true });
  if (!doc) return null;
  let decryptedCredentials: Record<string, string> = {};
  try {
    decryptedCredentials = JSON.parse(decrypt(doc.credentials));
  } catch {
    decryptedCredentials = {};
  }
  return { provider: doc, decryptedCredentials };
}

export async function batchGetProviders(
  db: Db,
  ids: ObjectId[],
): Promise<Map<string, Provider>> {
  if (ids.length === 0) return new Map();
  const unique = [...new Set(ids.map((id) => id.toHexString()))].map((h) => new ObjectId(h));
  const docs = await db
    .collection<Provider>(COL)
    .find({ _id: { $in: unique } }, { projection: { credentials: 0 } })
    .toArray();
  const map = new Map<string, Provider>();
  for (const d of docs) map.set(d._id!.toHexString(), d);
  return map;
}

// ---------------------------------------------------------------------------
// Create / Update / Delete (client providers only)
// ---------------------------------------------------------------------------

export interface CreateProviderInput {
  orgId: ObjectId;
  category: ProviderCategory;
  providerKey: string;
  name: string;
  credentials: Record<string, string>;
  models: ProviderModel[];
  settings?: Record<string, unknown>;
}

export async function createProvider(db: Db, input: CreateProviderInput): Promise<Provider> {
  const now = new Date();
  const doc: Provider = {
    orgId: input.orgId,
    category: input.category,
    providerKey: input.providerKey,
    name: input.name.trim(),
    credentials: encrypt(JSON.stringify(input.credentials)),
    models: input.models,
    settings: input.settings ?? {},
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection<Provider>(COL).insertOne(doc);
  doc._id = result.insertedId;
  return doc;
}

export interface UpdateProviderInput {
  name?: string;
  credentials?: Record<string, string>;
  models?: ProviderModel[];
  settings?: Record<string, unknown>;
  active?: boolean;
}

export async function updateProvider(
  db: Db,
  orgId: ObjectId,
  id: ObjectId,
  input: UpdateProviderInput,
): Promise<boolean> {
  const $set: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) $set.name = input.name.trim();
  if (input.credentials !== undefined) $set.credentials = encrypt(JSON.stringify(input.credentials));
  if (input.models !== undefined) $set.models = input.models;
  if (input.settings !== undefined) $set.settings = input.settings;
  if (input.active !== undefined) $set.active = input.active;
  const result = await db.collection<Provider>(COL).updateOne({ _id: id, orgId }, { $set });
  return result.matchedCount > 0;
}

export async function deleteProvider(db: Db, orgId: ObjectId, id: ObjectId): Promise<boolean> {
  const result = await db.collection<Provider>(COL).deleteOne({ _id: id, orgId });
  return result.deletedCount > 0;
}

// ---------------------------------------------------------------------------
// Delete guard
// ---------------------------------------------------------------------------

export async function findAgentsUsingProvider(
  db: Db,
  orgId: ObjectId,
  providerId: ObjectId,
): Promise<{ _id: ObjectId; name: string }[]> {
  return db
    .collection('agents')
    .find(
      {
        orgId,
        $or: [
          { llmProviderId: providerId },
          { ttsProviderId: providerId },
          { sttProviderId: providerId },
        ],
      },
      { projection: { _id: 1, name: 1 } },
    )
    .toArray() as Promise<{ _id: ObjectId; name: string }[]>;
}

// ---------------------------------------------------------------------------
// Paginated model search
// ---------------------------------------------------------------------------

interface ModelSearchItem {
  providerId: string;
  providerKey: string;
  providerName: string;
  modelId: string;
  label: string;
  description: string;
  category: ProviderCategory;
  source: 'platform' | 'custom';
  allowed: boolean;
  requiredPlan?: string;
}

export async function searchModels(
  db: Db,
  orgId: ObjectId,
  plan: Plan & { modelSets: { llm: Set<string>; tts: Set<string>; stt: Set<string> } },
  allPlans: Plan[],
  category: ProviderCategory,
  query: string,
  skip: number,
  limit: number,
): Promise<{ items: ModelSearchItem[]; total: number; hasMore: boolean }> {
  const globalProviders = await db.collection<Provider>(COL)
    .find({ orgId: null, category, active: true }, { projection: { credentials: 0 } })
    .toArray();

  const clientProviders = plan.features.customProviders
    ? await db.collection<Provider>(COL)
        .find({ orgId, category, active: true }, { projection: { credentials: 0 } })
        .toArray()
    : [];

  const plansByPrice = [...allPlans].sort((a, b) => (a.pricing.monthly || 0) - (b.pricing.monthly || 0));

  const q = query.toLowerCase();
  const items: ModelSearchItem[] = [];

  for (const prov of globalProviders) {
    const pid = prov._id!.toHexString();
    for (const m of prov.models) {
      const modelKey = `${prov.providerKey}/${m.modelId}`;
      const allowed = plan.modelSets[category].has(modelKey);

      let requiredPlan: string | undefined;
      if (!allowed) {
        const field = category === 'llm' ? 'models.llm' : category === 'tts' ? 'models.tts' : 'models.stt';
        for (const p of plansByPrice) {
          const models = category === 'llm' ? p.models.llm : category === 'tts' ? p.models.tts : p.models.stt;
          if (models.includes(modelKey)) { requiredPlan = p.slug; break; }
        }
      }

      if (q && !m.label.toLowerCase().includes(q) && !m.modelId.toLowerCase().includes(q) && !prov.providerKey.toLowerCase().includes(q)) continue;

      items.push({
        providerId: pid,
        providerKey: prov.providerKey,
        providerName: prov.name,
        modelId: m.modelId,
        label: m.label,
        description: m.description,
        category,
        source: 'platform',
        allowed,
        requiredPlan,
      });
    }
  }

  for (const prov of clientProviders) {
    const pid = prov._id!.toHexString();
    for (const m of prov.models) {
      if (q && !m.label.toLowerCase().includes(q) && !m.modelId.toLowerCase().includes(q) && !prov.name.toLowerCase().includes(q)) continue;
      items.push({
        providerId: pid,
        providerKey: prov.providerKey,
        providerName: prov.name,
        modelId: m.modelId,
        label: m.label,
        description: m.description,
        category,
        source: 'custom',
        allowed: true,
      });
    }
  }

  items.sort((a, b) => {
    if (a.allowed && !b.allowed) return -1;
    if (!a.allowed && b.allowed) return 1;
    if (a.source === 'custom' && b.source !== 'custom') return -1;
    if (a.source !== 'custom' && b.source === 'custom') return 1;
    return a.label.localeCompare(b.label);
  });

  const total = items.length;
  const paged = items.slice(skip, skip + limit);
  return { items: paged, total, hasMore: skip + limit < total };
}

// ---------------------------------------------------------------------------
// Agent status computation (batch)
// ---------------------------------------------------------------------------

export interface AgentWithStatus {
  status: 'active' | 'inactive' | 'paused_provider' | 'paused_plan';
  pauseReason?: string;
}

export function computeAgentStatus(
  agent: { active: boolean; llmProviderId: ObjectId; llmModelId: string; ttsProviderId: ObjectId; ttsModelId: string; sttProviderId: ObjectId },
  providerMap: Map<string, Provider>,
  planModelSets: { llm: Set<string>; tts: Set<string>; stt: Set<string> },
): AgentWithStatus {
  if (!agent.active) return { status: 'inactive' };

  const llmProv = providerMap.get(agent.llmProviderId.toHexString());
  const ttsProv = providerMap.get(agent.ttsProviderId.toHexString());
  const sttProv = providerMap.get(agent.sttProviderId.toHexString());

  if (llmProv && !llmProv.active) return { status: 'paused_provider', pauseReason: `LLM provider "${llmProv.name}" is disabled` };
  if (ttsProv && !ttsProv.active) return { status: 'paused_provider', pauseReason: `TTS provider "${ttsProv.name}" is disabled` };
  if (sttProv && !sttProv.active) return { status: 'paused_provider', pauseReason: `STT provider "${sttProv.name}" is disabled` };

  if (!llmProv || !ttsProv || !sttProv) return { status: 'paused_provider', pauseReason: 'One or more providers not found' };

  if (llmProv.orgId === null) {
    const key = `${llmProv.providerKey}/${agent.llmModelId}`;
    if (!planModelSets.llm.has(key)) return { status: 'paused_plan', pauseReason: `LLM model "${key}" requires a higher plan` };
  }
  if (ttsProv.orgId === null) {
    const key = `${ttsProv.providerKey}/${agent.ttsModelId}`;
    if (!planModelSets.tts.has(key)) return { status: 'paused_plan', pauseReason: `TTS voice "${key}" requires a higher plan` };
  }

  return { status: 'active' };
}
