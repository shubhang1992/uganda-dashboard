// Auth service — mock implementation. Replace with real API calls when backend is ready.

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

/**
 * Demo identities returned by the mock backend. When the real backend lands,
 * this whole block disappears — `verifyOtp` just forwards the user object
 * from `POST /api/auth/verify-otp`.
 */
const DEMO_USERS = {
  subscriber: { name: 'Demo Subscriber' },
  employer:   { name: 'Demo Employer' },
  distributor:{ name: 'Demo Distributor', distributorId: 'd-001' },
  branch:     { name: 'Demo Branch Admin', branchId: 'b-kam-015' },
  agent:      { name: 'Demo Agent', agentId: 'a-001' },
  admin:      { name: 'Demo Admin' },
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @endpoint POST /api/auth/send-otp
 * @param {string} phone - Ugandan phone number (without +256 prefix)
 * @param {string} role - User role (subscriber|employer|distributor|branch|agent|admin)
 * @returns {Promise<{success: boolean}>}
 * @description Sends a one-time password to the given phone number for authentication.
 *   Currently accepts any phone — mock implementation.
 * @scope Public — no authentication required.
 */
// eslint-disable-next-line no-unused-vars -- params kept for the live backend signature
export async function sendOtp(_phone, _role) {
  // Future: return api.post('/auth/send-otp', { phone, role });
  await delay(180);
  return { success: true };
}

/**
 * @endpoint POST /api/auth/verify-otp
 * @param {string} phone - Phone number used in sendOtp
 * @param {string} otp - 6-digit OTP code
 * @param {string} role - User role being authenticated
 * @returns {Promise<{token: string, user: {phone: string, role: string, name: string, branchId?: string, agentId?: string, distributorId?: string}}>}
 * @description Verifies OTP and returns JWT token + user profile. The real backend
 *   determines branchId/agentId/distributorId from the authenticated identity; the
 *   client must NOT inject these. Errors are thrown as `AuthError` instances with
 *   a `code` (invalid_otp, rate_limited, locked) and optional `retryAfterSeconds`.
 * @scope Public — no authentication required.
 */
export async function verifyOtp(phone, otp, role) {
  await delay(220);

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

  // Mock acceptance: any 6-digit numeric code passes. Real backend will validate.
  if (!/^\d{6}$/.test(String(otp || ''))) {
    throw new AuthError('invalid_otp', 'Invalid code. Please try again.');
  }

  // Future: return api.post('/auth/verify-otp', { phone, otp, role });
  const demo = DEMO_USERS[role] || { name: 'Demo User' };
  return {
    token: 'mock-jwt-token',
    user: { phone, role, ...demo },
  };
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
