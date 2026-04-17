// Base API client — swap this implementation when backend is ready.
// Currently unused (services read from mockData directly).
// When backend arrives, all services will import from here.

import { API_BASE_URL } from '../config/env';

const AUTH_KEY = 'upensions_auth';
const TOKEN_KEY = 'upensions_token';

export async function apiFetch(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const token = localStorage.getItem(TOKEN_KEY);

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `API error: ${res.status}`);
  }

  return res.json();
}

export const api = {
  get: (path) => apiFetch(path),
  post: (path, data) => apiFetch(path, { method: 'POST', body: JSON.stringify(data) }),
  put: (path, data) => apiFetch(path, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (path) => apiFetch(path, { method: 'DELETE' }),
};
