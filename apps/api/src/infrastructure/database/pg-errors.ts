/**
 * Postgres unique-violation check. Drizzle may wrap driver errors (the pg error is then in `cause`),
 * so both shapes are inspected.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 3; depth++) {
    const e = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (e.code === '23505') return constraint === undefined || e.constraint === constraint;
    current = e.cause;
  }
  return false;
}
