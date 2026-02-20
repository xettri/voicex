const limits = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_CONNECTIONS_PER_WINDOW = 30;

/** In-memory rate limit (single instance). Returns true if allowed. */
function checkInMemory(clientId: string): boolean {
  const now = Date.now();
  const entry = limits.get(clientId);
  if (!entry) {
    limits.set(clientId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (now > entry.resetAt) {
    limits.set(clientId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_CONNECTIONS_PER_WINDOW) return false;
  entry.count++;
  return true;
}

let redisClient: {
  incr: (k: string) => Promise<number>;
  pExpire: (k: string, ms: number) => Promise<unknown>;
} | null = null;
const RATE_LIMIT_KEY_PREFIX = 'rl:';

/** Initialize Redis for distributed rate limiting. Call at startup if REDIS_URL is set. */
export async function initRateLimitRedis(url: string): Promise<void> {
  const { createClient } = await import('redis');
  const client = createClient({ url }) as unknown as {
    incr: (k: string) => Promise<number>;
    pExpire: (k: string, ms: number) => Promise<unknown>;
    on: (e: string, cb: (err: Error) => void) => void;
    connect: () => Promise<void>;
  };
  client.on('error', (err: Error) => console.error('Redis rate limit error:', err));
  await client.connect();
  redisClient = client;
}

/** Redis-based rate limit (multi-instance). Returns true if allowed. */
async function checkRedis(clientId: string): Promise<boolean> {
  if (!redisClient) return checkInMemory(clientId);
  const key = `${RATE_LIMIT_KEY_PREFIX}${clientId}`;
  const count = await redisClient.incr(key);
  if (count === 1) await redisClient.pExpire(key, WINDOW_MS);
  return count <= MAX_CONNECTIONS_PER_WINDOW;
}

/** Check rate limit. Async when Redis is configured (multi-instance). */
export async function checkRateLimit(clientId: string): Promise<boolean> {
  if (redisClient) return checkRedis(clientId);
  return checkInMemory(clientId);
}
