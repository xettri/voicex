import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
config({ path: resolve(root, ".env") });
config({ path: resolve(root, ".env.local") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  LLM_PROVIDER: z.enum(["ollama", "groq", "openai"]).default("ollama"),
  OLLAMA_BASE_URL: z.string().default("http://localhost:11434"),
  GROQ_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  MONGODB_URI: z.string().optional(),
  API_KEYS: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default("1h"),
  CORS_ORIGIN: z.string().default("*"),
  TWILIO_APP_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().default(50),
  /** System TTS: cmd template (say,-o,{out},{text} or espeak,-w,{out},{text}) */
  SYSTEM_TTS_CMD: z.string().optional(),
  /** System TTS: output file extension (aiff, wav) */
  SYSTEM_TTS_EXT: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.flatten());
    process.exit(1);
  }
  return parsed.data;
}
