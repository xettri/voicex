import { Router } from 'express';
import { healthRoutes } from './health.routes.js';
import { createAuthRouter } from './auth.routes.js';
import { createTwilioRouter } from './twilio.routes.js';
import { createDashboardRouter, createPlansRouter } from './dashboard.routes.js';
import { createSetupRouter } from './setup.routes.js';
import type { VoiceConfig } from '../config/voice.config.js';

export function createRoutes(config: VoiceConfig): Router {
  const router = Router();

  router.use('/health', healthRoutes);
  router.use('/auth', createAuthRouter(config));
  router.use('/twilio', createTwilioRouter(config));
  router.use('/dashboard', createDashboardRouter());
  router.use('/setup', createSetupRouter());
  router.use('/plans', createPlansRouter());

  return router;
}
