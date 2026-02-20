import { createLogger } from '../shared/logger.js';
import { getDb } from '../db/client.js';
import { endCall, getCallBySession } from '../repositories/call.repository.js';
import { generateConversationSummary, type ContextMessage } from './context-manager.service.js';
import type { LLMProvider } from '../providers/llm/llm.interface.js';

const logger = createLogger('CallSummary');

export async function finalizeCall(sessionId: string, llm: LLMProvider): Promise<void> {
  try {
    const db = await getDb();
    const call = await getCallBySession(db, sessionId);
    if (!call || call.status !== 'active') return;

    const transcript = call.transcript.map((t) => ({ role: t.role, content: t.content }));

    const llmFn = async (messages: ContextMessage[]): Promise<string> => {
      let result = '';
      await llm.streamCompletion(messages, (token) => {
        result += token;
      });
      return result;
    };

    const { summary, sentiment } = await generateConversationSummary(transcript, llmFn);
    await endCall(db, sessionId, { summary, sentiment });
    logger.info('Call finalized', { sessionId, sentiment, summaryLen: summary.length });
  } catch (err) {
    logger.error('Failed to finalize call', { sessionId, error: err });
    try {
      const db = await getDb();
      await endCall(db, sessionId, {});
    } catch {
      /* best effort */
    }
  }
}
