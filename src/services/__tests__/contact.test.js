// contact service tests — exercise both branches of `submitContactForm`.
//
// The backend route returns `{ submitted: true, id }`; the service wraps that
// into `{ ok: true, demo: false, id }`. The X11 parity concern: the mock
// fallback must return `{ ok: true, demo: true }` (same `ok` key, no `id`)
// so callers can render the "demo mode" banner consistently.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn(() => Promise.resolve(JSON.stringify(body))),
    json: vi.fn(() => Promise.resolve(body)),
  };
}

describe('contact service — real (Supabase) branch', () => {
  let submitContactForm;
  beforeEach(async () => {
    const mod = await import('../contact');
    submitContactForm = mod.submitContactForm;
  });

  it('posts to /api/contact and returns { ok, demo: false, id } on success', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ submitted: true, id: 'msg-123' }),
    );
    const res = await submitContactForm({
      name: 'Sarah',
      email: 'sarah@example.com',
      message: 'Hello!',
    });
    expect(res).toEqual({ ok: true, demo: false, id: 'msg-123' });
    // Confirm path + body envelope.
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/contact');
    expect(init.method).toBe('POST');
    const sent = JSON.parse(init.body);
    expect(sent).toEqual({
      name: 'Sarah',
      email: 'sarah@example.com',
      message: 'Hello!',
    });
  });

  it('returns ok with id undefined when route omits id', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ submitted: true }));
    const res = await submitContactForm({ name: 'a', email: 'b', message: 'c' });
    expect(res).toEqual({ ok: true, demo: false, id: undefined });
  });

  it('falls back to mock when /api/contact 404s in dev mode', async () => {
    // In dev (IS_DEV=true by default in vitest env), the catch branch should
    // swallow the error and re-route to the mock payload.
    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ code: 'not_found' }, { status: 404 }),
    );
    const res = await submitContactForm({ name: 'a', email: 'b', message: 'c' });
    expect(res).toEqual({ ok: true, demo: true });
  });

  it('falls back to mock on network failure in dev mode', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const res = await submitContactForm({ name: 'a', email: 'b', message: 'c' });
    expect(res).toEqual({ ok: true, demo: true });
  });
});

describe('contact service — mock-fallback branch (IS_SUPABASE_ENABLED=false)', () => {
  let submitContactForm;

  beforeEach(async () => {
    vi.stubEnv('VITE_USE_SUPABASE', 'false');
    vi.resetModules();
    const mod = await import('../contact');
    submitContactForm = mod.submitContactForm;
  });

  it('does NOT hit the network', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    await submitContactForm({ name: 'a', email: 'b', message: 'c' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns { ok: true, demo: true } from the mock', async () => {
    const res = await submitContactForm({ name: 'a', email: 'b', message: 'c' });
    expect(res).toEqual({ ok: true, demo: true });
  });
});

describe('contact service — real/mock branch parity (X11)', () => {
  it('both branches return objects with the same `ok` key', async () => {
    // Real
    const realMod = await import('../contact');
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ submitted: true, id: 'x' }));
    const real = await realMod.submitContactForm({ name: 'a', email: 'b', message: 'c' });

    // Mock
    vi.stubEnv('VITE_USE_SUPABASE', 'false');
    vi.resetModules();
    const mockMod = await import('../contact');
    const mock = await mockMod.submitContactForm({ name: 'a', email: 'b', message: 'c' });

    expect(real.ok).toBe(true);
    expect(mock.ok).toBe(true);
    // Distinguishable `demo` flag — the load-bearing parity property.
    expect(real.demo).toBe(false);
    expect(mock.demo).toBe(true);
  });
});
