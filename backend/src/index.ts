import { loadEnv } from './config/env.js';
import { createApp } from './server.js';
import { initDb, closeDb } from './db/client.js';
import { createLogger } from './shared/logger.js';

const logger = createLogger('Main');
const env = loadEnv();
const apiKeys = env.API_KEYS
  ? env.API_KEYS.split(',')
      .map((k) => k.trim())
      .filter(Boolean)
  : [];

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — shutting down', { error: err.message, stack: err.stack });
  process.exit(1);
});

if (env.MONGODB_URI) {
  await initDb(env.MONGODB_URI, { maxPoolSize: env.MONGODB_MAX_POOL_SIZE });
}
if (env.REDIS_URL) {
  const { initRateLimitRedis } = await import('./middleware/rate-limit.js');
  const { initConversationHistoryRedis } =
    await import('./repositories/conversation-history.repository.js');
  const { initPlanCacheRedis } = await import('./repositories/plan.repository.js');
  await Promise.all([
    initRateLimitRedis(env.REDIS_URL),
    initConversationHistoryRedis(env.REDIS_URL),
    initPlanCacheRedis(env.REDIS_URL),
  ]);
}

const { server, wss } = createApp(env.PORT, {
  deepgramApiKey: env.DEEPGRAM_API_KEY,
  llmProvider: env.LLM_PROVIDER,
  ollamaBaseUrl: env.OLLAMA_BASE_URL,
  groqApiKey: env.GROQ_API_KEY,
  openaiApiKey: env.OPENAI_API_KEY,
  elevenLabsApiKey: env.ELEVENLABS_API_KEY,
  systemTts:
    env.SYSTEM_TTS_CMD && env.SYSTEM_TTS_EXT
      ? { cmd: env.SYSTEM_TTS_CMD, ext: env.SYSTEM_TTS_EXT }
      : undefined,
  apiKeys,
  jwtSecret: env.JWT_SECRET,
  corsOrigin: env.CORS_ORIGIN,
  mongodbUri: env.MONGODB_URI,
  twilioAppUrl: env.TWILIO_APP_URL,
});

const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Graceful shutdown initiated');

  const forceExit = setTimeout(() => {
    logger.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  for (const client of wss.clients) {
    try {
      client.close(1001, 'Server shutting down');
    } catch {
      /* ignore */
    }
  }
  wss.close();

  server.close(() => {
    logger.info('HTTP server closed');
    closeDb()
      .then(() => {
        clearTimeout(forceExit);
        logger.info('Shutdown complete');
        process.exit(0);
      })
      .catch(() => {
        clearTimeout(forceExit);
        process.exit(1);
      });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
