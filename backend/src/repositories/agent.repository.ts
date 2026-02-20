import { ObjectId, type Db } from 'mongodb';
import {
  type Agent,
  DEFAULT_AGENT_PERSONA,
  DEFAULT_LLM_CONFIG,
  DEFAULT_TTS_CONFIG,
  DEFAULT_AGENT_THRESHOLDS,
} from '../db/schema.js';

const COL = 'agents';

export interface CreateAgentInput {
  orgId: ObjectId;
  name: string;
  persona?: Partial<Agent['persona']>;
  llmProviderId: ObjectId;
  llmModelId: string;
  llmConfig?: Partial<Agent['llmConfig']>;
  ttsProviderId: ObjectId;
  ttsModelId: string;
  ttsConfig?: Partial<Agent['ttsConfig']>;
  sttProviderId: ObjectId;
  thresholds?: Partial<Agent['thresholds']>;
}

export async function createAgent(db: Db, input: CreateAgentInput): Promise<Agent> {
  const doc: Agent = {
    orgId: input.orgId,
    name: input.name,
    persona: { ...DEFAULT_AGENT_PERSONA, ...input.persona },
    llmProviderId: input.llmProviderId,
    llmModelId: input.llmModelId,
    llmConfig: { ...DEFAULT_LLM_CONFIG, ...input.llmConfig },
    ttsProviderId: input.ttsProviderId,
    ttsModelId: input.ttsModelId,
    ttsConfig: { ...DEFAULT_TTS_CONFIG, ...input.ttsConfig },
    sttProviderId: input.sttProviderId,
    thresholds: { ...DEFAULT_AGENT_THRESHOLDS, ...input.thresholds },
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await db.collection<Agent>(COL).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function getAgent(db: Db, agentId: ObjectId): Promise<Agent | null> {
  return db.collection<Agent>(COL).findOne({ _id: agentId });
}

export async function getAgentForOrg(
  db: Db,
  orgId: ObjectId,
  agentId: ObjectId,
): Promise<Agent | null> {
  return db.collection<Agent>(COL).findOne({ _id: agentId, orgId });
}

export async function listAgents(db: Db, orgId: ObjectId, skip = 0, limit = 50): Promise<Agent[]> {
  return db
    .collection<Agent>(COL)
    .find({ orgId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
}

export async function countAgents(db: Db, orgId: ObjectId): Promise<number> {
  return db.collection<Agent>(COL).countDocuments({ orgId });
}

export async function updateAgent(
  db: Db,
  orgId: ObjectId,
  agentId: ObjectId,
  update: Partial<Omit<Agent, '_id' | 'orgId' | 'createdAt'>>,
): Promise<boolean> {
  const result = await db
    .collection<Agent>(COL)
    .updateOne({ _id: agentId, orgId }, { $set: { ...update, updatedAt: new Date() } });
  return result.modifiedCount > 0;
}

export async function deleteAgent(db: Db, orgId: ObjectId, agentId: ObjectId): Promise<boolean> {
  const result = await db.collection<Agent>(COL).deleteOne({ _id: agentId, orgId });
  return result.deletedCount > 0;
}

export async function getDefaultAgent(db: Db, orgId: ObjectId): Promise<Agent | null> {
  return db.collection<Agent>(COL).findOne({ orgId, active: true }, { sort: { createdAt: 1 } });
}
