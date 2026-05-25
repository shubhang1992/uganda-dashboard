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

const SIMULATED_LATENCY_MS = 1200;

type AmlResult = {
  outcome: 'clear' | 'flagged';
  trackingId: string;
};

function mockTrackingId(): string {
  return `smile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

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
