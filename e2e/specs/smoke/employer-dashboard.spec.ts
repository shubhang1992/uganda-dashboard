// Employer dashboard smoke spec.
//
// The employer desktop experience was rebuilt as a routed shell (the agent/
// subscriber desktop redesign theme): a white collapsible rail
// (EmployerSideNavDesktop) whose NavLinks route to full pages
// (Overview / Employees / Contribution Runs / Insurance / Analytics / Support /
// Settings) under a 3-column shell, with an "Ask AI" copilot + notification bell
// top-right. This shell renders for viewports >= 1024px (useIsDesktop), and this
// spec runs only in the desktop projects (chromium + webkit, 1440x900) — it is
// NOT in the mobile projects' testMatch, so the OLD slide-in-panel shell (still
// used < 1024px) is out of scope here.
//
// We assert: the shell mounts (no ErrorBoundary), the rail exposes the full nav
// as links, each link routes to its page (URL + page heading), and the Ask-AI
// copilot opens. storageState auth = the employer persona (global-setup →
// fixtures/auth.ts).

import { test, expect } from '@playwright/test';
import { disableAnimations } from '../../fixtures/motion';
import { storageStatePathFor } from '../../fixtures/auth';
import { selectors } from '../../helpers/selectors';

test.use({ storageState: storageStatePathFor('employer') });

// Scope link lookups to the primary rail so page-body links (tiles, "Manage
// cover", etc.) never shadow a nav assertion.
const railLink = (page, name) =>
  page.locator('aside[aria-label="Primary"]').getByRole('link', { name });

test.describe('employer dashboard smoke', () => {
  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
  });

  test('desktop shell + rail nav render', async ({ page }) => {
    // Stay on /dashboard (employer role guard passed, employerId resolved → no
    // missing-id screen, which renders no greeting).
    await expect(page).toHaveURL(/\/dashboard/);
    // The Overview page greets the employer with "Welcome back, …".
    await expect(page.getByText(/welcome back/i)).toBeVisible();
    // The rail exposes every primary destination as a NavLink.
    await expect(railLink(page, /^overview$/i)).toBeVisible();
    await expect(railLink(page, /^employees$/i)).toBeVisible();
    await expect(railLink(page, /^contribution runs$/i)).toBeVisible();
    await expect(railLink(page, /^insurance$/i)).toBeVisible();
    await expect(railLink(page, /^analytics$/i)).toBeVisible();
    // "Support" may carry an open-ticket count badge → accessible name "Support N".
    await expect(railLink(page, /^support/i)).toBeVisible();
    await expect(railLink(page, /^settings$/i)).toBeVisible();
  });

  test('Employees route loads', async ({ page }) => {
    await railLink(page, /^employees$/i).click();
    await expect(page).toHaveURL(/\/dashboard\/employees$/);
    await expect(page.getByRole('heading', { level: 1, name: /^employees$/i })).toBeVisible();
  });

  test('Contribution Runs route loads', async ({ page }) => {
    await railLink(page, /^contribution runs$/i).click();
    await expect(page).toHaveURL(/\/dashboard\/runs$/);
    await expect(page.getByRole('heading', { level: 1, name: /contribution runs/i })).toBeVisible();
  });

  test('Insurance route loads', async ({ page }) => {
    await railLink(page, /^insurance$/i).click();
    await expect(page).toHaveURL(/\/dashboard\/insurance$/);
    await expect(page.getByRole('heading', { level: 1, name: /^insurance$/i })).toBeVisible();
  });

  test('Analytics route loads', async ({ page }) => {
    await railLink(page, /^analytics$/i).click();
    await expect(page).toHaveURL(/\/dashboard\/analytics$/);
    await expect(page.getByRole('heading', { level: 1, name: /^analytics$/i })).toBeVisible();
  });

  test('Support route loads', async ({ page }) => {
    await railLink(page, /^support/i).click();
    await expect(page).toHaveURL(/\/dashboard\/support$/);
    await expect(page.getByRole('heading', { level: 1, name: /^support$/i })).toBeVisible();
  });

  test('Settings route loads', async ({ page }) => {
    await railLink(page, /^settings$/i).click();
    await expect(page).toHaveURL(/\/dashboard\/settings/);
    await expect(page.getByRole('heading', { level: 1, name: /^settings$/i })).toBeVisible();
  });

  test('Ask AI copilot opens', async ({ page }) => {
    await page.getByRole('button', { name: /ask ai/i }).click();
    // The copilot panel exposes an "AI assistant" region with a composer input.
    await expect(page.getByRole('complementary', { name: /ai assistant/i })).toBeVisible();
    await expect(page.getByPlaceholder(/ask about staff/i)).toBeVisible();
  });
});
