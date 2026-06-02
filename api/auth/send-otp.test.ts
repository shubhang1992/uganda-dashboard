// Unit tests for POST /api/auth/send-otp.
//
// The route is a dev-bypass stub — no SMS provider, no DB writes — so the
// coverage surface is the request-shape validators (`phone`, `role`),
// the HTTP method gate, and the `Cache-Control` + `Allow` headers added
// during Phase 1 of the audit cleanup.

import { describe, it, expect, beforeEach } from 'vitest';
import handler from './send-otp';

// Vercel route handlers consume `VercelRequest` / `VercelResponse`. Minimal
// stand-ins below mirror the surface this handler actually touches: method,
// body, setHeader, status, json.

type StubReq = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

function makeReq(overrides: StubReq = {}): StubReq {
  return {
    method: 'POST',
    headers: {},
    body: {},
    ...overrides,
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
    // Test-only accessors.
    __headers: headers,
    __getStatus: () => statusCode,
    __getPayload: () => payload,
  };
  return res;
}

// Cast helpers — VercelRequest/Response are structural, the handler only
// calls the methods stubbed above.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (req: StubReq, res: ReturnType<typeof makeRes>) =>
  handler(req as any, res as any);

describe('POST /api/auth/send-otp', () => {
  let res: ReturnType<typeof makeRes>;

  beforeEach(() => {
    res = makeRes();
  });

  it('returns 200 + { success: true } for a well-formed subscriber request', async () => {
    await call(
      makeReq({ body: { phone: '+256777247884', role: 'subscriber' } }),
      res,
    );
    expect(res.__getStatus()).toBe(200);
    expect(res.__getPayload()).toEqual({ success: true });
    expect(res.__headers['Cache-Control']).toBe('no-store');
  });

  it('accepts the 9-digit local phone form and the 0XX form', async () => {
    // The route normalises through toCanonicalUGPhone, so any of these should
    // pass validation. Run each through a fresh response stub.
    for (const phone of ['777247884', '0777247884', '+256777247884']) {
      const r = makeRes();
      await call(makeReq({ body: { phone, role: 'agent' } }), r);
      expect(r.__getStatus(), `phone=${phone}`).toBe(200);
      expect(r.__getPayload(), `phone=${phone}`).toEqual({ success: true });
    }
  });

  it.each(['subscriber', 'agent', 'branch', 'distributor', 'employer'])(
    'accepts role=%s',
    async (role) => {
      await call(
        makeReq({ body: { phone: '+256777247884', role } }),
        res,
      );
      expect(res.__getStatus()).toBe(200);
      expect(res.__getPayload()).toEqual({ success: true });
    },
  );

  it('returns 400 invalid_request when phone is missing', async () => {
    await call(makeReq({ body: { role: 'subscriber' } }), res);
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'invalid_request' });
    // Cache-Control still set — covers 4xx paths.
    expect(res.__headers['Cache-Control']).toBe('no-store');
  });

  it('returns 400 invalid_request when phone is not a string', async () => {
    await call(
      makeReq({ body: { phone: 1234, role: 'subscriber' } }),
      res,
    );
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'invalid_request' });
  });

  it('returns 400 invalid_request when phone is empty string', async () => {
    await call(
      makeReq({ body: { phone: '', role: 'subscriber' } }),
      res,
    );
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'invalid_request' });
  });

  it('returns 400 invalid_request when phone cannot be canonicalised', async () => {
    // 'abcde' contains no digits — toCanonicalUGPhone returns ''.
    await call(
      makeReq({ body: { phone: 'abcde', role: 'subscriber' } }),
      res,
    );
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'invalid_request' });
  });

  it('returns 400 invalid_request when role is missing', async () => {
    await call(makeReq({ body: { phone: '+256777247884' } }), res);
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'invalid_request' });
  });

  it('returns 400 invalid_request when role is not in the allow-list', async () => {
    await call(
      makeReq({ body: { phone: '+256777247884', role: 'admin' } }),
      res,
    );
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'invalid_request' });
  });

  it('treats an undefined body as an empty object (no crash, 400 invalid_request)', async () => {
    await call(makeReq({ body: undefined }), res);
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'invalid_request' });
  });

  it('returns 405 method_not_allowed + Allow: POST for GET', async () => {
    await call(makeReq({ method: 'GET' }), res);
    expect(res.__getStatus()).toBe(405);
    expect(res.__getPayload()).toEqual({ code: 'method_not_allowed' });
    expect(res.__headers['Allow']).toBe('POST');
  });

  it.each(['PUT', 'DELETE', 'PATCH', 'OPTIONS'])(
    'returns 405 method_not_allowed for method=%s',
    async (method) => {
      const r = makeRes();
      await call(makeReq({ method }), r);
      expect(r.__getStatus()).toBe(405);
      expect(r.__getPayload()).toEqual({ code: 'method_not_allowed' });
      expect(r.__headers['Allow']).toBe('POST');
    },
  );
});
