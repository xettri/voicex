export function parseAuthFromUrl(url: string): { apiKey?: string; token?: string } {
  try {
    const u = new URL(url, 'http://localhost');
    return {
      apiKey: u.searchParams.get('api_key') ?? undefined,
      token: u.searchParams.get('token') ?? undefined,
    };
  } catch {
    return {};
  }
}

export function validateApiKey(
  apiKey: string | null,
  allowedKeys: string[],
): { valid: boolean; clientId?: string } {
  if (!apiKey) return { valid: allowedKeys.length === 0 };
  const key = allowedKeys.find((k) => k.trim() === apiKey.trim());
  if (key) return { valid: true, clientId: apiKey.slice(0, 12) };
  return { valid: false };
}

export async function validateToken(
  token: string | null,
  jwtSecret: string | undefined,
): Promise<{ valid: boolean; clientId?: string }> {
  if (!token || !jwtSecret) return { valid: false };
  const { verifyToken } = await import('../services/auth.service.js');
  const payload = await verifyToken(token, jwtSecret);
  if (payload?.clientId) return { valid: true, clientId: payload.clientId };
  return { valid: false };
}
