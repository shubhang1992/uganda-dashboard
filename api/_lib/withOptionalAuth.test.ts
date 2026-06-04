// Unit tests for the `withOptionalAuth` middleware (api/_lib/withOptionalAuth.ts).
//
// Contract under test: `withOptionalAuth` FAILS OPEN. It attaches
// `req.user: JwtClaims | null` and ALWAYS calls the wrapped handler — a valid
// token populates `req.user`, while no token / an invalid (expired/malformed)
// token leaves `req.user = null` and the request proceeds anonymously rather
// than being rejected. The test names assert this fail-open behaviour
// explicitly so the security posture is documented in the suite output.
//
// Used today only by `/api/chat` (a deliberately public, role-flavoured route),
// so fail-open is intentional there. See the SECURITY note at the bottom: this
// middleware must NOT wrap any data-bearing/authorisation-gated route, because
// a forged/expired token would silently degrade to anonymous instead of 401.
//
// Mocking strategy (mirrors api/chat.test.ts): swap `verifyJwt` for a stub;
// `extractBearer` (a pure header parser) is left REAL.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { JwtClaims, JwtRole } from './jwt.js';

// ---------------------------------------------------------------------------
// JWT mock — valid `token:<app_role>` resolves; `expired-token` /
// `malformed-token` throw (the two ways jose signals a non-acceptable JWS).
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
import { withOptionalAuth, type MaybeAuthedRequest } from './withOptionalAuth.js';

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
  let statusCode = 200;
  let payload: unknown = undefined;
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(body: unknown) {
      payload = body;
      return res;
    },
    __getStatus: () => statusCode,
    __getPayload: () => payload,
  };
  return res;
}

// ---------------------------------------------------------------------------

describe('withOptionalAuth (attach claims when present, FAIL OPEN otherwise)', () => {
  let res: ReturnType<typeof makeRes>;
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    verifyJwtMock.mockClear();
    res = makeRes();
    handler = vi.fn(async (_req: MaybeAuthedRequest, r: ReturnType<typeof makeRes>) => {
      r.status(200).json({ ok: true });
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = (req: StubReq) => withOptionalAuth(handler as any)(req as any, res as any);

  // -------------------------------------------------------------------------
  // Authenticated path: a valid token attaches the decoded claims.
  // -------------------------------------------------------------------------

  it('valid bearer token → handler invoked with decoded claims on req.user', async () => {
    await run(withBearer(makeReq(), 'token:agent'));

    expect(verifyJwtMock).toHaveBeenCalledWith('token:agent');
    expect(handler).toHaveBeenCalledTimes(1);
    const passedReq = handler.mock.calls[0][0] as MaybeAuthedRequest;
    expect(passedReq.user).toMatchObject({ app_role: 'agent', role: 'authenticated' });
    expect(res.__getStatus()).toBe(200);
  });

  // -------------------------------------------------------------------------
  // FAIL-OPEN paths — handler ALWAYS runs, req.user is null, NO 401.
  // -------------------------------------------------------------------------

  it('FAILS OPEN: no token → handler invoked anonymously (req.user = null, NO 401)', async () => {
    await run(makeReq()); // no Authorization header

    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as MaybeAuthedRequest).user).toBeNull();
    // Proceeds — never short-circuits with 401.
    expect(res.__getStatus()).not.toBe(401);
    expect(res.__getStatus()).toBe(200);
    // No token present → verifyJwt is never even called.
    expect(verifyJwtMock).not.toHaveBeenCalled();
  });

  it('FAILS OPEN: EXPIRED token (verifyJwt throws) → treated as anonymous (req.user = null, NO 401)', async () => {
    await run(withBearer(makeReq(), 'expired-token'));

    expect(verifyJwtMock).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as MaybeAuthedRequest).user).toBeNull();
    expect(res.__getStatus()).not.toBe(401);
    expect(res.__getStatus()).toBe(200);
  });

  it('FAILS OPEN: MALFORMED token (verifyJwt throws) → treated as anonymous (req.user = null, NO 401)', async () => {
    await run(withBearer(makeReq(), 'malformed-token'));

    expect(verifyJwtMock).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as MaybeAuthedRequest).user).toBeNull();
    expect(res.__getStatus()).not.toBe(401);
    expect(res.__getStatus()).toBe(200);
  });

  it('FAILS OPEN: header without "Bearer " prefix → treated as anonymous, verifyJwt not called', async () => {
    await run(makeReq({ headers: { authorization: 'token:agent' } }));

    expect(verifyJwtMock).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as MaybeAuthedRequest).user).toBeNull();
    expect(res.__getStatus()).not.toBe(401);
  });

  it('always seeds req.user = null BEFORE parsing, so handlers can rely on the field existing', async () => {
    // Even on the anonymous path the property is explicitly null, never undefined.
    await run(makeReq());
    const passedReq = handler.mock.calls[0][0] as MaybeAuthedRequest;
    expect('user' in passedReq).toBe(true);
    expect(passedReq.user).toBeNull();
  });
});
