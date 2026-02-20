import type { AgentPersona } from '../db/schema.js';

export interface ContextMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const APPROX_CHARS_PER_TOKEN = 4;
const SUMMARY_PROMPT =
  'Summarize the key points of this conversation so far in 2-3 sentences. Focus on what the user wants and what was discussed.';

function estimateTokens(text: string): number {
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

function buildSystemPrompt(persona: AgentPersona): string {
  const parts: string[] = [persona.systemPrompt];

  if (persona.guardrails.length > 0) {
    parts.push('\nIMPORTANT rules you MUST follow:');
    for (const rule of persona.guardrails) {
      parts.push(`- ${rule}`);
    }
  }

  parts.push(
    '\nAdditional instructions:',
    '- Keep replies to 1-3 short sentences. This is voice, not text.',
    '- Use natural speech patterns with contractions.',
    "- If you don't know something, say so. Never make up facts.",
    '- Stay grounded in what the user actually said.',
    `- Respond in ${persona.language === 'en' ? 'English' : persona.language}.`,
  );

  return parts.join('\n');
}

export function buildContextWindow(
  persona: AgentPersona,
  history: ContextMessage[],
  userText: string,
  maxTokenBudget: number,
): ContextMessage[] {
  const systemMsg: ContextMessage = { role: 'system', content: buildSystemPrompt(persona) };
  const userMsg: ContextMessage = { role: 'user', content: userText };

  const systemTokens = estimateTokens(systemMsg.content);
  const userTokens = estimateTokens(userMsg.content);
  const reservedForReply = 200;
  let budget = maxTokenBudget - systemTokens - userTokens - reservedForReply;

  if (budget <= 0 || history.length === 0) {
    return [systemMsg, userMsg];
  }

  const recentMessages: ContextMessage[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    const tokens = estimateTokens(msg.content);
    if (budget - tokens < 0) break;
    budget -= tokens;
    recentMessages.unshift(msg);
  }

  if (recentMessages.length < history.length && history.length > 6) {
    const droppedCount = history.length - recentMessages.length;
    const summaryNote: ContextMessage = {
      role: 'system',
      content: `[${droppedCount} earlier messages omitted for brevity. The conversation has been ongoing.]`,
    };
    return [systemMsg, summaryNote, ...recentMessages, userMsg];
  }

  return [systemMsg, ...recentMessages, userMsg];
}

export async function generateConversationSummary(
  transcript: Array<{ role: string; content: string }>,
  llmFn: (messages: ContextMessage[]) => Promise<string>,
): Promise<{ summary: string; sentiment: 'positive' | 'neutral' | 'negative' }> {
  if (transcript.length === 0) {
    return { summary: 'No conversation took place.', sentiment: 'neutral' };
  }

  const conversationText = transcript.map((t) => `${t.role}: ${t.content}`).join('\n');

  const messages: ContextMessage[] = [
    {
      role: 'system',
      content: `You analyze voice conversations. Respond ONLY with valid JSON in this exact format: {"summary": "...", "sentiment": "positive|neutral|negative"}`,
    },
    {
      role: 'user',
      content: `${SUMMARY_PROMPT}\n\nConversation:\n${conversationText.slice(0, 3000)}`,
    },
  ];

  try {
    const raw = await llmFn(messages);
    const cleaned = raw
      .replace(/```json\s*/g, '')
      .replace(/```/g, '')
      .trim();
    const parsed = JSON.parse(cleaned) as { summary?: string; sentiment?: string };
    const sentiment = ['positive', 'neutral', 'negative'].includes(parsed.sentiment ?? '')
      ? (parsed.sentiment as 'positive' | 'neutral' | 'negative')
      : 'neutral';
    return { summary: parsed.summary ?? raw.slice(0, 500), sentiment };
  } catch {
    return { summary: 'Call completed.', sentiment: 'neutral' };
  }
}
