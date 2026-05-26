// POST /api/kyc/otp-send
//
// Public route. Mirrors the KYC-stage OTP send (`sendOtp` in
// src/services/kyc.js — note this is the KYC-stage OTP, distinct from the
// post-signup auth OTP at /api/auth/send-otp owned by Agent 6).
//
// Stateless mock — no database, no auth header, no actual SMS dispatch.
// ~600ms simulated latency.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { toCanonicalUGPhone } from '../_lib/phone.js';

const SIMULATED_LATENCY_MS = 600;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ code: 'method_not_allowed' });
  }

  // Body shape: { phone: string }. Canonicalise to +256XXXXXXXXX before any
  // downstream use so callers can't slip in `0712…` / `256712…` variants that
  // would later mismatch a stored canonical phone. expiresIn is the OTP
  // validity window in seconds (5 min, matches the JS service stub).
  const body = (req.body ?? {}) as { phone?: unknown };
  const phone = toCanonicalUGPhone(body.phone);
  if (!phone) {
    return res.status(400).json({ code: 'invalid_phone' });
  }

  await new Promise((r) => setTimeout(r, SIMULATED_LATENCY_MS));

  return res.status(200).json({ success: true, expiresIn: 300 });
}
