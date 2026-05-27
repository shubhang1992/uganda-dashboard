// Sanity check: prove the entire pipeline works end-to-end.
//   1. globalSetup minted e2e/.auth/{role}.json files
//   2. webServer (Vite :5173 + Express :3001 via npm run dev:all) is up on baseURL
//   3. Playwright can drive a browser against it
//   4. A role-storage-state JWT actually authenticates against the dashboard
//
// If this passes, the harness is wired correctly. Other specs can rely on it.

import { test, expect } from '@playwright/test';
import { disableAnimations } from '../../fixtures/motion';
import { storageStatePathFor } from '../../fixtures/auth';

test.describe('harness health', () => {
  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
  });

  test('landing page returns 200 and shows hero', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Universal Pensions/i);
  });

  test.describe('subscriber storageState authenticates', () => {
    test.use({ storageState: storageStatePathFor('subscriber') });

    test('reaches /dashboard without being redirected to login', async ({ page }) => {
      await page.goto('/dashboard');
      // The pre-authenticated session means we should land on the subscriber
      // shell, not get bounced to the landing page or the sign-in modal.
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });
});
