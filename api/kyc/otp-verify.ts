// POST /api/kyc/otp-verify
//
// Public route. Mirrors the KYC-stage OTP verify (`verifyOtp` in
// src/services/kyc.js — distinct from the post-signup auth verify owned by
// Agent 6 at /api/auth/verify-otp).
//
// QA override: pass `x-qa-force: fail` to force a rejection.
// Otherwise: accept any 4-digit code except '0000' (which mimics a typo).
// ~700ms simulated latency.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const SIMULATED_LATENCY_MS = 700;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await new Promise((r) => setTimeout(r, SIMULATED_LATENCY_MS));

  const forced = req.headers['x-qa-force'];
  const force = Array.isArray(forced) ? forced[0] : forced;
  if (force === 'fail') return res.status(200).json({ verified: false });

  const body = (req.body ?? {}) as { phone?: string; code?: string };
  const code = body.code;
  if (!code || code.length !== 4) {
    return res.status(200).json({ verified: false });
  }
  if (code === '0000') {
    return res.status(200).json({ verified: false });
  }
  return res.status(200).json({ verified: true });
}
