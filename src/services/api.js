// Base API client — swap this implementation when backend is ready.
// Currently unused (services read from mockData directly).
// When backend arrives, all services will import from here.

import { API_BASE_URL } from '../config/env';

const AUTH_KEY = 'upensions_auth';
const TOKEN_KEY = 'upensions_token';

/** localStorage in private-browsing modes can throw; treat as missing. */
function safeRead(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeRemove(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

/**
 * Subscribe to 401 (session-expired) events. Wire AuthContext into this so
 * we can call its `logout` and use react-router's `useNavigate` instead of
 * a hard `window.location.href` reload (which destroys all in-memory state).
 */
const authExpiredListeners = new Set();
export function onAuthExpired(handler) {
  authExpiredListeners.add(handler);
  return () => authExpiredListeners.delete(handler);
}

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

export async function apiFetch(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const token = safeRead(TOKEN_KEY);
  const method = (options.method || 'GET').toUpperCase();

  const headers = { ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (METHODS_WITH_BODY.has(method) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    safeRemove(AUTH_KEY);
    safeRemove(TOKEN_KEY);
    // Notify subscribers (AuthContext clears React state + navigates).
    // Falls back to a soft reload only if no listener is registered.
    if (authExpiredListeners.size === 0) {
      if (typeof window !== 'undefined') window.location.assign('/');
    } else {
      authExpiredListeners.forEach((h) => { try { h(); } catch { /* ignore */ } });
    }
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `API error: ${res.status}`);
  }

  // 204 No Content / empty body
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (path) => apiFetch(path),
  post: (path, data) => apiFetch(path, { method: 'POST', body: JSON.stringify(data) }),
  put: (path, data) => apiFetch(path, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (path) => apiFetch(path, { method: 'DELETE' }),
};
