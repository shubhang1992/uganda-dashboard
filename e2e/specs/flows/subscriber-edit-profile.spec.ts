// Flow spec: subscriber edits their email via /dashboard/settings/profile.
//
// What this demonstrates (template for future flow specs):
//   1. Auth via storageState — no UI login.
//   2. UI flow — navigate, fill a form, submit, wait for confirmation.
//   3. DB verification via service-role Supabase client (e2e/fixtures/db).
//   4. Cleanup — restore the original value via the same service-role client
//      so reruns don't leave the demo seed in a drifted state.
//
// Why this flow:
//   • Simplest write surface in the subscriber dashboard
//   • Hits a single table (`subscribers`) — easy to reverse
//   • Exercises the auth → form → API → DB chain end-to-end
//
// Service-role notes:
//   • supabaseAdmin in db.ts bypasses RLS by design; it only lives in this
//     Node test process, never the browser context.
//   • If this spec leaves state behind (network drop mid-test), the seeded
//     s-0001 email may end up as the test value. `npm run seed` resets it.

import { test, expect } from '@playwright/test';
import { storageStatePathFor, PERSONA_FOR } from '../../fixtures/auth';
import { disableAnimations } from '../../fixtures/motion';
import { supabaseAdmin, getRow } from '../../fixtures/db';

test.use({ storageState: storageStatePathFor('subscriber') });

const SUBSCRIBER_ID = PERSONA_FOR.subscriber.entityId; // s-0001

type SubscriberRow = { id: string; email: string | null; name: string; phone: string };

// ProfilePage uses a useEffect to hydrate name/email/phone from the
// subscriber query result on arrival. We wait for one of those fields to
// reflect the seeded value before typing — otherwise our `fill()` calls race
// with the hydration effect and get clobbered.

test.describe('subscriber → edit profile (UI + DB)', () => {
  let original: SubscriberRow | null = null;

  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
    const before = await getRow<SubscriberRow>('subscribers', { id: SUBSCRIBER_ID });
    expect(before, `seed subscriber ${SUBSCRIBER_ID} must exist`).not.toBeNull();
    original = before;
  });

  test.afterEach(async () => {
    // Always restore the original values so reruns start clean.
    if (original) {
      const { error } = await supabaseAdmin
        .from('subscribers')
        .update({ name: original.name, email: original.email, phone: original.phone })
        .eq('id', SUBSCRIBER_ID);
      expect(error, `cleanup: restoring profile for ${SUBSCRIBER_ID}`).toBeNull();
    }
  });

  test('saving a new email updates the DB and the UI reflects it', async ({ page }) => {
    const newEmail = `e2e-${Date.now()}@example.com`;
    const testName = original!.name; // keep original name to minimize change surface
    const testPhoneDigits = '700000123'; // valid UG mobile (07XX XXX XXX form)

    // Listen for the PATCH /rest/v1/subscribers response — that's the
    // authoritative signal the save mutation completed.
    const patchPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/rest/v1/subscribers') &&
        res.request().method() === 'PATCH' &&
        res.status() === 200,
      { timeout: 15_000 },
    );

    await page.goto('/dashboard/settings/profile');
    await expect(page.getByRole('heading', { level: 1, name: /^profile$/i })).toBeVisible();

    // Wait for the hydration useEffect to populate the form (otherwise our
    // fill() races with it and gets clobbered). Email is the cleanest barrier
    // because it goes from '' to the seeded value with no intermediate states.
    const emailField = page.getByRole('textbox', { name: /email/i });
    await expect(emailField).toHaveValue(original!.email ?? '');

    // Now safely override the form fields.
    await page.getByRole('textbox', { name: /full name/i }).fill(testName);
    await page.getByRole('textbox', { name: /phone/i }).fill(testPhoneDigits);
    await emailField.fill(newEmail);

    const saveBtn = page.getByRole('button', { name: /save changes/i });
    await expect(saveBtn).toBeEnabled();
    // Brief pause so React has time to flush the canSave=true state from the
    // last fill() before we click — otherwise the click race-conditions with
    // the validator and handleSave returns early via `if (!canSave) return;`.
    await page.waitForTimeout(200);
    await saveBtn.click();

    // Wait for the PATCH /rest/v1/subscribers 200 response — proof that the
    // mutation reached the backend successfully.
    const patchResponse = await patchPromise;
    expect(patchResponse.ok()).toBe(true);

    // [DB] Verify the new email persisted to the subscribers row.
    const after = await getRow<SubscriberRow>('subscribers', { id: SUBSCRIBER_ID });
    expect(after, `subscriber row should still exist after update`).not.toBeNull();
    expect(after!.email).toBe(newEmail);
    expect(after!.phone).toBe(`+256${testPhoneDigits}`);
    // eslint-disable-next-line no-console
    console.log(
      `[db] subscribers.email for ${SUBSCRIBER_ID}: ${original!.email} → ${after!.email}`
    );
  });
});
