// Unit tests for POST /api/contact.
//
// Public landing-page contact form route. Validates { name, email, message },
// INSERTs into contact_submissions via the service-role client (RLS bypassed),
// and returns { submitted: true, id }. Covers: 405 on non-POST; the four 400
// shape errors (invalid_name / invalid_email / invalid_message + email-regex);
// the per-field length caps (§2a.5); the 200 happy path; the 500 db_error
// surfacing; and `Cache-Control: no-store` on every path.
//
// Mocking strategy mirrors verify-otp.test.ts: `vi.mock` swaps the admin
// Supabase client for a fluent chain whose terminal `.insert()` resolves with a
// per-call queued `{ error }`. The insert is the route's only DB touch, so the
// chain only needs `from(...).insert(...)`.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase-admin mock — `from(table).insert(row)` resolves with a queued result.
// ---------------------------------------------------------------------------

type InsertResult = { error: unknown };
let insertQueue: InsertResult[] = [];
const insertCalls: Array<{ table: string; row: unknown }> = [];

vi.mock('./_lib/supabase-admin.js', () => ({
  default: {
    from: vi.fn((table: string) => ({
      insert: vi.fn((row: unknown) => {
        insertCalls.push({ table, row });
        const queued = insertQueue.shift();
        return Promise.resolve(queued ?? { error: null });
      }),
    })),
  },
}));

// eslint-disable-next-line import/first
import handler from './contact';

// ---------------------------------------------------------------------------
// Req/Res stubs (same minimal shape as the other api/*.test.ts files).
// ---------------------------------------------------------------------------

type StubReq = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

function makeReq(overrides: StubReq = {}): StubReq {
  return { method: 'POST', headers: {}, body: {}, ...overrides };
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (req: StubReq, res: ReturnType<typeof makeRes>) =>
  handler(req as any, res as any);

const VALID = { name: 'Asha N.', email: 'asha@example.com', message: 'Hello team' };

// ---------------------------------------------------------------------------

describe('POST /api/contact', () => {
  let res: ReturnType<typeof makeRes>;

  beforeEach(() => {
    insertQueue = [];
    insertCalls.length = 0;
    res = makeRes();
  });

  // -------------------------------------------------------------------------
  // Method gate
  // -------------------------------------------------------------------------

  it('returns 405 method_not_allowed + Allow: POST + no-store for GET', async () => {
    await call(makeReq({ method: 'GET' }), res);
    expect(res.__getStatus()).toBe(405);
    expect(res.__getPayload()).toEqual({ code: 'method_not_allowed' });
    expect(res.__headers['Allow']).toBe('POST');
    expect(res.__headers['Cache-Control']).toBe('no-store');
  });

  it('returns 405 for PUT/DELETE/PATCH', async () => {
    for (const method of ['PUT', 'DELETE', 'PATCH']) {
      const r = makeRes();
      await call(makeReq({ method }), r);
      expect(r.__getStatus(), method).toBe(405);
      expect(r.__getPayload(), method).toEqual({ code: 'method_not_allowed' });
    }
  });

  // -------------------------------------------------------------------------
  // Shape validation — each missing/blank field surfaces its own code.
  // -------------------------------------------------------------------------

  it('returns 400 invalid_name when name is missing (+ no-store, no insert)', async () => {
    await call(makeReq({ body: { email: VALID.email, message: VALID.message } }), res);
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'invalid_name' });
    expect(res.__headers['Cache-Control']).toBe('no-store');
    expect(insertCalls).toHaveLength(0);
  });

  it('returns 400 invalid_name when name is only whitespace', async () => {
    await call(makeReq({ body: { ...VALID, name: '   ' } }), res);
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'invalid_name' });
  });

  it('returns 400 invalid_email when email is missing', async () => {
    await call(makeReq({ body: { name: VALID.name, message: VALID.message } }), res);
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'invalid_email' });
  });

  it('returns 400 invalid_email when the email fails the regex', async () => {
    for (const bad of ['not-an-email', 'a@b', 'a@b.', '@example.com', 'a b@c.com']) {
      const r = makeRes();
      await call(makeReq({ body: { ...VALID, email: bad } }), r);
      expect(r.__getStatus(), bad).toBe(400);
      expect(r.__getPayload()).toEqual({ code: 'invalid_email' });
    }
  });

  it('returns 400 invalid_message when message is missing or blank', async () => {
    for (const message of [undefined, '', '   ']) {
      const r = makeRes();
      await call(makeReq({ body: { name: VALID.name, email: VALID.email, message } }), r);
      expect(r.__getStatus(), String(message)).toBe(400);
      expect(r.__getPayload()).toEqual({ code: 'invalid_message' });
    }
  });

  // -------------------------------------------------------------------------
  // Per-field length caps (§2a.5) — these fields persist verbatim via the
  // RLS-bypassing admin client, so an over-length field is rejected up front.
  // -------------------------------------------------------------------------

  it('returns 400 name_too_long for a >120-char name', async () => {
    await call(makeReq({ body: { ...VALID, name: 'a'.repeat(121) } }), res);
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'name_too_long' });
    expect(insertCalls).toHaveLength(0);
  });

  it('returns 400 email_too_long for a >254-char email', async () => {
    // Build a syntactically-valid but over-length address.
    const local = 'a'.repeat(250);
    await call(makeReq({ body: { ...VALID, email: `${local}@e.com` } }), res);
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'email_too_long' });
  });

  it('returns 400 message_too_long for a >4000-char message', async () => {
    await call(makeReq({ body: { ...VALID, message: 'a'.repeat(4001) } }), res);
    expect(res.__getStatus()).toBe(400);
    expect(res.__getPayload()).toEqual({ code: 'message_too_long' });
  });

  // -------------------------------------------------------------------------
  // Success path
  // -------------------------------------------------------------------------

  it('returns 200 { submitted: true, id } and inserts the trimmed row', async () => {
    await call(makeReq({ body: { name: '  Asha N.  ', email: '  asha@example.com ', message: '  Hi  ' } }), res);
    expect(res.__getStatus()).toBe(200);
    const payload = res.__getPayload() as { submitted: boolean; id: string };
    expect(payload.submitted).toBe(true);
    expect(typeof payload.id).toBe('string');
    expect(payload.id.startsWith('cs-')).toBe(true);
    expect(res.__headers['Cache-Control']).toBe('no-store');

    // The row written is trimmed and carries the generated id.
    expect(insertCalls).toHaveLength(1);
    const { table, row } = insertCalls[0] as { table: string; row: Record<string, unknown> };
    expect(table).toBe('contact_submissions');
    expect(row).toMatchObject({ name: 'Asha N.', email: 'asha@example.com', message: 'Hi' });
    expect(row.id).toBe(payload.id);
  });

  // -------------------------------------------------------------------------
  // DB error → 500 db_error surfacing the supabase error code.
  // -------------------------------------------------------------------------

  it('returns 500 db_error with the supabase code when the insert fails', async () => {
    insertQueue.push({ error: { code: '23505', message: 'duplicate key' } });
    await call(makeReq({ body: VALID }), res);
    expect(res.__getStatus()).toBe(500);
    expect(res.__getPayload()).toEqual({ code: 'db_error', message: '23505' });
    expect(res.__headers['Cache-Control']).toBe('no-store');
  });

  it('falls back to error.message when the supabase error has no code', async () => {
    insertQueue.push({ error: { message: 'connection refused' } });
    await call(makeReq({ body: VALID }), res);
    expect(res.__getStatus()).toBe(500);
    expect(res.__getPayload()).toEqual({ code: 'db_error', message: 'connection refused' });
  });
});
