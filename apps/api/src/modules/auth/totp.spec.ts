import { base32Decode, base32Encode, otpauthUrl, SecretBox, stepAt, totpCode, verifyTotp } from './totp.js';

// RFC 6238 Appendix B test vectors (SHA-1 secret "12345678901234567890", 8 digits).
const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');
const RFC_VECTORS: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('TOTP (RFC 6238)', () => {
  it('matches the RFC test vectors', () => {
    for (const [seconds, expected] of RFC_VECTORS) {
      expect(totpCode(RFC_SECRET, stepAt(new Date(seconds * 1000)), 8)).toBe(expected);
    }
  });

  it('round-trips base32 the way authenticator apps read it', () => {
    expect(base32Encode(Buffer.from('12345678901234567890'))).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq').toString()).toBe('12345678901234567890');
  });

  it('accepts the current code and one step of clock drift, never a reused or wrong one', () => {
    const at = new Date('2026-10-09T10:00:15Z');
    const step = stepAt(at);
    const code = totpCode(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, at, null)).toBe(step);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), at, null)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), at, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, code, at, step)).toBeNull(); // already used
    expect(verifyTotp(RFC_SECRET, '12345', at, null)).toBeNull();
  });

  it('builds an otpauth link and keeps secrets encrypted', () => {
    const url = otpauthUrl(RFC_SECRET, 'Dodoom', 'admin@example.com');
    expect(url).toBe(
      'otpauth://totp/Dodoom%3Aadmin%40example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Dodoom&algorithm=SHA1&digits=6&period=30',
    );
    const box = new SecretBox('root-secret-for-tests-only-0123456789');
    const sealed = box.seal(RFC_SECRET);
    expect(sealed).not.toContain('GEZDGNBV');
    expect(box.open(sealed).equals(RFC_SECRET)).toBe(true);
    expect(() => new SecretBox('another-root-secret-0123456789abcdef').open(sealed)).toThrow();
  });
});
