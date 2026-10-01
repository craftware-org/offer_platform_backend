/**
 * Password rules approved by the product owner (2026-10-01, ADR-0015): at least 8 characters,
 * at most 128, and not one of the most common passwords. No composition rules (NIST SP 800-63B).
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Frequently leaked passwords of 8+ characters (compared case-insensitively, spaces ignored). */
const COMMON = new Set([
  '12345678', '123456789', '1234567890', '12341234', '11111111', '00000000', '88888888', '87654321',
  '11223344', '12344321', '1qaz2wsx', '1q2w3e4r', '1q2w3e4r5t', 'qwertyui', 'qwertyuiop', 'qwerty123',
  'qwerty12', 'asdfghjk', 'asdfghjkl', 'zxcvbnm1', 'password', 'password1', 'password12', 'password123',
  'passw0rd', 'p@ssw0rd', 'p@ssword', 'iloveyou', 'iloveyou1', 'sunshine', 'princess', 'football',
  'baseball', 'welcome1', 'welcome123', 'abcd1234', 'abcdefgh', 'abc12345', 'admin123', 'administrator',
  'letmein1', 'trustno1', 'superman', 'whatever', 'computer', 'internet', 'starwars', 'dragon123',
  'monkey123', 'test1234', 'testtest', 'changeme', 'aa123456', 'a1234567', 'india123', 'india@123',
  'bharat123', 'hubli123', 'dharwad123', 'karnataka', 'bangalore', 'bengaluru', 'mumbai123',
  'qwerty@123', 'admin@123', 'pass@123', 'welcome@123', 'password@123', 'abc@1234', 'india@1234',
]);

/** Returns a human message when the password is not acceptable, otherwise null. */
export function passwordProblem(password: string, personal: (string | null | undefined)[] = []): string | null {
  // NIST SP 800-63B: each Unicode code point counts as one character (fair for Kannada etc.).
  let length = 0;
  for (const _ of password) length++;
  if (length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters`;
  if (length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters`;
  const normalized = password.toLowerCase().replace(/\s+/g, '');
  if (COMMON.has(normalized)) return 'This password is too common. Choose another one.';
  if (new Set(normalized).size === 1) return 'This password is too easy to guess. Choose another one.';
  for (const value of personal) {
    if (!value) continue;
    const v = value.toLowerCase();
    const digits = v.replace(/\D/g, '');
    if (normalized === v || normalized === v.split('@')[0] || (digits.length >= 8 && normalized.includes(digits.slice(-10)))) {
      return 'Do not use your email or phone number as the password.';
    }
  }
  return null;
}
