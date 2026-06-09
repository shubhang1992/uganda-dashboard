// Shared input-length guard for public service-role write routes.
//
// The auth-free routes (`/api/contact`, `/api/chat`, `/api/kyc/agent-referral`)
// persist free-text fields verbatim via the RLS-bypassing service-role client.
// `express.json({ limit: '200kb' })` is the only ceiling, so a single field can
// be ~200,000 chars — a cheap storage-spam vector on the public unauthenticated
// forms (audit §2a.5). Each route applies explicit per-field caps up front and
// rejects an over-length field with a dedicated 400 code, BEFORE the write.
//
// Designed for the routes' return-response error style: instead of throwing,
// `checkLen` returns a `LenViolation` ({ code }) when a field is too long, so
// the caller can `return res.status(400).json(violation)` inline. Callers must
// have already coerced the field to a string (typeof guard + trim) — this only
// inspects `.length`.

export type LenViolation = { code: string };

// Returns a `LenViolation` whose `code` is the supplied dedicated 400 code when
// `value.length > max`, or `null` when the field is within bounds.
export function checkLen(value: string, max: number, code: string): LenViolation | null {
  return value.length > max ? { code } : null;
}

export default checkLen;
