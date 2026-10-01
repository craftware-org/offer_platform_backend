import { apiUrl } from './config';
import type { PageMeta, Paged } from './types';

/** An error response from the API ({ success: false, error: { code, message, fields } }). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
    readonly requestId?: string,
  ) {
    super(message);
  }
}

/** Human message for any thrown value, including field errors ("phone: Invalid phone number"). */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const fields = Object.entries(error.fields).map(([k, v]) => `${k}: ${v}`);
    return fields.length ? `${error.message} (${fields.join('; ')})` : error.message;
  }
  if (error instanceof TypeError) return 'Cannot reach the server. Check your connection and try again.';
  return error instanceof Error ? error.message : 'Something went wrong';
}

// ---- Session (browser only) -----------------------------------------------------------------
// ADR-0014: the access token lives in memory only; the rotating refresh token in localStorage.

const REFRESH_KEY = 'offer-platform.refresh-token';
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

const storage = () => (typeof window === 'undefined' ? null : window.localStorage);

export const session = {
  hasRefreshToken: () => !!storage()?.getItem(REFRESH_KEY),
  set(tokens: { accessToken: string; refreshToken: string }) {
    accessToken = tokens.accessToken;
    storage()?.setItem(REFRESH_KEY, tokens.refreshToken);
    listeners.forEach((l) => l());
  },
  clear() {
    accessToken = null;
    storage()?.removeItem(REFRESH_KEY);
    listeners.forEach((l) => l());
  },
  refreshToken: () => storage()?.getItem(REFRESH_KEY) ?? null,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/**
 * Exchanges the refresh token for a new pair. Concurrent callers share ONE request: refresh tokens are
 * single-use and the API treats a reused token as theft (it revokes the whole session).
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = session.refreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(apiUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        // Only a definitive rejection ends the session; network/5xx errors keep it for a retry.
        if (res.status === 401 || res.status === 400) session.clear();
        return false;
      }
      const body = (await res.json()) as { data: { accessToken: string; refreshToken: string } };
      session.set(body.data);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// ---- Requests ---------------------------------------------------------------------------------

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** JSON body. */
  body?: unknown;
  /** Multipart body (image uploads). */
  form?: FormData;
  /** Query parameters; undefined, null and '' values are skipped. */
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Send the access token (refreshing it first if needed). Default true. */
  auth?: boolean;
  signal?: AbortSignal;
}

function withQuery(path: string, query?: RequestOptions['query']): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  const qs = params.toString();
  return qs ? `${path}${path.includes('?') ? '&' : '?'}${qs}` : path;
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const auth = opts.auth ?? true;
  if (auth && !accessToken && session.hasRefreshToken()) await refreshSession();

  const doFetch = () => {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return fetch(apiUrl(withQuery(path, opts.query)), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: opts.signal,
    });
  };

  let res = await doFetch();
  if (res.status === 401 && auth && session.hasRefreshToken() && (await refreshSession())) {
    res = await doFetch();
  }
  return res;
}

async function failure(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as {
      error?: { code: string; message: string; fields?: Record<string, string> };
      requestId?: string;
    };
    if (body.error) {
      return new ApiError(res.status, body.error.code, body.error.message, body.error.fields, body.requestId);
    }
  } catch {
    // not JSON
  }
  return new ApiError(res.status, 'HTTP_ERROR', `Request failed (${res.status})`);
}

/** Calls the API and returns `data` from the success envelope. */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, opts);
  if (!res.ok) throw await failure(res);
  if (res.status === 204) return undefined as T;
  const body = (await res.json()) as { data: T };
  return body.data;
}

/** Paginated list: `data` plus `meta`. */
export async function apiPage<T, M = Record<string, unknown>>(
  path: string,
  opts: RequestOptions = {},
): Promise<Paged<T> & { meta: PageMeta & M }> {
  const res = await send(path, opts);
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { data: T[]; meta: PageMeta & M };
  return { items: body.data, meta: body.meta };
}

/** Binary download with auth (private images), as a Blob. */
export async function apiBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const res = await send(path, { signal });
  if (!res.ok) throw await failure(res);
  return res.blob();
}
