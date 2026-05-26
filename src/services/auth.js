// Auth service — calls the `/api/auth/*` Vercel routes (which delegate to
// Supabase + sign the HS256 JWT shared with RLS).
//
// Public surface preserved verbatim so callers (SignInModal, AuthContext) need
// no changes beyond consuming the `{ token, user }` shape `verifyOtp` now
// returns (it always did — the mock just returned `mock-jwt-token`).

import { api } from './api';
import { IS_DEV } from '../config/env';

const DASHBOARD_ROLES = ['distributor', 'branch', 'subscriber', 'agent'];

/**
 * Standardised auth-error shape. Components catch these and render
 * per-`code` messages (invalid_otp, rate_limited, locked, network).
 */
export class AuthError extends Error {
  constructor(code, message, retryAfterSeconds) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    if (retryAfterSeconds != null) this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Map a per-code string to the customer-facing message OtpVerify falls back on. */
function messageForCode(code) {
  if (code === 'rate_limited') return 'Too many attempts. Try again shortly.';
  if (code === 'locked') return 'This account is temporarily locked.';
  if (code === 'invalid_otp') return 'Invalid code. Please try again.';
  // Password-related codes — surfaced by the new password-aware auth routes
  // (verify-otp w/ password, verify-password, change-password) added in
  // Phases 2–5. These are demo-appropriate phrasings; the server is the
  // source of truth, but keeping them mapped here lets every caller render
  // a consistent customer-facing string when only a `code` is available.
  if (code === 'password_too_short') return 'Password must be at least 8 characters.';
  if (code === 'password_too_weak')  return 'Password must include a letter and a number.';
  if (code === 'password_too_long')  return 'Password is too long.';
  if (code === 'password_required')  return 'Please enter a password.';
  if (code === 'invalid_password')   return 'Incorrect password.';
  if (code === 'password_not_set')   return 'This account uses one-time codes only.';
  if (code === 'current_password_required') return 'Enter your current password.';
  if (code === 'current_password_invalid')  return 'Current password is incorrect.';
  return 'Could not verify the code. Please try again.';
}

/**
 * @endpoint POST /api/auth/send-otp
 * @param {string} phone - Phone number (E.164, e.g. +256700000001)
 * @param {string} role - subscriber|distributor|branch|agent (employer/admin are routed elsewhere)
 * @returns {Promise<{success: boolean}>}
 * @description Asks the backend to dispatch an OTP. The demo backend treats this
 *   as a no-op (any 6-digit code passes `verifyOtp`); the real provider will
 *   send an SMS via Twilio / Africa's Talking.
 * @scope Public — no authentication required.
 */
export async function sendOtp(phone, role) {
  try {
    return await api.post('/auth/send-otp', { phone, role });
  } catch (err) {
    // send-otp errors don't currently map to AuthError codes (the verify step
    // is the gate). Surface a generic AuthError so callers can show a toast.
    const code = err?.code || 'network';
    throw new AuthError(code, err?.message || messageForCode(code));
  }
}

/**
 * @endpoint POST /api/auth/verify-otp
 * @param {string} phone - Phone number used in sendOtp
 * @param {string} otp - 6-digit OTP code
 * @param {string} role - User role being authenticated
 * @param {string} [password] - Optional password to stamp onto the user row
 *   during this OTP verification. When non-empty, the backend hashes it
 *   (bcrypt) and stores it on `users.password_hash`; the response's
 *   `user.hasPassword` reflects whether a hash exists after the upsert.
 *   Empty / undefined is the legacy OTP-only path — leaves any existing hash
 *   untouched. Used by the signup flow (set at ReviewStep) to attach a
 *   password to the freshly-created account in the same call that mints the
 *   JWT, so no second round-trip is needed.
 * @returns {Promise<{token: string, user: {phone: string, role: string, hasPassword: boolean, name?: string, subscriberId?: string, agentId?: string, branchId?: string, distributorId?: string}}>}
 * @description Verifies the OTP, upserts the `users` row, and returns the HS256
 *   JWT (signed with the Supabase JWT secret) along with the user shape the
 *   frontend stores in `AuthContext`. `name` may be omitted (undefined) when
 *   the resolved entity doesn't have one — callers should handle as optional.
 *   Errors are thrown as `AuthError` instances with a `code` (invalid_otp,
 *   rate_limited, locked, password_too_short, password_too_weak,
 *   password_too_long, password_required) and optional `retryAfterSeconds`.
 * @scope Public — no authentication required.
 */
export async function verifyOtp(phone, otp, role, password) {
  // Dev-only QA force-overrides — mirror the kyc.js force-key pattern. Set
  // localStorage['upensions_otp_force'] to one of: invalid_otp, rate_limited, locked.
  if (IS_DEV && typeof window !== 'undefined') {
    try {
      const forced = window.localStorage.getItem('upensions_otp_force');
      if (forced === 'invalid_otp') {
        throw new AuthError('invalid_otp', 'Invalid code. Please try again.');
      }
      if (forced === 'rate_limited') {
        throw new AuthError('rate_limited', 'Too many attempts. Try again shortly.', 45);
      }
      if (forced === 'locked') {
        throw new AuthError('locked', 'This account is temporarily locked.', 600);
      }
    } catch (err) {
      if (err instanceof AuthError) throw err;
      // localStorage access failed (private mode etc.) — proceed.
    }
  }

  try {
    // Only include `password` in the request body when the caller actually
    // supplied a non-empty string. The backend treats missing and empty as
    // equivalent ("no password to stamp"), but omitting it keeps network
    // payloads in devtools clean for the legacy OTP-only path.
    const body = { phone, otp, role };
    if (typeof password === 'string' && password.length > 0) {
      body.password = password;
    }
    const data = await api.post('/auth/verify-otp', body);
    // Backend contract: `{ token, user: { role, phone, hasPassword, name?, subscriberId?, ... } }`.
    if (!data || typeof data.token !== 'string' || !data.user) {
      throw new AuthError('invalid_otp', 'Could not verify the code. Please try again.');
    }
    return data;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    const code = err?.code || 'invalid_otp';
    const retry = err?.body?.retryAfterSeconds;
    throw new AuthError(code, err?.message || messageForCode(code), retry);
  }
}

/**
 * @endpoint POST /api/auth/verify-password
 * @param {string} phone - Phone number used at sign-in
 * @param {string} password - Plaintext password to verify
 * @param {string} role - subscriber|distributor|branch|agent
 * @returns {Promise<{token: string, user: {phone: string, role: string, hasPassword: boolean, name?: string, subscriberId?: string, agentId?: string, branchId?: string, distributorId?: string}}>}
 * @description Returning-user password sign-in. Mirrors `verifyOtp`'s success
 *   shape (`{ token, user }`) so callers (SignInModal → AuthContext.login)
 *   handle either branch interchangeably. Backend returns 401 `password_not_set`
 *   when the `users(phone, role)` row is missing OR `password_hash` is NULL,
 *   and 401 `invalid_password` on a hash mismatch. Both surface here as
 *   `AuthError` instances so the UI can route to the OTP fallback or render
 *   an inline error.
 * @scope Public — no authentication required.
 */
export async function signInWithPassword(phone, password, role) {
  try {
    const data = await api.post('/auth/verify-password', { phone, role, password });
    // Backend contract: `{ token, user: { role, phone, hasPassword, name?, subscriberId?, ... } }`.
    if (!data || typeof data.token !== 'string' || !data.user) {
      throw new AuthError('invalid_password', 'Could not verify the password. Please try again.');
    }
    return data;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    const code = err?.code || 'network';
    const retry = err?.body?.retryAfterSeconds;
    throw new AuthError(code, err?.message || messageForCode(code), retry);
  }
}

/**
 * @endpoint POST /api/auth/change-password
 * @param {string} currentPassword - Existing password (omitted from the body when
 *   empty/undefined — backend skips the check when the user's stored hash is
 *   NULL, i.e. the initial-set path).
 * @param {string} newPassword - New password (≥8 chars, ≥1 letter, ≥1 digit).
 * @returns {Promise<{ok: true, hasPassword: true}>}
 * @description Authenticated endpoint — `api.post` auto-injects
 *   `Authorization: Bearer <upensions_token>` via `services/api.js`, mirroring
 *   how every other post-login request is made. Used by the Settings panel to
 *   either stamp a password onto a row that doesn't have one yet (OTP-only
 *   account) or rotate an existing one. Errors map to the same `AuthError`
 *   codes the verify-otp / verify-password routes surface
 *   (`current_password_required`, `current_password_invalid`,
 *   `password_too_short`, `password_too_weak`, `password_too_long`,
 *   `password_required`, `unauthorized`, `network`).
 * @scope Authenticated.
 */
export async function changePassword(currentPassword, newPassword) {
  try {
    // Omit currentPassword from the payload entirely when the caller has no
    // current credential to send (initial-set path). The server treats missing
    // and empty as equivalent, but a clean body keeps devtools readable.
    const body = { newPassword };
    if (typeof currentPassword === 'string' && currentPassword.length > 0) {
      body.currentPassword = currentPassword;
    }
    const data = await api.post('/auth/change-password', body);
    // Backend contract: `{ ok: true, hasPassword: true }`.
    if (!data || data.ok !== true) {
      throw new AuthError('network', 'Could not update password. Please try again.');
    }
    return data;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    const code = err?.code || 'network';
    throw new AuthError(code, err?.message || messageForCode(code));
  }
}

/**
 * @description Checks whether a role has a built dashboard. Currently 'distributor',
 *   'branch', 'subscriber', and 'agent' have dashboards. Other roles (employer,
 *   admin) are routed to `/coming-soon`. This is a client-side guard — the
 *   backend should enforce the same check on protected endpoints.
 * @param {string} role - User role to check
 * @returns {boolean} Whether the role has a dashboard
 */
export function hasDashboard(role) {
  return DASHBOARD_ROLES.includes(role);
}

export { DASHBOARD_ROLES };
