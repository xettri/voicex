import express from 'express';
import cors from 'cors';
import { apiLimiter } from './middleware/api-limiter.js';
import { createRoutes } from './routes/index.js';
import type { VoiceConfig } from './config/voice.config.js';

export function createExpressApp(config: VoiceConfig): express.Application {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/', apiLimiter);
  app.use('/api', createRoutes(config));

  return app;
}
