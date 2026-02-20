import { ObjectId, type Db } from 'mongodb';
import { PLAN_LIMITS, type Organization } from '../db/schema.js';

const COL = 'organizations';

export async function createOrganization(
  db: Db,
  name: string,
  plan: Organization['plan'] = 'free',
): Promise<Organization> {
  const doc: Organization = {
    name,
    plan,
    limits: PLAN_LIMITS[plan],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await db.collection<Organization>(COL).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function getOrganization(db: Db, orgId: ObjectId): Promise<Organization | null> {
  return db.collection<Organization>(COL).findOne({ _id: orgId });
}

export async function updateOrganization(
  db: Db,
  orgId: ObjectId,
  update: Partial<Pick<Organization, 'name' | 'plan'>>,
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (update.name) set.name = update.name;
  if (update.plan) {
    set.plan = update.plan;
    set.limits = PLAN_LIMITS[update.plan];
  }
  await db.collection<Organization>(COL).updateOne({ _id: orgId }, { $set: set });
}

export async function listOrganizations(db: Db, skip = 0, limit = 50): Promise<Organization[]> {
  return db
    .collection<Organization>(COL)
    .find()
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
}
