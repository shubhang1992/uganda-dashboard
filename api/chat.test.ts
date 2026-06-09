// Unit tests for POST /api/chat.
//
// The JWT-optional chat route: a valid bearer token resolves the reply flavor
// from the application role (`app_role`), an unauthenticated caller falls back
// to the body `context`, then to the 'subscriber' default.
//
// The regression these tests pin (BL-12 / audit finding H1): `resolveFlavor`
// must read `req.user.app_role` — NOT `req.user.role`, which is always the
// literal Postgres role `"authenticated"` (see api/_lib/jwt.ts) and would make
// every signed-in distributor/branch/agent silently get the subscriber flavor.
//
// Mocking strategy: swap `verifyJwt` (imported by withOptionalAuth) for a stub
// that returns canned claims carrying both `role: 'authenticated'` and a real
// `app_role`, so the full bearer → withOptionalAuth → resolveFlavor path runs.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { JwtClaims, JwtRole } from './_lib/jwt.js';

// ---------------------------------------------------------------------------
// JWT mock — `verifyJwt` returns claims for the app_role encoded in the token
// string (`token:<app_role>`); 'bad-token' throws (treated as anonymous).
// ---------------------------------------------------------------------------

const verifyJwtMock = vi.fn(async (token: string): Promise<JwtClaims> => {
  if (token === 'bad-token') throw new Error('invalid');
  const appRole = (token.startsWith('token:')
    ? token.slice('token:'.length)
    : 'subscriber') as JwtRole;
  return {
    iss: 'upensions',
    sub: `${appRole}:+256777000000`,
    // Always the literal Postgres role — exactly the trap BL-12 guards against.
    role: 'authenticated',
    app_role: appRole,
    phone: '+256777000000',
    aud: 'authenticated',
    iat: 1700000000,
    exp: 1700086400,
  };
});

vi.mock('./_lib/jwt.js', () => ({
  verifyJwt: (token: string) => verifyJwtMock(token),
}));

// eslint-disable-next-line import/first
import handler from './chat';

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
    __getPayload: () => payload as { reply: string; suggestions?: string[] },
  };
  return res;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (req: StubReq, res: ReturnType<typeof makeRes>) =>
  handler(req as any, res as any);

// The flavor-defining strings each reply path leads with, so assertions don't
// duplicate the whole copy from chat.ts.
const ADMIN_DEFAULT = 'I can help you analyse your pension network data';
const AGENT_GREETING = 'Hi! your agent here. How can I help you today?';
const SUBSCRIBER_DEFAULT = 'I can help with your savings, contributions';

// ---------------------------------------------------------------------------

describe('POST /api/chat', () => {
  let res: ReturnType<typeof makeRes>;

  beforeEach(() => {
    verifyJwtMock.mockClear();
    res = makeRes();
  });

  // -------------------------------------------------------------------------
  // BL-12: authenticated callers get the flavor for their app_role.
  // -------------------------------------------------------------------------

  it('distributor JWT → admin flavor (NOT subscriber)', async () => {
    await call(withBearer(makeReq({ body: { message: 'hello' } }), 'token:distributor'), res);
    expect(res.__getStatus()).toBe(200);
    expect(res.__getPayload().reply).toContain(ADMIN_DEFAULT);
    expect(res.__getPayload().reply).not.toContain(SUBSCRIBER_DEFAULT);
  });

  it('branch JWT → admin flavor', async () => {
    await call(withBearer(makeReq({ body: { message: 'hello' } }), 'token:branch'), res);
    expect(res.__getStatus()).toBe(200);
    expect(res.__getPayload().reply).toContain(ADMIN_DEFAULT);
  });

  it('agent JWT → agent flavor (NOT subscriber)', async () => {
    await call(withBearer(makeReq({ body: { message: 'hi' } }), 'token:agent'), res);
    expect(res.__getStatus()).toBe(200);
    expect(res.__getPayload().reply).toBe(AGENT_GREETING);
    expect(res.__getPayload().reply).not.toContain(SUBSCRIBER_DEFAULT);
  });

  it('subscriber JWT → subscriber flavor', async () => {
    await call(withBearer(makeReq({ body: { message: 'hello' } }), 'token:subscriber'), res);
    expect(res.__getStatus()).toBe(200);
    expect(res.__getPayload().reply).toContain(SUBSCRIBER_DEFAULT);
  });

  it('JWT app_role wins over a conflicting body context (never trust body for an authed caller)', async () => {
    await call(
      withBearer(makeReq({ body: { message: 'hello', context: 'subscriber' } }), 'token:distributor'),
      res,
    );
    expect(res.__getStatus()).toBe(200);
    expect(res.__getPayload().reply).toContain(ADMIN_DEFAULT);
  });

  // -------------------------------------------------------------------------
  // B14: unauthenticated callers fall back to the body `context`.
  // -------------------------------------------------------------------------

  it('unauthenticated + context:admin → admin flavor', async () => {
    await call(makeReq({ body: { message: 'hello', context: 'admin' } }), res);
    expect(res.__getStatus()).toBe(200);
    expect(res.__getPayload().reply).toContain(ADMIN_DEFAULT);
    expect(verifyJwtMock).not.toHaveBeenCalled();
  });

  it('unauthenticated + context:agent → agent flavor', async () => {
    await call(makeReq({ body: { message: 'hi', context: 'agent' } }), res);
    expect(res.__getStatus()).toBe(200);
    expect(res.__getPayload().reply).toBe(AGENT_GREETING);
  });

  it('unauthenticated + no context → subscriber default', async () => {
    await call(makeReq({ body: { message: 'hello' } }), res);
    expect(res.__getStatus()).toBe(200);
    expect(res.__getPayload().reply).toContain(SUBSCRIBER_DEFAULT);
  });

  it('invalid token is treated as anonymous, then falls back to body context', async () => {
    await call(withBearer(makeReq({ body: { message: 'hello', context: 'admin' } }), 'bad-token'), res);
    expect(res.__getStatus()).toBe(200);
    expect(res.__getPayload().reply).toContain(ADMIN_DEFAULT);
  });

  // -------------------------------------------------------------------------
  // Method + shape gates (unchanged behaviour, pinned for regression).
  // -------------------------------------------------------------------------

  it('returns 405 method_not_allowed + Allow: POST + no-store for GET', async () => {
    await call(makeReq({ method: 'GET' }), res);
    expect(res.__getStatus()).toBe(405);
    expect(res.__getPayload()).toEqual({ code: 'method_not_allowed' });
    expect(res.__headers['Allow']).toBe('POST');
    expect(res.__headers['Cache-Control']).toBe('no-store');
  });

  it('returns 400 invalid_message for a non-string message', async () => {
    await call(makeReq({ body: { message: 123 } }), res);
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'invalid_message' });
  });

  it('returns 400 invalid_message for an empty message', async () => {
    await call(makeReq({ body: { message: '   ' } }), res);
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'invalid_message' });
  });

  it('sets Cache-Control: no-store on the success path', async () => {
    await call(makeReq({ body: { message: 'hello' } }), res);
    expect(res.__headers['Cache-Control']).toBe('no-store');
  });

  // -------------------------------------------------------------------------
  // Employer flavor dispatch (audit §7b.3).
  //
  // IMPORTANT — pins the ACTUAL route contract, which differs from the audit's
  // one-line suggestion ("context:'employer' → admin flavor"):
  //   • An EMPLOYER JWT maps through flavorForRole('employer'), which is NOT in
  //     {distributor,branch,admin} → it falls through to the subscriber flavor.
  //   • An unauthenticated body context of 'employer' is NOT one of the three
  //     honored literals ('admin'|'agent'|'subscriber') in resolveFlavor, so it
  //     also falls back to the subscriber default.
  // These two assertions lock that behaviour so a future flavor change (e.g.
  // adding an employer-specific reply) is a deliberate, test-visible decision.
  // -------------------------------------------------------------------------

  it('employer JWT → subscriber flavor (employer is not an admin-flavor role)', async () => {
    await call(withBearer(makeReq({ body: { message: 'hello' } }), 'token:employer'), res);
    expect(res.__getStatus()).toBe(200);
    expect(res.__getPayload().reply).toContain(SUBSCRIBER_DEFAULT);
    expect(res.__getPayload().reply).not.toContain(ADMIN_DEFAULT);
  });

  it('unauthenticated + context:"employer" → subscriber default (employer is not an honored body context)', async () => {
    await call(makeReq({ body: { message: 'hello', context: 'employer' } }), res);
    expect(res.__getStatus()).toBe(200);
    expect(res.__getPayload().reply).toContain(SUBSCRIBER_DEFAULT);
    expect(verifyJwtMock).not.toHaveBeenCalled();
  });

  // Body-size / rate-limit gates live in the server (Express) layer, not this
  // serverless handler — see audit §7b.3 (deferred to server-integration).
});
