import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 16;
const TAG_LEN = 16;

const DEV_FALLBACK_KEY = createHash('sha256').update('voicex-dev-key-do-not-use-in-production').digest('hex');

let warnedOnce = false;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (hex && hex.length === 64) {
    return Buffer.from(hex, 'hex');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'ENCRYPTION_KEY env var must be a 64-char hex string (32 bytes). ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  if (!warnedOnce) {
    console.warn(
      '[encryption] WARNING: ENCRYPTION_KEY not set — using insecure dev fallback. ' +
        'Set ENCRYPTION_KEY in .env for production.',
    );
    warnedOnce = true;
  }
  return Buffer.from(DEV_FALLBACK_KEY, 'hex');
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(stored: string): string {
  const key = getKey();
  const parts = stored.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format');
  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const data = Buffer.from(parts[2], 'hex');
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error('Invalid encrypted format');
  }
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final('utf8');
}
