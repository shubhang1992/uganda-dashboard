// Unit tests for POST /api/auth/verify-otp.
//
// Covers the request-shape validators, the demo wildcard OTP (any 6-digit
// code is accepted), demo-persona fallback IDs, DB-error surfacing, JWT-
// claim parity per role, and the Phase-1 headers (`Cache-Control: no-store`,
// `Allow: POST`).
//
// Mocking strategy: `vi.mock` swaps `supabase-admin` for a fluent chain
// stub whose terminal `.maybeSingle()` returns a per-table FIFO of canned
// `{ data, error }` results; `signJwt` is stubbed to return a sentinel so
// we can introspect what claim shape the route minted without paying the
// cost of real signing.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase-admin mock — fluent chain with per-table FIFO results.
// ---------------------------------------------------------------------------

type CannedResult = { data: unknown; error: unknown };
const fromQueues = new Map<string, CannedResult[]>();
const fromCalls: Array<{ table: string; upsertArg?: unknown }> = [];

function queueFrom(table: string, result: CannedResult) {
  if (!fromQueues.has(table)) fromQueues.set(table, []);
  fromQueues.get(table)!.push(result);
}

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  const passThrough = [
    'select', 'insert', 'update', 'delete',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    'in', 'is', 'not', 'or', 'filter', 'match',
    'order', 'limit', 'range', 'offset',
  ];
  for (const m of passThrough) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // `upsert` captures its argument so we can assert the patch shape.
  chain.upsert = vi.fn((arg: unknown) => {
    fromCalls.push({ table, upsertArg: arg });
    return chain;
  });
  // Terminal — resolves with the queued result for this table.
  chain.maybeSingle = vi.fn(() => {
    const queued = (fromQueues.get(table) || []).shift();
    return Promise.resolve(queued ?? { data: null, error: null });
  });
  chain.single = chain.maybeSingle;
  return chain;
}

vi.mock('../_lib/supabase-admin.js', () => ({
  default: {
    from: vi.fn((table: string) => {
      if (!fromCalls.find((c) => c.table === table)) {
        fromCalls.push({ table });
      }
      return makeChain(table);
    }),
  },
}));

// ---------------------------------------------------------------------------
// JWT mock — return a sentinel and capture the claims the route passed.
// ---------------------------------------------------------------------------

const signJwtMock = vi.fn(async () => 'signed-token-fake');
vi.mock('../_lib/jwt.js', () => ({
  signJwt: (...args: unknown[]) => signJwtMock(...args),
}));

// ---------------------------------------------------------------------------
// Import the handler AFTER mocks are registered so the bindings resolve to
// the stubs above.
// ---------------------------------------------------------------------------

// eslint-disable-next-line import/first
import handler from './verify-otp';

// ---------------------------------------------------------------------------
// Req/Res stubs (same minimal shape as send-otp.test.ts).
// ---------------------------------------------------------------------------

type StubReq = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

function makeReq(overrides: StubReq = {}): StubReq {
  return { method: 'POST', headers: {}, body: {}, ...overrides };
}

function makeRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let payload: unknown = undefined;
  const res = {
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(body: unknown) {
      payload = body;
      return res;
    },
    __headers: headers,
    __getStatus: () => statusCode,
    __getPayload: () => payload,
  };
  return res;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (req: StubReq, res: ReturnType<typeof makeRes>) =>
  handler(req as any, res as any);

// ---------------------------------------------------------------------------

describe('POST /api/auth/verify-otp', () => {
  let res: ReturnType<typeof makeRes>;

  beforeEach(() => {
    fromQueues.clear();
    fromCalls.length = 0;
    signJwtMock.mockClear();
    signJwtMock.mockImplementation(async () => 'signed-token-fake');
    res = makeRes();
  });

  // -------------------------------------------------------------------------
  // Method gate
  // -------------------------------------------------------------------------

  it('returns 405 method_not_allowed + Allow: POST for GET', async () => {
    await call(makeReq({ method: 'GET' }), res);
    expect(res.__getStatus()).toBe(405);
    expect(res.__getPayload()).toEqual({ code: 'method_not_allowed' });
    expect(res.__headers['Allow']).toBe('POST');
  });

  it('returns 405 method_not_allowed for PUT/DELETE/PATCH', async () => {
    for (const method of ['PUT', 'DELETE', 'PATCH']) {
      const r = makeRes();
      await call(makeReq({ method }), r);
      expect(r.__getStatus(), method).toBe(405);
      expect(r.__getPayload(), method).toEqual({ code: 'method_not_allowed' });
    }
  });

  // -------------------------------------------------------------------------
  // Request-shape failures (all surface `invalid_otp` per the route's contract)
  // -------------------------------------------------------------------------

  it('returns 400 invalid_otp when phone is missing', async () => {
    await call(
      makeReq({ body: { otp: '123456', role: 'subscriber' } }),
      res,
    );
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'invalid_otp' });
    expect(res.__headers['Cache-Control']).toBe('no-store');
  });

  it('returns 400 invalid_otp when otp is missing', async () => {
    await call(
      makeReq({ body: { phone: '+256777247884', role: 'subscriber' } }),
      res,
    );
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'invalid_otp' });
  });

  it('returns 400 invalid_otp when otp is not 6 digits', async () => {
    for (const bad of ['12345', '1234567', 'abcdef', '12345a']) {
      const r = makeRes();
      await call(
        makeReq({
          body: { phone: '+256777247884', otp: bad, role: 'subscriber' },
        }),
        r,
      );
      expect(r.__getStatus(), `otp=${bad}`).toBe(400);
      expect(r.__getPayload()).toEqual({ code: 'invalid_otp' });
    }
  });

  it('returns 400 invalid_otp when role is missing or out-of-allow-list', async () => {
    for (const role of [undefined, 'admin', 'employer', 42]) {
      const r = makeRes();
      await call(
        makeReq({
          body: { phone: '+256777247884', otp: '123456', role },
        }),
        r,
      );
      expect(r.__getStatus(), `role=${String(role)}`).toBe(400);
      expect(r.__getPayload()).toEqual({ code: 'invalid_otp' });
    }
  });

  it('surfaces password shape errors before role lookup', async () => {
    await call(
      makeReq({
        body: {
          phone: '+256777247884',
          otp: '123456',
          role: 'subscriber',
          password: 'short',
        },
      }),
      res,
    );
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'password_too_short' });
  });

  // -------------------------------------------------------------------------
  // Demo wildcard OTP — any 6-digit code is accepted (CLAUDE.md §10a).
  // -------------------------------------------------------------------------

  it('accepts ANY 6-digit OTP — wildcard demo behaviour', async () => {
    // Seed: subscriber lookup returns a row, users upsert returns no hash.
    queueFrom('subscribers', {
      data: { id: 's-0007', name: 'Test Subscriber' },
      error: null,
    });
    queueFrom('users', { data: { password_hash: null }, error: null });
    await call(
      makeReq({
        body: {
          phone: '+256777247884',
          // 000000 is not a "magic" value — the route accepts any digits.
          otp: '000000',
          role: 'subscriber',
        },
      }),
      res,
    );
    expect(res.__getStatus()).toBe(200);
    const payload = res.__getPayload() as { token: string; user: unknown };
    expect(payload.token).toBe('signed-token-fake');
    expect(payload.user).toMatchObject({
      role: 'subscriber',
      phone: '+256777247884',
      subscriberId: 's-0007',
      name: 'Test Subscriber',
      hasPassword: false,
    });
  });

  // -------------------------------------------------------------------------
  // Success path — subscriber with a known phone resolves to its row.
  // -------------------------------------------------------------------------

  it('returns 200 + signed JWT for a subscriber whose phone matches a row', async () => {
    queueFrom('subscribers', {
      data: { id: 's-0001', name: 'Brian Okello' },
      error: null,
    });
    queueFrom('users', { data: { password_hash: null }, error: null });

    await call(
      makeReq({
        body: {
          phone: '+256777247884',
          otp: '123456',
          role: 'subscriber',
        },
      }),
      res,
    );

    expect(res.__getStatus()).toBe(200);
    const payload = res.__getPayload() as {
      token: string;
      user: Record<string, unknown>;
    };
    expect(payload.token).toBe('signed-token-fake');
    expect(payload.user).toMatchObject({
      role: 'subscriber',
      phone: '+256777247884',
      subscriberId: 's-0001',
      name: 'Brian Okello',
      hasPassword: false,
    });
    // No agentId/branchId/distributorId on a subscriber payload.
    expect(payload.user.agentId).toBeUndefined();
    expect(payload.user.branchId).toBeUndefined();
    expect(payload.user.distributorId).toBeUndefined();

    // signJwt received the right claim shape.
    expect(signJwtMock).toHaveBeenCalledTimes(1);
    expect(signJwtMock.mock.calls[0][0]).toMatchObject({
      sub: 's-0001',
      role: 'authenticated',
      app_role: 'subscriber',
      phone: '+256777247884',
      subscriberId: 's-0001',
    });
  });

  it('returns hasPassword: true when the upsert leaves a non-null hash', async () => {
    // No password supplied in this request, but a previous run had set one
    // — the users.password_hash returned by maybeSingle reflects that.
    queueFrom('subscribers', {
      data: { id: 's-0001', name: 'Brian' },
      error: null,
    });
    queueFrom('users', {
      data: { password_hash: 'bcrypted' },
      error: null,
    });
    await call(
      makeReq({
        body: {
          phone: '+256777247884',
          otp: '123456',
          role: 'subscriber',
        },
      }),
      res,
    );
    expect(res.__getStatus()).toBe(200);
    expect((res.__getPayload() as { user: { hasPassword: boolean } }).user.hasPassword).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Subscriber demo persona fallback (no row → s-0001).
  // -------------------------------------------------------------------------

  it('falls back to ROLE_DEFAULTS.subscriber (s-0001) when no subscriber row matches', async () => {
    queueFrom('subscribers', { data: null, error: null });
    queueFrom('users', { data: { password_hash: null }, error: null });

    await call(
      makeReq({
        body: {
          phone: '+256711000099',
          otp: '123456',
          role: 'subscriber',
        },
      }),
      res,
    );

    expect(res.__getStatus()).toBe(200);
    const payload = res.__getPayload() as {
      user: { subscriberId: string; name?: string };
    };
    expect(payload.user.subscriberId).toBe('s-0001');
    // Fallback returns no `name` from personas.ts.
    expect(payload.user.name).toBeUndefined();
    expect(signJwtMock.mock.calls[0][0]).toMatchObject({
      sub: 's-0001',
      app_role: 'subscriber',
      subscriberId: 's-0001',
    });
  });

  // -------------------------------------------------------------------------
  // Non-subscriber roles — demo_personas hit and fallback.
  // -------------------------------------------------------------------------

  it.each([
    ['agent', 'a-001', 'agentId'],
    ['branch', 'b-kam-015', 'branchId'],
    ['distributor', 'd-001', 'distributorId'],
  ] as const)(
    'returns the role-scoped %s claim with fallback id %s when demo_personas misses',
    async (role, fallbackId, claimKey) => {
      queueFrom('demo_personas', { data: null, error: null });
      queueFrom('users', { data: { password_hash: null }, error: null });

      await call(
        makeReq({
          body: { phone: '+256711000099', otp: '123456', role },
        }),
        res,
      );
      expect(res.__getStatus()).toBe(200);
      const payload = res.__getPayload() as {
        user: Record<string, unknown>;
      };
      expect(payload.user.role).toBe(role);
      expect(payload.user[claimKey]).toBe(fallbackId);

      expect(signJwtMock.mock.calls[0][0]).toMatchObject({
        sub: fallbackId,
        app_role: role,
        [claimKey]: fallbackId,
      });
    },
  );

  it('uses the demo_personas row when one matches (agent path)', async () => {
    queueFrom('demo_personas', {
      data: { entity_id: 'a-042', label: 'Alice Field-Agent' },
      error: null,
    });
    queueFrom('users', { data: { password_hash: null }, error: null });

    await call(
      makeReq({
        body: {
          phone: '+256777247884',
          otp: '123456',
          role: 'agent',
        },
      }),
      res,
    );
    expect(res.__getStatus()).toBe(200);
    const payload = res.__getPayload() as {
      user: Record<string, unknown>;
    };
    expect(payload.user.agentId).toBe('a-042');
    expect(payload.user.name).toBe('Alice Field-Agent');
  });

  // -------------------------------------------------------------------------
  // DB error on the users upsert → 500 db_error with supabase code.
  // -------------------------------------------------------------------------

  it('returns 500 db_error when the users upsert returns a non-PGRST116 error', async () => {
    queueFrom('subscribers', {
      data: { id: 's-0001', name: 'Brian' },
      error: null,
    });
    queueFrom('users', {
      data: null,
      error: { code: '23505', message: 'duplicate key violation' },
    });

    await call(
      makeReq({
        body: {
          phone: '+256777247884',
          otp: '123456',
          role: 'subscriber',
        },
      }),
      res,
    );

    expect(res.__getStatus()).toBe(500);
    expect(res.__getPayload()).toEqual({
      code: 'db_error',
      message: '23505',
    });
  });

  it('treats PGRST116 on upsert as non-fatal (200, hasPassword reflects request)', async () => {
    queueFrom('subscribers', {
      data: { id: 's-0001', name: 'Brian' },
      error: null,
    });
    queueFrom('users', {
      data: null,
      error: { code: 'PGRST116', message: 'no row' },
    });

    await call(
      makeReq({
        body: {
          phone: '+256777247884',
          otp: '123456',
          role: 'subscriber',
        },
      }),
      res,
    );
    expect(res.__getStatus()).toBe(200);
    expect(
      (res.__getPayload() as { user: { hasPassword: boolean } }).user.hasPassword,
    ).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Phone normalisation — different request forms produce the same canonical
  // phone in the JWT.
  // -------------------------------------------------------------------------

  it('normalises 9-digit local phone to +256… in the JWT', async () => {
    queueFrom('subscribers', { data: null, error: null });
    queueFrom('users', { data: { password_hash: null }, error: null });

    await call(
      makeReq({
        body: { phone: '777247884', otp: '123456', role: 'subscriber' },
      }),
      res,
    );

    expect(res.__getStatus()).toBe(200);
    expect(signJwtMock.mock.calls[0][0]).toMatchObject({
      phone: '+256777247884',
    });
  });

  // -------------------------------------------------------------------------
  // Generic catch — signJwt blowing up surfaces as 500 unexpected_error
  // (distinct from the 4xx invalid_otp vocabulary; BL-39).
  // -------------------------------------------------------------------------

  it('returns 500 unexpected_error on unexpected error (e.g. signJwt failure)', async () => {
    queueFrom('subscribers', {
      data: { id: 's-0001', name: 'Brian' },
      error: null,
    });
    queueFrom('users', { data: { password_hash: null }, error: null });
    signJwtMock.mockRejectedValueOnce(new Error('boom'));

    await call(
      makeReq({
        body: {
          phone: '+256777247884',
          otp: '123456',
          role: 'subscriber',
        },
      }),
      res,
    );
    expect(res.__getStatus()).toBe(500);
    expect(res.__getPayload()).toEqual({ code: 'unexpected_error' });
  });
});
