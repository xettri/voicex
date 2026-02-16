import type { Request, Response } from "express";
import { Router } from "express";
import { validateApiKey, validateToken } from "../middleware/auth.js";
import type { VoiceConfig } from "../config/voice.config.js";

export function createTwilioRouter(config: VoiceConfig): Router {
  const router = Router();

  if (!config.twilioAppUrl) return router;

  router.post("/voice", async (req: Request, res: Response) => {
    const apiKey = typeof req.query.api_key === "string" ? req.query.api_key : undefined;
    const token = typeof req.query.token === "string" ? req.query.token : undefined;

    let valid = false;
    let authParam: string;

    if (apiKey) {
      const result = validateApiKey(apiKey, config.apiKeys);
      valid = result.valid;
      authParam = `api_key=${encodeURIComponent(apiKey)}`;
    } else if (token && config.jwtSecret) {
      const result = await validateToken(token, config.jwtSecret);
      valid = result.valid;
      authParam = `token=${encodeURIComponent(token)}`;
    } else {
      authParam = "";
    }

    if (!valid) {
      res.status(401).type("text/xml").send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="rejected"/></Response>`
      );
      return;
    }
    const streamUrl = `${config.twilioAppUrl!.replace(/^http/, "ws")}/ws/twilio/stream?${authParam}`;
    res.type("text/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${streamUrl}"/></Connect></Response>`
    );
  });

  return router;
}
