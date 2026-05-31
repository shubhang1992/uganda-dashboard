// POST /api/kyc/nira-verify
//
// Public route. Mirrors `verifyNira` in src/services/kyc.js.
// Stateless mock — no database, no auth header.
//
// QA override: pass `x-qa-force` header with one of:
//   - 'partial'   → returns a partial match with dob mismatch
//   - 'no-match'  → returns a no-match outcome
//
// Default response: clean match.
//
// Latency: ~1800ms. (The JS service uses 2400ms; this route honors the
// 1800ms figure listed in the agent brief.)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { mockTrackingId } from './_lib/mocks.js';

const SIMULATED_LATENCY_MS = 1800;

type NiraResult =
  | { result: 'match'; trackingId: string }
  | {
      result: 'partial';
      mismatchedFields: string[];
      reason: string;
      trackingId: string;
    }
  | { result: 'no-match'; reason: string; trackingId: string };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set once at the top so every response path (success + 4xx + 405) is
  // uncacheable. KYC responses can carry verification state / PII and must
  // never be cached — same contract as agent-referral.ts (B13).
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ code: 'method_not_allowed' });
  }

  await new Promise((r) => setTimeout(r, SIMULATED_LATENCY_MS));

  const forced = req.headers['x-qa-force'];
  const force = Array.isArray(forced) ? forced[0] : forced;

  // B16 demo-scope intentional: verification refusals are 200 with result:'partial'
  // or 'no-match', not 4xx. Client UX surfaces the failure based on the body, not
  // the HTTP status. Do not switch to 4xx.
  if (force === 'partial') {
    const result: NiraResult = {
      result: 'partial',
      mismatchedFields: ['dob'],
      reason:
        'DOB differs from NIRA record by a day — flagged for back-office review.',
      trackingId: mockTrackingId(),
    };
    return res.status(200).json(result);
  }

  if (force === 'no-match') {
    const result: NiraResult = {
      result: 'no-match',
      reason:
        'NIRA could not confirm your identity from the card details provided.',
      trackingId: mockTrackingId(),
    };
    return res.status(200).json(result);
  }

  const result: NiraResult = { result: 'match', trackingId: mockTrackingId() };
  return res.status(200).json(result);
}
