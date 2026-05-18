// Contact form submission service — backed by `POST /api/contact`.
//
// The Vercel route (`api/contact.ts`) returns `{ submitted: true, id }` on
// success. The existing caller (`src/pages/Contact.jsx`) reads `res.demo` to
// decide whether to render a "demo mode" banner. We preserve that contract:
//   - Real path → `{ ok: true, demo: false, id }`
//   - Mock fallback (rollback flag) → `{ ok: true, demo: true }`

import { api } from './api';
import { IS_SUPABASE_ENABLED } from './api';
import { IS_DEV } from '../config/env';

/**
 * @endpoint POST /api/contact
 * @param {{ name: string, email: string, message: string }} payload
 * @returns {Promise<{ ok: true, demo: boolean, id?: string }>}
 *   `demo` is `false` whenever a row was persisted to Supabase (real path)
 *   and `true` under the rollback flag (or in dev when no `/api/*` route is
 *   reachable, in which case the catch branch swallows the network error
 *   and reverts to the previous behaviour).
 */
export async function submitContactForm(payload) {
  if (!IS_SUPABASE_ENABLED) {
    return mockSubmit();
  }
  try {
    const res = await api.post('/contact', {
      name: payload.name,
      email: payload.email,
      message: payload.message,
    });
    // Backend contract: { submitted: true, id }
    return { ok: true, demo: false, id: res?.id };
  } catch (err) {
    // In local dev without `vercel dev` running, the same-origin POST will
    // 404. Falling back to the mock keeps the contact form usable in that
    // mode and matches the spirit of the rollback flag. The mock response
    // sets `demo: true`, which the Contact page surfaces to the user via
    // a banner so they know the message wasn't actually sent and can email
    // ${SUPPORT_EMAIL} instead — no console output needed.
    if (IS_DEV) {
      return mockSubmit();
    }
    throw err;
  }
}

async function mockSubmit() {
  // Demo mode — caller renders a banner from `demo: true` so the user can
  // contact ${SUPPORT_EMAIL} directly if they need a real response.
  // Simulate network latency so the UI's loading state is exercised.
  await new Promise((resolve) => setTimeout(resolve, 600));
  return { ok: true, demo: true };
}
