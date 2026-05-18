// Subscriber dashboard smoke spec — one test per route, asserting only that
// the page navigates without crashing, the ErrorBoundary fallback is not on
// screen, and a single role-specific identity element renders. Deeper
// behavioural assertions (form submits, balance maths, schedule writes) are
// out of scope for SMOKE and live in Phase 2 flow specs.
//
// All routes piggy-back on the pre-minted subscriber storageState produced by
// global-setup, so each test loads at /dashboard/* already authenticated. Most
// pages render a <PageHeader> whose <h1> title is the cheapest, hashed-class-
// free identity anchor; HomePage is the exception and is identified via its
// "Total balance" copy from PulseCard.

import { test, expect } from '@playwright/test';
import { disableAnimations } from '../../fixtures/motion';
import { storageStatePathFor } from '../../fixtures/auth';

test.use({ storageState: storageStatePathFor('subscriber') });

test.describe('subscriber dashboard smoke', () => {
  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
  });

  test('Home loads (/dashboard)', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard\/?$/);
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    // PulseCard renders the "Total balance" label even before the balance
    // count-up has finished animating — stable identity anchor for HomePage.
    await expect(page.getByText(/total balance/i).first()).toBeVisible();
  });

  test('Save loads (/dashboard/save)', async ({ page }) => {
    await page.goto('/dashboard/save');
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: /top up/i })).toBeVisible();
  });

  test('Schedule loads (/dashboard/save/schedule)', async ({ page }) => {
    await page.goto('/dashboard/save/schedule');
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    // SchedulePage title flips between "Set a schedule" (new) and "Tune your
    // schedule" (existing). The seeded subscriber has a schedule, but match
    // both so the test survives demo-data resets.
    await expect(
      page.getByRole('heading', { level: 1, name: /(set a schedule|tune your schedule)/i }),
    ).toBeVisible();
  });

  test('Withdrawals hub loads (/dashboard/withdraw)', async ({ page }) => {
    await page.goto('/dashboard/withdraw');
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: /withdrawals/i })).toBeVisible();
  });

  test('Withdraw savings loads (/dashboard/withdraw/savings)', async ({ page }) => {
    await page.goto('/dashboard/withdraw/savings');
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: /^withdraw$/i })).toBeVisible();
  });

  test('Claim loads (/dashboard/withdraw/claim)', async ({ page }) => {
    await page.goto('/dashboard/withdraw/claim');
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: /file a claim/i })).toBeVisible();
  });

  test('Claim redirect resolves (/dashboard/claim -> /dashboard/withdraw/claim)', async ({ page }) => {
    await page.goto('/dashboard/claim');
    await expect(page).toHaveURL(/\/dashboard\/withdraw\/claim$/);
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: /file a claim/i })).toBeVisible();
  });

  test('Projection loads (/dashboard/projection)', async ({ page }) => {
    await page.goto('/dashboard/projection');
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: /goal projection/i })).toBeVisible();
  });

  test('Activity redirect resolves (/dashboard/activity -> /dashboard/reports/all-transactions)', async ({ page }) => {
    await page.goto('/dashboard/activity');
    await expect(page).toHaveURL(/\/dashboard\/reports\/all-transactions$/);
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: /all transactions/i })).toBeVisible();
  });

  test('Reports loads (/dashboard/reports)', async ({ page }) => {
    await page.goto('/dashboard/reports');
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: /^reports$/i })).toBeVisible();
  });

  test('All Transactions report loads (/dashboard/reports/all-transactions)', async ({ page }) => {
    await page.goto('/dashboard/reports/all-transactions');
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: /all transactions/i })).toBeVisible();
  });

  test('Contributions Summary report loads (/dashboard/reports/contributions-summary)', async ({ page }) => {
    // ReportsPage's REPORT_VIEWS map keys the route segment as
    // "contributions-summary", not "contributions" — verified in
    // src/subscriber-dashboard/pages/ReportsPage.jsx.
    await page.goto('/dashboard/reports/contributions-summary');
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: /contributions summary/i })).toBeVisible();
  });

  test('Help loads (/dashboard/help)', async ({ page }) => {
    await page.goto('/dashboard/help');
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: /how can we help/i })).toBeVisible();
  });

  test('Agent loads (/dashboard/agent)', async ({ page }) => {
    await page.goto('/dashboard/agent');
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    // AgentPage title is `agent?.name || 'Your agent'` — agent name depends on
    // who is assigned to the seeded subscriber, so assert on the level-1
    // heading existing rather than a brittle name match.
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('Settings loads (/dashboard/settings)', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: /^settings$/i })).toBeVisible();
  });

  test('Profile loads (/dashboard/settings/profile)', async ({ page }) => {
    await page.goto('/dashboard/settings/profile');
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: /^profile$/i })).toBeVisible();
  });
});
