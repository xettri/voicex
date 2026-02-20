import * as jose from 'jose';

export interface TokenPayload {
  clientId: string;
  iat: number;
  exp: number;
}

export async function signToken(
  clientId: string,
  secret: string,
  expiresIn = '1h',
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ clientId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jose.jwtVerify(token, key);
    const p = payload as Record<string, unknown>;
    if (typeof p.clientId !== 'string') return null;
    return {
      clientId: p.clientId,
      iat: (payload.iat as number) ?? 0,
      exp: (payload.exp as number) ?? 0,
    };
  } catch {
    return null;
  }
}
