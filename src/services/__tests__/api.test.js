// api service tests — exercises the thin fetch wrapper in `services/api.js`.
//
// Strategy: stub `global.fetch` per test and assert that apiFetch / api.{get,
// post, put, delete} build the right URL + headers, raise the right errors,
// and notify `onAuthExpired` listeners on session-bound 401s. We never hit
// the network.
//
// Notes:
//   - `IS_SUPABASE_ENABLED` is module-level — see the dedicated subscribe-time
//     test below that re-imports the module under a stubbed env to flip it.
//   - 401 error parsing tolerates both `error` and `code` body shapes
//     (Phase 1D unified the wire envelope; tests cover the legacy + new shape).

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  apiFetch,
  api,
  onAuthExpired,
  IS_SUPABASE_ENABLED,
} from '../api';

const AUTH_KEY = 'upensions_auth';
const TOKEN_KEY = 'upensions_token';

function jsonResponse(body, { status = 200, statusText = 'OK' } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: vi.fn(() => Promise.resolve(text)),
    json: vi.fn(() => Promise.resolve(typeof body === 'string' ? JSON.parse(text || '{}') : body)),
  };
}

function emptyResponse({ status = 204, statusText = 'No Content' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: vi.fn(() => Promise.resolve('')),
    json: vi.fn(() => Promise.resolve({})),
  };
}

beforeEach(() => {
  // Clean slate between tests — clear listeners by spinning up a new one and
  // unsubscribing immediately so the internal Set is empty for the next test.
  window.localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('api service', () => {
  describe('IS_SUPABASE_ENABLED', () => {
    it('defaults to true when VITE_USE_SUPABASE is unset', () => {
      // Module-level constant — the imported value reflects the build-time env.
      // In tests the env defaults so we expect truthy. (See dynamic-import
      // test below for the "false" path.)
      expect(typeof IS_SUPABASE_ENABLED).toBe('boolean');
    });

    it('flips to false when VITE_USE_SUPABASE === "false" (re-imported module)', async () => {
      // Re-import the module under a stubbed env to prove the flag flips. The
      // top-level binding above keeps the original value; this only affects
      // the freshly-imported instance.
      vi.stubEnv('VITE_USE_SUPABASE', 'false');
      vi.resetModules();
      const fresh = await import('../api');
      expect(fresh.IS_SUPABASE_ENABLED).toBe(false);
    });

    it('is true when VITE_USE_SUPABASE === "true" (re-imported module)', async () => {
      vi.stubEnv('VITE_USE_SUPABASE', 'true');
      vi.resetModules();
      const fresh = await import('../api');
      expect(fresh.IS_SUPABASE_ENABLED).toBe(true);
    });
  });

  describe('apiFetch()', () => {
    it('prefixes /api and forwards to fetch with default headers', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));
      const result = await apiFetch('/auth/verify-otp');
      expect(result).toEqual({ ok: true });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('/api/auth/verify-otp');
      // No body-bearing method → no Content-Type default; no token → no Auth.
      expect(init.headers.Authorization).toBeUndefined();
      expect(init.headers['Content-Type']).toBeUndefined();
    });

    it('injects Authorization: Bearer <token> when localStorage has a token', async () => {
      window.localStorage.setItem(TOKEN_KEY, 'abc.def.ghi');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));
      await apiFetch('/path');
      expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe('Bearer abc.def.ghi');
    });

    it('sets Content-Type: application/json for body-bearing methods', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));
      await apiFetch('/path', { method: 'POST', body: JSON.stringify({}) });
      expect(fetchSpy.mock.calls[0][1].headers['Content-Type']).toBe('application/json');
    });

    it('does not overwrite a caller-supplied Content-Type', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));
      await apiFetch('/path', {
        method: 'POST',
        body: 'plain',
        headers: { 'Content-Type': 'text/plain' },
      });
      expect(fetchSpy.mock.calls[0][1].headers['Content-Type']).toBe('text/plain');
    });

    it('returns null on 204 No Content', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(emptyResponse({ status: 204 }));
      const result = await apiFetch('/whatever');
      expect(result).toBeNull();
    });

    it('returns null on 200 with empty body', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn(() => Promise.resolve('')),
        json: vi.fn(() => Promise.resolve({})),
      });
      const result = await apiFetch('/whatever');
      expect(result).toBeNull();
    });

    it('returns raw text when the body is not JSON', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn(() => Promise.resolve('plain text not json')),
        json: vi.fn(() => Promise.reject(new Error('not json'))),
      });
      const result = await apiFetch('/whatever');
      expect(result).toBe('plain text not json');
    });

    it('parses error from body.error field (legacy shape)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ error: 'validation_failed', message: 'Bad input' }, { status: 400 }),
      );
      await expect(apiFetch('/v')).rejects.toMatchObject({
        code: 'validation_failed',
        status: 400,
        message: 'Bad input',
      });
    });

    it('parses error from body.code field (unified shape after Phase 1D)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ code: 'rate_limited', message: 'Slow down' }, { status: 429 }),
      );
      await expect(apiFetch('/v')).rejects.toMatchObject({
        code: 'rate_limited',
        status: 429,
      });
    });

    it('falls back to "API error: <status>" when 4xx body has no code or message', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({}, { status: 400 }),
      );
      await expect(apiFetch('/v')).rejects.toThrow('API error: 400');
    });

    it('attaches the parsed body to the error for non-401 failures', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ code: 'failed', extra: 'data' }, { status: 400 }),
      );
      try {
        await apiFetch('/v');
        throw new Error('expected throw');
      } catch (err) {
        expect(err.body).toEqual({ code: 'failed', extra: 'data' });
      }
    });

    it('maps 5xx into server_unavailable (G48) after the single retry', async () => {
      // First call and retry both return 500 → final throw is server_unavailable.
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({}, { status: 500 }),
      );
      await expect(apiFetch('/v')).rejects.toMatchObject({
        code: 'server_unavailable',
        status: 500,
      });
    });

    it('handles JSON-parse failure on 5xx as server_unavailable', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn(() => Promise.reject(new Error('parse fail'))),
        text: vi.fn(() => Promise.resolve('')),
      });
      await expect(apiFetch('/v')).rejects.toMatchObject({ code: 'server_unavailable' });
    });
  });

  describe('apiFetch — idempotent retry gating (Task 2.1)', () => {
    it('(a) retries a GET once on a transient 5xx, then succeeds', async () => {
      // First attempt 500 (transient cold-start), retry resolves 200 → success.
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({}, { status: 500 }))
        .mockResolvedValueOnce(jsonResponse({ ok: true }));
      const result = await apiFetch('/things'); // default method GET
      expect(result).toEqual({ ok: true });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('(b) does NOT retry a POST on a 5xx — single attempt, surfaces error', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({}, { status: 500 }));
      await expect(
        apiFetch('/things', { method: 'POST', body: JSON.stringify({ a: 1 }) }),
      ).rejects.toMatchObject({ code: 'server_unavailable', status: 500 });
      // Write must fast-fail: exactly one fetch call, no replay.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('(b) does NOT retry a PUT on a 5xx — single attempt, surfaces error', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({}, { status: 500 }));
      await expect(
        apiFetch('/things/1', { method: 'PUT', body: JSON.stringify({ a: 1 }) }),
      ).rejects.toMatchObject({ code: 'server_unavailable' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('(b) does NOT retry a DELETE on a 5xx — single attempt, surfaces error', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({}, { status: 500 }));
      await expect(
        apiFetch('/things/1', { method: 'DELETE' }),
      ).rejects.toMatchObject({ code: 'server_unavailable' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('(b) does NOT retry a POST on a transient timeout (AbortError) — surfaces error', async () => {
      const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortErr);
      await expect(
        apiFetch('/things', { method: 'POST', body: JSON.stringify({ a: 1 }) }),
      ).rejects.toMatchObject({ code: 'timeout' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('retries a GET once on a transient timeout (AbortError), then succeeds', async () => {
      const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(abortErr)
        .mockResolvedValueOnce(jsonResponse({ ok: true }));
      const result = await apiFetch('/things'); // GET
      expect(result).toEqual({ ok: true });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('(c) does NOT retry a non-JSON 4xx write (POST) — single attempt, surfaces server_unavailable', async () => {
      // 4xx with an HTML (non-JSON) body, e.g. a CDN/LB page in front of the
      // Express server. After the fold, this branch is gated on the idempotent
      // method check, so a write (POST) never retries — exactly one fetch call.
      const htmlResponse = {
        ok: false,
        status: 400,
        headers: { get: () => 'text/html' },
        text: vi.fn(() => Promise.resolve('<html>nope</html>')),
        json: vi.fn(() => Promise.resolve({})),
      };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlResponse);
      await expect(
        apiFetch('/things', { method: 'POST', body: JSON.stringify({ a: 1 }) }),
      ).rejects.toMatchObject({
        code: 'server_unavailable',
        status: 400,
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('a non-JSON 4xx GET stays inside the idempotent gate (retries once, still surfaces error)', async () => {
      // GET is idempotent, so the folded branch still permits the single G49
      // retry. Both attempts return the same HTML 4xx, so it ultimately throws.
      const htmlResponse = {
        ok: false,
        status: 400,
        headers: { get: () => 'text/html' },
        text: vi.fn(() => Promise.resolve('<html>nope</html>')),
        json: vi.fn(() => Promise.resolve({})),
      };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlResponse);
      await expect(apiFetch('/things')).rejects.toMatchObject({
        code: 'server_unavailable',
        status: 400,
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('apiFetch — 401 handling', () => {
    it('fires onAuthExpired listeners on bare 401 (no code)', async () => {
      const handler = vi.fn();
      const unsubscribe = onAuthExpired(handler);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({}, { status: 401 }),
      );
      await expect(apiFetch('/x')).rejects.toMatchObject({
        code: 'session_expired',
        status: 401,
      });
      expect(handler).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('fires onAuthExpired on session_expired code', async () => {
      const handler = vi.fn();
      const unsubscribe = onAuthExpired(handler);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ code: 'session_expired' }, { status: 401 }),
      );
      await expect(apiFetch('/x')).rejects.toMatchObject({ code: 'session_expired' });
      expect(handler).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('fires onAuthExpired on unauthorized code', async () => {
      const handler = vi.fn();
      const unsubscribe = onAuthExpired(handler);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ error: 'unauthorized' }, { status: 401 }),
      );
      await expect(apiFetch('/x')).rejects.toMatchObject({ code: 'session_expired' });
      expect(handler).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('does NOT fire onAuthExpired on domain-level 401 (e.g. invalid_password)', async () => {
      const handler = vi.fn();
      const unsubscribe = onAuthExpired(handler);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ code: 'invalid_password', message: 'Wrong password' }, { status: 401 }),
      );
      await expect(apiFetch('/x')).rejects.toMatchObject({
        code: 'invalid_password',
        status: 401,
        message: 'Wrong password',
      });
      expect(handler).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('clears localStorage on session-expired 401', async () => {
      window.localStorage.setItem(AUTH_KEY, '{"id":"x"}');
      window.localStorage.setItem(TOKEN_KEY, 'tok');
      const handler = vi.fn();
      const unsubscribe = onAuthExpired(handler);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, { status: 401 }));
      await expect(apiFetch('/x')).rejects.toThrow();
      expect(window.localStorage.getItem(AUTH_KEY)).toBeNull();
      expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
      unsubscribe();
    });

    it('navigates to / when no listeners are registered', async () => {
      // window.location.assign is read-only in jsdom by default — stub it.
      const assignSpy = vi.fn();
      vi.stubGlobal('location', { ...window.location, assign: assignSpy });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, { status: 401 }));
      await expect(apiFetch('/x')).rejects.toThrow();
      expect(assignSpy).toHaveBeenCalledWith('/');
    });
  });

  describe('onAuthExpired()', () => {
    it('returns an unsubscribe function', async () => {
      const handler = vi.fn();
      const unsubscribe = onAuthExpired(handler);
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
      // After unsubscribe, fire a 401 and confirm the handler is no longer called.
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, { status: 401 }));
      // Also need to register a placeholder so notifyAuthExpired doesn't try to
      // navigate (it asserts at least one listener exists; otherwise it calls
      // location.assign which we don't want in this test).
      const placeholder = vi.fn();
      const unsubPlaceholder = onAuthExpired(placeholder);
      await expect(apiFetch('/x')).rejects.toThrow();
      expect(handler).not.toHaveBeenCalled();
      unsubPlaceholder();
    });

    it('swallows listener exceptions so other listeners still fire', async () => {
      const bad = vi.fn(() => { throw new Error('boom'); });
      const good = vi.fn();
      const unsubBad = onAuthExpired(bad);
      const unsubGood = onAuthExpired(good);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, { status: 401 }));
      await expect(apiFetch('/x')).rejects.toThrow();
      expect(bad).toHaveBeenCalledTimes(1);
      expect(good).toHaveBeenCalledTimes(1);
      unsubBad();
      unsubGood();
    });
  });

  describe('api convenience wrappers', () => {
    it('api.get issues a GET (no body)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));
      await api.get('/things');
      const init = fetchSpy.mock.calls[0][1];
      expect(init.method ?? 'GET').toBe('GET');
      expect(init.body).toBeUndefined();
    });

    it('api.post issues a POST with JSON-encoded body', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));
      await api.post('/things', { a: 1 });
      const init = fetchSpy.mock.calls[0][1];
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify({ a: 1 }));
      expect(init.headers['Content-Type']).toBe('application/json');
    });

    it('api.post encodes null payload as "{}" (defensive default)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));
      await api.post('/things');
      expect(fetchSpy.mock.calls[0][1].body).toBe('{}');
    });

    it('api.put issues a PUT with JSON-encoded body', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));
      await api.put('/things', { a: 2 });
      const init = fetchSpy.mock.calls[0][1];
      expect(init.method).toBe('PUT');
      expect(init.body).toBe(JSON.stringify({ a: 2 }));
    });

    it('api.delete issues a DELETE', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));
      await api.delete('/things/x');
      expect(fetchSpy.mock.calls[0][1].method).toBe('DELETE');
    });

    it('merges custom headers on top of defaults', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));
      await api.post('/things', { a: 1 }, { headers: { 'X-QA-Force': 'fail' } });
      const headers = fetchSpy.mock.calls[0][1].headers;
      expect(headers['X-QA-Force']).toBe('fail');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('maps TypeError fetch rejection to network_unreachable (G50)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      await expect(api.get('/things')).rejects.toMatchObject({ code: 'network_unreachable' });
    });
  });
});
