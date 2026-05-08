// Contact form submission service.
// Currently a demo stub: no backend exists, so submissions are logged to the
// dev console and the UI shows a success state. Replace with the real
// `api.post('/api/contact', ...)` call once the backend endpoint is live.

import { IS_DEV, SUPPORT_EMAIL } from '../config/env';

/**
 * @endpoint POST /api/contact
 * @param {{ name: string, email: string, message: string }} payload
 * @returns {Promise<{ ok: true, demo?: boolean }>}
 */
export async function submitContactForm(payload) {
  // Future: return api.post('/api/contact', payload);
  if (IS_DEV) {
    console.warn(
      `[contact] Demo mode — message not actually sent. For real inquiries email ${SUPPORT_EMAIL}.`,
      payload,
    );
  }
  // Simulate network latency so the UI's loading state is exercised.
  await new Promise((resolve) => setTimeout(resolve, 600));
  return { ok: true, demo: true };
}
