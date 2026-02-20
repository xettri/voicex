import { Router, type Request, type Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db/client.js';
import {
  getOrganization,
  updateOrganization,
} from '../repositories/organization.repository.js';
import {
  createAgent,
  listAgents,
  getAgentForOrg,
  updateAgent,
  deleteAgent,
  countAgents,
} from '../repositories/agent.repository.js';
import {
  listCalls,
  getCall,
  countCalls,
  getUsage,
  getOrgStats,
} from '../repositories/call.repository.js';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  resolveApiKey,
} from '../repositories/apikey.repository.js';
import { verifyUserToken } from '../services/auth.service.js';
import {
  getPlanCached,
  isModelAllowed,
  listPublicPlans,
  listAllPlans,
} from '../repositories/plan.repository.js';
import {
  listRegistry,
  listProviders,
  listClientProviders,
  getProviderSafe,
  createProvider,
  updateProvider,
  deleteProvider,
  findAgentsUsingProvider,
  searchModels,
  batchGetProviders,
  computeAgentStatus,
} from '../repositories/provider.repository.js';
import type { ProviderCategory, Plan, Agent } from '../db/schema.js';

function oid(id: string): ObjectId | null {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

interface DashboardReq extends Request {
  orgId: ObjectId;
  plan: Plan & { modelSets: { llm: Set<string>; tts: Set<string>; stt: Set<string> } };
  orgLimits: Plan['limits'];
}

async function authMiddleware(req: Request, res: Response, next: () => void): Promise<void> {
  const r = req as unknown as DashboardReq;

  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7);
    const jwtSecret = process.env.JWT_SECRET ?? 'voicex-secret-change-in-production';
    try {
      const payload = await verifyUserToken(token, jwtSecret);
      if (payload?.orgId) {
        const orgId = oid(payload.orgId);
        if (orgId) {
          const db = await getDb();
          const org = await getOrganization(db, orgId);
          if (!org) {
            res.status(401).json({ error: 'Organization not found' });
            return;
          }
          if (org.status === 'pending') {
            res.status(403).json({ status: 'pending', error: 'Your account is pending verification.' });
            return;
          }
          const plan = await getPlanCached(db, org.planId);
          if (!plan) {
            res.status(500).json({ error: 'Plan configuration not found' });
            return;
          }
          r.orgId = orgId;
          r.plan = plan;
          r.orgLimits = plan.limits;
          next();
          return;
        }
      }
    } catch { /* fall through */ }
  }

  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (apiKey) {
    try {
      const db = await getDb();
      const resolved = await resolveApiKey(db, apiKey);
      if (resolved) {
        const org = await getOrganization(db, resolved.orgId);
        if (org) {
          const plan = await getPlanCached(db, org.planId);
          if (plan) {
            r.orgId = resolved.orgId;
            r.plan = plan;
            r.orgLimits = plan.limits;
            next();
            return;
          }
        }
      }
    } catch { /* fall through */ }
  }

  res.status(401).json({ error: 'Authentication required. Provide a valid Bearer token or x-api-key.' });
}

function getReq(req: Request): DashboardReq {
  return req as unknown as DashboardReq;
}

function enrichAgentsWithStatus(
  agents: Agent[],
  providerMap: Map<string, import('../db/schema.js').Provider>,
  planModelSets: { llm: Set<string>; tts: Set<string>; stt: Set<string> },
) {
  return agents.map((agent) => {
    const { status, pauseReason } = computeAgentStatus(agent, providerMap, planModelSets);
    return { ...agent, status, pauseReason };
  });
}

export function createDashboardRouter(): Router {
  const r = Router();
  r.use(authMiddleware);

  // --- Organization ---
  r.get('/organization', async (req: Request, res: Response) => {
    try {
      const { orgId, plan } = getReq(req);
      const db = await getDb();
      const org = await getOrganization(db, orgId);
      if (!org) { res.status(404).json({ error: 'not found' }); return; }
      res.json({ ...org, planSlug: plan.slug, planName: plan.name, limits: plan.limits });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  r.patch('/organization', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const { name } = req.body as { name?: string };
      await updateOrganization(db, getReq(req).orgId, { name });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  r.get('/stats', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const { orgId } = getReq(req);
      const [stats, agentCount] = await Promise.all([
        getOrgStats(db, orgId),
        countAgents(db, orgId),
      ]);
      res.json({ ...stats, agentCount });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  // --- Plan (with model keys + features) ---
  r.get('/plan', async (req: Request, res: Response) => {
    const { plan } = getReq(req);
    res.json({
      slug: plan.slug,
      name: plan.name,
      description: plan.description,
      limits: plan.limits,
      pricing: plan.pricing,
      models: plan.models,
      features: plan.features ?? { customProviders: false, maxCustomProviders: 0 },
    });
  });

  // --- Paginated model search ---
  r.get('/models/search', async (req: Request, res: Response) => {
    try {
      const { orgId, plan } = getReq(req);
      const db = await getDb();
      const category = (req.query.category as ProviderCategory) ?? 'llm';
      const q = (req.query.q as string) ?? '';
      const skip = parseInt(req.query.skip as string) || 0;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
      if (!['llm', 'tts', 'stt'].includes(category)) {
        res.status(400).json({ error: 'category must be llm, tts, or stt' });
        return;
      }
      const allPlans = await listAllPlans(db);
      const result = await searchModels(db, orgId, plan, allPlans, category, q, skip, limit);
      res.json(result);
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  // --- Agents ---
  r.get('/agents', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const { orgId, plan } = getReq(req);
      const skip = parseInt(req.query.skip as string) || 0;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const agents = await listAgents(db, orgId, skip, limit);

      const providerIds = agents.flatMap((a) => [a.llmProviderId, a.ttsProviderId, a.sttProviderId]);
      const providerMap = await batchGetProviders(db, providerIds);

      res.json(enrichAgentsWithStatus(agents, providerMap, plan.modelSets));
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  r.post('/agents', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const { orgId, plan } = getReq(req);
      const count = await countAgents(db, orgId);
      if (count >= plan.limits.maxAgents) {
        res.status(403).json({ error: `Agent limit reached (${plan.limits.maxAgents})` });
        return;
      }
      const body = req.body as Record<string, unknown>;
      const { name, llmProviderId, llmModelId, llmConfig, ttsProviderId, ttsModelId, ttsConfig, sttProviderId, persona, thresholds } = body as {
        name?: string; llmProviderId?: string; llmModelId?: string; llmConfig?: Record<string, unknown>;
        ttsProviderId?: string; ttsModelId?: string; ttsConfig?: Record<string, unknown>;
        sttProviderId?: string; persona?: Record<string, unknown>; thresholds?: Record<string, unknown>;
      };

      if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }
      if (!llmProviderId || !llmModelId) { res.status(400).json({ error: 'llmProviderId and llmModelId are required' }); return; }
      if (!ttsProviderId || !ttsModelId) { res.status(400).json({ error: 'ttsProviderId and ttsModelId are required' }); return; }
      if (!sttProviderId) { res.status(400).json({ error: 'sttProviderId is required' }); return; }

      const llmPid = oid(llmProviderId);
      const ttsPid = oid(ttsProviderId);
      const sttPid = oid(sttProviderId);
      if (!llmPid || !ttsPid || !sttPid) { res.status(400).json({ error: 'Invalid provider ID(s)' }); return; }

      const providerMap = await batchGetProviders(db, [llmPid, ttsPid, sttPid]);
      const llmProv = providerMap.get(llmPid.toHexString());
      const ttsProv = providerMap.get(ttsPid.toHexString());
      const sttProv = providerMap.get(sttPid.toHexString());

      if (!llmProv) { res.status(400).json({ error: 'LLM provider not found' }); return; }
      if (!ttsProv) { res.status(400).json({ error: 'TTS provider not found' }); return; }
      if (!sttProv) { res.status(400).json({ error: 'STT provider not found' }); return; }

      if (llmProv.orgId === null && !isModelAllowed(plan, 'llm', llmProv.providerKey, llmModelId)) {
        res.status(403).json({ error: `LLM "${llmProv.providerKey}/${llmModelId}" is not available on your plan.` });
        return;
      }
      if (ttsProv.orgId === null && !isModelAllowed(plan, 'tts', ttsProv.providerKey, ttsModelId)) {
        res.status(403).json({ error: `Voice "${ttsProv.providerKey}/${ttsModelId}" is not available on your plan.` });
        return;
      }

      const agent = await createAgent(db, {
        orgId,
        name: name.trim(),
        llmProviderId: llmPid,
        llmModelId,
        llmConfig: llmConfig as unknown as Agent['llmConfig'] | undefined,
        ttsProviderId: ttsPid,
        ttsModelId,
        ttsConfig: ttsConfig as unknown as Agent['ttsConfig'] | undefined,
        sttProviderId: sttPid,
        persona: persona as Partial<Agent['persona']> | undefined,
        thresholds: thresholds as Partial<Agent['thresholds']> | undefined,
      });

      const { status, pauseReason } = computeAgentStatus(agent, providerMap, plan.modelSets);
      res.status(201).json({ ...agent, status, pauseReason });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  r.get('/agents/:id', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const { orgId, plan } = getReq(req);
      const id = oid(req.params.id);
      if (!id) { res.status(400).json({ error: 'invalid id' }); return; }
      const agent = await getAgentForOrg(db, orgId, id);
      if (!agent) { res.status(404).json({ error: 'not found' }); return; }

      const providerMap = await batchGetProviders(db, [agent.llmProviderId, agent.ttsProviderId, agent.sttProviderId]);
      const { status, pauseReason } = computeAgentStatus(agent, providerMap, plan.modelSets);
      res.json({ ...agent, status, pauseReason });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  r.patch('/agents/:id', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const { orgId, plan } = getReq(req);
      const id = oid(req.params.id);
      if (!id) { res.status(400).json({ error: 'invalid id' }); return; }

      const body = req.body as Record<string, unknown>;
      const update: Record<string, unknown> = {};

      if (body.name !== undefined) update.name = body.name;
      if (body.persona !== undefined) update.persona = body.persona;
      if (body.thresholds !== undefined) update.thresholds = body.thresholds;
      if (body.active !== undefined) update.active = body.active;
      if (body.llmConfig !== undefined) update.llmConfig = body.llmConfig;
      if (body.ttsConfig !== undefined) update.ttsConfig = body.ttsConfig;

      if (body.llmProviderId !== undefined) {
        const pid = oid(body.llmProviderId as string);
        if (!pid) { res.status(400).json({ error: 'Invalid llmProviderId' }); return; }
        const provMap = await batchGetProviders(db, [pid]);
        const prov = provMap.get(pid.toHexString());
        if (!prov) { res.status(400).json({ error: 'LLM provider not found' }); return; }
        const modelId = (body.llmModelId as string) ?? '';
        if (prov.orgId === null && !isModelAllowed(plan, 'llm', prov.providerKey, modelId)) {
          res.status(403).json({ error: `LLM "${prov.providerKey}/${modelId}" is not available on your plan.` });
          return;
        }
        update.llmProviderId = pid;
        update.llmModelId = modelId;
      }

      if (body.ttsProviderId !== undefined) {
        const pid = oid(body.ttsProviderId as string);
        if (!pid) { res.status(400).json({ error: 'Invalid ttsProviderId' }); return; }
        const provMap = await batchGetProviders(db, [pid]);
        const prov = provMap.get(pid.toHexString());
        if (!prov) { res.status(400).json({ error: 'TTS provider not found' }); return; }
        const modelId = (body.ttsModelId as string) ?? '';
        if (prov.orgId === null && !isModelAllowed(plan, 'tts', prov.providerKey, modelId)) {
          res.status(403).json({ error: `Voice "${prov.providerKey}/${modelId}" is not available on your plan.` });
          return;
        }
        update.ttsProviderId = pid;
        update.ttsModelId = modelId;
      }

      if (body.sttProviderId !== undefined) {
        const pid = oid(body.sttProviderId as string);
        if (!pid) { res.status(400).json({ error: 'Invalid sttProviderId' }); return; }
        update.sttProviderId = pid;
      }

      const ok = await updateAgent(db, orgId, id, update);
      if (!ok) { res.status(404).json({ error: 'not found' }); return; }

      const updated = await getAgentForOrg(db, orgId, id);
      if (updated) {
        const providerMap = await batchGetProviders(db, [updated.llmProviderId, updated.ttsProviderId, updated.sttProviderId]);
        const st = computeAgentStatus(updated, providerMap, plan.modelSets);
        res.json({ ...updated, status: st.status, pauseReason: st.pauseReason });
      } else {
        res.json({ ok: true });
      }
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  r.delete('/agents/:id', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const id = oid(req.params.id);
      if (!id) { res.status(400).json({ error: 'invalid id' }); return; }
      await deleteAgent(db, getReq(req).orgId, id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  // --- Calls ---
  r.get('/calls', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const agentId = req.query.agent_id
        ? (oid(req.query.agent_id as string) ?? undefined)
        : undefined;
      const status = req.query.status as string | undefined;
      const skip = parseInt(req.query.skip as string) || 0;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const calls = await listCalls(db, getReq(req).orgId, {
        agentId: agentId ?? undefined,
        status: status as 'active' | 'completed' | undefined,
        skip,
        limit,
      });
      res.json(calls);
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  r.get('/calls/count', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const count = await countCalls(db, getReq(req).orgId);
      res.json({ count });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  r.get('/calls/:id', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const id = oid(req.params.id);
      if (!id) { res.status(400).json({ error: 'invalid id' }); return; }
      const call = await getCall(db, getReq(req).orgId, id);
      if (!call) { res.status(404).json({ error: 'not found' }); return; }
      res.json(call);
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  // --- Analytics ---
  r.get('/analytics/usage', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const days = Math.min(parseInt(req.query.days as string) || 30, 90);
      const usage = await getUsage(db, getReq(req).orgId, days);
      res.json(usage);
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  // --- API Keys ---
  r.get('/api-keys', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const keys = await listApiKeys(db, getReq(req).orgId);
      res.json(keys.map((k) => ({ ...k, keyHash: undefined })));
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  r.post('/api-keys', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const { name, scopes } = req.body as { name?: string; scopes?: string[] };
      if (!name) { res.status(400).json({ error: 'name required' }); return; }
      const { doc, rawKey } = await createApiKey(db, getReq(req).orgId, name, scopes);
      res.status(201).json({ ...doc, keyHash: undefined, key: rawKey });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  r.delete('/api-keys/:id', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const id = oid(req.params.id);
      if (!id) { res.status(400).json({ error: 'invalid id' }); return; }
      await revokeApiKey(db, getReq(req).orgId, id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  // --- Provider Registry ---
  r.get('/providers/registry', async (_req: Request, res: Response) => {
    try {
      const db = await getDb();
      const registry = await listRegistry(db);
      res.json(registry);
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  // --- Providers (unified) ---
  r.get('/providers', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const category = req.query.category as ProviderCategory | undefined;
      const clientOnly = req.query.client === 'true';
      const providers = clientOnly
        ? await listClientProviders(db, getReq(req).orgId, category)
        : await listProviders(db, getReq(req).orgId, category);
      res.json(providers);
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  r.get('/providers/:id', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const id = oid(req.params.id);
      if (!id) { res.status(400).json({ error: 'invalid id' }); return; }
      const provider = await getProviderSafe(db, getReq(req).orgId, id);
      if (!provider) { res.status(404).json({ error: 'not found' }); return; }
      res.json(provider);
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  r.post('/providers', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const { orgId, plan } = getReq(req);
      const features = plan.features ?? { customProviders: false, maxCustomProviders: 0 };
      if (!features.customProviders) {
        res.status(403).json({ error: 'Your plan does not support custom providers. Upgrade to add your own API keys.' });
        return;
      }

      const existingCount = (await listClientProviders(db, orgId)).length;
      if (existingCount >= features.maxCustomProviders) {
        res.status(403).json({ error: `Custom provider limit reached (${features.maxCustomProviders}). Upgrade your plan for more.` });
        return;
      }

      const { category, providerKey, name, credentials, models, settings } = req.body as {
        category?: ProviderCategory; providerKey?: string; name?: string;
        credentials?: Record<string, string>; models?: Array<{ modelId: string; label: string; description: string }>;
        settings?: Record<string, unknown>;
      };
      if (!category || !providerKey || !name) {
        res.status(400).json({ error: 'category, providerKey, and name are required' });
        return;
      }
      // Validate required credential fields against the registry entry
      const registryEntry = await db.collection('provider_registry').findOne({ category, providerKey });
      if (registryEntry?.settings?.length) {
        const missing = (registryEntry.settings as Array<{ key: string; required: boolean; label: string }>)
          .filter((s) => s.required && !credentials?.[s.key]?.trim());
        if (missing.length > 0) {
          res.status(400).json({ error: `Missing required fields: ${missing.map((s) => s.label).join(', ')}` });
          return;
        }
      }
      const doc = await createProvider(db, {
        orgId, category, providerKey, name, credentials: credentials ?? {}, models: models ?? [], settings,
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { credentials: _c, ...safe } = doc;
      res.status(201).json(safe);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('duplicate key')) {
        res.status(409).json({ error: 'A provider with this name already exists for your organization.' });
        return;
      }
      res.status(500).json({ error: String(err) });
    }
  });

  r.patch('/providers/:id', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const id = oid(req.params.id);
      if (!id) { res.status(400).json({ error: 'invalid id' }); return; }
      const { name, credentials, models, settings, active } = req.body as {
        name?: string; credentials?: Record<string, string>;
        models?: Array<{ modelId: string; label: string; description: string }>;
        settings?: Record<string, unknown>; active?: boolean;
      };
      const ok = await updateProvider(db, getReq(req).orgId, id, { name, credentials, models, settings, active });
      if (!ok) { res.status(404).json({ error: 'not found' }); return; }
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  r.delete('/providers/:id', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const orgId = getReq(req).orgId;
      const id = oid(req.params.id);
      if (!id) { res.status(400).json({ error: 'invalid id' }); return; }
      const agents = await findAgentsUsingProvider(db, orgId, id);
      if (agents.length > 0) {
        const names = agents.map((a) => a.name).join(', ');
        res.status(409).json({
          error: `Cannot delete: provider is used by agent(s): ${names}. Update those agents first.`,
          agents: agents.map((a) => ({ id: a._id.toHexString(), name: a.name })),
        });
        return;
      }
      const ok = await deleteProvider(db, orgId, id);
      if (!ok) { res.status(404).json({ error: 'not found' }); return; }
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  return r;
}

// --- Public plans endpoint (no auth) ---
export function createPlansRouter(): Router {
  const r = Router();

  r.get('/', async (_req: Request, res: Response) => {
    try {
      const db = await getDb();
      const plans = await listPublicPlans(db);
      res.json(plans.map(({ _id, slug, name, description, pricing, limits }) => ({
        slug, name, description, pricing, limits,
      })));
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  return r;
}
