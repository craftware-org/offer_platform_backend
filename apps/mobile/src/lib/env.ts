/**
 * Build-time settings. EXPO_PUBLIC_* values are inlined into the bundle when it is built (eas.json sets
 * them per build profile). No React Native imports here, so unit tests can load it.
 */

/** Public origin of the API, e.g. https://api.example.com (no trailing slash). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://13-235-201-166.sslip.io').replace(/\/+$/, '');

/** The website, for pages the app does not have (admin) and for share links. */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://dodoom.vercel.app').replace(/\/+$/, '');

/** Absolute URL for an API path. Accepts "/offers" (→ /api/v1/offers) or a full "/api/v1/..." path from a response. */
export function apiUrl(path: string): string {
  return `${API_URL}${path.startsWith('/api/') ? path : `/api/v1${path}`}`;
}
