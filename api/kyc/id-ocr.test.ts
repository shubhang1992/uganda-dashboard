// Tests for POST /api/kyc/id-ocr.
//
// Covers: success path returns the fixed sample subscriber, missing front/back
// → 400 with code:id_sides_required, 2200ms simulated latency, and method-not-
// allowed semantics.
//
// This route has no QA override headers and no env-key short-circuits; the
// shape it returns is hard-coded.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from './id-ocr';

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

describe('POST /api/kyc/id-ocr', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 200 + fixed sample IdExtraction when both sides present', async () => {
    const req = buildReq({ body: { front: 'front-token', back: 'back-token' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(2200);
    await pending;
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      fullName: 'Namukasa Sarah Kintu',
      nin: 'CF92018AB3CD45',
      cardNumber: 'UG7412903',
      dob: '1992-06-18',
      gender: 'female',
      barcodeRaw: 'CF92018AB3CD45|UG7412903|1992-06-18|NAMUKASA,SARAH,KINTU',
      confidence: 0.94,
    });
  });

  it('deliberately omits district (subscriber picks manually on ReviewStep)', async () => {
    const req = buildReq({ body: { front: 'f', back: 'b' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(2200);
    await pending;
    expect((res.body as Record<string, unknown>).district).toBeUndefined();
  });

  it('returns 400 + code:id_sides_required when front is missing', async () => {
    const req = buildReq({ body: { back: 'back-token' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(2200);
    await pending;
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ code: 'id_sides_required' });
  });

  it('returns 400 + code:id_sides_required when back is missing', async () => {
    const req = buildReq({ body: { front: 'front-token' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(2200);
    await pending;
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ code: 'id_sides_required' });
  });

  it('awaits the simulated 2200ms latency before resolving', async () => {
    const req = buildReq({ body: { front: 'f', back: 'b' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(2100);
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
});
