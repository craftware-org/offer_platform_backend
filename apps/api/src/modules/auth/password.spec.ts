import { hashPassword, verifyPassword } from './password-hasher.js';
import { passwordProblem } from './password-policy.js';

describe('password hashing (Argon2id)', () => {
  it('stores a salted PHC string that verifies only the right password', async () => {
    const hash = await hashPassword('mango@shop');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    expect(hash).not.toContain('mango');
    await expect(verifyPassword(hash, 'mango@shop')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'mango@shoP')).resolves.toBe(false);
  });

  it('salts every hash differently', async () => {
    expect(await hashPassword('same-password')).not.toBe(await hashPassword('same-password'));
  });

  it('never throws on malformed stored values', async () => {
    await expect(verifyPassword('not-a-hash', 'x')).resolves.toBe(false);
    await expect(verifyPassword('', 'x')).resolves.toBe(false);
  });
});

describe('password policy', () => {
  it.each(['mango@shop', 'hubli2026', 'my shop is open', 'ಕನ್ನಡಪಾಸ್ವರ್ಡ್'])('accepts %j', (pw) => {
    expect(passwordProblem(pw)).toBeNull();
  });

  it.each([
    ['abc123', 'at least 8'],
    ['12345678', 'too common'],
    ['Password123', 'too common'],
    ['aaaaaaaa', 'too easy'],
    ['x'.repeat(129), 'at most 128'],
  ])('rejects %j', (pw, message) => {
    expect(passwordProblem(pw)).toContain(message);
  });

  it('rejects the email or phone number as the password', () => {
    expect(passwordProblem('ravi.kumar', ['ravi.kumar@gmail.com'])).toContain('email or phone');
    expect(passwordProblem('9845012345', ['+919845012345'])).toContain('email or phone');
    expect(passwordProblem('ravi@mango1', ['ravi@gmail.com'])).toBeNull();
  });
});
