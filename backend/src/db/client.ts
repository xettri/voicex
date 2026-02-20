import type { Db } from 'mongodb';
import { MongoClient } from 'mongodb';

let client: MongoClient | null = null;

export interface DbOptions {
  maxPoolSize?: number;
}

export async function initDb(uri: string, options?: DbOptions): Promise<void> {
  if (client) return;
  client = new MongoClient(uri, {
    maxPoolSize: options?.maxPoolSize ?? 100,
    minPoolSize: 10,
    maxIdleTimeMS: 60_000,
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 10_000,
  });
  await client.connect();
  await ensureIndexes(client);
}

async function ensureIndexes(mongoClient: MongoClient): Promise<void> {
  const db = mongoClient.db();

  await Promise.all([
    db.collection('plans').createIndex({ slug: 1 }, { unique: true }),
    db.collection('plans').createIndex({ public: 1, custom: 1 }),
    db.collection('organizations').createIndex({ name: 1 }),
    db.collection('organizations').createIndex({ planId: 1 }),
    db.collection('api_keys').createIndex({ orgId: 1 }),
    db.collection('api_keys').createIndex({ keyHash: 1 }, { unique: true }),
    db.collection('api_keys').createIndex({ keyPrefix: 1 }),
    db.collection('agents').createIndex({ orgId: 1, active: 1 }),
    db.collection('agents').createIndex({ orgId: 1, createdAt: -1 }),
    db.collection('agents').createIndex({ llmProviderId: 1 }),
    db.collection('agents').createIndex({ ttsProviderId: 1 }),
    db.collection('agents').createIndex({ sttProviderId: 1 }),
    db.collection('calls').createIndex({ orgId: 1, createdAt: -1 }),
    db.collection('calls').createIndex({ orgId: 1, agentId: 1, createdAt: -1 }),
    db.collection('calls').createIndex({ sessionId: 1 }, { unique: true }),
    db.collection('calls').createIndex({ status: 1 }),
    db.collection('calls').createIndex({ orgId: 1, status: 1 }),
    db.collection('daily_usage').createIndex({ orgId: 1, date: -1 }),
    db.collection('daily_usage').createIndex({ orgId: 1, date: 1 }, { unique: true }),
    db.collection('sessions').createIndex({ sessionId: 1 }, { unique: true }),
    db.collection('sessions').createIndex({ clientId: 1, createdAt: -1 }),
    db.collection('usage').createIndex({ clientId: 1, date: 1 }, { unique: true }),
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('users').createIndex({ orgId: 1 }),
    db.collection('providers').createIndex({ orgId: 1, category: 1 }),
    db.collection('providers').createIndex(
      { orgId: 1, category: 1, providerKey: 1, name: 1 },
      { unique: true },
    ),
    db.collection('providers').createIndex({ orgId: 1, active: 1 }),
    db.collection('provider_registry').createIndex(
      { category: 1, providerKey: 1 },
      { unique: true },
    ),
  ]);
}

export async function getDb(): Promise<Db> {
  if (!client) throw new Error('MongoDB not initialized. Call initDb() at startup.');
  return client.db();
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}
