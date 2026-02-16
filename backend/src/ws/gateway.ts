import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import { createLogger } from "../shared/logger.js";
import { parseAuthFromUrl, validateApiKey, validateToken } from "../middleware/auth.js";
import { checkRateLimit } from "../middleware/rate-limit.js";
import { handleVoiceConnection } from "../handlers/voice.handler.js";
import { handleTwilioConnection } from "../handlers/twilio.handler.js";
import type { VoiceConfig } from "../config/voice.config.js";

const logger = createLogger("WSGateway");

async function authenticate(
  url: string,
  config: VoiceConfig
): Promise<{ valid: boolean; clientId?: string }> {
  const { apiKey, token } = parseAuthFromUrl(url);
  if (apiKey) {
    return validateApiKey(apiKey, config.apiKeys);
  }
  if (token && config.jwtSecret) {
    return validateToken(token, config.jwtSecret);
  }
  return { valid: config.apiKeys.length === 0 };
}

export function createWebSocketGateway(
  server: import("http").Server,
  config: VoiceConfig
): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const path = req.url?.split("?")[0];
    if (path === "/ws/voice") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else if (path === "/ws/twilio/stream" && config.twilioAppUrl) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("twilio-connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const requestId = crypto.randomUUID().slice(0, 8);
    const url = req.url ?? "";
    const { valid, clientId } = await authenticate(url, config);

    if (!valid) {
      ws.close(4001, "Unauthorized");
      logger.info("WebSocket rejected: invalid api_key or token", { requestId });
      return;
    }

    const rateLimitId = clientId ?? req.socket?.remoteAddress ?? "unknown";
    const allowed = await checkRateLimit(rateLimitId);
    if (!allowed) {
      ws.close(4029, "Rate limit exceeded");
      logger.info("WebSocket rejected: rate limit", { requestId });
      return;
    }

    const sessionIdParam = new URL(url, "http://localhost").searchParams.get("session_id");
    const historyKey = sessionIdParam || clientId || requestId;

    logger.info("WebSocket connected", { requestId, clientId, historyKey });
    handleVoiceConnection(ws, requestId, config, clientId ?? undefined, historyKey);
  });

  wss.on("twilio-connection", async (ws: WebSocket, req: IncomingMessage) => {
    const requestId = crypto.randomUUID().slice(0, 8);
    const url = req.url ?? "";
    const { valid, clientId } = await authenticate(url, config);

    if (!valid) {
      ws.close(4001, "Unauthorized");
      logger.info("Twilio stream rejected: invalid api_key or token", { requestId });
      return;
    }

    const historyKey = clientId ?? requestId;
    logger.info("Twilio Media Stream connected", { requestId, clientId });
    handleTwilioConnection(ws, requestId, config, clientId ?? undefined, historyKey);
  });

  return wss;
}
