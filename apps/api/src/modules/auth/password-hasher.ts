import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Argon2id password hashing with Node's built-in implementation (ADR-0015).
 * Parameters follow the OWASP Password Storage Cheat Sheet minimum (19 MiB, 2 passes, 1 lane).
 * Hashes are stored in PHC string format so parameters can be raised later: old hashes keep
 * verifying with the parameters encoded in them.
 */
export const ARGON2_PARAMS = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 } as const;
const SALT_BYTES = 16;

interface Params {
  memory: number;
  passes: number;
  parallelism: number;
  tagLength: number;
}

function derive(password: string, salt: Buffer, p: Params): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      'argon2id',
      {
        message: password,
        nonce: salt,
        memory: p.memory,
        passes: p.passes,
        parallelism: p.parallelism,
        tagLength: p.tagLength,
      },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

const b64 = (buf: Buffer) => buf.toString('base64').replace(/=+$/, '');

/** "$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>" */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(password, salt, ARGON2_PARAMS);
  const { memory: m, passes: t, parallelism: p } = ARGON2_PARAMS;
  return `$argon2id$v=19$m=${m},t=${t},p=${p}$${b64(salt)}$${b64(hash)}`;
}

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/** Constant-time check. Returns false (never throws) for malformed stored values. */
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const match = PHC.exec(stored);
  if (!match) return false;
  const [, m, t, p, salt, hash] = match;
  const expected = Buffer.from(hash!, 'base64');
  const actual = await derive(password, Buffer.from(salt!, 'base64'), {
    memory: Number(m),
    passes: Number(t),
    parallelism: Number(p),
    tagLength: expected.length,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A real hash of a random value: verifying against it costs the same time as a real account (no user enumeration by timing). */
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(16).toString('hex')));
