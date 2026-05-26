// POST /api/auth/send-otp
//
// Dev-bypass stub — no SMS provider is wired in for the demo. Validates the
// phone shape and role enum and returns `{ success: true }`. The frontend's
// existing `sendOtp` service expects this exact response shape.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { toCanonicalUGPhone } from '../_lib/phone.js';

const VALID_ROLES = new Set(['subscriber', 'agent', 'branch', 'distributor']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ code: 'method_not_allowed' });
    return;
  }

  // B13: every response path on this auth route must be uncacheable. Setting
  // the header once at the top of the handler covers success + all 4xx paths.
  res.setHeader('Cache-Control', 'no-store');

  // Vercel parses JSON bodies by default when the content-type is set.
  const body = (req.body ?? {}) as { phone?: unknown; role?: unknown };
  const { phone, role } = body;

  // Accept any caller-side form (9-digit local, '0XX…', canonical) and
  // normalize. Matches verify-otp's contract so the two routes agree on
  // what counts as a valid phone — previously the regex-only check here
  // surfaced a console 400 every time SignInModal fired the warm-up send.
  if (typeof phone !== 'string' || phone.length === 0) {
    res.status(400).json({ code: 'invalid_request' });
    return;
  }
  if (!toCanonicalUGPhone(phone)) {
    res.status(400).json({ code: 'invalid_request' });
    return;
  }
  if (typeof role !== 'string' || !VALID_ROLES.has(role)) {
    res.status(400).json({ code: 'invalid_request' });
    return;
  }

  // No SMS provider for the demo — accept any well-formed request and let the
  // verify step pick up the actual OTP (which is also dev-bypassed).
  res.status(200).json({ success: true });
}
