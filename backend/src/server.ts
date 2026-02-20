import { createServer } from 'http';
import { createLogger } from './shared/logger.js';
import { createExpressApp } from './app.js';
import { createWebSocketGateway } from './ws/gateway.js';
import type { VoiceConfig } from './config/voice.config.js';

const logger = createLogger('Server');

export type { VoiceConfig } from './config/voice.config.js';

export function createApp(port: number, config: VoiceConfig) {
  const app = createExpressApp(config);
  const server = createServer(app);

  const wss = createWebSocketGateway(server, config);

  server.listen(port, () => {
    logger.info('Server listening', { port });
  });

  return { server, wss };
}
