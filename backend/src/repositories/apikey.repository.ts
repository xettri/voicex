import { ObjectId, type Db } from 'mongodb';
import { createHash, randomBytes } from 'crypto';
import type { ApiKeyDoc } from '../db/schema.js';

const COL = 'api_keys';

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export async function createApiKey(
  db: Db,
  orgId: ObjectId,
  name: string,
  scopes: string[] = ['voice'],
): Promise<{ doc: ApiKeyDoc; rawKey: string }> {
  const rawKey = `vx_${randomBytes(24).toString('hex')}`;
  const doc: ApiKeyDoc = {
    orgId,
    keyHash: hashKey(rawKey),
    keyPrefix: rawKey.slice(0, 10),
    name,
    scopes,
    lastUsedAt: null,
    createdAt: new Date(),
    revokedAt: null,
  };
  const result = await db.collection<ApiKeyDoc>(COL).insertOne(doc);
  return { doc: { ...doc, _id: result.insertedId }, rawKey };
}

export async function resolveApiKey(
  db: Db,
  rawKey: string,
): Promise<{ orgId: ObjectId; scopes: string[] } | null> {
  const hash = hashKey(rawKey);
  const doc = await db.collection<ApiKeyDoc>(COL).findOne({ keyHash: hash, revokedAt: null });
  if (!doc) return null;
  db.collection<ApiKeyDoc>(COL)
    .updateOne({ _id: doc._id }, { $set: { lastUsedAt: new Date() } })
    .catch(() => {});
  return { orgId: doc.orgId, scopes: doc.scopes };
}

export async function listApiKeys(db: Db, orgId: ObjectId): Promise<ApiKeyDoc[]> {
  return db.collection<ApiKeyDoc>(COL).find({ orgId }).sort({ createdAt: -1 }).toArray();
}

export async function revokeApiKey(db: Db, orgId: ObjectId, keyId: ObjectId): Promise<boolean> {
  const result = await db
    .collection<ApiKeyDoc>(COL)
    .updateOne({ _id: keyId, orgId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  return result.modifiedCount > 0;
}
