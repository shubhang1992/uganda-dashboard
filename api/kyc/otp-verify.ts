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
import { toCanonicalUGPhone } from '../_lib/phone.js';

const SIMULATED_LATENCY_MS = 700;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set once at the top so every response path (success + 4xx + 405) is
  // uncacheable. KYC responses can carry verification state / PII and must
  // never be cached — same contract as agent-referral.ts (B13).
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ code: 'method_not_allowed' });
  }

  const body = (req.body ?? {}) as { phone?: unknown; code?: string };
  // Canonicalise the phone before any downstream use; reject early on invalid
  // shapes so this route can't write/read mismatched representations once it
  // grows real persistence.
  const phone = toCanonicalUGPhone(body.phone);
  if (!phone) {
    return res.status(400).json({ code: 'invalid_phone' });
  }

  await new Promise((r) => setTimeout(r, SIMULATED_LATENCY_MS));

  const forced = req.headers['x-qa-force'];
  const force = Array.isArray(forced) ? forced[0] : forced;
  if (force === 'fail') return res.status(200).json({ verified: false });

  const code = body.code;
  if (!code || code.length !== 4) {
    return res.status(200).json({ verified: false });
  }
  if (code === '0000') {
    return res.status(200).json({ verified: false });
  }
  return res.status(200).json({ verified: true });
}
