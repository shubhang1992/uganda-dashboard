// Auth service — mock implementation. Replace with real API calls when backend is ready.

const DASHBOARD_ROLES = ['distributor', 'branch', 'subscriber'];

/**
 * @endpoint POST /api/auth/send-otp
 * @param {string} phone - Ugandan phone number (without +256 prefix)
 * @param {string} role - User role (subscriber|employer|distributor|branch|agent|admin)
 * @returns {Promise<{success: boolean}>}
 * @description Sends a one-time password to the given phone number for authentication.
 *   Currently accepts any phone — mock implementation.
 * @scope Public — no authentication required.
 */
export async function sendOtp(phone, role) {
  // Future: api.post('/auth/send-otp', { phone, role })
  return { success: true };
}

/**
 * @endpoint POST /api/auth/verify-otp
 * @param {string} phone - Phone number used in sendOtp
 * @param {string} otp - 6-digit OTP code
 * @param {string} role - User role being authenticated
 * @returns {Promise<{token: string, user: {phone: string, role: string, name: string, branchId?: string}}>}
 * @description Verifies OTP and returns JWT token + user profile. Currently accepts any 6-digit code.
 *   For branch role, response should include branchId. For agent role, should include agentId.
 *   For distributor role, may include distributorId if multi-distributor support is added.
 * @scope Public — no authentication required.
 */
export async function verifyOtp(phone, otp, role) {
  // Future: api.post('/auth/verify-otp', { phone, otp })
  // Mock: any 6-digit OTP is accepted
  return {
    token: 'mock-jwt-token',
    user: { phone, role, name: 'Demo User' },
  };
}

/**
 * @description Checks whether a role has dashboard access. Currently only 'distributor' and 'branch'.
 *   This is a client-side guard — the backend should enforce the same check on protected endpoints.
 * @param {string} role - User role to check
 * @returns {boolean} Whether the role has a dashboard
 */
export function hasDashboard(role) {
  return DASHBOARD_ROLES.includes(role);
}
