import { Router, type Request, type Response } from 'express';
import { getDb } from '../db/client.js';
import { createOrganization } from '../repositories/organization.repository.js';
import { createApiKey } from '../repositories/apikey.repository.js';
import { getPlanBySlug } from '../repositories/plan.repository.js';

export function createSetupRouter(): Router {
  const r = Router();

  r.get('/status', async (_req: Request, res: Response) => {
    try {
      const db = await getDb();
      const count = await db.collection('organizations').countDocuments();
      res.json({ initialized: count > 0 });
    } catch {
      res.json({ initialized: false });
    }
  });

  r.post('/', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const existingOrgs = await db.collection('organizations').countDocuments();
      if (existingOrgs > 0) {
        res.status(409).json({
          error: 'Setup already complete. Use your existing API key to access the dashboard.',
        });
        return;
      }

      const freePlan = await getPlanBySlug(db, 'free');
      if (!freePlan?._id) {
        res.status(500).json({ error: 'Default plan not configured. Run seed-plans first.' });
        return;
      }

      const { orgName } = req.body as { orgName?: string };
      const name = (orgName ?? '').trim() || 'My Organization';

      const org = await createOrganization(db, name, freePlan._id, '', 'active');
      const { rawKey } = await createApiKey(db, org._id!, 'Admin Key');

      res.json({
        ok: true,
        orgId: org._id!.toString(),
        orgName: org.name,
        apiKey: rawKey,
        message: 'Setup complete. Copy your API key — it will not be shown again.',
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return r;
}
