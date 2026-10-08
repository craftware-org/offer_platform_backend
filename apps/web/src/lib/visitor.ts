const KEY = 'op.visitor';
let fallback: string | null = null;

/**
 * A random id for counting views and taps of visitors who are not logged in (owner decision
 * 2026-10-08). It identifies nothing about the person: it only lets the API count the same browser
 * once per 30 minutes. Kept in localStorage; if that is blocked, a new id per page load is used.
 */
export function visitorId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    fallback ??= crypto.randomUUID();
    return fallback;
  }
}
