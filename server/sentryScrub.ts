// Sentry PII / secret scrubber — backend (@sentry/node) half.
//
// This is observability hardening, NOT a new integration: it is a `beforeSend`
// guard that runs only when SENTRY_DSN is configured (`server/index.ts`). Its
// purpose is to keep CLAUDE.md §7 ("never log JWTs", PII hygiene) true even if a
// future maintainer flips `sendDefaultPii: true` or a future Sentry major
// changes the request-data defaults. Today @sentry/node v8 already defaults
// `sendDefaultPii` false and strips Authorization/cookies via
// requestDataIntegration — this is belt-and-braces on top.
//
// KEEP IN SYNC with `src/utils/sentryScrub.js` — the two halves are
// intentionally identical (separate build graphs: Vite bundles the frontend
// copy, tsc compiles this one with NodeNext/`rootDir: ..` which cannot reach
// `src/`). Any change to the redaction rules below must be mirrored there.
//
// PII vectors specific to this app (audit BL-26 / H-4):
//   - Ugandan phone numbers (synthetic `+25671XXXXXXX` demo range, but redact
//     any `+256…` / bare `25671…` shape). Phone is a thrown-error parameter in
//     `api/auth/verify-otp.ts` and embedded in `users.id`.
//   - `users.id` is `` `${role}:${phone}` `` and becomes the JWT `sub`, so a
//     `subscriber:+256701234567` substring can ride along in a Supabase error
//     forwarded to Sentry by the central error handler.
//   - Bearer tokens / Authorization headers / JWT-shaped strings.
//   - `password` fields.

import type { Breadcrumb, Event } from '@sentry/node';

const REDACTED = '[redacted]';

// Ugandan phone: optional +/256/0 prefix then a 9-digit local number starting
// with 7. Catches `+256701234567`, `256701234567`, `0701234567`, and the
// `role:phone` id form (`subscriber:+256…`).
const PHONE_RE = /(?:\+?256|0)?7\d{8}/g;
// JWTs: three base64url segments separated by dots (header.payload.signature).
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
// `Bearer <token>` anywhere in a string.
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._-]+/gi;

// Header/field names whose VALUES are dropped wholesale (case-insensitive).
const SENSITIVE_KEYS = new Set<string>([
  'authorization',
  'cookie',
  'set-cookie',
  'x-auth-token',
  'password',
  'newpassword',
  'oldpassword',
  'currentpassword',
  'token',
  'access_token',
  'refresh_token',
  'jwt',
  'otp',
]);

/** Redact PII/secret substrings inside a single string. */
export function scrubString(value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return value;
  return value
    .replace(JWT_RE, REDACTED)
    .replace(BEARER_RE, `Bearer ${REDACTED}`)
    .replace(PHONE_RE, REDACTED);
}

/**
 * Deep-clone-and-redact an arbitrary value. Drops whole values for keys in
 * `SENSITIVE_KEYS`; scrubs substrings everywhere else. Guards against cycles
 * and caps recursion depth so a pathological event can't hang the process.
 */
export function scrubValue(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (depth > 8) return REDACTED;
  if (typeof value === 'string') return scrubString(value);
  if (value == null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return value; // cycle — leave the existing ref
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => scrubValue(v, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = REDACTED;
    } else {
      out[key] = scrubValue(v, depth + 1, seen);
    }
  }
  return out;
}

/** `beforeBreadcrumb` hook — scrubs message + data of each breadcrumb. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb | null): Breadcrumb | null {
  if (!breadcrumb || typeof breadcrumb !== 'object') return breadcrumb;
  if (breadcrumb.message) breadcrumb.message = scrubString(breadcrumb.message) as string;
  if (breadcrumb.data) breadcrumb.data = scrubValue(breadcrumb.data) as Record<string, unknown>;
  return breadcrumb;
}

/**
 * `beforeSend` / `beforeSendTransaction` hook. Scrubs the message, exception
 * values, breadcrumbs, request data/headers, extra, contexts, and user fields
 * of an outgoing event. Returns the same (mutated) event so Sentry still sends
 * it — we redact, we don't drop. Generic over `Event` subtypes so it satisfies
 * the narrowed `ErrorEvent`/`TransactionEvent` callback signatures.
 */
export function scrubEvent<E extends Event>(event: E): E {
  if (!event || typeof event !== 'object') return event;

  if (event.message) event.message = scrubString(event.message) as string;

  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex && typeof ex.value === 'string') ex.value = scrubString(ex.value) as string;
    }
  }

  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((b) => scrubBreadcrumb(b)) as Breadcrumb[];
  }

  if (event.request) {
    // Belt-and-braces: assert auth headers/cookies are gone even if a future
    // Sentry default change stops stripping them.
    if (event.request.headers) {
      event.request.headers = scrubValue(event.request.headers) as Record<string, string>;
    }
    if (event.request.cookies) {
      event.request.cookies = REDACTED as unknown as Record<string, string>;
    }
    if (event.request.data) event.request.data = scrubValue(event.request.data);
    if (typeof event.request.query_string === 'string') {
      event.request.query_string = scrubString(event.request.query_string) as string;
    }
  }

  if (event.extra) event.extra = scrubValue(event.extra) as Record<string, unknown>;
  if (event.contexts) {
    event.contexts = scrubValue(event.contexts) as NonNullable<Event['contexts']>;
  }
  if (event.user) event.user = scrubValue(event.user) as NonNullable<Event['user']>;

  return event;
}
