// Unit tests for the `withAuth` middleware (api/_lib/withAuth.ts).
//
// Contract under test: `withAuth` REQUIRES a valid Bearer JWT. On success the
// wrapped handler runs with `req.user` populated by the decoded claims; on a
// missing / expired / malformed token the wrapper short-circuits with
// 401 `{ error: 'unauthorized' }` and the handler is NEVER invoked.
//
// Mocking strategy (mirrors api/chat.test.ts): swap `verifyJwt` (imported by
// `withAuth` from `./jwt.js`) for a stub keyed off the token string —
// `token:<app_role>` resolves to canned claims, `expired-token` /
// `malformed-token` throw (exactly how the real jose `jwtVerify` signals an
// expired or malformed JWS). `extractBearer` (a pure header parser) is left
// REAL so the full `Authorization: Bearer …` → claims path is exercised.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { JwtClaims, JwtRole } from './jwt.js';

// ---------------------------------------------------------------------------
// JWT mock — `verifyJwt` returns claims for the app_role encoded in the token
// string. `expired-token` and `malformed-token` throw (treated as 401).
// ---------------------------------------------------------------------------

const verifyJwtMock = vi.fn(async (token: string): Promise<JwtClaims> => {
  if (token === 'expired-token') throw new Error('"exp" claim timestamp check failed');
  if (token === 'malformed-token') throw new Error('Invalid Compact JWS');
  const appRole = (token.startsWith('token:')
    ? token.slice('token:'.length)
    : 'subscriber') as JwtRole;
  return {
    iss: 'upensions',
    sub: `${appRole}:+256777000000`,
    // Always the literal Postgres role — the application role lives in app_role.
    role: 'authenticated',
    app_role: appRole,
    phone: '+256777000000',
    aud: 'authenticated',
    iat: 1700000000,
    exp: 1700086400,
  };
});

vi.mock('./jwt.js', () => ({
  verifyJwt: (token: string) => verifyJwtMock(token),
}));

// eslint-disable-next-line import/first
import { withAuth, type AuthedRequest } from './withAuth.js';

// ---------------------------------------------------------------------------
// Req/Res stubs (same minimal shape as api/chat.test.ts).
// ---------------------------------------------------------------------------

type StubReq = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

function makeReq(overrides: StubReq = {}): StubReq {
  return { method: 'GET', headers: {}, body: {}, ...overrides };
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

// ---------------------------------------------------------------------------

describe('withAuth (require a valid Bearer JWT)', () => {
  let res: ReturnType<typeof makeRes>;
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    verifyJwtMock.mockClear();
    res = makeRes();
    handler = vi.fn(async (_req: AuthedRequest, r: ReturnType<typeof makeRes>) => {
      r.status(200).json({ ok: true });
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = (req: StubReq) => withAuth(handler as any)(req as any, res as any);

  // -------------------------------------------------------------------------
  // Happy path: a valid bearer token passes through with decoded claims.
  // -------------------------------------------------------------------------

  it('valid bearer token → handler invoked with the decoded claims on req.user', async () => {
    await run(withBearer(makeReq(), 'token:distributor'));

    expect(verifyJwtMock).toHaveBeenCalledTimes(1);
    expect(verifyJwtMock).toHaveBeenCalledWith('token:distributor');
    expect(handler).toHaveBeenCalledTimes(1);

    // The handler saw the decoded claims attached as req.user.
    const passedReq = handler.mock.calls[0][0] as AuthedRequest;
    expect(passedReq.user).toMatchObject({
      role: 'authenticated',
      app_role: 'distributor',
      phone: '+256777000000',
    });
    // Handler's own response flowed through untouched.
    expect(res.__getStatus()).toBe(200);
    expect(res.__getPayload()).toEqual({ ok: true });
  });

  it('passes the token verbatim to verifyJwt (trims "Bearer " prefix only)', async () => {
    await run(withBearer(makeReq(), 'token:agent'));
    expect(verifyJwtMock).toHaveBeenCalledWith('token:agent');
    expect((handler.mock.calls[0][0] as AuthedRequest).user.app_role).toBe('agent');
  });

  // -------------------------------------------------------------------------
  // 401 paths — handler is NEVER invoked.
  // -------------------------------------------------------------------------

  it('MISSING token (no Authorization header) → 401 unauthorized, handler not invoked', async () => {
    await run(makeReq()); // no Authorization header at all
    expect(res.__getStatus()).toBe(401);
    expect(res.__getPayload()).toEqual({ error: 'unauthorized' });
    expect(handler).not.toHaveBeenCalled();
    // Short-circuited before ever calling verifyJwt.
    expect(verifyJwtMock).not.toHaveBeenCalled();
  });

  it('MISSING token (malformed Authorization header, no "Bearer " prefix) → 401, handler not invoked', async () => {
    await run(makeReq({ headers: { authorization: 'token:agent' } }));
    expect(res.__getStatus()).toBe(401);
    expect(res.__getPayload()).toEqual({ error: 'unauthorized' });
    expect(handler).not.toHaveBeenCalled();
    expect(verifyJwtMock).not.toHaveBeenCalled();
  });

  it('MISSING token (empty Bearer value) → 401, handler not invoked', async () => {
    await run(makeReq({ headers: { authorization: 'Bearer    ' } }));
    expect(res.__getStatus()).toBe(401);
    expect(res.__getPayload()).toEqual({ error: 'unauthorized' });
    expect(handler).not.toHaveBeenCalled();
    expect(verifyJwtMock).not.toHaveBeenCalled();
  });

  it('EXPIRED token (verifyJwt throws on exp) → 401 unauthorized, handler not invoked', async () => {
    await run(withBearer(makeReq(), 'expired-token'));
    expect(verifyJwtMock).toHaveBeenCalledTimes(1);
    expect(res.__getStatus()).toBe(401);
    expect(res.__getPayload()).toEqual({ error: 'unauthorized' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('MALFORMED token (verifyJwt throws on bad JWS) → 401 unauthorized, handler not invoked', async () => {
    await run(withBearer(makeReq(), 'malformed-token'));
    expect(verifyJwtMock).toHaveBeenCalledTimes(1);
    expect(res.__getStatus()).toBe(401);
    expect(res.__getPayload()).toEqual({ error: 'unauthorized' });
    expect(handler).not.toHaveBeenCalled();
  });
});
