// Smoke tests for the branch admin dashboard.
//
// Unlike the subscriber/agent dashboards, the branch shell has NO routed
// sub-pages — every drawer is state-based via DashboardPanelContext +
// `splitMode`. There is effectively a single URL (`/dashboard`) and panels
// open by clicking sidebar nav buttons (and, for agent flows, items inside
// the Agents popover).
//
// What we cover:
//   1. /dashboard loads BranchOverview cleanly (no error boundary)
//   2. Each side panel opens from the sidebar:
//        • Create agent  (sidebar → "Agents" → "Create New Agent")
//        • View agents   (sidebar → "Agents" → "View Existing Agents")
//        • View reports  (sidebar → "Reports")
//        • Commissions   (sidebar → "Commissions")
//        • Settings      (bottom sidebar → "Settings")
//
// Sidebar labels are taken verbatim from
// src/branch-dashboard/sidebar/BranchSidebar.jsx (NAV_ITEMS / BOTTOM_ITEMS).
// Popover labels come from the same file (handleClick → 'create-agent' /
// 'view-agents' branches).

import { test, expect } from '@playwright/test';
import { disableAnimations } from '../../fixtures/motion';
import { storageStatePathFor } from '../../fixtures/auth';
import { selectors } from '../../helpers/selectors';

test.use({ storageState: storageStatePathFor('branch') });

test.describe('branch dashboard — smoke', () => {
  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
  });

  test('main overview loads', async ({ page }) => {
    await page.goto('/dashboard');
    // Wait for either the page to settle or the error boundary to mount.
    // networkidle gives data fetches enough time to fail and trigger the boundary.
    await page.waitForLoadState('networkidle', { timeout: 20_000 });
    await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
    await expect(page.getByText(/branch overview/i).first()).toBeVisible();
    await expect(page.getByText(/branch admin/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('Create agent panel opens', async ({ page }) => {
    await page.goto('/dashboard');
    // "Agents" sidebar button opens a popover with two choices.
    await selectors.dashboardShell.agentsTab(page).first().click();
    await page.getByRole('button', { name: /create new agent/i }).click();
    // CreateAgent renders `<h2>Create New Agent</h2>` as the drawer title.
    await expect(
      page.getByRole('heading', { name: /create new agent/i }),
    ).toBeVisible();
  });

  test('View agents panel opens', async ({ page }) => {
    await page.goto('/dashboard');
    await selectors.dashboardShell.agentsTab(page).first().click();
    await page.getByRole('button', { name: /view existing agents/i }).click();
    await expect(
      page.getByRole('heading', { name: /existing agents/i }),
    ).toBeVisible();
  });

  test('View reports panel opens', async ({ page }) => {
    // Reports panel opens via DashboardPanelContext state — independent of the
    // ViewAgents shell crash, so this test passes cleanly even with the bug.
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /^reports$/i }).first().click();
    await expect(
      page.getByRole('heading', { name: /^reports$/i }),
    ).toBeVisible();
  });

  test('Commissions panel opens', async ({ page }) => {
    // Commission panel opens via DashboardPanelContext state — independent of
    // the ViewAgents shell crash, so this test passes cleanly even with the bug.
    await page.goto('/dashboard');
    await selectors.dashboardShell.commissionsTab(page).first().click();
    await expect(
      page.getByRole('dialog', { name: /commission settlement/i }),
    ).toBeVisible();
  });

  test('Settings panel opens', async ({ page }) => {
    await page.goto('/dashboard');
    await selectors.dashboardShell.settingsTab(page).first().click();
    await expect(
      page.getByRole('dialog', { name: /^settings$/i }),
    ).toBeVisible();
  });
});
