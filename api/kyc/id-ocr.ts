// POST /api/kyc/id-ocr
//
// Public route. Mirrors `extractIdFields` in src/services/kyc.js.
// Stateless mock — no database, no auth header. Returns an IdExtraction.
//
// Real flow (Smile ID Document Verification): OCR reads printed fields from
// the front of the Uganda National ID; the barcode decoder reads the PDF417
// on the back and cross-checks both. Confidence reflects OCR + barcode
// agreement.
//
// This stub returns a fixed sample subscriber. ~2200ms simulated latency.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const SIMULATED_LATENCY_MS = 2200;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ code: 'method_not_allowed' });
  }

  await new Promise((r) => setTimeout(r, SIMULATED_LATENCY_MS));

  // The body envelope is { front: <token>, back: <token>, sessionId?: string }.
  // In the real provider, `front` and `back` would be multipart uploads; here
  // we accept any truthy values as proof that both sides were captured.
  const body = (req.body ?? {}) as { front?: unknown; back?: unknown };

  if (!body.front || !body.back) {
    return res
      .status(400)
      .json({ code: 'id_sides_required' });
  }

  // Note: Ugandan National IDs don't carry a district. The user always picks
  // it manually on ReviewStep, so we deliberately omit it from the OCR
  // response — otherwise the "Auto-filled" badge would appear on a value the
  // ID never actually contained.
  return res.status(200).json({
    fullName: 'Namukasa Sarah Kintu',
    nin: 'CF92018AB3CD45',
    cardNumber: 'UG7412903',
    dob: '1992-06-18',
    gender: 'female',
    barcodeRaw: 'CF92018AB3CD45|UG7412903|1992-06-18|NAMUKASA,SARAH,KINTU',
    confidence: 0.94,
  });
}
