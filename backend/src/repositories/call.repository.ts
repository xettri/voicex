import { ObjectId, type Db } from 'mongodb';
import type { Call, CallMetrics, CallTranscriptEntry, DailyUsage } from '../db/schema.js';

const COL = 'calls';
const USAGE_COL = 'daily_usage';

export async function createCall(
  db: Db,
  input: {
    orgId: ObjectId;
    agentId: ObjectId;
    sessionId: string;
    channel: 'web' | 'phone';
    metadata?: Call['metadata'];
  },
): Promise<Call> {
  const doc: Call = {
    orgId: input.orgId,
    agentId: input.agentId,
    sessionId: input.sessionId,
    channel: input.channel,
    status: 'active',
    startedAt: new Date(),
    endedAt: null,
    durationSec: null,
    metrics: {
      ttfbMs: null,
      avgLatencyMs: null,
      totalTokens: 0,
      ttsChars: 0,
      interruptions: 0,
      turnCount: 0,
    },
    summary: null,
    sentiment: null,
    transcript: [],
    metadata: input.metadata ?? {},
    createdAt: new Date(),
  };
  const result = await db.collection<Call>(COL).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function endCall(
  db: Db,
  sessionId: string,
  data: {
    summary?: string | null;
    sentiment?: Call['sentiment'];
  },
): Promise<void> {
  const call = await db.collection<Call>(COL).findOne({ sessionId });
  if (!call) return;
  const now = new Date();
  const durationSec = Math.round((now.getTime() - call.startedAt.getTime()) / 1000);
  await db
    .collection<Call>(COL)
    .updateOne(
      { sessionId },
      {
        $set: {
          status: 'completed',
          endedAt: now,
          durationSec,
          summary: data.summary ?? null,
          sentiment: data.sentiment ?? null,
        },
      },
    );
  const dateStr = now.toISOString().slice(0, 10);
  await db.collection<DailyUsage>(USAGE_COL).updateOne(
    { orgId: call.orgId, date: dateStr },
    {
      $inc: {
        calls: 1,
        minutes: Math.ceil(durationSec / 60),
        ttsChars: call.metrics.ttsChars,
        llmTokens: call.metrics.totalTokens,
      },
      $setOnInsert: { orgId: call.orgId, date: dateStr, sttSeconds: 0 },
    },
    { upsert: true },
  );
}

export async function updateCallMetrics(
  db: Db,
  sessionId: string,
  inc: Partial<CallMetrics>,
): Promise<void> {
  const $inc: Record<string, number> = {};
  if (inc.totalTokens) $inc['metrics.totalTokens'] = inc.totalTokens;
  if (inc.ttsChars) $inc['metrics.ttsChars'] = inc.ttsChars;
  if (inc.interruptions) $inc['metrics.interruptions'] = inc.interruptions;
  if (inc.turnCount) $inc['metrics.turnCount'] = inc.turnCount;
  const $set: Record<string, unknown> = {};
  if (inc.ttfbMs !== undefined && inc.ttfbMs !== null) $set['metrics.ttfbMs'] = inc.ttfbMs;
  if (inc.avgLatencyMs !== undefined && inc.avgLatencyMs !== null)
    $set['metrics.avgLatencyMs'] = inc.avgLatencyMs;
  const update: Record<string, unknown> = {};
  if (Object.keys($inc).length) update.$inc = $inc;
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys(update).length) {
    await db.collection<Call>(COL).updateOne({ sessionId }, update);
  }
}

export async function appendTranscript(
  db: Db,
  sessionId: string,
  entry: CallTranscriptEntry,
): Promise<void> {
  await db.collection<Call>(COL).updateOne({ sessionId }, { $push: { transcript: entry } });
}

export async function getCall(db: Db, orgId: ObjectId, callId: ObjectId): Promise<Call | null> {
  return db.collection<Call>(COL).findOne({ _id: callId, orgId });
}

export async function getCallBySession(db: Db, sessionId: string): Promise<Call | null> {
  return db.collection<Call>(COL).findOne({ sessionId });
}

export async function listCalls(
  db: Db,
  orgId: ObjectId,
  opts?: {
    agentId?: ObjectId;
    status?: Call['status'];
    skip?: number;
    limit?: number;
  },
): Promise<Call[]> {
  const filter: Record<string, unknown> = { orgId };
  if (opts?.agentId) filter.agentId = opts.agentId;
  if (opts?.status) filter.status = opts.status;
  return db
    .collection<Call>(COL)
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(opts?.skip ?? 0)
    .limit(opts?.limit ?? 50)
    .toArray();
}

export async function countCalls(
  db: Db,
  orgId: ObjectId,
  filter?: { status?: Call['status'] },
): Promise<number> {
  const q: Record<string, unknown> = { orgId };
  if (filter?.status) q.status = filter.status;
  return db.collection<Call>(COL).countDocuments(q);
}

export async function getUsage(db: Db, orgId: ObjectId, days = 30): Promise<DailyUsage[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const dateStr = since.toISOString().slice(0, 10);
  return db
    .collection<DailyUsage>(USAGE_COL)
    .find({ orgId, date: { $gte: dateStr } })
    .sort({ date: 1 })
    .toArray();
}

export async function getOrgStats(
  db: Db,
  orgId: ObjectId,
): Promise<{
  totalCalls: number;
  activeCalls: number;
  totalMinutes: number;
  avgDurationSec: number;
}> {
  const [totalCalls, activeCalls, agg] = await Promise.all([
    db.collection<Call>(COL).countDocuments({ orgId }),
    db.collection<Call>(COL).countDocuments({ orgId, status: 'active' }),
    db
      .collection<Call>(COL)
      .aggregate([
        { $match: { orgId, durationSec: { $ne: null } } },
        {
          $group: {
            _id: null,
            totalMin: { $sum: { $divide: ['$durationSec', 60] } },
            avgDur: { $avg: '$durationSec' },
          },
        },
      ])
      .toArray(),
  ]);
  const stats = agg[0] as { totalMin?: number; avgDur?: number } | undefined;
  return {
    totalCalls,
    activeCalls,
    totalMinutes: Math.round(stats?.totalMin ?? 0),
    avgDurationSec: Math.round(stats?.avgDur ?? 0),
  };
}
