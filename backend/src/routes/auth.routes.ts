import type { IRouter, Request, Response } from 'express';
import { Router } from 'express';
import { signToken } from '../services/auth.service.js';
import type { VoiceConfig } from '../config/voice.config.js';

export function createAuthRouter(config: Pick<VoiceConfig, 'apiKeys'>): IRouter {
  const router = Router();

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
      res.status(400).json({ error: 'api_key required (body or Authorization: Bearer)' });
      return;
    }

    if (!jwtSecret) {
      res.status(503).json({ error: 'Token issuance not configured (JWT_SECRET)' });
      return;
    }

    const key = config.apiKeys.find((k) => k.trim() === apiKey.trim());
    if (!key) {
      res.status(401).json({ error: 'Invalid api_key' });
      return;
    }

    const clientId = apiKey.slice(0, 12);
    const token = await signToken(clientId, jwtSecret, jwtExpiresIn);

    res.json({
      token,
      expires_in: 3600,
      token_type: 'Bearer',
    });
  });

  return router;
}
