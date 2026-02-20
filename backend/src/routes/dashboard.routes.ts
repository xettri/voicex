import { Router, type Request, type Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db/client.js';
import {
  createOrganization,
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

function oid(id: string): ObjectId | null {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

function orgFromReq(req: Request): ObjectId | null {
  const id = req.headers['x-org-id'] as string | undefined;
  return id ? oid(id) : null;
}

async function authMiddleware(req: Request, res: Response, next: () => void): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (apiKey) {
    try {
      const db = await getDb();
      const resolved = await resolveApiKey(db, apiKey);
      if (resolved) {
        (req as unknown as Record<string, unknown>).orgId = resolved.orgId;
        next();
        return;
      }
    } catch {
      /* fall through */
    }
  }
  const orgId = orgFromReq(req);
  if (orgId) {
    (req as unknown as Record<string, unknown>).orgId = orgId;
    next();
    return;
  }
  res.status(401).json({ error: 'Missing x-api-key or x-org-id header' });
}

function getOrgId(req: Request): ObjectId {
  return (req as unknown as Record<string, unknown>).orgId as ObjectId;
}

export function createDashboardRouter(): Router {
  const r = Router();
  r.use(authMiddleware);

  r.post('/organizations', async (_req: Request, res: Response) => {
    try {
      const db = await getDb();
      const { name, plan } = _req.body as { name?: string; plan?: string };
      if (!name) {
        res.status(400).json({ error: 'name required' });
        return;
      }
      const org = await createOrganization(db, name, (plan as 'free') ?? 'free');
      res.json(org);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  r.get('/organization', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const org = await getOrganization(db, getOrgId(req));
      if (!org) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.json(org);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  r.patch('/organization', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      await updateOrganization(db, getOrgId(req), req.body);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  r.get('/stats', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const orgId = getOrgId(req);
      const [stats, agentCount] = await Promise.all([
        getOrgStats(db, orgId),
        countAgents(db, orgId),
      ]);
      res.json({ ...stats, agentCount });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // --- Agents ---
  r.get('/agents', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const skip = parseInt(req.query.skip as string) || 0;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const agents = await listAgents(db, getOrgId(req), skip, limit);
      res.json(agents);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  r.post('/agents', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const orgId = getOrgId(req);
      const org = await getOrganization(db, orgId);
      const count = await countAgents(db, orgId);
      if (org && count >= org.limits.maxAgents) {
        res.status(403).json({ error: `Agent limit reached (${org.limits.maxAgents})` });
        return;
      }
      const agent = await createAgent(db, { orgId, ...req.body });
      res.status(201).json(agent);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  r.get('/agents/:id', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const id = oid(req.params.id);
      if (!id) {
        res.status(400).json({ error: 'invalid id' });
        return;
      }
      const agent = await getAgentForOrg(db, getOrgId(req), id);
      if (!agent) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.json(agent);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  r.patch('/agents/:id', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const id = oid(req.params.id);
      if (!id) {
        res.status(400).json({ error: 'invalid id' });
        return;
      }
      const ok = await updateAgent(db, getOrgId(req), id, req.body);
      if (!ok) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  r.delete('/agents/:id', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const id = oid(req.params.id);
      if (!id) {
        res.status(400).json({ error: 'invalid id' });
        return;
      }
      await deleteAgent(db, getOrgId(req), id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
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
      const calls = await listCalls(db, getOrgId(req), {
        agentId: agentId ?? undefined,
        status: status as 'active' | 'completed' | undefined,
        skip,
        limit,
      });
      res.json(calls);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  r.get('/calls/count', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const count = await countCalls(db, getOrgId(req));
      res.json({ count });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  r.get('/calls/:id', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const id = oid(req.params.id);
      if (!id) {
        res.status(400).json({ error: 'invalid id' });
        return;
      }
      const call = await getCall(db, getOrgId(req), id);
      if (!call) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.json(call);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // --- Analytics ---
  r.get('/analytics/usage', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const days = Math.min(parseInt(req.query.days as string) || 30, 90);
      const usage = await getUsage(db, getOrgId(req), days);
      res.json(usage);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // --- API Keys ---
  r.get('/api-keys', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const keys = await listApiKeys(db, getOrgId(req));
      res.json(keys.map((k) => ({ ...k, keyHash: undefined })));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  r.post('/api-keys', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const { name, scopes } = req.body as { name?: string; scopes?: string[] };
      if (!name) {
        res.status(400).json({ error: 'name required' });
        return;
      }
      const { doc, rawKey } = await createApiKey(db, getOrgId(req), name, scopes);
      res.status(201).json({ ...doc, keyHash: undefined, key: rawKey });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  r.delete('/api-keys/:id', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const id = oid(req.params.id);
      if (!id) {
        res.status(400).json({ error: 'invalid id' });
        return;
      }
      await revokeApiKey(db, getOrgId(req), id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return r;
}
