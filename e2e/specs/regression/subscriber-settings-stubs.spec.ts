// Regression spec (BL-39 / R9): pin two settings redirect routes + nominee-sum.
//
// Why:
//   1. Settings redirects — CLAUDE.md §10b / FRONTEND.md §16b document that the
//      subscriber Settings → Notifications and Settings → Security routes are
//      deliberate redirects back to /dashboard/settings
//      (SubscriberDashboardShell.jsx routes both to
//      `<Navigate replace to="/dashboard/settings" />`). The old `StubPage`
//      placeholders were removed in the audit-remediation cleanup. These
//      routes are NOT bugs — but nothing pinned them, so a future contributor
//      could re-wire a half-finished page, change the redirect target, or
//      accidentally surface a broken screen and no test would notice. This
//      spec asserts each one settles on /dashboard/settings.
//
//   2. Nominee-sum validation — FRONTEND.md / NomineesPage.jsx:206-207 gate
//      the Save CTA on `totalShare === 100`. Adding a nominee while the list
//      already sums to 100% pushes the total past 100, flips the share banner
//      out of its valid state, surfaces the "Balance" auto-fix button, and
//      disables Save. We drive that purely through the UI (no network writes)
//      so the sum-to-100 invariant the backend RPC also enforces has a
//      front-end regression guard.
//
// All assertions here are read-only / client-only (no service-role writes,
// no destructive DB ops), so this spec is safe under the default --workers
// setting alongside the other regression specs.

import { test, expect } from '@playwright/test';
import { storageStatePathFor } from '../../fixtures/auth';
import { disableAnimations } from '../../fixtures/motion';

test.use({ storageState: storageStatePathFor('subscriber') });

test.describe('subscriber settings → redirect routes', () => {
  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
  });

  // Both routes redirect back to the Settings page; titled by their source path.
  const REDIRECTS = [
    { path: '/dashboard/settings/notifications', title: 'Notifications' },
    { path: '/dashboard/settings/security', title: 'Security' },
  ];

  for (const { path, title } of REDIRECTS) {
    test(`${title} settings redirects to /dashboard/settings`, async ({ page }) => {
      await page.goto(path);

      // The route element is `<Navigate replace to="/dashboard/settings" />`,
      // so the final URL settles on the Settings page (no trailing segment).
      await expect(page).toHaveURL(/\/dashboard\/settings$/, { timeout: 15_000 });

      // And the Settings page actually mounts. Its hero PageHeader <h1> reads
      // "Profile" (the /dashboard/settings route renders the Profile tab).
      await expect(
        page.getByRole('heading', { level: 1, name: /^profile$/i }),
      ).toBeVisible({ timeout: 15_000 });
    });
  }
});

test.describe('subscriber nominees → sum-to-100 validation', () => {
  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
  });

  test('exceeding 100% total share disables Save and offers Balance', async ({ page }) => {
    await page.goto('/dashboard/settings/nominees');

    // Page mounts via the hero header.
    await expect(
      page.getByRole('heading', { level: 1, name: /^nominees$/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Share-banner value carries `{totalShare}%`. CSS Modules preserve the
    // source class name as a substring (default Vite scoping), so a
    // `[class*=…]` anchor is stable across dev + prod builds.
    const shareBannerValue = page.locator('[class*="shareBannerValue"]').first();
    await expect(shareBannerValue).toBeVisible({ timeout: 10_000 });
    const addBtn = page.getByRole('button', { name: /add nominee/i });
    const balanceBtn = page.getByRole('button', { name: /^balance$/i });

    // Drive the list into an invalid (≠100%) total. addNominee() seeds a new
    // row with `Math.max(1, floor(100 - totalShare))`, so:
    //   - from a 100%-summed list, one add → 101% (invalid).
    //   - from an empty list, the first add → 100% (valid), the second → 101%.
    // Add until the "Balance" affordance (which only renders while invalid)
    // appears, capped at MAX_NOMINEES (5) to avoid a runaway loop.
    for (let i = 0; i < 5; i += 1) {
      if (await balanceBtn.isVisible().catch(() => false)) break;
      if (!(await addBtn.isEnabled().catch(() => false))) break;
      await addBtn.click();
    }

    // Now the sum is invalid: the valid "Balanced" badge is gone, the auto-fix
    // "Balance" button is present, and Save is gated off.
    await expect(balanceBtn).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/^balanced$/i)).toHaveCount(0);
    await expect(shareBannerValue).not.toHaveText(/^100%$/);
    await expect(page.getByRole('button', { name: /save changes/i })).toBeDisabled();

    // Clicking Balance redistributes shares back to a 100% total, restoring
    // the valid state — proves the recovery path the validation gates.
    await balanceBtn.click();
    await expect(shareBannerValue).toHaveText(/100%/, { timeout: 10_000 });
    await expect(page.getByText(/^balanced$/i)).toBeVisible();
  });
});
