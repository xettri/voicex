import type { WebSocket } from 'ws';
import { createLogger } from '../shared/logger.js';
import { createTwilioCallChannel } from '../providers/call/twilio.provider.js';
import { runVoiceSession } from '../services/voice-session.service.js';
import type { Agent } from '../db/schema.js';

const logger = createLogger('TwilioHandler');

export interface TwilioHandlerConfig {
  deepgramApiKey?: string;
  llmProvider: 'ollama' | 'groq' | 'openai';
  ollamaBaseUrl?: string;
  groqApiKey?: string;
  openaiApiKey?: string;
  elevenLabsApiKey?: string;
  mongodbUri?: string;
}

export function handleTwilioConnection(
  ws: WebSocket,
  requestId: string,
  config: TwilioHandlerConfig,
  clientId?: string,
  historyKey?: string,
  agent?: Agent,
  orgId?: string,
): void {
  const { deepgramApiKey } = config;

  if (!deepgramApiKey) {
    logger.info('Twilio connection rejected: STT not configured', { requestId });
    ws.close(4002, 'STT not configured');
    return;
  }

  const channel = createTwilioCallChannel(ws);

  runVoiceSession(
    channel,
    requestId,
    {
      ...config,
      deepgramApiKey,
      audioFormat: { encoding: 'mulaw', sampleRate: 8000 },
      agent,
      orgId,
      channel: 'phone',
    },
    clientId,
    historyKey ?? requestId,
  ).catch((err) => {
    logger.error('Twilio voice session failed to start', err);
    ws.close(4500, 'Session startup error');
  });
}
