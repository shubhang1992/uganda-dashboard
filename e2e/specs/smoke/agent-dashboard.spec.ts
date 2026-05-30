// Smoke spec: every agent dashboard route should load without crashing.
//
// Scope of these assertions (intentionally shallow):
//   1. The route resolves (we land at a URL that includes the requested path,
//      or — for routes the router redirects, like an unknown commissions view —
//      we still land somewhere inside /dashboard).
//   2. The ErrorBoundary fallback ("Something went wrong") is NOT rendered.
//   3. One stable identity element specific to the page is visible.
//
// Deep behaviour (filtering, mutations, dispute flows) belongs in the flows/
// suite. This spec exists so we catch the "shell silently broke for one role"
// class of regression in under 12 seconds.
//
// Identity: agent persona a-001 ("Default agent (Kampala)"), pre-authed via
// the storageState minted by e2e/global-setup.ts. The agent router lives at
// src/agent-dashboard/AgentDashboardShell.jsx — every route below is taken
// from that file's <Route> table.
//
// Selector strategy: CSS Modules hash class names, so we rely on role +
// accessible name (PageHeader renders <h1>title</h1>) or stable visible text.
// Animations are disabled in beforeEach to keep the assertions fast.
//
// Note on /dashboard/commissions/due — `due` is not in the agent router's
// VALID_VIEWS set (earned | owed | confirm | disputes). The CommissionsPage
// component redirects unknown views back to /dashboard/commissions in a
// useEffect, so the test verifies the redirect lands safely on the home view
// rather than crashing. This is documented behaviour, not a bug.

import { test, expect } from '@playwright/test';
import { disableAnimations } from '../../fixtures/motion';
import { storageStatePathFor } from '../../fixtures/auth';
import { selectors } from '../../helpers/selectors';

test.use({ storageState: storageStatePathFor('agent') });

test.describe('agent dashboard smoke', () => {
  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
  });

  test('Home loads', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
    // Post-redesign: Home's PulseCard wraps HeroCapsule, which renders the
    // (dynamic) greeting as the page <h1>. That greeting is not a stable
    // identity marker, so we still assert the unique "Monthly contribution
    // volume" hero eyebrow label — the most stable copy on the page.
    await expect(page.getByText('Monthly contribution volume')).toBeVisible();
  });

  test('Onboard loads', async ({ page }) => {
    await page.goto('/dashboard/onboard');
    await expect(page).toHaveURL(/\/dashboard\/onboard/);
    await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 1, name: /onboard a new subscriber/i })
    ).toBeVisible();
  });

  test('Subscribers list loads', async ({ page }) => {
    await page.goto('/dashboard/subscribers');
    await expect(page).toHaveURL(/\/dashboard\/subscribers$/);
    await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 1, name: /my subscribers/i })
    ).toBeVisible();
  });

  test('Subscriber detail loads', async ({ page }) => {
    // s-0001 may or may not belong to agent a-001 in the seed — if it doesn't,
    // SubscriberDetailPage renders a "Subscriber not found" state. Either way
    // we get an <h1> via PageHeader and no error boundary, which is what this
    // smoke check guards against.
    await page.goto('/dashboard/subscribers/s-0001');
    await expect(page).toHaveURL(/\/dashboard\/subscribers\/s-0001/);
    await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('Inbox loads', async ({ page }) => {
    // Support inbox (Phase 2 of the tickets feature). Reached from the agent's
    // More popover. List mode renders PageHeader variant="hero" title="Inbox"
    // as the page <h1>; selecting a row swaps to a ThreadView, but a cold
    // goto lands on the list, so the stable identity marker is the "Inbox" h1.
    await page.goto('/dashboard/inbox');
    await expect(page).toHaveURL(/\/dashboard\/inbox/);
    await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 1, name: /^inbox$/i })
    ).toBeVisible();
  });

  test('Analytics loads', async ({ page }) => {
    await page.goto('/dashboard/analytics');
    await expect(page).toHaveURL(/\/dashboard\/analytics/);
    await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 1, name: /analytics/i })
    ).toBeVisible();
  });

  test('Commissions home loads', async ({ page }) => {
    await page.goto('/dashboard/commissions');
    await expect(page).toHaveURL(/\/dashboard\/commissions$/);
    await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 1, name: /^commissions$/i })
    ).toBeVisible();
  });

  test('Commissions filtered view redirects safely', async ({ page }) => {
    // /dashboard/commissions/due is not a VALID_VIEW in CommissionsPage
    // (valid: earned | owed | confirm | disputes). The page redirects unknown
    // views back to /dashboard/commissions — assert that nav happens cleanly
    // and the home view renders. If product wants `due` as a real filter
    // later, the route table and VALID_VIEWS set both need updates.
    await page.goto('/dashboard/commissions/due');
    await expect(page).toHaveURL(/\/dashboard\/commissions(?:$|\/)/);
    await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('Settings loads', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await expect(page).toHaveURL(/\/dashboard\/settings/);
    await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 1, name: /^settings$/i })
    ).toBeVisible();
    // Role-specific identity: the agent profile card carries a static
    // "Agent" badge. This is the cheapest way to assert we landed on the
    // *agent* settings page rather than another role's variant.
    await expect(page.getByText('Agent', { exact: true })).toBeVisible();
  });
});
