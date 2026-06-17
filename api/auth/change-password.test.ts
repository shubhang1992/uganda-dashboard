// Unit tests for POST /api/auth/change-password.
//
// The authenticated endpoint behind Settings / Security: bearer → JWT verify
// → look up `users` row → either stamp a hash (initial-set) or verify
// currentPassword then rotate the hash (change). Covers each branch of the
// error vocabulary and confirms the final `users.update` carries the new
// hash on the success path.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  hashPassword,
  verifyPassword,
} from './_lib/password.js';

// ---------------------------------------------------------------------------
// Supabase-admin mock — captures the `update` patch so we can assert the
// new hash was written, and pulls per-table FIFO results for the lookup.
// ---------------------------------------------------------------------------

type CannedResult = { data: unknown; error: unknown };
const fromQueues = new Map<string, CannedResult[]>();
const fromUpdateQueues = new Map<string, CannedResult[]>();
const updateCalls: Array<{ table: string; patch: unknown }> = [];

function queueFrom(table: string, result: CannedResult) {
  if (!fromQueues.has(table)) fromQueues.set(table, []);
  fromQueues.get(table)!.push(result);
}
function queueUpdate(table: string, result: CannedResult) {
  if (!fromUpdateQueues.has(table)) fromUpdateQueues.set(table, []);
  fromUpdateQueues.get(table)!.push(result);
}

function makeChain(table: string) {
  // Two awaitable states per chain: terminated by `.maybeSingle()` (the
  // SELECT path) or by chaining `.update().eq().eq()` and awaiting directly
  // (the UPDATE path). A `then` on the chain handles the second case.
  const state = { isUpdate: false };
  const chain: Record<string, unknown> = {};
  const passThrough = [
    'select', 'insert', 'delete', 'upsert',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    'in', 'is', 'not', 'or', 'filter', 'match',
    'order', 'limit', 'range', 'offset',
  ];
  for (const m of passThrough) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.update = vi.fn((patch: unknown) => {
    state.isUpdate = true;
    updateCalls.push({ table, patch });
    return chain;
  });
  chain.maybeSingle = vi.fn(() => {
    const queued = (fromQueues.get(table) || []).shift();
    return Promise.resolve(queued ?? { data: null, error: null });
  });
  chain.single = chain.maybeSingle;
  // Thenable — only fires when the test code awaits the chain directly
  // (which the route only does after `.update(...)`).
  (chain as Record<string, unknown>).then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected: (e: unknown) => unknown,
  ) => {
    const queued = state.isUpdate
      ? (fromUpdateQueues.get(table) || []).shift()
      : undefined;
    return Promise.resolve(queued ?? { data: null, error: null }).then(
      onFulfilled,
      onRejected,
    );
  };
  return chain;
}

vi.mock('../_lib/supabase-admin.js', () => ({
  default: { from: vi.fn((table: string) => makeChain(table)) },
}));

// ---------------------------------------------------------------------------
// JWT mock — `verifyJwt` returns canned claims; tests can override per-case.
// ---------------------------------------------------------------------------

const verifyJwtMock = vi.fn(async (token: string) => {
  if (token === 'bad-token') throw new Error('invalid');
  return {
    iss: 'upensions',
    sub: 's-0001',
    role: 'authenticated',
    app_role: 'subscriber',
    phone: '+256777247884',
    subscriberId: 's-0001',
    aud: 'authenticated',
    iat: 1700000000,
    exp: 1700086400,
  };
});

vi.mock('../_lib/jwt.js', () => ({
  verifyJwt: (token: string) => verifyJwtMock(token),
}));

// eslint-disable-next-line import/first
import handler from './change-password';

// ---------------------------------------------------------------------------
// Req/Res stubs.
// ---------------------------------------------------------------------------

type StubReq = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

function makeReq(overrides: StubReq = {}): StubReq {
  return { method: 'POST', headers: {}, body: {}, ...overrides };
}

function withBearer(req: StubReq, token: string): StubReq {
  return {
    ...req,
    headers: { ...(req.headers || {}), authorization: `Bearer ${token}` },
  };
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

describe('POST /api/auth/change-password', () => {
  let res: ReturnType<typeof makeRes>;
  // Single hash reused across tests — bcrypt is the slow part.
  let validHash: string;

  async function ensureHash() {
    if (!validHash) validHash = await hashPassword('OldPass123');
    return validHash;
  }

  beforeEach(() => {
    fromQueues.clear();
    fromUpdateQueues.clear();
    updateCalls.length = 0;
    verifyJwtMock.mockClear();
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

  it('sets Cache-Control: no-store on the 405 path (2a.2)', async () => {
    // no-store is set BEFORE the method check, so even a 405 carries it.
    await call(makeReq({ method: 'GET' }), res);
    expect(res.__getStatus()).toBe(405);
    expect(res.__headers['Cache-Control']).toBe('no-store');
  });

  it('returns 405 for PUT/DELETE/PATCH', async () => {
    for (const method of ['PUT', 'DELETE', 'PATCH']) {
      const r = makeRes();
      await call(makeReq({ method }), r);
      expect(r.__getStatus(), method).toBe(405);
    }
  });

  // -------------------------------------------------------------------------
  // Bearer / JWT verification
  // -------------------------------------------------------------------------

  it('returns 401 unauthorized when no Authorization header is present', async () => {
    await call(
      makeReq({ body: { newPassword: 'Demo1234' } }),
      res,
    );
    expect(res.__getStatus()).toBe(401);
    expect(res.__getPayload()).toEqual({ code: 'unauthorized' });
    expect(res.__headers['Cache-Control']).toBe('no-store');
  });

  it('returns 401 unauthorized when the Authorization header is malformed', async () => {
    await call(
      makeReq({
        body: { newPassword: 'Demo1234' },
        headers: { authorization: 'notbearer abc' },
      }),
      res,
    );
    expect(res.__getStatus()).toBe(401);
    expect(res.__getPayload()).toEqual({ code: 'unauthorized' });
  });

  it('returns 401 unauthorized when the JWT verify throws', async () => {
    await call(
      withBearer(
        makeReq({ body: { newPassword: 'Demo1234' } }),
        'bad-token',
      ),
      res,
    );
    expect(res.__getStatus()).toBe(401);
    expect(res.__getPayload()).toEqual({ code: 'unauthorized' });
  });

  // -------------------------------------------------------------------------
  // newPassword shape validation
  // -------------------------------------------------------------------------

  it('returns 400 password_required when newPassword is missing', async () => {
    await call(
      withBearer(makeReq({ body: {} }), 'good-token'),
      res,
    );
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'password_required' });
  });

  it('returns 400 password_too_short when newPassword is under 8 chars', async () => {
    await call(
      withBearer(makeReq({ body: { newPassword: 'short' } }), 'good-token'),
      res,
    );
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'password_too_short' });
  });

  it('returns 400 password_too_weak when newPassword has no digit', async () => {
    await call(
      withBearer(makeReq({ body: { newPassword: 'lettersonly' } }), 'good-token'),
      res,
    );
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'password_too_weak' });
  });

  // -------------------------------------------------------------------------
  // user_not_found
  // -------------------------------------------------------------------------

  it('returns 404 user_not_found when no users row matches the JWT claim', async () => {
    queueFrom('users', { data: null, error: null });
    await call(
      withBearer(
        makeReq({ body: { newPassword: 'Demo1234' } }),
        'good-token',
      ),
      res,
    );
    expect(res.__getStatus()).toBe(404);
    expect(res.__getPayload()).toEqual({ code: 'user_not_found' });
  });

  // -------------------------------------------------------------------------
  // Change flow — existing hash present
  // -------------------------------------------------------------------------

  it('returns 400 current_password_required when row has a hash but body omitted currentPassword', async () => {
    const hash = await ensureHash();
    queueFrom('users', { data: { password_hash: hash }, error: null });
    await call(
      withBearer(
        makeReq({ body: { newPassword: 'NewPass123' } }),
        'good-token',
      ),
      res,
    );
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'current_password_required' });
  });

  it('returns 401 current_password_invalid when currentPassword does not match the stored hash (wrong_old_password)', async () => {
    const hash = await ensureHash();
    queueFrom('users', { data: { password_hash: hash }, error: null });
    await call(
      withBearer(
        makeReq({
          body: {
            currentPassword: 'WrongOld999',
            newPassword: 'NewPass123',
          },
        }),
        'good-token',
      ),
      res,
    );
    expect(res.__getStatus()).toBe(401);
    expect(res.__getPayload()).toEqual({ code: 'current_password_invalid' });
  });

  it('returns 200 + rotates the hash on a valid change (success path writes new hash)', async () => {
    const hash = await ensureHash();
    queueFrom('users', { data: { password_hash: hash }, error: null });
    queueUpdate('users', { data: null, error: null });

    await call(
      withBearer(
        makeReq({
          body: {
            currentPassword: 'OldPass123',
            newPassword: 'NewPass123',
          },
        }),
        'good-token',
      ),
      res,
    );

    expect(res.__getStatus()).toBe(200);
    expect(res.__getPayload()).toEqual({ ok: true, hasPassword: true });

    // The route called `.update({ password_hash: <new bcrypt of NewPass123> })`.
    const writes = updateCalls.filter((c) => c.table === 'users');
    expect(writes).toHaveLength(1);
    const patch = writes[0].patch as { password_hash: string };
    expect(typeof patch.password_hash).toBe('string');
    expect(patch.password_hash).not.toBe(hash);
    // The newly written hash must verify against the new password — proves
    // the route ran the password through hashPassword (not e.g. stored plain).
    expect(await verifyPassword('NewPass123', patch.password_hash)).toBe(true);
    // …and must NOT verify against the old password.
    expect(await verifyPassword('OldPass123', patch.password_hash)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Initial-set flow — no existing hash, currentPassword not required.
  // -------------------------------------------------------------------------

  it('returns 200 on the initial-set flow (row exists but password_hash is null)', async () => {
    queueFrom('users', { data: { password_hash: null }, error: null });
    queueUpdate('users', { data: null, error: null });

    await call(
      withBearer(
        makeReq({ body: { newPassword: 'Demo1234' } }),
        'good-token',
      ),
      res,
    );
    expect(res.__getStatus()).toBe(200);
    expect(res.__getPayload()).toEqual({ ok: true, hasPassword: true });

    const writes = updateCalls.filter((c) => c.table === 'users');
    expect(writes).toHaveLength(1);
    const patch = writes[0].patch as { password_hash: string };
    expect(await verifyPassword('Demo1234', patch.password_hash)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Deactivation gate (H1) — a deactivated distributor / branch / agent /
  // employer holding a still-valid pre-deactivation JWT must NOT be able to
  // rotate its password. The gate runs right after JWT verify (before the
  // users lookup), so no `users` row need be queued.
  // -------------------------------------------------------------------------

  it('returns 403 account_deactivated when the JWT entity is deactivated', async () => {
    // A distributor whose status row is 'inactive'. `isEntityDeactivated`
    // looks up the `distributors` table by id and finds status: 'inactive'.
    verifyJwtMock.mockResolvedValueOnce({
      iss: 'upensions',
      sub: 'd-001',
      role: 'authenticated',
      app_role: 'distributor',
      phone: '+256700000001',
      distributorId: 'd-001',
      aud: 'authenticated',
      iat: 1700000000,
      exp: 1700086400,
    });
    queueFrom('distributors', { data: { status: 'inactive' }, error: null });

    await call(
      withBearer(
        makeReq({
          body: {
            currentPassword: 'OldPass123',
            newPassword: 'NewPass123',
          },
        }),
        'good-token',
      ),
      res,
    );

    expect(res.__getStatus()).toBe(403);
    expect(res.__getPayload()).toEqual({
      code: 'account_deactivated',
      message:
        'This account has been deactivated. Please contact support to reactivate it.',
    });
    expect(res.__headers['Cache-Control']).toBe('no-store');
    // Gate fires before the users lookup/update — no password rotation happens.
    expect(updateCalls.filter((c) => c.table === 'users')).toHaveLength(0);
  });

  it('does not gate a subscriber (status lookup short-circuits, rotation proceeds)', async () => {
    // Default JWT claims are a subscriber — subscriber is never gated even if a
    // (notional) status row existed. Confirms the rotation still completes 200.
    queueFrom('users', { data: { password_hash: null }, error: null });
    queueUpdate('users', { data: null, error: null });

    await call(
      withBearer(
        makeReq({ body: { newPassword: 'Demo1234' } }),
        'good-token',
      ),
      res,
    );

    expect(res.__getStatus()).toBe(200);
    expect(res.__getPayload()).toEqual({ ok: true, hasPassword: true });
  });

  // -------------------------------------------------------------------------
  // DB errors
  // -------------------------------------------------------------------------

  it('returns 500 db_error when the users lookup returns a non-PGRST116 error', async () => {
    queueFrom('users', {
      data: null,
      error: { code: '42501', message: 'permission denied' },
    });
    await call(
      withBearer(
        makeReq({ body: { newPassword: 'Demo1234' } }),
        'good-token',
      ),
      res,
    );
    expect(res.__getStatus()).toBe(500);
    // §11-M1: opaque payload — the raw supabase code/message must NOT leak.
    expect(res.__getPayload()).toEqual({ code: 'db_error' });
  });

  it('returns 500 db_error when the users update returns an error', async () => {
    queueFrom('users', { data: { password_hash: null }, error: null });
    queueUpdate('users', {
      data: null,
      error: { code: '23505', message: 'unique violation' },
    });
    await call(
      withBearer(
        makeReq({ body: { newPassword: 'Demo1234' } }),
        'good-token',
      ),
      res,
    );
    expect(res.__getStatus()).toBe(500);
    // §11-M1: opaque payload — the raw supabase code/message must NOT leak.
    expect(res.__getPayload()).toEqual({ code: 'db_error' });
  });
});
