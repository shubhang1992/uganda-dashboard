// Regression spec: branch dashboard mobile drawer behaves.
//
// Why: on mobile, BranchDashboardShell.jsx hides the desktop sidebar and
// renders a MobileHeader with a hamburger trigger. Tapping it should:
//   1. Slide a MobileDrawer in from the left (role="dialog" aria-modal).
//   2. Lock body scroll (document.body.style.overflow = 'hidden').
//   3. Forward navigation clicks via onNavigate (which closes the drawer).
//   4. Close on Escape.
//
// We only run on mobile viewports — playwright.config.ts gates this file
// via the `mobile-chromium` and `mobile-webkit` project testMatch.

import { test, expect } from '@playwright/test';
import { storageStatePathFor } from '../../fixtures/auth';
import { disableAnimations } from '../../fixtures/motion';

test.use({ storageState: storageStatePathFor('branch') });

test.describe('branch mobile drawer regression (mobile only)', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    // Belt-and-braces: this file should only ever run under the mobile
    // projects (testMatch in playwright.config.ts) — but if someone invokes
    // it on the desktop chromium project we want a clear skip rather than
    // a confusing "hamburger not found" failure.
    test.skip(!isMobile, 'this file is mobile-only — hamburger is hidden on desktop viewport');
    await disableAnimations(page);
  });

  test('hamburger renders in the mobile header', async ({ page }) => {
    await page.goto('/dashboard');
    // BranchDashboardShell uses aria-label="Open menu" when closed,
    // "Close menu" when open. We assert the closed state.
    const hamburger = page.getByRole('button', { name: /open menu/i });
    await expect(hamburger).toBeVisible({ timeout: 10_000 });
    await expect(hamburger).toHaveAttribute('aria-expanded', 'false');
  });

  test('clicking the hamburger opens the drawer and locks body scroll', async ({ page }) => {
    await page.goto('/dashboard');
    const hamburger = page.getByRole('button', { name: /open menu/i });
    await expect(hamburger).toBeVisible();

    await hamburger.click();

    // Drawer is role="dialog" aria-label="Branch dashboard menu".
    const drawer = page.getByRole('dialog', { name: /branch dashboard menu/i });
    await expect(drawer).toBeVisible();

    // Body scroll is locked. We check the inline style — the effect sets
    // document.body.style.overflow = 'hidden' in BranchDashboardShell.
    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflow).toBe('hidden');

    // Hamburger aria-expanded flips.
    const hamburgerNow = page.getByRole('button', { name: /close menu/i });
    await expect(hamburgerNow).toHaveAttribute('aria-expanded', 'true');
  });

  test('clicking Create Agent inside the drawer closes the drawer + opens the form', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /open menu/i }).click();
    const drawer = page.getByRole('dialog', { name: /branch dashboard menu/i });
    await expect(drawer).toBeVisible();

    // BranchSidebar drawer mode shows Agents as a collapsible group — we
    // must expand it first, then click the "Create new agent" sub-item.
    const agentsToggle = drawer.getByRole('button', { name: /^agents$/i });
    await expect(agentsToggle).toBeVisible({ timeout: 5_000 });
    await agentsToggle.click();

    const createAgent = drawer.getByRole('button', { name: /create new agent/i });
    await expect(createAgent).toBeVisible({ timeout: 5_000 });
    await createAgent.click();

    // Drawer closes (drawer dialog should disappear).
    await expect(drawer).toHaveCount(0, { timeout: 5_000 });

    // The CreateAgent slide-in panel opens — heading "Create New Agent"
    // (h2 in src/branch-dashboard/agent/CreateAgent.jsx line 250).
    await expect(
      page.getByRole('heading', { name: /create new agent/i, level: 2 }),
    ).toBeVisible({ timeout: 10_000 });

    // Body scroll restored (overflow cleared by the MobileDrawer effect
    // cleanup — see BranchDashboardShell.jsx:48-63).
    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflow).not.toBe('hidden');
  });

  test('Escape inside the drawer closes the drawer', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /open menu/i }).click();
    const drawer = page.getByRole('dialog', { name: /branch dashboard menu/i });
    await expect(drawer).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);

    // Body scroll restored.
    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflow).not.toBe('hidden');
  });
});
