import { ObjectId, type Db } from 'mongodb';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { createLogger } from '../shared/logger.js';
import { parseAuthFromUrl, validateApiKey, validateToken } from '../middleware/auth.js';
import { checkRateLimit } from '../middleware/rate-limit.js';
import { handleVoiceConnection } from '../handlers/voice.handler.js';
import { handleTwilioConnection } from '../handlers/twilio.handler.js';
import { resolveApiKey } from '../repositories/apikey.repository.js';
import { getAgent, getDefaultAgent } from '../repositories/agent.repository.js';
import type { VoiceConfig } from '../config/voice.config.js';
import type { Agent } from '../db/schema.js';

const logger = createLogger('WSGateway');

interface AuthResult {
  valid: boolean;
  clientId?: string;
  orgId?: ObjectId;
}

async function authenticate(url: string, config: VoiceConfig, db: Db | null): Promise<AuthResult> {
  const { apiKey, token } = parseAuthFromUrl(url);

  if (apiKey && db) {
    const resolved = await resolveApiKey(db, apiKey);
    if (resolved) return { valid: true, clientId: apiKey.slice(0, 12), orgId: resolved.orgId };
  }

  if (apiKey) {
    const result = validateApiKey(apiKey, config.apiKeys);
    if (result.valid) return { valid: true, clientId: result.clientId };
  }

  if (token && config.jwtSecret) {
    const result = await validateToken(token, config.jwtSecret);
    if (result.valid) return { valid: true, clientId: result.clientId };
  }

  return { valid: config.apiKeys.length === 0 };
}

async function resolveAgent(
  url: string,
  db: Db | null,
  orgId?: ObjectId,
): Promise<Agent | undefined> {
  if (!db || !orgId) return undefined;
  const params = new URL(url, 'http://localhost').searchParams;
  const agentIdStr = params.get('agent_id');

  try {
    if (agentIdStr) {
      const agent = await getAgent(db, new ObjectId(agentIdStr));
      if (agent && agent.orgId.equals(orgId)) return agent;
    }
    const defaultAgent = await getDefaultAgent(db, orgId);
    return defaultAgent ?? undefined;
  } catch {
    return undefined;
  }
}

export function createWebSocketGateway(
  server: import('http').Server,
  config: VoiceConfig,
): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

  let getDbFn: (() => Promise<Db>) | null = null;
  import('../db/client.js')
    .then((m) => {
      getDbFn = m.getDb;
    })
    .catch(() => {});

  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    const path = req.url?.split('?')[0];
    if (path === '/ws/voice') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else if (path === '/ws/twilio/stream' && config.twilioAppUrl) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('twilio-connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const requestId = crypto.randomUUID().slice(0, 8);
    const url = req.url ?? '';

    let db: Db | null = null;
    try {
      if (getDbFn) db = await getDbFn();
    } catch {
      /* no db */
    }

    const { valid, clientId, orgId } = await authenticate(url, config, db);
    if (!valid) {
      ws.close(4001, 'Unauthorized');
      logger.info('WebSocket rejected: unauthorized', { requestId });
      return;
    }

    const rateLimitId = clientId ?? req.socket?.remoteAddress ?? 'unknown';
    const allowed = await checkRateLimit(rateLimitId);
    if (!allowed) {
      ws.close(4029, 'Rate limit exceeded');
      return;
    }

    const agent = await resolveAgent(url, db, orgId);
    const sessionIdParam = new URL(url, 'http://localhost').searchParams.get('session_id');
    const historyKey = sessionIdParam || clientId || requestId;

    logger.info('WebSocket connected', {
      requestId,
      clientId,
      orgId: orgId?.toHexString(),
      agentId: agent?._id?.toHexString(),
      historyKey,
    });
    handleVoiceConnection(
      ws,
      requestId,
      config,
      clientId ?? undefined,
      historyKey,
      agent,
      orgId?.toHexString(),
    );
  });

  wss.on('twilio-connection', async (ws: WebSocket, req: IncomingMessage) => {
    const requestId = crypto.randomUUID().slice(0, 8);
    const url = req.url ?? '';

    let db: Db | null = null;
    try {
      if (getDbFn) db = await getDbFn();
    } catch {
      /* no db */
    }

    const { valid, clientId, orgId } = await authenticate(url, config, db);
    if (!valid) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const agent = await resolveAgent(url, db, orgId);
    const historyKey = clientId ?? requestId;
    logger.info('Twilio stream connected', {
      requestId,
      clientId,
      agentId: agent?._id?.toHexString(),
    });
    handleTwilioConnection(
      ws,
      requestId,
      config,
      clientId ?? undefined,
      historyKey,
      agent,
      orgId?.toHexString(),
    );
  });

  return wss;
}
