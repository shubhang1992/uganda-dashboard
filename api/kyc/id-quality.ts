// POST /api/kyc/id-quality
//
// Public route. Mirrors `assessImageQuality` in src/services/kyc.js.
// Stateless mock — no database, no auth header. Returns a QualityReport.
//
// The real provider (Smile ID Document Verification) runs the same checks
// server-side. This stub simulates ~900ms of latency so the UI's animated
// checks remain meaningful during a live demo.
//
// QA override: pass `x-qa-force` header with one of:
//   - 'fail-blur'    → blur check fails
//   - 'fail-corners' → corners check fails
//   - 'fail-glare'   → glare check fails

import type { VercelRequest, VercelResponse } from '@vercel/node';

const SIMULATED_LATENCY_MS = 900;

type QualityReport = {
  blur: boolean;
  corners: boolean;
  glare: boolean;
  pass: boolean;
  score: number;
};

function buildQuality({
  blur = true,
  corners = true,
  glare = true,
}: { blur?: boolean; corners?: boolean; glare?: boolean }): QualityReport {
  const pass = blur && corners && glare;
  const score = [blur, corners, glare].filter(Boolean).length / 3;
  return { blur, corners, glare, pass, score };
}

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

  // Header lookup is case-insensitive in Node's IncomingMessage.headers; the
  // key is always lower-cased on the way in.
  const forced = req.headers['x-qa-force'];
  const force = Array.isArray(forced) ? forced[0] : forced;

  if (force === 'fail-blur') return res.status(200).json(buildQuality({ blur: false }));
  if (force === 'fail-corners') return res.status(200).json(buildQuality({ corners: false }));
  if (force === 'fail-glare') return res.status(200).json(buildQuality({ glare: false }));

  // The JS service also has a file-size heuristic — files under 20 KiB fail
  // the blur check. The HTTP version can't see the raw file (the frontend
  // POSTs an envelope rather than the raw blob), so we trust the client-side
  // pre-check and otherwise return a pass.
  return res.status(200).json(buildQuality({}));
}
