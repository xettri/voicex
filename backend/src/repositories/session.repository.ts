import type { Db } from 'mongodb';

export interface SessionDoc {
  sessionId: string;
  clientId?: string;
  createdAt: Date;
  endedAt?: Date;
  metadata?: Record<string, unknown>;
}

export async function createSession(db: Db, sessionId: string, clientId?: string): Promise<void> {
  await db.collection<SessionDoc>('sessions').insertOne({
    sessionId,
    clientId,
    createdAt: new Date(),
    metadata: {},
  });
}

export async function endSession(db: Db, sessionId: string): Promise<void> {
  await db
    .collection<SessionDoc>('sessions')
    .updateOne({ sessionId }, { $set: { endedAt: new Date() } });
}
