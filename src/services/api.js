// Thin wrapper around fetch() for same-origin /api/* routes (Vercel functions).
//
// Responsibilities:
//   - JWT injection: reads `localStorage['upensions_token']` and sets
//     `Authorization: Bearer <token>` on every request.
//   - 401 detection: notifies all `onAuthExpired` listeners and clears local
//     auth keys before throwing.
//   - Convenience wrappers: api.get / post / put / delete.
//
// `vercel.json` rewrites everything except `/api/*` and `/assets/*` to
// `/index.html`, so the same-origin `/api` prefix works in dev (`vercel dev`)
// and production. The prefix is read from `src/config/env.js` (`API_BASE_URL`)
// which honours `VITE_API_BASE_URL` when set and falls back to `/api`. Override
// the env var only if the `/api/*` routes are hosted elsewhere (separate
// origin, preview vs. prod split, etc.).
//
// `VITE_USE_SUPABASE` is the rollback feature flag. When set to the string
// `'false'` it flips `IS_SUPABASE_ENABLED` off; downstream services can branch
// on it to fall back to mocks.

import { API_BASE_URL } from '../config/env';

const AUTH_KEY = 'upensions_auth';
const TOKEN_KEY = 'upensions_token';

const API_PREFIX = API_BASE_URL;

/** Rollback feature flag (string env -> boolean). Default ON. */
export const IS_SUPABASE_ENABLED =
  String(import.meta.env.VITE_USE_SUPABASE ?? 'true').toLowerCase() !== 'false';

/** localStorage in private-browsing modes can throw; treat as missing. */
function safeRead(key) {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function safeRemove(key) {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Subscribe to 401 (session-expired) events. AuthContext wires its `logout`
 * + `useNavigate('/')` into this so we never hard-reload the page (which
 * would destroy in-memory React Query state).
 */
const authExpiredListeners = new Set();
export function onAuthExpired(handler) {
  authExpiredListeners.add(handler);
  return () => authExpiredListeners.delete(handler);
}

function notifyAuthExpired() {
  safeRemove(AUTH_KEY);
  safeRemove(TOKEN_KEY);
  if (authExpiredListeners.size === 0) {
    if (typeof window !== 'undefined') window.location.assign('/');
    return;
  }
  authExpiredListeners.forEach((h) => {
    try { h(); } catch { /* ignore listener failure */ }
  });
}

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

/**
 * Fire a request against an `/api/*` Vercel route.
 *
 * @param {string} path - Path beginning with `/`, e.g. `/auth/verify-otp`.
 * @param {RequestInit} [options] - Standard fetch options.
 * @returns {Promise<any>} Parsed JSON body (or null on 204).
 * @throws {Error} On non-OK responses. The thrown error has a `code` (from the
 *   response body's `error` or `code` field), `status` (HTTP status), and an
 *   optional `body` (the parsed JSON). 401 fires `onAuthExpired` listeners
 *   before throwing.
 */
export async function apiFetch(path, options = {}) {
  const url = `${API_PREFIX}${path}`;
  const token = safeRead(TOKEN_KEY);
  const method = (options.method || 'GET').toUpperCase();

  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (METHODS_WITH_BODY.has(method) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    // Read the body once so we can distinguish "the token itself is bad"
    // (no code, session_expired, or unauthorized — all server signals that
    // the JWT is missing/expired/invalid) from a domain-level 401 like
    // `password_not_set`, `invalid_password`, or `current_password_invalid`
    // that the caller needs to handle without being logged out.
    const body = await res.json().catch(() => ({}));
    const code = body?.error || body?.code;
    if (!code || code === 'session_expired' || code === 'unauthorized') {
      notifyAuthExpired();
      const err = new Error('Session expired');
      err.code = 'session_expired';
      err.status = 401;
      throw err;
    }
    const message = body?.message || code || `API error: ${res.status}`;
    const err = new Error(message);
    err.code = code;
    err.status = 401;
    err.body = body;
    throw err;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const code = body?.error || body?.code;
    const message = body?.message || code || `API error: ${res.status}`;
    const err = new Error(message);
    err.code = code;
    err.status = res.status;
    err.body = body;
    throw err;
  }

  if (res.status === 204) return null;

  // Some routes return empty bodies on 200 (no Content-Type / zero length).
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Convenience wrappers around `apiFetch`.
 *
 * The third `options` argument on body-bearing methods is optional and supports
 * `{ headers: {...} }` — handy for forwarding per-call headers like
 * `X-QA-Force` from the KYC service without polluting the global `Authorization`
 * + `Content-Type` defaults handled inside `apiFetch`. Any keys passed in
 * `options.headers` are merged on top of the defaults.
 */
export const api = {
  get: (path, options = {}) => apiFetch(path, { ...options }),
  post: (path, data, options = {}) =>
    apiFetch(path, { ...options, method: 'POST', body: JSON.stringify(data ?? {}) }),
  put: (path, data, options = {}) =>
    apiFetch(path, { ...options, method: 'PUT', body: JSON.stringify(data ?? {}) }),
  delete: (path, options = {}) => apiFetch(path, { ...options, method: 'DELETE' }),
};
