import type { Db } from "mongodb";

export interface UsageDoc {
  clientId: string;
  date: string;
  sessions: number;
  sttSeconds: number;
  llmTokens: number;
  ttsChars: number;
}

export async function incrementUsage(
  db: Db,
  clientId: string,
  delta: { sessions?: number; sttSeconds?: number; llmTokens?: number; ttsChars?: number }
): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  await db.collection<UsageDoc>("usage").updateOne(
    { clientId, date },
    {
      $inc: {
        sessions: delta.sessions ?? 0,
        sttSeconds: delta.sttSeconds ?? 0,
        llmTokens: delta.llmTokens ?? 0,
        ttsChars: delta.ttsChars ?? 0,
      },
    },
    { upsert: true }
  );
}
