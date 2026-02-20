export type HistoryMessage = { role: 'user' | 'assistant'; content: string };

const KEY_PREFIX = 'voice:history:';
const MAX_MESSAGES = 20;

const inMemoryStore = new Map<string, HistoryMessage[]>();

let redisClient: {
  get: (k: string) => Promise<string | null>;
  set: (k: string, v: string, opts?: { EX?: number }) => Promise<string>;
} | null = null;

/** Initialize Redis for conversation history. Call at startup if REDIS_URL is set. */
export async function initConversationHistoryRedis(url: string): Promise<void> {
  const { createClient } = await import('redis');
  const client = createClient({ url }) as unknown as {
    get: (k: string) => Promise<string | null>;
    set: (k: string, v: string, opts?: { EX?: number }) => Promise<string>;
    on: (e: string, cb: (err: Error) => void) => void;
    connect: () => Promise<void>;
  };
  client.on('error', (err: Error) => console.error('Redis conversation history error:', err));
  await client.connect();
  redisClient = client;
}

function getKey(sessionKey: string): string {
  return `${KEY_PREFIX}${sessionKey}`;
}

/** Get conversation history for a session. Returns empty array if none. */
export async function getHistory(sessionKey: string): Promise<HistoryMessage[]> {
  if (redisClient) {
    try {
      const raw = await redisClient.get(getKey(sessionKey));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (m): m is HistoryMessage =>
          typeof m === 'object' &&
          m !== null &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string',
      );
    } catch {
      return [];
    }
  }
  return inMemoryStore.get(sessionKey) ?? [];
}

const TTL_SECONDS = 86400; // 24 hours

/** Save conversation history. Trims to MAX_MESSAGES. Sets TTL when using Redis. */
export async function saveHistory(sessionKey: string, messages: HistoryMessage[]): Promise<void> {
  const trimmed = messages.slice(-MAX_MESSAGES);
  if (redisClient) {
    try {
      await redisClient.set(getKey(sessionKey), JSON.stringify(trimmed), { EX: TTL_SECONDS });
    } catch {
      /* ignore */
    }
    return;
  }
  inMemoryStore.set(sessionKey, trimmed);
}
