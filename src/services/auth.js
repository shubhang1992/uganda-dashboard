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
 * @returns {Promise<{token: string, user: {phone: string, role: string, name?: string, subscriberId?: string, agentId?: string, branchId?: string, distributorId?: string}}>}
 * @description Verifies the OTP, upserts the `users` row, and returns the HS256
 *   JWT (signed with the Supabase JWT secret) along with the user shape the
 *   frontend stores in `AuthContext`. `name` may be omitted (undefined) when
 *   the resolved entity doesn't have one — callers should handle as optional.
 *   Errors are thrown as `AuthError` instances with a `code` (invalid_otp,
 *   rate_limited, locked) and optional `retryAfterSeconds`.
 * @scope Public — no authentication required.
 */
export async function verifyOtp(phone, otp, role) {
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
    const data = await api.post('/auth/verify-otp', { phone, otp, role });
    // Backend contract: `{ token, user: { role, phone, name?, subscriberId?, ... } }`.
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
