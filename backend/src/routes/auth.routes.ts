import type { IRouter, Request, Response } from 'express';
import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db/client.js';
import { createOrganization, getOrganization } from '../repositories/organization.repository.js';
import { getPlanBySlug, getPlanCached } from '../repositories/plan.repository.js';
import {
  createUser,
  findUserByEmail,
  findUserById,
  emailExists,
} from '../repositories/user.repository.js';
import {
  hashPassword,
  verifyPassword,
  signUserToken,
  verifyUserToken,
  signToken,
} from '../services/auth.service.js';
import type { VoiceConfig } from '../config/voice.config.js';

const JWT_SECRET_FALLBACK = 'voicex-secret-change-in-production';

function getSecret(): string {
  return process.env.JWT_SECRET ?? JWT_SECRET_FALLBACK;
}

function bearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export function createAuthRouter(config: Pick<VoiceConfig, 'apiKeys'>): IRouter {
  const router = Router();

  router.post('/signup', async (req: Request, res: Response) => {
    try {
      const { name, email, password, orgName } = req.body as {
        name?: string; email?: string; password?: string; orgName?: string;
      };

      if (!name?.trim() || !email?.trim() || !password) {
        res.status(400).json({ error: 'name, email and password are required' });
        return;
      }
      if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters' });
        return;
      }

      const db = await getDb();
      const normalizedEmail = email.toLowerCase().trim();

      if (await emailExists(db, normalizedEmail)) {
        res.status(409).json({ error: 'An account with this email already exists' });
        return;
      }

      const freePlan = await getPlanBySlug(db, 'free');
      if (!freePlan?._id) {
        res.status(500).json({ error: 'Default plan not configured. Run seed-plans first.' });
        return;
      }

      const org = await createOrganization(
        db,
        (orgName?.trim() || `${name.trim()}'s Organization`),
        freePlan._id,
        normalizedEmail,
        'pending',
      );

      await createUser(db, {
        orgId: org._id!,
        email: normalizedEmail,
        passwordHash: hashPassword(password),
        name: name.trim(),
        role: 'admin',
      });

      res.status(201).json({
        status: 'pending',
        message: 'Account created. Your access is pending verification — you will be notified once approved.',
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/signin', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };

      if (!email?.trim() || !password) {
        res.status(400).json({ error: 'email and password are required' });
        return;
      }

      const db = await getDb();
      const user = await findUserByEmail(db, email.trim());

      if (!user || !verifyPassword(password, user.passwordHash)) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      const org = await getOrganization(db, user.orgId);
      if (!org) {
        res.status(401).json({ error: 'Organization not found' });
        return;
      }

      if (org.status === 'pending') {
        res.status(403).json({
          status: 'pending',
          error: 'Your account is pending verification. You will be notified once approved.',
        });
        return;
      }

      const plan = await getPlanCached(db, org.planId);

      const token = await signUserToken(
        user._id!,
        user.orgId,
        user.email,
        getSecret(),
        process.env.JWT_EXPIRES_IN ?? '7d',
      );

      res.json({
        token,
        user: {
          id: user._id!.toString(),
          name: user.name,
          email: user.email,
          orgId: user.orgId.toString(),
          orgName: org.name,
          plan: plan?.slug ?? 'free',
          role: user.role,
        },
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get('/me', async (req: Request, res: Response) => {
    try {
      const token = bearerToken(req);
      if (!token) {
        res.status(401).json({ error: 'No token provided' });
        return;
      }

      const payload = await verifyUserToken(token, getSecret());
      if (!payload) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }

      const db = await getDb();
      const user = await findUserById(db, new ObjectId(payload.userId));
      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      const org = await getOrganization(db, user.orgId);
      const plan = org ? await getPlanCached(db, org.planId) : null;

      res.json({
        user: {
          id: user._id!.toString(),
          name: user.name,
          email: user.email,
          orgId: user.orgId.toString(),
          orgName: org?.name ?? '',
          plan: plan?.slug ?? 'free',
          role: user.role,
        },
        orgStatus: org?.status ?? 'pending',
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/token', async (req: Request, res: Response) => {
    const body = req.body as { api_key?: unknown } | undefined;
    const rawApiKey = body?.api_key ?? req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const apiKey = typeof rawApiKey === 'string' ? rawApiKey : null;
    const jwtSecret = process.env.JWT_SECRET;
    const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? '1h';

    if (!config.apiKeys?.length) {
      res.status(503).json({ error: 'No API keys configured' });
      return;
    }
    if (!apiKey) {
      res.status(400).json({ error: 'api_key required' });
      return;
    }
    if (!jwtSecret) {
      res.status(503).json({ error: 'Token issuance not configured (JWT_SECRET missing)' });
      return;
    }

    const key = config.apiKeys.find((k) => k.trim() === apiKey.trim());
    if (!key) {
      res.status(401).json({ error: 'Invalid api_key' });
      return;
    }

    const clientId = apiKey.slice(0, 12);
    const token = await signToken(clientId, jwtSecret, jwtExpiresIn);
    res.json({ token, expires_in: 3600, token_type: 'Bearer' });
  });

  return router;
}
