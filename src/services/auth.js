// Auth service — mock implementation. Replace with real API calls when backend is ready.

const DASHBOARD_ROLES = ['distributor', 'branch'];

export async function sendOtp(phone, role) {
  // Future: api.post('/auth/send-otp', { phone, role })
  return { success: true };
}

export async function verifyOtp(phone, otp, role) {
  // Future: api.post('/auth/verify-otp', { phone, otp })
  // Mock: any 6-digit OTP is accepted
  return {
    token: 'mock-jwt-token',
    user: { phone, role, name: 'Demo User' },
  };
}

export function hasDashboard(role) {
  return DASHBOARD_ROLES.includes(role);
}
