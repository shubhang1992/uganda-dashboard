// Tests for POST /api/kyc/otp-send.
//
// Covers: success path, simulated-latency hook, missing/invalid phone (400),
// phone canonicalisation across input variants (0712…, 256712…), and
// method-not-allowed semantics.
//
// The handler is a Vercel function with no external deps — no Supabase, no
// fetch — so we drive it with hand-rolled `req`/`res` stubs and a fake timer
// to assert the awaited `setTimeout`.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from './otp-send';

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

describe('POST /api/kyc/otp-send', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 200 + { success, expiresIn: 300 } on a valid phone', async () => {
    const req = buildReq({ body: { phone: '+256701234567' } });
    const res = buildRes();
    const pending = handler(req, res);
    // The handler awaits a 600ms simulated latency before resolving.
    await vi.advanceTimersByTimeAsync(600);
    await pending;
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, expiresIn: 300 });
  });

  it('canonicalises a leading-zero local-form phone (0701234567 → +256701234567)', async () => {
    // The route doesn't echo the phone back, but it must not 400 on a valid
    // local-form input — that's the canonicalisation contract.
    const req = buildReq({ body: { phone: '0701234567' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(600);
    await pending;
    expect(res.statusCode).toBe(200);
    expect((res.body as { success: boolean }).success).toBe(true);
  });

  it('canonicalises a 256-prefixed phone (256701234567 → +256701234567)', async () => {
    const req = buildReq({ body: { phone: '256701234567' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(600);
    await pending;
    expect(res.statusCode).toBe(200);
  });

  it('rejects missing phone with 400 + code:invalid_phone', async () => {
    const req = buildReq({ body: {} });
    const res = buildRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ code: 'invalid_phone' });
  });

  it('rejects malformed phone (too few digits) with 400 + code:invalid_phone', async () => {
    const req = buildReq({ body: { phone: '12345' } });
    const res = buildRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ code: 'invalid_phone' });
  });

  it('awaits the simulated 600ms latency before responding', async () => {
    const req = buildReq({ body: { phone: '+256701234567' } });
    const res = buildRes();
    const pending = handler(req, res);
    // Advance less than the simulated latency — handler should not have
    // resolved yet, so the body remains unset.
    await vi.advanceTimersByTimeAsync(500);
    expect(res.body).toBeUndefined();
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    expect(res.body).toBeDefined();
  });

  it('returns 405 + Allow:POST for GET method', async () => {
    const req = buildReq({ method: 'GET' });
    const res = buildRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ code: 'method_not_allowed' });
    expect(res.headers.Allow).toBe('POST');
  });
});
