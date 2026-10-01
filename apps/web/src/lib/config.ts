/** Public origin of the API, e.g. https://api.example.com (no trailing slash). */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** Absolute URL for an API path. Accepts "/offers" (→ /api/v1/offers) or a full "/api/v1/..." path from a response. */
export function apiUrl(path: string): string {
  return `${API_URL}${path.startsWith('/api/') ? path : `/api/v1${path}`}`;
}
