// Tests for POST /api/kyc/otp-verify.
//
// Covers: success on a 4-digit non-0000 code, '0000' typo → verified:false,
// the x-qa-force:fail short-circuit (QA override), phone canonicalisation,
// invalid-phone 400, latency hook, and method-not-allowed semantics.
//
// Per B16, this route returns 200 + { verified: false } for *verification*
// refusals (wrong code, forced fail) — only *input* errors (missing/invalid
// phone) return 4xx.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from './otp-verify';

function buildReq(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'POST',
    headers: {},
    body: {},
    ...overrides,
  } as VercelRequest;
}

function buildRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
  };
  return res as unknown as VercelResponse & {
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
  };
}

describe('POST /api/kyc/otp-verify', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 200 + verified:true for any valid 4-digit code', async () => {
    const req = buildReq({ body: { phone: '+256701234567', code: '1234' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(700);
    await pending;
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ verified: true });
  });

  it('returns 200 + verified:false for the 0000 typo code', async () => {
    const req = buildReq({ body: { phone: '+256701234567', code: '0000' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(700);
    await pending;
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ verified: false });
  });

  it('returns 200 + verified:false for a code with wrong length', async () => {
    const req = buildReq({ body: { phone: '+256701234567', code: '12345' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(700);
    await pending;
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ verified: false });
  });

  it('honours x-qa-force:fail header (QA override short-circuits to verified:false)', async () => {
    const req = buildReq({
      body: { phone: '+256701234567', code: '1234' },
      headers: { 'x-qa-force': 'fail' },
    });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(700);
    await pending;
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ verified: false });
  });

  it('canonicalises a local-form phone before processing', async () => {
    // Phone in local 0712 form must canonicalise to +256712… — otherwise the
    // route would 400 on a perfectly valid Ugandan number.
    const req = buildReq({ body: { phone: '0712345678', code: '1234' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(700);
    await pending;
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ verified: true });
  });

  it('rejects missing/invalid phone with 400 + code:invalid_phone', async () => {
    const req = buildReq({ body: { code: '1234' } });
    const res = buildRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ code: 'invalid_phone' });
  });

  it('awaits the 700ms simulated latency before responding', async () => {
    const req = buildReq({ body: { phone: '+256701234567', code: '1234' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(600);
    expect(res.body).toBeUndefined();
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    expect(res.body).toBeDefined();
  });

  it('returns 405 + Allow:POST for non-POST methods', async () => {
    const req = buildReq({ method: 'DELETE' });
    const res = buildRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ code: 'method_not_allowed' });
    expect(res.headers.Allow).toBe('POST');
  });
});
