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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = (req.body ?? {}) as ContactBody;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!name) return res.status(400).json({ error: 'name is required.' });
  if (!email) return res.status(400).json({ error: 'email is required.' });
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'email must be a valid address.' });
  }
  if (!message) return res.status(400).json({ error: 'message is required.' });

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
    return res.status(500).json({ error: 'Could not record submission.' });
  }

  return res.status(200).json({ submitted: true, id });
}
