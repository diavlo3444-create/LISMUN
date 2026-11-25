import crypto from 'node:crypto';

let ephemeralSigningKey: string | null = null;

function getSigningSecret(): string {
  const configured =
    process.env.SESSION_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    '';
  if (configured) return configured;
  if (!ephemeralSigningKey) {
    ephemeralSigningKey = crypto.randomBytes(32).toString('hex');
  }
  return ephemeralSigningKey;
}

export function getPrimarySuperAdminEmail(): string {
  return (process.env.PRIMARY_SUPER_ADMIN_EMAIL ?? '').trim().toLowerCase();
}

export function generateOpaqueToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

export function generateQrTokenValue(): string {
  return `LMQR-${crypto.randomBytes(16).toString('hex')}`;
}

export function generateApplicationCode(prefix = 'LM'): string {
  const num = crypto.randomInt(100000, 999999);
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${num}-${suffix}`;
}

export function generatePassCode(): string {
  return `LMP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

export function hashOpaqueToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function signHmacPayload<T extends Record<string, unknown>>(
  payload: T,
  ttlSeconds: number
): string {
  const fullPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

export function verifyHmacPayload<T extends Record<string, unknown>>(
  token: string
): (T & { exp: number }) | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(body)
    .digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & {
      exp?: number;
    };
    if (!parsed || typeof parsed.exp !== 'number') return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed as T & { exp: number };
  } catch {
    return null;
  }
}

export function encryptGmailSecret(plaintext: string): string {
  const keyRaw = (process.env.GMAIL_TOKEN_ENCRYPTION_KEY ?? '').trim();
  if (!keyRaw) {
    throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY_MISSING');
  }
  const key = crypto.createHash('sha256').update(keyRaw).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptGmailSecret(ciphertext: string): string {
  const keyRaw = (process.env.GMAIL_TOKEN_ENCRYPTION_KEY ?? '').trim();
  if (!keyRaw) {
    throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY_MISSING');
  }
  const parts = ciphertext.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('INVALID_ENCRYPTED_GMAIL_TOKEN');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const key = crypto.createHash('sha256').update(keyRaw).digest();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivB64, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}
