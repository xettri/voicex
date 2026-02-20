import type { WebSocket } from 'ws';
import { createLogger } from '../shared/logger.js';
import { createWebSocketCallChannel } from '../providers/call/websocket.provider.js';
import { runVoiceSession } from '../services/voice-session.service.js';
import type { Agent } from '../db/schema.js';

const logger = createLogger('VoiceHandler');

export interface VoiceHandlerConfig {
  deepgramApiKey?: string;
  llmProvider: 'ollama' | 'groq' | 'openai';
  ollamaBaseUrl?: string;
  groqApiKey?: string;
  openaiApiKey?: string;
  elevenLabsApiKey?: string;
  systemTts?: { cmd: string; ext: string };
  mongodbUri?: string;
}

function sendError(ws: WebSocket, message: string): void {
  try {
    ws.send(JSON.stringify({ type: 'error', payload: { message } } as const));
  } catch {
    /* ignore */
  }
}

export function handleVoiceConnection(
  ws: WebSocket,
  requestId: string,
  config: VoiceHandlerConfig,
  clientId?: string,
  historyKey?: string,
  agent?: Agent,
  orgId?: string,
): void {
  const { deepgramApiKey } = config;

  if (!deepgramApiKey) {
    sendError(ws, 'STT not configured. Set DEEPGRAM_API_KEY.');
    ws.close(4002, 'STT not configured');
    logger.info('WebSocket rejected: STT not configured', { requestId });
    return;
  }

  const channel = createWebSocketCallChannel(ws);

  ws.send(
    JSON.stringify({
      type: 'connected',
      sessionId: requestId,
      historyKey: historyKey ?? requestId,
      agentId: agent?._id?.toHexString(),
      agentName: agent?.name,
      timestamp: Date.now(),
    }),
  );

  runVoiceSession(
    channel,
    requestId,
    { ...config, deepgramApiKey, agent, orgId, channel: 'web' },
    clientId,
    historyKey ?? requestId,
  ).catch((err) => {
    logger.error('Voice session failed to start', err);
    sendError(ws, 'Failed to start voice session');
    ws.close(4500, 'Session startup error');
  });
}
