import { randomUUID } from 'expo-crypto';
import { secureStorage } from './secure-storage';

const KEY = 'op.visitor';
let cached: string | null = null;

/**
 * A random id for counting views and taps of people who are not logged in (owner decision
 * 2026-10-08). It identifies nothing about the person: it only lets the API count the same phone
 * once per 30 minutes. Same rule as the website's visitor id.
 */
export async function visitorId(): Promise<string> {
  if (cached) return cached;
  const existing = await secureStorage.get(KEY);
  cached = existing ?? randomUUID();
  if (!existing) await secureStorage.set(KEY, cached);
  return cached;
}
