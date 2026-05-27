// Tests for POST /api/kyc/id-quality.
//
// Covers: default-pass (all three checks pass, score=1, pass:true), the three
// QA override headers (`x-qa-force: fail-blur | fail-corners | fail-glare`)
// each individually fail their respective check (with score=2/3), the 900ms
// latency hook, and method-not-allowed semantics.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from './id-quality';

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

describe('POST /api/kyc/id-quality', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 200 + all-pass QualityReport (score=1) by default', async () => {
    const req = buildReq({ body: {} });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(900);
    await pending;
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      blur: true,
      corners: true,
      glare: true,
      pass: true,
      score: 1,
    });
  });

  it('QA override x-qa-force:fail-blur fails the blur check (score=2/3)', async () => {
    const req = buildReq({ body: {}, headers: { 'x-qa-force': 'fail-blur' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(900);
    await pending;
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      blur: false,
      corners: true,
      glare: true,
      pass: false,
      score: 2 / 3,
    });
  });

  it('QA override x-qa-force:fail-corners fails only the corners check', async () => {
    const req = buildReq({ body: {}, headers: { 'x-qa-force': 'fail-corners' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(900);
    await pending;
    const body = res.body as { blur: boolean; corners: boolean; glare: boolean; pass: boolean };
    expect(body.corners).toBe(false);
    expect(body.blur).toBe(true);
    expect(body.glare).toBe(true);
    expect(body.pass).toBe(false);
  });

  it('QA override x-qa-force:fail-glare fails only the glare check', async () => {
    const req = buildReq({ body: {}, headers: { 'x-qa-force': 'fail-glare' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(900);
    await pending;
    const body = res.body as { blur: boolean; corners: boolean; glare: boolean; pass: boolean };
    expect(body.glare).toBe(false);
    expect(body.blur).toBe(true);
    expect(body.corners).toBe(true);
    expect(body.pass).toBe(false);
  });

  it('awaits the 900ms simulated latency before resolving', async () => {
    const req = buildReq({ body: {} });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(800);
    expect(res.body).toBeUndefined();
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    expect(res.body).toBeDefined();
  });

  it('returns 405 + Allow:POST for PUT', async () => {
    const req = buildReq({ method: 'PUT' });
    const res = buildRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ code: 'method_not_allowed' });
    expect(res.headers.Allow).toBe('POST');
  });
});
