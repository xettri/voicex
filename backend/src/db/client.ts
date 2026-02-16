import type { Db } from "mongodb";
import { MongoClient } from "mongodb";

let client: MongoClient | null = null;

export interface DbOptions {
  maxPoolSize?: number;
}

/** Call at startup to initialize MongoDB with connection pool. Required before getDb(). */
export async function initDb(uri: string, options?: DbOptions): Promise<void> {
  if (client) return;
  client = new MongoClient(uri, { maxPoolSize: options?.maxPoolSize ?? 50 });
  await client.connect();
  await ensureIndexes(client);
}

async function ensureIndexes(mongoClient: MongoClient): Promise<void> {
  const db = mongoClient.db();
  await db.collection("sessions").createIndex({ sessionId: 1 }, { unique: true });
  await db.collection("sessions").createIndex({ clientId: 1, createdAt: -1 });
  await db.collection("usage").createIndex({ clientId: 1, date: 1 }, { unique: true });
}

export async function getDb(): Promise<Db> {
  if (!client) throw new Error("MongoDB not initialized. Call initDb() at startup.");
  return client.db();
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}
