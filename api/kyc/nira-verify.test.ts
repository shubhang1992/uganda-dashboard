// Tests for POST /api/kyc/nira-verify.
//
// Covers: default match outcome with tracking-id, the two QA-override outcomes
// (`partial` with dob mismatched-fields, `no-match` with a reason) both
// returning 200 per B16, deterministic trackingId via spies, 1800ms latency
// hook, and method-not-allowed semantics.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from './nira-verify';

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

const TRACKING_ID_RE = /^smile_[0-9a-z]+_[0-9a-z]{6}$/;

describe('POST /api/kyc/nira-verify', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns 200 + result:match with tracking-id by default', async () => {
    const req = buildReq({ body: {} });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(1800);
    await pending;
    expect(res.statusCode).toBe(200);
    const body = res.body as { result: string; trackingId: string };
    expect(body.result).toBe('match');
    expect(body.trackingId).toMatch(TRACKING_ID_RE);
  });

  it('QA override x-qa-force:partial returns 200 + result:partial + mismatchedFields (B16)', async () => {
    const req = buildReq({ body: {}, headers: { 'x-qa-force': 'partial' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(1800);
    await pending;
    expect(res.statusCode).toBe(200);
    const body = res.body as {
      result: string;
      mismatchedFields: string[];
      reason: string;
      trackingId: string;
    };
    expect(body.result).toBe('partial');
    expect(body.mismatchedFields).toEqual(['dob']);
    expect(typeof body.reason).toBe('string');
    expect(body.trackingId).toMatch(TRACKING_ID_RE);
  });

  it('QA override x-qa-force:no-match returns 200 + result:no-match + reason (B16)', async () => {
    const req = buildReq({ body: {}, headers: { 'x-qa-force': 'no-match' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(1800);
    await pending;
    expect(res.statusCode).toBe(200);
    const body = res.body as { result: string; reason: string; trackingId: string };
    expect(body.result).toBe('no-match');
    expect(typeof body.reason).toBe('string');
    expect(body.reason.length).toBeGreaterThan(0);
    expect(body.trackingId).toMatch(TRACKING_ID_RE);
  });

  it('emits a deterministic trackingId when Date.now and Math.random are stubbed', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
    const req = buildReq({ body: {} });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(1800);
    await pending;
    const body = res.body as { trackingId: string };
    const expectedTs = (1_700_000_000_000).toString(36);
    const expectedRand = (0.123456789).toString(36).slice(2, 8);
    expect(body.trackingId).toBe(`smile_${expectedTs}_${expectedRand}`);
  });

  it('awaits the 1800ms simulated latency before responding', async () => {
    const req = buildReq({ body: {} });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(1700);
    expect(res.body).toBeUndefined();
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    expect(res.body).toBeDefined();
  });

  it('returns 405 + Allow:POST for OPTIONS', async () => {
    const req = buildReq({ method: 'OPTIONS' });
    const res = buildRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ code: 'method_not_allowed' });
    expect(res.headers.Allow).toBe('POST');
  });

  it('sets Cache-Control: no-store on the success path (B13)', async () => {
    const req = buildReq({ body: {} });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(1800);
    await pending;
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('sets Cache-Control: no-store on the 405 path (B13)', async () => {
    const req = buildReq({ method: 'OPTIONS' });
    const res = buildRes();
    await handler(req, res);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});
