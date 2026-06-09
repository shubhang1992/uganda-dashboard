// Employer dashboard smoke spec.
//
// Closes audit §7b.8 / F2-07 ("zero employer E2E"). The employer role is shipped
// to production (PR #8) and had NO E2E gate at any layer. This mirrors
// distributor-dashboard.spec.ts: storageState auth (the employer persona minted
// by global-setup → fixtures/auth.ts), then assert the shell shell + its key
// panels render without crashing into the ErrorBoundary fallback.
//
// Employer shell (src/employer-dashboard/EmployerDashboardShell.jsx) is a
// branch-style desktop shell: an icon-rail EmployerSidebar (aria-labelled nav
// buttons: Overview, Employees, Contribution Runs, Insurance, Analytics, Support,
// Settings) over a single <main> EmployerOverview. Each sidebar item opens ONE
// slide-in panel (EmployerSlidePanel → role="dialog" aria-label={title} + an
// <h2> title). "Employees" is a fly-out (View employees / Onboard an employee)
// rather than a direct panel.

import { test, expect } from '@playwright/test';
import { disableAnimations } from '../../fixtures/motion';
import { storageStatePathFor } from '../../fixtures/auth';
import { selectors } from '../../helpers/selectors';

test.use({ storageState: storageStatePathFor('employer') });

test.describe('employer dashboard smoke', () => {
  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
    await page.goto('/dashboard');
    // Let the overview data fetches settle so the error boundary (if any) has
    // mounted by the time we inspect the page.
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
  });

  test('main dashboard loads with the employer shell + sidebar visible', async ({ page }) => {
    // Stay on /dashboard (EmployerDashboardShell, not redirected to /coming-soon
    // by the role guard, nor to the missing-employer screen).
    await expect(page).toHaveURL(/\/dashboard/);
    // The overview hero greets the employer with "Welcome back, …" — a stable
    // anchor that the employer shell mounted (and the employerId resolved, since
    // the missing-id screen renders no greeting).
    await expect(page.getByText(/welcome back/i)).toBeVisible();
    // The sidebar exposes the full nav set as aria-labelled buttons — a quick
    // reachability check across the role's primary destinations.
    await expect(page.getByRole('button', { name: /^overview$/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^employees$/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^contribution runs$/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^insurance$/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^analytics$/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^support$/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^settings$/i }).first()).toBeVisible();
  });

  test('Contribution Runs panel opens', async ({ page }) => {
    await page.getByRole('button', { name: /^contribution runs$/i }).first().click();
    // ContributionRuns wraps EmployerSlidePanel with title "Contribution runs",
    // rendered as role="dialog" aria-label="Contribution runs" + an <h2>.
    await expect(
      page.getByRole('dialog', { name: /contribution runs/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /contribution runs/i, level: 2 }),
    ).toBeVisible();
  });

  test('View employees panel opens from the Employees fly-out', async ({ page }) => {
    // Employees is a fly-out menu (role="menu" aria-label="Employees") → click it
    // then pick "View employees".
    await page.getByRole('button', { name: /^employees$/i }).first().click();
    await page.getByRole('menuitem', { name: /view employees/i }).click();
    // ViewEmployees renders inside an EmployerSlidePanel titled "Employees".
    await expect(
      page.getByRole('dialog', { name: /employees/i }),
    ).toBeVisible();
  });

  test('Insurance panel opens', async ({ page }) => {
    await page.getByRole('button', { name: /^insurance$/i }).first().click();
    // InsuranceBenefits wraps EmployerSlidePanel (role="dialog").
    await expect(page.getByRole('dialog').first()).toBeVisible();
  });

  test('Analytics (reports) panel opens', async ({ page }) => {
    await page.getByRole('button', { name: /^analytics$/i }).first().click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
  });

  test('Settings panel opens', async ({ page }) => {
    // Settings sits in the bottom rail of the sidebar.
    await page.getByRole('button', { name: /^settings$/i }).first().click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
  });
});
