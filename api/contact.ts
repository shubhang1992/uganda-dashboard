// POST /api/contact
//
// Public route. Validates the landing-page contact form payload and
// INSERTs it into contact_submissions via the service-role Supabase client
// (RLS is bypassed because the form is open to unauthenticated visitors).
//
// Body: { name, email, message }
// Returns: { submitted: true, id }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import supabaseAdmin from './_lib/supabase-admin.js';
import { checkLen } from './_lib/assertLen.js';

// Same regex the frontend uses for client-side validation.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type ContactBody = {
  name?: string;
  email?: string;
  message?: string;
};

function generateId(): string {
  const suffix = Math.random().toString(36).slice(2, 6);
  return `cs-${Date.now()}-${suffix}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(405).json({ code: 'method_not_allowed' });
  }

  // B13: every response path on this route must be uncacheable. Setting the
  // header once at the top of the handler covers success + all 4xx/5xx paths.
  res.setHeader('Cache-Control', 'no-store');

  const body = (req.body ?? {}) as ContactBody;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!name) return res.status(400).json({ code: 'invalid_name' });
  if (!email) return res.status(400).json({ code: 'invalid_email' });
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ code: 'invalid_email' });
  }
  if (!message) return res.status(400).json({ code: 'invalid_message' });

  // §2a.5: explicit per-field length caps before the service-role insert —
  // these fields persist verbatim via the RLS-bypassing admin client, so an
  // over-length field is a storage-spam vector on this public form.
  const tooLong =
    checkLen(name, 120, 'name_too_long') ??
    checkLen(email, 254, 'email_too_long') ??
    checkLen(message, 4000, 'message_too_long');
  if (tooLong) return res.status(400).json(tooLong);

  const id = generateId();

  const { error } = await supabaseAdmin.from('contact_submissions').insert({
    id,
    name,
    email,
    message,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[contact] insert failed', error);
    return res.status(500).json({ code: 'db_error' });
  }

  return res.status(200).json({ submitted: true, id });
}
