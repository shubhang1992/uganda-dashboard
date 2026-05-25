// POST /api/kyc/face-match
//
// Public route. Mirrors `faceMatch` in src/services/kyc.js.
// Stateless mock — no database, no auth header.
//
// QA override: pass `x-qa-force` header with one of:
//   - 'liveness-fail' → selfie wasn't live (match=false, liveness=false)
//   - 'no-match'      → liveness ok but face doesn't match the ID
//
// Default response: clean match with high confidence.
// ~1500ms simulated latency.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const SIMULATED_LATENCY_MS = 1500;

type FaceMatchResult = {
  match: boolean;
  liveness: boolean;
  matchScore: number;
  outcome: 'ok' | 'liveness-fail' | 'no-match';
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

  // The body envelope is { selfieFile: <token>, nin: string, sessionId?: string }.
  // We defensively check the selfie token before sleeping, matching the JS
  // service which throws if the rehydrated localStorage state dropped the
  // selfie blob.
  const body = (req.body ?? {}) as { selfieFile?: unknown; nin?: string };
  if (!body.selfieFile) {
    return res
      .status(400)
      .json({ error: 'Selfie image is missing — please retake.' });
  }

  await new Promise((r) => setTimeout(r, SIMULATED_LATENCY_MS));

  const forced = req.headers['x-qa-force'];
  const force = Array.isArray(forced) ? forced[0] : forced;

  if (force === 'liveness-fail') {
    const result: FaceMatchResult = {
      match: false,
      liveness: false,
      matchScore: 0,
      outcome: 'liveness-fail',
      trackingId: mockTrackingId(),
    };
    return res.status(200).json(result);
  }

  if (force === 'no-match') {
    const result: FaceMatchResult = {
      match: false,
      liveness: true,
      matchScore: 0.42,
      outcome: 'no-match',
      trackingId: mockTrackingId(),
    };
    return res.status(200).json(result);
  }

  const result: FaceMatchResult = {
    match: true,
    liveness: true,
    matchScore: 0.97,
    outcome: 'ok',
    trackingId: mockTrackingId(),
  };
  return res.status(200).json(result);
}
