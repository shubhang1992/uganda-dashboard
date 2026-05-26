// POST /api/kyc/aml-screen
//
// Public route. Mirrors `screenAml` in src/services/kyc.js.
// Stateless mock — no database, no auth header.
//
// QA override: pass `x-qa-force: flagged` to force a sanction-list / PEP hit.
// Default response: clear. ~1200ms simulated latency.
//
// In production this hits Smile ID's compliance API for sanctions + PEP
// screening. Flagged users are routed to back-office review; they should
// never see the screening reason on screen.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { mockTrackingId } from './_lib/mocks';

const SIMULATED_LATENCY_MS = 1200;

type AmlResult = {
  outcome: 'clear' | 'flagged';
  trackingId: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await new Promise((r) => setTimeout(r, SIMULATED_LATENCY_MS));

  const forced = req.headers['x-qa-force'];
  const force = Array.isArray(forced) ? forced[0] : forced;

  if (force === 'flagged') {
    const result: AmlResult = { outcome: 'flagged', trackingId: mockTrackingId() };
    return res.status(200).json(result);
  }

  const result: AmlResult = { outcome: 'clear', trackingId: mockTrackingId() };
  return res.status(200).json(result);
}
