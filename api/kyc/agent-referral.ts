// POST /api/kyc/agent-referral
//
// Public route. Mirrors `referToAgent` in src/services/kyc.js.
// INSERTs a row into agent_referrals via the service-role Supabase client
// (RLS is bypassed because signup KYC runs before the user has a JWT).
//
// Body: { phone, reason, stage?, trackingId?, sessionId? }
// Returns { ticketId, eta } — the ticketId is surfaced to the user so they
// can quote it when they meet a real agent.
//
// ~600ms simulated latency to match the JS service.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import supabaseAdmin from '../_lib/supabase-admin.js';

const SIMULATED_LATENCY_MS = 600;
const TICKET_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateTicketId(): string {
  let suffix = '';
  for (let i = 0; i < 4; i += 1) {
    suffix += TICKET_ALPHABET[Math.floor(Math.random() * TICKET_ALPHABET.length)];
  }
  return `UAG-${suffix}`;
}

function generateRowId(): string {
  // Internal row PK (TEXT). Distinct from the user-facing ticketId so we can
  // collide-recover ticketIds without touching the row PK.
  const random = Math.random().toString(36).slice(2, 8);
  return `ar-${Date.now().toString(36)}-${random}`;
}

type ReferralBody = {
  phone?: string;
  reason?: string;
  stage?: string;
  trackingId?: string;
  sessionId?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await new Promise((r) => setTimeout(r, SIMULATED_LATENCY_MS));

  const body = (req.body ?? {}) as ReferralBody;
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (!phone || !reason) {
    return res.status(400).json({ error: 'phone and reason are required.' });
  }

  const eta = 'within 24 hours';
  const ticketId = generateTicketId();
  const rowId = generateRowId();

  const { error } = await supabaseAdmin.from('agent_referrals').insert({
    id: rowId,
    ticket_id: ticketId,
    phone,
    reason,
    stage: body.stage ?? null,
    tracking_id: body.trackingId ?? null,
    session_id: body.sessionId ?? null,
    status: 'open',
    eta,
  });

  if (error) {
    // Surface a generic error message — the user can still try again or
    // proceed via a different channel. Logged for operator triage.
    // eslint-disable-next-line no-console
    console.error('[agent-referral] insert failed', error);
    return res.status(500).json({ error: 'Could not record referral.' });
  }

  return res.status(200).json({ ticketId, eta });
}
