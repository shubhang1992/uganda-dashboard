// Tests for POST /api/kyc/agent-referral.
//
// Covers: success path (200 + ticketId + eta), phone canonicalisation written
// into the INSERTed row (B3/B4 — local-form `0712…` becomes `+256712…` before
// it hits the DB), missing-phone 400 + code:invalid_phone, missing-reason
// 400 + code:reason_required, Cache-Control:no-store on every path (B13),
// Supabase insert-error → 500 + code:db_error, 600ms latency hook, and
// method-not-allowed semantics.
//
// Mocking strategy:
//   - vi.mock('../_lib/supabase-admin.js') to swap in a chainable stub that
//     records insert() calls and lets each test inject a canned { error } via
//     a module-level queue.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Per-test insert behaviour:
//   - inserts: an array of `(row: unknown) => void` observers; the stub
//     forwards each insert() call so tests can assert on the persisted row.
//   - nextError: returned by the next insert() (defaults to null).
const insertCalls: unknown[] = [];
let nextError: { code?: string; message?: string } | null = null;

vi.mock('../_lib/supabase-admin.js', () => {
  return {
    default: {
      from: (_table: string) => ({
        insert: (row: unknown) => {
          insertCalls.push(row);
          return Promise.resolve({ error: nextError, data: null });
        },
      }),
    },
  };
});

// Import AFTER the mock declaration so the handler resolves the mocked module.
import handler from './agent-referral';

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

describe('POST /api/kyc/agent-referral', () => {
  beforeEach(() => {
    insertCalls.length = 0;
    nextError = null;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns 200 + ticketId + eta on a successful insert', async () => {
    const req = buildReq({ body: { phone: '+256701234567', reason: 'Need help with ID upload' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(600);
    await pending;
    expect(res.statusCode).toBe(200);
    const body = res.body as { ticketId: string; eta: string };
    // ticketId is `UAG-XXXX` where XXXX comes from the alphabet
    // `[A-Z0-9]`. The eta is hard-coded.
    expect(body.ticketId).toMatch(/^UAG-[A-Z0-9]{4}$/);
    expect(body.eta).toBe('within 24 hours');
  });

  it('writes Cache-Control: no-store on the success path (B13)', async () => {
    const req = buildReq({ body: { phone: '+256701234567', reason: 'help me' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(600);
    await pending;
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('canonicalises a local-form phone before persisting (0701234567 → +256701234567)', async () => {
    // Per B3/B4: the row must store the canonical +256… form so agent
    // lookups (which query canonical phone) actually find this referral.
    const req = buildReq({ body: { phone: '0701234567', reason: 'help me' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(600);
    await pending;
    expect(insertCalls.length).toBe(1);
    const row = insertCalls[0] as { phone: string };
    expect(row.phone).toBe('+256701234567');
  });

  it('canonicalises a 256-prefixed phone the same way (256701234567 → +256701234567)', async () => {
    const req = buildReq({ body: { phone: '256701234567', reason: 'reason' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(600);
    await pending;
    const row = insertCalls[0] as { phone: string };
    expect(row.phone).toBe('+256701234567');
  });

  it('returns 400 + code:invalid_phone when phone is missing', async () => {
    const req = buildReq({ body: { reason: 'help me' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(600);
    await pending;
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ code: 'invalid_phone' });
    expect(insertCalls.length).toBe(0);
    // Cache-Control must still be set on the error path (B13).
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('returns 400 + code:invalid_phone for a malformed phone', async () => {
    const req = buildReq({ body: { phone: '123', reason: 'help me' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(600);
    await pending;
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ code: 'invalid_phone' });
  });

  it('returns 400 + code:reason_required when reason is empty / whitespace', async () => {
    const req = buildReq({ body: { phone: '+256701234567', reason: '   ' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(600);
    await pending;
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ code: 'reason_required' });
    expect(insertCalls.length).toBe(0);
  });

  it('returns 500 + code:db_error when Supabase insert fails', async () => {
    nextError = { code: '23505', message: 'duplicate key value' };
    // Silence the expected console.error so test output stays clean.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = buildReq({ body: { phone: '+256701234567', reason: 'help me' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(600);
    await pending;
    expect(res.statusCode).toBe(500);
    // §11-M1: opaque payload — the raw supabase code/message must NOT leak.
    expect(res.body).toEqual({ code: 'db_error' });
    errSpy.mockRestore();
  });

  it('persists row with status:open, eta, and optional fields (stage/trackingId/sessionId)', async () => {
    const req = buildReq({
      body: {
        phone: '+256701234567',
        reason: 'help me',
        stage: 'id-capture',
        trackingId: 'smile_abc_def123',
        sessionId: 'sess-xyz',
      },
    });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(600);
    await pending;
    const row = insertCalls[0] as Record<string, unknown>;
    expect(row.status).toBe('open');
    expect(row.eta).toBe('within 24 hours');
    expect(row.stage).toBe('id-capture');
    expect(row.tracking_id).toBe('smile_abc_def123');
    expect(row.session_id).toBe('sess-xyz');
    expect(typeof row.id).toBe('string');
    expect(typeof row.ticket_id).toBe('string');
  });

  it('awaits the 600ms simulated latency before responding', async () => {
    const req = buildReq({ body: { phone: '+256701234567', reason: 'help' } });
    const res = buildRes();
    const pending = handler(req, res);
    await vi.advanceTimersByTimeAsync(500);
    expect(res.body).toBeUndefined();
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    expect(res.body).toBeDefined();
  });

  it('returns 405 + Allow:POST + Cache-Control:no-store for GET', async () => {
    const req = buildReq({ method: 'GET' });
    const res = buildRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ code: 'method_not_allowed' });
    expect(res.headers.Allow).toBe('POST');
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});
