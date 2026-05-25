// POST /api/kyc/otp-send
//
// Public route. Mirrors the KYC-stage OTP send (`sendOtp` in
// src/services/kyc.js — note this is the KYC-stage OTP, distinct from the
// post-signup auth OTP at /api/auth/send-otp owned by Agent 6).
//
// Stateless mock — no database, no auth header, no actual SMS dispatch.
// ~600ms simulated latency.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const SIMULATED_LATENCY_MS = 600;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await new Promise((r) => setTimeout(r, SIMULATED_LATENCY_MS));

  // Body shape: { phone: string }. We don't validate the phone here — the
  // frontend uses the same format check as the auth route. expiresIn is the
  // OTP validity window in seconds (5 min, matches the JS service stub).
  return res.status(200).json({ success: true, expiresIn: 300 });
}
