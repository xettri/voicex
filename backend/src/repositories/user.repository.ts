import { ObjectId, type Db } from 'mongodb';
import type { User } from '../db/schema.js';

const COL = 'users';

export async function createUser(
  db: Db,
  data: Omit<User, '_id' | 'createdAt'>,
): Promise<User> {
  const doc: User = { ...data, createdAt: new Date() };
  const result = await db.collection<User>(COL).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function findUserByEmail(db: Db, email: string): Promise<User | null> {
  return db.collection<User>(COL).findOne({ email: email.toLowerCase().trim() });
}

export async function findUserById(db: Db, id: ObjectId): Promise<User | null> {
  return db.collection<User>(COL).findOne({ _id: id });
}

export async function emailExists(db: Db, email: string): Promise<boolean> {
  const count = await db
    .collection<User>(COL)
    .countDocuments({ email: email.toLowerCase().trim() });
  return count > 0;
}
