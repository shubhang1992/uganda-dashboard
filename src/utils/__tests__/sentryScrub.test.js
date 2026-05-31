import { describe, it, expect } from 'vitest';
import {
  scrubString,
  scrubValue,
  scrubEvent,
  scrubBreadcrumb,
} from '../sentryScrub';

// Mirrors the PII vectors documented in BL-26 / H-4. The backend half
// (`server/sentryScrub.ts`) is intentionally identical; if this file changes,
// keep that copy in lockstep.

const SAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzdWJzY3JpYmVyOis' +
  'yNTY3MDEyMzQ1NjcifQ.s1gn4tur3_p4rt';

describe('scrubString', () => {
  it('redacts a canonical Ugandan phone (+256…)', () => {
    expect(scrubString('caller +256701234567 failed')).toBe(
      'caller [redacted] failed',
    );
  });

  it('redacts a bare 256-prefixed phone', () => {
    expect(scrubString('id 256701234567')).toBe('id [redacted]');
  });

  it('redacts a 0-prefixed local phone', () => {
    expect(scrubString('phone 0701234567')).toBe('phone [redacted]');
  });

  it('redacts the role:phone id form (the JWT sub / users.id)', () => {
    const out = scrubString('subscriber:+256701234567 not found');
    expect(out).toContain('subscriber:');
    expect(out).not.toContain('701234567');
    expect(out).toContain('[redacted]');
  });

  it('redacts a JWT', () => {
    expect(scrubString(`token ${SAMPLE_JWT}`)).toBe('token [redacted]');
  });

  it('redacts a Bearer token but keeps the scheme', () => {
    expect(scrubString('Authorization: Bearer abc.def.ghi')).toBe(
      'Authorization: Bearer [redacted]',
    );
  });

  it('leaves non-PII strings untouched', () => {
    expect(scrubString('database connection refused')).toBe(
      'database connection refused',
    );
  });

  it('passes through non-strings', () => {
    expect(scrubString(42)).toBe(42);
    expect(scrubString(null)).toBe(null);
    expect(scrubString(undefined)).toBe(undefined);
  });
});

describe('scrubValue', () => {
  it('drops whole values for sensitive keys (case-insensitive)', () => {
    const out = scrubValue({
      Authorization: 'Bearer abc.def.ghi',
      password: 'hunter2',
      Cookie: 'session=xyz',
      note: 'ok',
    });
    expect(out.Authorization).toBe('[redacted]');
    expect(out.password).toBe('[redacted]');
    expect(out.Cookie).toBe('[redacted]');
    expect(out.note).toBe('ok');
  });

  it('scrubs phone substrings in nested non-sensitive values', () => {
    const out = scrubValue({ detail: { msg: 'row subscriber:+256701234567' } });
    expect(out.detail.msg).not.toContain('701234567');
  });

  it('handles arrays', () => {
    const out = scrubValue(['+256701234567', 'fine']);
    expect(out[0]).toBe('[redacted]');
    expect(out[1]).toBe('fine');
  });

  it('does not hang on cyclic objects', () => {
    const a = { name: 'a' };
    a.self = a;
    expect(() => scrubValue(a)).not.toThrow();
  });

  it('caps recursion depth', () => {
    let deep = { v: '+256701234567' };
    for (let i = 0; i < 12; i++) deep = { nested: deep };
    expect(() => scrubValue(deep)).not.toThrow();
  });
});

describe('scrubEvent', () => {
  it('scrubs message, exception value, breadcrumbs, request, extra, user', () => {
    const event = {
      message: 'error for +256701234567',
      exception: {
        values: [{ value: 'lookup failed for subscriber:+256701234567' }],
      },
      breadcrumbs: [{ message: 'POST with token Bearer abc.def.ghi' }],
      request: {
        headers: { authorization: `Bearer ${SAMPLE_JWT}`, accept: 'json' },
        cookies: 'session=secret',
        data: { phone: '+256701234567', other: 'keep' },
        query_string: 'phone=256701234567',
      },
      extra: { note: 'subscriber:+256701234567' },
      user: { id: 'subscriber:+256701234567' },
    };

    const out = scrubEvent(event);

    expect(out.message).not.toContain('701234567');
    expect(out.exception.values[0].value).not.toContain('701234567');
    expect(out.breadcrumbs[0].message).toBe('POST with token Bearer [redacted]');
    expect(out.request.headers.authorization).toBe('[redacted]');
    expect(out.request.headers.accept).toBe('json');
    expect(out.request.cookies).toBe('[redacted]');
    // `phone` is not a sensitive key, but its phone-shaped value is scrubbed.
    expect(out.request.data.phone).not.toContain('701234567');
    expect(out.request.data.other).toBe('keep');
    expect(out.request.query_string).not.toContain('701234567');
    expect(out.extra.note).not.toContain('701234567');
    expect(out.user.id).not.toContain('701234567');
  });

  it('passes through empty/invalid events', () => {
    expect(scrubEvent(null)).toBe(null);
    expect(scrubEvent({})).toEqual({});
  });
});

describe('scrubBreadcrumb', () => {
  it('scrubs message and data', () => {
    const out = scrubBreadcrumb({
      message: 'fetch +256701234567',
      data: { url: '/api/auth/verify-otp', body: '+256701234567' },
    });
    expect(out.message).not.toContain('701234567');
    expect(out.data.body).not.toContain('701234567');
    expect(out.data.url).toBe('/api/auth/verify-otp');
  });

  it('passes through null', () => {
    expect(scrubBreadcrumb(null)).toBe(null);
  });
});
