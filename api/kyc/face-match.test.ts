// Tests for POST /api/kyc/face-match.
//
// Covers: success path with match:true/liveness:true and a well-formed
// trackingId, the two QA-override outcomes (`liveness-fail`, `no-match`) both
// returning 200 + match:false per B16, missing-selfie 400, tracking-ID shape
// assertions (smile_<ts36>_<rand36>), 1500ms latency hook, and method-not-
// allowed semantics.
//
// We mock Date.now + Math.random with vi.spyOn so trackingId is deterministic
// — that lets us assert against an exact string instead of a fuzzy regex.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from './face-match';

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

// Canonical tracking-id shape: `smile_<ts36>_<rand36>` (see _lib/mocks.ts).
const TRACKING_ID_RE = /^smile_[0-9a-z]+_[0-9a-z]{6}$/;

describe('POST /api/kyc/face-match', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns 200 + ok outcome with high matchScore and tracking-id', async () => {
    const req = buildReq({ body: { selfieFile: 'selfie-token', nin: 'CF92018AB3CD45' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(1500);
    await pending;
    expect(res.statusCode).toBe(200);
    const body = res.body as {
      match: boolean;
      liveness: boolean;
      matchScore: number;
      outcome: string;
      trackingId: string;
    };
    expect(body.match).toBe(true);
    expect(body.liveness).toBe(true);
    expect(body.outcome).toBe('ok');
    expect(body.matchScore).toBeGreaterThan(0.9);
    expect(body.trackingId).toMatch(TRACKING_ID_RE);
  });

  it('QA override x-qa-force:liveness-fail returns 200 + match:false (B16 demo-scope)', async () => {
    const req = buildReq({
      body: { selfieFile: 's' },
      headers: { 'x-qa-force': 'liveness-fail' },
    });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(1500);
    await pending;
    expect(res.statusCode).toBe(200);
    const body = res.body as { match: boolean; liveness: boolean; outcome: string };
    expect(body.match).toBe(false);
    expect(body.liveness).toBe(false);
    expect(body.outcome).toBe('liveness-fail');
  });

  it('QA override x-qa-force:no-match returns 200 + match:false but liveness:true', async () => {
    const req = buildReq({
      body: { selfieFile: 's' },
      headers: { 'x-qa-force': 'no-match' },
    });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(1500);
    await pending;
    expect(res.statusCode).toBe(200);
    const body = res.body as { match: boolean; liveness: boolean; outcome: string };
    expect(body.match).toBe(false);
    expect(body.liveness).toBe(true);
    expect(body.outcome).toBe('no-match');
  });

  it('returns 400 + code:selfie_required when selfieFile is missing', async () => {
    const req = buildReq({ body: { nin: 'CF92018AB3CD45' } });
    const res = buildRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ code: 'selfie_required' });
  });

  it('emits a deterministic trackingId when Date.now and Math.random are stubbed', async () => {
    // ts36 of 1000000000000 = 'gjdgxs'; rand36 of '0.5' (then slice(2,8)) =
    // '5' so we use a value that yields 6 chars.
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    // Math.random returning 0.5 → "0.i" in base-36; pick a longer value.
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
    const req = buildReq({ body: { selfieFile: 's' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(1500);
    await pending;
    const body = res.body as { trackingId: string };
    const expectedTs = (1_700_000_000_000).toString(36);
    const expectedRand = (0.123456789).toString(36).slice(2, 8);
    expect(body.trackingId).toBe(`smile_${expectedTs}_${expectedRand}`);
  });

  it('awaits the 1500ms simulated latency before responding', async () => {
    const req = buildReq({ body: { selfieFile: 's' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(1400);
    expect(res.body).toBeUndefined();
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    expect(res.body).toBeDefined();
  });

  it('returns 405 + Allow:POST for GET', async () => {
    const req = buildReq({ method: 'GET' });
    const res = buildRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ code: 'method_not_allowed' });
    expect(res.headers.Allow).toBe('POST');
  });

  it('sets Cache-Control: no-store on the success path (B13)', async () => {
    const req = buildReq({ body: { selfieFile: 'selfie-token', nin: 'CF92018AB3CD45' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(1500);
    await pending;
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('sets Cache-Control: no-store on the 400 path (B13)', async () => {
    const req = buildReq({ body: { nin: 'CF92018AB3CD45' } });
    const res = buildRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('sets Cache-Control: no-store on the 405 path (B13)', async () => {
    const req = buildReq({ method: 'GET' });
    const res = buildRes();
    await handler(req, res);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});
