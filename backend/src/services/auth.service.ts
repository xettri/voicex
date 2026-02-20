import * as jose from 'jose';
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import type { ObjectId } from 'mongodb';

// ─── Password hashing (scrypt, no extra deps) ────────────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const hashBuffer = Buffer.from(hash, 'hex');
    const derived = scryptSync(password, salt, 64);
    return timingSafeEqual(hashBuffer, derived);
  } catch {
    return false;
  }
}

// ─── User JWT ────────────────────────────────────────────────────────────────

export interface UserTokenPayload {
  userId: string;
  orgId: string;
  email: string;
  iat: number;
  exp: number;
}

export async function signUserToken(
  userId: ObjectId,
  orgId: ObjectId,
  email: string,
  secret: string,
  expiresIn = '7d',
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ userId: userId.toString(), orgId: orgId.toString(), email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

export async function verifyUserToken(
  token: string,
  secret: string,
): Promise<UserTokenPayload | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jose.jwtVerify(token, key);
    const p = payload as Record<string, unknown>;
    if (
      typeof p.userId !== 'string' ||
      typeof p.orgId !== 'string' ||
      typeof p.email !== 'string'
    ) {
      return null;
    }
    return {
      userId: p.userId,
      orgId: p.orgId,
      email: p.email,
      iat: (payload.iat as number) ?? 0,
      exp: (payload.exp as number) ?? 0,
    };
  } catch {
    return null;
  }
}

// ─── Legacy: API-key JWT (kept for backward compat with WS token flow) ───────

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
