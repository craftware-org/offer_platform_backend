import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Time-based one-time passwords for authenticator apps (RFC 6238 with RFC 4226 HOTP): HMAC-SHA1,
 * 30-second steps, 6 digits. This is what Google Authenticator, Microsoft Authenticator, Authy etc.
 * expect from an `otpauth://totp/...` link (ADR-0018).
 */
export const TOTP_PERIOD_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 without padding (how authenticator apps take secrets). */
export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret (the size RFC 4226 recommends for SHA-1). */
export const newTotpSecret = (): Buffer => randomBytes(20);

export const stepAt = (at: Date): number => Math.floor(at.getTime() / 1000 / TOTP_PERIOD_SECONDS);

/** The code for one time step (HOTP with the step as the counter). */
export function totpCode(secret: Buffer, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', secret).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return binary.toString().padStart(digits, '0');
}

/**
 * Checks a typed code against the current step and one step either side (phone clocks drift).
 * Returns the matching step, or null. Steps at or before `lastUsedStep` are refused, so a code
 * can't be used twice.
 */
export function verifyTotp(
  secret: Buffer,
  code: string,
  at: Date,
  lastUsedStep: number | null,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = stepAt(at);
  for (const step of [now - 1, now, now + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const expected = Buffer.from(totpCode(secret, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

/** `otpauth://` link for the QR code that authenticator apps scan. */
export function otpauthUrl(secret: Buffer, issuer: string, account: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: base32Encode(secret),
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * Authenticator secrets are stored encrypted (AES-256-GCM). The key is derived from
 * OTP_HASH_SECRET, so a database dump alone doesn't reveal them. Rotating OTP_HASH_SECRET makes
 * every admin set up their authenticator again (see ADR-0018 and `admin:reset-mfa`).
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(rootSecret: string) {
    this.key = Buffer.from(
      hkdfSync('sha256', rootSecret, Buffer.alloc(0), 'offer-platform/totp-secret-v1', 32),
    );
  }

  seal(plain: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return [
      'v1',
      iv.toString('base64url'),
      body.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
    ].join('.');
  }

  open(sealed: string): Buffer {
    const [version, iv, body, tag] = sealed.split('.');
    if (version !== 'v1' || !iv || !body || !tag) throw new Error('Unknown secret format');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]);
  }
}
