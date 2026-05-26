// Password hashing + shape validation, shared across the auth API routes.
//
// This is the ONLY module in the codebase that imports `bcryptjs`. Wrap it
// once here so every caller (signup completion, sign-in verify, Settings
// change-password, future surfaces) goes through the same cost factor and
// the same error vocabulary. Never imported from `src/` — frontend never
// hashes or compares passwords — so this file never lands in the browser
// bundle.
//
// Error vocabulary (matches the AuthError shape on the frontend):
//   - password_required   — empty / wrong type
//   - password_too_short  — under 8 chars (UI hint, see SPEC)
//   - password_too_long   — over 72 BYTES; bcrypt silently truncates above
//                           that boundary, so we reject loudly instead of
//                           hashing a prefix the user can't recover from
//   - password_too_weak   — must contain at least one letter AND one digit
//
// The 72-byte cap is bcrypt's documented hard input limit. A user typing
// multi-byte UTF-8 (emoji, accented characters) can blow past 72 bytes well
// before 72 characters, so the byte length is what we check.

import bcrypt from 'bcryptjs';

// Work factor. 10 is the bcryptjs default and gives ~80ms per hash on a
// modern Vercel serverless instance — comfortably above the brute-force
// floor without slowing the demo's "sign in" tap-through.
const COST = 10;

// bcrypt's input length cap. Any byte beyond this is silently dropped by
// the algorithm itself; we reject the password instead of letting the user
// set one whose tail they can't reproduce on sign-in.
const MAX_BYTES = 72;

export type PasswordShapeError =
  | 'password_required'
  | 'password_too_short'
  | 'password_too_long'
  | 'password_too_weak';

/**
 * Validate a candidate password against the demo's shape rules. Returns
 * `null` when the password is acceptable, or one of the
 * `PasswordShapeError` codes otherwise. Pure / synchronous — safe to call
 * from request handlers before paying the hashing round-trip.
 */
export function validatePasswordShape(plain: unknown): PasswordShapeError | null {
  if (typeof plain !== 'string' || plain.length === 0) return 'password_required';
  if (plain.length < 8) return 'password_too_short';
  const bytes = new TextEncoder().encode(plain).length;
  if (bytes > MAX_BYTES) return 'password_too_long';
  if (!/[A-Za-z]/.test(plain) || !/\d/.test(plain)) return 'password_too_weak';
  return null;
}

/**
 * Hash a password with bcrypt at the configured cost. Callers MUST run
 * `validatePasswordShape` first — this function does not re-check shape
 * and will happily hash a 3-character password if asked.
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

/**
 * Compare a candidate plain password against a stored bcrypt hash.
 * Returns `false` (not throws) for any failure mode — missing hash,
 * malformed hash, mismatch — so callers can branch on a single boolean.
 * A missing/NULL `password_hash` therefore correctly resolves to "no
 * password set", which the upstream route turns into the OTP fallback.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
