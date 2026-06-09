// Admin dashboard smoke spec.
//
// Closes audit §7b.8 / F2-07 ("zero admin E2E") + §7b.15 ("admin WIP zero
// coverage at any layer"). The admin role ships a map-theme shell
// (src/admin-dashboard/AdminDashboardShell.jsx) that REUSES the distributor map /
// overlay / view panels (role-blind, RLS-scoped — admin holds the *_select_admin
// grants) and adds two admin-exclusive managers: Distributors + Employers.
//
// Sidebar (src/admin-dashboard/sidebar/AdminSidebar.jsx, reusing the distributor
// Sidebar.module.css) exposes aria-labelled buttons: Overview, Distributors,
// Employers, Branches, Agents, Subscribers, Commissions, Support, Reports,
// Settings. Distributors/Employers open admin panels directly; Branches/Agents/
// Subscribers open a fly-out submenu first ("View Existing X"); Commissions opens
// the reused CommissionPanel (role="dialog" name "Commission Settlement").
//
// This mirrors distributor-dashboard.spec.ts (same login helper, same
// describe/test shape, same ErrorBoundary guard).

import { test, expect } from '@playwright/test';
import { disableAnimations } from '../../fixtures/motion';
import { storageStatePathFor } from '../../fixtures/auth';
import { selectors } from '../../helpers/selectors';

test.use({ storageState: storageStatePathFor('admin') });

test.describe('admin dashboard smoke', () => {
  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
    await page.goto('/dashboard');
    // Wait for the data fetches (platform overview + map) to settle so the error
    // boundary, if any, has mounted by the time we inspect the page. §7f map
    // drill-down is exercised separately in regression/map-drill.spec.ts.
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
  });

  test('main dashboard loads with the admin sidebar visible', async ({ page }) => {
    // Stay on /dashboard (AdminDashboardShell, not redirected to login or
    // coming-soon).
    await expect(page).toHaveURL(/\/dashboard/);
    // The admin rail leads with its two exclusive managers, then the reused
    // distributor nav set — a quick reachability check across the role.
    await expect(page.getByRole('button', { name: /^distributors$/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^employers$/i }).first()).toBeVisible();
    await expect(selectors.dashboardShell.branchesTab(page)).toBeVisible();
    await expect(selectors.dashboardShell.agentsTab(page)).toBeVisible();
    await expect(selectors.dashboardShell.subscribersTab(page)).toBeVisible();
    await expect(selectors.dashboardShell.commissionsTab(page)).toBeVisible();
    await expect(page.getByRole('button', { name: /^reports$/i })).toBeVisible();
    await expect(selectors.dashboardShell.settingsTab(page)).toBeVisible();
  });

  test('Distributors panel opens', async ({ page }) => {
    // Distributors opens its admin panel directly (no submenu).
    await page.getByRole('button', { name: /^distributors$/i }).first().click();
    // ViewDistributors renders <h2>Distributors</h2>.
    await expect(
      page.getByRole('heading', { name: /^distributors$/i, level: 2 }),
    ).toBeVisible();
  });

  test('Employers panel opens', async ({ page }) => {
    await page.getByRole('button', { name: /^employers$/i }).first().click();
    // ViewEmployers renders <h2>Employers</h2>.
    await expect(
      page.getByRole('heading', { name: /^employers$/i, level: 2 }),
    ).toBeVisible();
  });

  test('View branches panel opens (reused distributor panel)', async ({ page }) => {
    // Branches is a fly-out; admin's is view-only (no "Create New Branch" — that
    // is RLS-gated to the distributor role).
    await selectors.dashboardShell.branchesTab(page).click();
    await page.getByRole('button', { name: /view existing branches/i }).click();
    await expect(
      page.getByRole('heading', { name: /existing branches/i, level: 2 }),
    ).toBeVisible();
  });

  test('View agents panel opens (reused distributor panel)', async ({ page }) => {
    await selectors.dashboardShell.agentsTab(page).click();
    await page.getByRole('button', { name: /view existing agents/i }).click();
    await expect(
      page.getByRole('heading', { name: /existing agents/i, level: 2 }),
    ).toBeVisible();
  });

  test('View subscribers panel opens (platform-wide)', async ({ page }) => {
    await selectors.dashboardShell.subscribersTab(page).click();
    await selectors.viewListPanel.viewExistingSubscribers(page).click();
    await expect(
      page.getByRole('heading', { name: /subscribers/i, level: 2 }),
    ).toBeVisible();
    // Admin reads the platform total (incl. employer-onboarded), so the panel
    // must NOT show "Showing 0 of 0" — a regression that masked the platform read.
    await expect(page.getByText(/Showing 0 of 0/i)).toHaveCount(0);
  });

  test('Commission panel opens (reused distributor panel)', async ({ page }) => {
    await selectors.dashboardShell.commissionsTab(page).click();
    // CommissionPanel's motion.div carries role="dialog" aria-label="Commission Settlement".
    await expect(
      page.getByRole('dialog', { name: /commission settlement/i }),
    ).toBeVisible();
  });

  test('Settings panel opens', async ({ page }) => {
    await selectors.dashboardShell.settingsTab(page).click();
    await expect(
      page.getByRole('heading', { name: /^settings$/i, level: 2 }),
    ).toBeVisible();
  });
});
