import 'server-only';
import { apiUrl } from './config';
import type { AppMeta } from './types';

/** Public, cacheable GET from a Server Component. Returns null for 404 so pages can call notFound(). */
export async function serverGet<T>(path: string, revalidateSeconds = 60): Promise<T | null> {
  const res = await fetch(apiUrl(path), { next: { revalidate: revalidateSeconds } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${path} failed with ${res.status}`);
  return ((await res.json()) as { data: T }).data;
}

const FALLBACK_META: AppMeta = {
  appName: 'Offers',
  publicUrl: '',
  preview: false,
  loginMethods: {
    phone: { available: true, delivery: 'sms' },
    email: { available: true, delivery: 'email' },
  },
  discovery: { defaultRadiusKm: 5, maxRadiusKm: 25, radiusOptionsKm: [2, 5, 10, 25] },
  features: {},
};

/** App name, preview flag etc. from the API (the brand name is configuration, ADR-0009). */
export async function getAppMeta(): Promise<AppMeta> {
  try {
    return (await serverGet<AppMeta>('/meta', 300)) ?? FALLBACK_META;
  } catch {
    return FALLBACK_META;
  }
}
