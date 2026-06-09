// Unit tests for the singleton Supabase admin client (api/_lib/supabase-admin.ts).
//
// Contract under test:
//  - The default export is a lazy Proxy: `createClient` is NOT called at import
//    time, only on first property access.
//  - When accessed, the client is built with the SERVICE_ROLE key (which
//    bypasses RLS) and the long-lived-process auth options
//    (persistSession/autoRefreshToken/detectSessionInUrl all false — G66).
//  - The URL accepts `SUPABASE_URL` and falls back to `VITE_SUPABASE_URL`.
//  - A missing URL or missing service-role key throws a descriptive error.
//  - The Proxy forwards method calls to the underlying client (`.from()` etc.),
//    binding `this` so the real client's chain works.
//
// Mocking strategy: `vi.mock('@supabase/supabase-js')` replaces `createClient`
// with a spy returning a fake client whose shape we control, so we can assert
// the exact (url, key, options) it was constructed with WITHOUT a network call.
// Env vars are set/restored per test; `vi.resetModules()` clears the module
// singleton's `cached` between cases so each test re-evaluates construction.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// @supabase/supabase-js mock — createClient returns a fake client and records
// the args it was called with. `SupabaseClient` is re-exported as a no-op
// class because supabase-admin.ts imports the type.
// ---------------------------------------------------------------------------

const createClientMock = vi.fn((url: string, key: string, options?: unknown) => ({
  __fake: true,
  __url: url,
  __key: key,
  __options: options,
  from: vi.fn(function (this: unknown, table: string) {
    // Returns `this` so we can prove the Proxy bound the method correctly.
    return { table, boundThis: this };
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string, options?: unknown) =>
    createClientMock(url, key, options),
  SupabaseClient: class {},
}));

// ---------------------------------------------------------------------------

const ORIGINAL_ENV = { ...process.env };

// NOTE: we wrap the default export in a plain holder rather than returning the
// Proxy directly. The lazy Proxy traps EVERY property get — including `then` —
// so `return mod.default` from an async function would let the promise-
// resolution machinery probe `.then`, fire the Proxy `get` trap, and construct
// the client (or throw, if env is missing) BEFORE the test could observe it.
// The holder keeps the Proxy untouched until the test accesses it explicitly.
// (This same `.then`-trap behaviour is flagged as a risk in the findings.)
async function importFreshClient(): Promise<{ client: import('@supabase/supabase-js').SupabaseClient }> {
  // Reset the module registry so the `cached` singleton inside supabase-admin
  // is rebuilt under the current env, then re-import.
  vi.resetModules();
  const mod = await import('./supabase-admin.js');
  return { client: mod.default };
}

describe('supabase-admin singleton client', () => {
  beforeEach(() => {
    createClientMock.mockClear();
    // Start each test from a clean, known env.
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  // -------------------------------------------------------------------------
  // Lazy construction — importing must NOT build the client.
  // -------------------------------------------------------------------------

  it('does NOT call createClient at import time (lazy Proxy)', async () => {
    process.env.SUPABASE_URL = 'https://demo.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
    const { client } = await importFreshClient();
    void client; // hold the Proxy without touching any of its properties
    // No property touched yet → never constructed.
    expect(createClientMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Construction with the SERVICE_ROLE key + long-lived-process auth options.
  // -------------------------------------------------------------------------

  it('builds the client with the SERVICE_ROLE key on first property access', async () => {
    process.env.SUPABASE_URL = 'https://demo.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';

    const { client } = await importFreshClient();
    // Touch a property → triggers getClient().
    void client.from;

    expect(createClientMock).toHaveBeenCalledTimes(1);
    const [url, key] = createClientMock.mock.calls[0];
    expect(url).toBe('https://demo.supabase.co');
    // The service-role key — the whole point of the admin client (bypasses RLS).
    expect(key).toBe('service-role-secret');
  });

  it('passes the long-lived-process auth options (persistSession/autoRefresh/detectSessionInUrl all false)', async () => {
    process.env.SUPABASE_URL = 'https://demo.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';

    const { client } = await importFreshClient();
    void client.from;

    const options = createClientMock.mock.calls[0][2] as {
      auth: { persistSession: boolean; autoRefreshToken: boolean; detectSessionInUrl: boolean };
    };
    expect(options.auth.persistSession).toBe(false);
    expect(options.auth.autoRefreshToken).toBe(false);
    expect(options.auth.detectSessionInUrl).toBe(false);
  });

  it('caches the client — repeated access constructs it only once', async () => {
    process.env.SUPABASE_URL = 'https://demo.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';

    const { client } = await importFreshClient();
    void client.from;
    void client.from;
    void client.from;

    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // URL resolution — SUPABASE_URL preferred, VITE_SUPABASE_URL fallback.
  // -------------------------------------------------------------------------

  it('falls back to VITE_SUPABASE_URL when SUPABASE_URL is unset', async () => {
    process.env.VITE_SUPABASE_URL = 'https://legacy.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';

    const { client } = await importFreshClient();
    void client.from;

    expect(createClientMock.mock.calls[0][0]).toBe('https://legacy.supabase.co');
  });

  it('prefers SUPABASE_URL over VITE_SUPABASE_URL when both are set', async () => {
    process.env.SUPABASE_URL = 'https://new.supabase.co';
    process.env.VITE_SUPABASE_URL = 'https://legacy.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';

    const { client } = await importFreshClient();
    void client.from;

    expect(createClientMock.mock.calls[0][0]).toBe('https://new.supabase.co');
  });

  // -------------------------------------------------------------------------
  // Defensive guards — missing env throws a descriptive error.
  // -------------------------------------------------------------------------

  it('throws a descriptive error when no URL is set', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
    const { client } = await importFreshClient();
    expect(() => void client.from).toThrow(/SUPABASE_URL/);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('throws a descriptive error when the service-role key is missing', async () => {
    process.env.SUPABASE_URL = 'https://demo.supabase.co';
    const { client } = await importFreshClient();
    expect(() => void client.from).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Proxy shape — method calls forward to the underlying client and are bound.
  // -------------------------------------------------------------------------

  it('exposes the underlying client shape and binds methods to the real client', async () => {
    process.env.SUPABASE_URL = 'https://demo.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';

    const { client } = await importFreshClient();
    // `.from` is a function on the proxy…
    expect(typeof client.from).toBe('function');
    // …and calling it forwards to the underlying client (returns its result),
    // with `this` bound to the real client (not the Proxy/undefined).
    const result = client.from('subscribers') as { table: string; boundThis: { __fake?: boolean } };
    expect(result.table).toBe('subscribers');
    expect(result.boundThis.__fake).toBe(true);
  });
});
