// Shared mock helpers for the KYC API routes.
//
// All eight routes under `/api/kyc/*` are Smile ID v2-shaped mocks (see
// CLAUDE.md §10a). When a real Smile ID call would return a `tracking_id`,
// these routes return a synthetic one with the same surface shape so the
// frontend can echo it back into receipts, audit logs, and back-office
// review screens without branching on demo-vs-prod.
//
// **Canonical tracking-id shape:** `${prefix}_${ts36}_${rand36}`
//   - `prefix`   — vendor namespace (default `'smile'`, matching Smile ID v2)
//   - `ts36`     — `Date.now()` in base-36 (~8 chars, monotonically increasing)
//   - `rand36`   — 6 chars of base-36 randomness (collision-resistant for a
//                  single demo session; not cryptographic)
//
// Example: `smile_lwxa3y2k_4f9q2z`
//
// The shape and separators (underscores, not hyphens) are deliberate — the
// previous inline copies in face-match / aml-screen / nira-verify all used
// this exact form, and changing it would break any QA fixture or screenshot
// that hard-codes the prefix. Keep it stable.

export function mockTrackingId(prefix: string = 'smile'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
