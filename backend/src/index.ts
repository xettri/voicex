import { loadEnv } from "./config/env.js";
import { createApp } from "./server.js";
import { initDb, closeDb } from "./db/client.js";

const env = loadEnv();
const apiKeys = env.API_KEYS ? env.API_KEYS.split(",").map((k) => k.trim()).filter(Boolean) : [];

if (env.MONGODB_URI) {
  await initDb(env.MONGODB_URI, { maxPoolSize: env.MONGODB_MAX_POOL_SIZE });
}
if (env.REDIS_URL) {
  const { initRateLimitRedis } = await import("./middleware/rate-limit.js");
  const { initConversationHistoryRedis } = await import("./repositories/conversation-history.repository.js");
  await Promise.all([
    initRateLimitRedis(env.REDIS_URL),
    initConversationHistoryRedis(env.REDIS_URL),
  ]);
}

const { server } = createApp(env.PORT, {
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

function shutdown(): void {
  server.close(() => {
    closeDb().then(() => process.exit(0));
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
