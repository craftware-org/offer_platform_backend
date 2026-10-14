import { apiUrl, USER_AGENT } from './config';
import { secureStorage } from './secure-storage';
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

/** Human message for any thrown value, including field errors ("Use at least 8 characters"). */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const fields = Object.values(error.fields);
    return fields.length ? fields.join(' ') : error.message;
  }
  if (error instanceof Error && error.name === 'AbortError') return 'The server took too long to answer. Try again.';
  // React Native's fetch throws TypeError("Network request failed") when offline.
  if (error instanceof TypeError) return 'Cannot reach the server. Check your internet connection and try again.';
  return error instanceof Error ? error.message : 'Something went wrong';
}

// ---- Session --------------------------------------------------------------------------------------
// ADR-0006: the mobile app keeps the rotating refresh token in secure storage (Android Keystore) and
// the 15-minute access token in memory only.

const REFRESH_KEY = 'op.refresh-token';
let accessToken: string | null = null;
let refreshToken: string | null = null;
let loaded = false;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const session = {
  /** Reads the saved refresh token once, at app start. */
  async load(): Promise<void> {
    if (loaded) return;
    refreshToken = await secureStorage.get(REFRESH_KEY);
    loaded = true;
  },
  hasRefreshToken: () => !!refreshToken,
  refreshToken: () => refreshToken,
  async set(tokens: { accessToken: string; refreshToken: string }) {
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
    await secureStorage.set(REFRESH_KEY, tokens.refreshToken);
    notify();
  },
  async clear() {
    accessToken = null;
    refreshToken = null;
    await secureStorage.remove(REFRESH_KEY);
    notify();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

const TIMEOUT_MS = 20_000;

function timedFetch(url: string, init: RequestInit & { signal?: AbortSignal }): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const outer = init.signal;
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * Exchanges the refresh token for a new pair. Concurrent callers share ONE request: refresh tokens are
 * single-use and the API treats a reused token as theft (it revokes the whole session).
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    await session.load();
    const token = refreshToken;
    if (!token) return false;
    try {
      const res = await timedFetch(apiUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
        body: JSON.stringify({ refreshToken: token }),
      });
      if (!res.ok) {
        // Only a definitive rejection ends the session; network/5xx errors keep it for a retry.
        if (res.status === 401 || res.status === 400) await session.clear();
        return false;
      }
      const body = (await res.json()) as { data: { accessToken: string; refreshToken: string } };
      await session.set(body.data);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Current access token (refreshing it first if needed), for image requests that need auth. */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!accessToken && session.hasRefreshToken()) await refreshSession();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

// ---- Requests ---------------------------------------------------------------------------------------

/** A picked image, uploaded as multipart field "file". */
export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** JSON body. */
  body?: unknown;
  /** Image upload (multipart/form-data, field "file"). */
  file?: UploadFile;
  /** Query parameters; undefined, null and '' values are skipped. */
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Send the access token (refreshing it first if needed). Default true. */
  auth?: boolean;
  signal?: AbortSignal;
}

export function withQuery(path: string, query?: RequestOptions['query']): string {
  if (!query) return path;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `${path}${path.includes('?') ? '&' : '?'}${parts.join('&')}` : path;
}

function formFor(file: UploadFile): FormData {
  const form = new FormData();
  // React Native's FormData accepts { uri, name, type } for files.
  form.append('file', file as unknown as Blob);
  return form;
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const auth = opts.auth ?? true;
  await session.load();
  if (auth && !accessToken && session.hasRefreshToken()) await refreshSession();

  const doFetch = () => {
    const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': USER_AGENT };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return timedFetch(apiUrl(withQuery(path, opts.query)), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.file ? formFor(opts.file) : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
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
