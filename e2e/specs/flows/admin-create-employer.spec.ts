// Flow spec: an admin creates an employer (with a co-contribution funding model)
// and it appears in the platform Employers list.
//
// Closes audit §7b.8 / F2-07 ("≥1 admin flow") + §7b.5 (admin create-employer
// write surface untested at every layer). Admin create-employer is write-flow
// #17 (RPC create_employer, SECURITY DEFINER, gated on app_role='admin' — §4a.1).
//
// The "funding model A5" called for is the §4a A5 / co-contribution model
// (CreateEmployer's default fundingMode='co-contribution' + a Match %). Building
// a non-empty defaultContributionConfig means the created employer can run
// contributions immediately (CreateEmployer §7d-2 rationale).
//
// What this exercises:
//   1. Admin persona auth via storageState (no UI login).
//   2. Sidebar → Employers → "New" launches the CreateEmployer panel.
//   3. Fill the company name + the co-contribution funding model (Match %).
//   4. "Create employer" fires the real create_employer RPC.
//   5. It appears — re-open the Employers panel; the new name is listed.
//   6. DB verify — the employers row exists with the funding config.
//   7. Cleanup — delete the row by name.
//
// Mirrors distributor-create-branch.spec.ts: storageState auth, waitForResponse
// on the write, DB assert, afterEach cleanup via supabaseAdmin.

import { test, expect } from '@playwright/test';
import { storageStatePathFor } from '../../fixtures/auth';
import { disableAnimations } from '../../fixtures/motion';
import { supabaseAdmin, rowExists, getRow } from '../../fixtures/db';

test.use({ storageState: storageStatePathFor('admin') });
test.setTimeout(45_000);

type EmployerRow = {
  id: string;
  name: string;
  sector: string | null;
  default_contribution_config: { mode?: string; matchPct?: number } | null;
};

test.describe('admin → create employer (UI + DB)', () => {
  const employerName = `E2E Employer ${Date.now()}`;
  const sector = 'Manufacturing';
  const matchPct = '50'; // A5 co-contribution funding model.

  test.afterEach(async () => {
    // Auto-clean the inserted employer by name so re-runs don't accumulate
    // duplicate E2E employers in the demo DB.
    const { error } = await supabaseAdmin
      .from('employers')
      .delete()
      .eq('name', employerName);
    expect(error, `cleanup: deleting employer by name ${employerName}`).toBeNull();
  });

  test('creating an employer inserts a row and it appears in the list', async ({ page }) => {
    await disableAnimations(page);

    // Listen for the create_employer RPC that fires when the form submits.
    const rpcPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/rest/v1/rpc/create_employer') &&
        r.request().method() === 'POST',
      { timeout: 20_000 },
    );

    await page.goto('/dashboard');

    // ── Open Employers → "New" → CreateEmployer panel ─────────────────────────
    await page.getByRole('button', { name: /^employers$/i }).first().click();
    await expect(page.getByRole('heading', { name: /^employers$/i, level: 2 })).toBeVisible();
    await page.getByRole('button', { name: /^new$/i }).click();

    // CreateEmployer renders <h2>New Employer</h2>.
    await expect(page.getByRole('heading', { name: /new employer/i, level: 2 })).toBeVisible();

    // ── Fill company name + co-contribution funding model (A5) ────────────────
    await page.locator('#ce-name').fill(employerName);
    await page.locator('#ce-sector').fill(sector);
    // Funding model — co-contribution is the default; set it explicitly + Match %.
    await page.locator('#ce-funding-mode').selectOption('co-contribution');
    await page.locator('#ce-match-pct').fill(matchPct);

    // ── Submit → create_employer RPC ──────────────────────────────────────────
    const submitBtn = page.getByRole('button', { name: /^create employer$/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    const rpcResponse = await rpcPromise;
    expect(rpcResponse.status(), 'create_employer RPC must succeed').toBe(200);

    // Success toast: `Employer "<name>" created.`
    await expect(page.getByText(new RegExp(`employer "${employerName}" created`, 'i'))).toBeVisible({
      timeout: 10_000,
    });

    // ── It appears in the Employers list ──────────────────────────────────────
    // CreateEmployer closes on success; the ViewEmployers panel (still open
    // underneath) re-renders from the invalidated useAllEmployersMetrics. The new
    // employer name is rendered as a row in the list.
    await expect(
      page.getByRole('heading', { name: /^employers$/i, level: 2 }),
    ).toBeVisible();
    await expect(page.getByText(employerName).first()).toBeVisible({ timeout: 15_000 });

    // ── DB verify — the employers row exists with the funding config ──────────
    expect(await rowExists('employers', { name: employerName })).toBe(true);
    const row = await getRow<EmployerRow>('employers', { name: employerName });
    expect(row, `inserted employer row should exist for name ${employerName}`).not.toBeNull();
    expect(row!.sector).toBe(sector);
    // The A5 co-contribution config landed.
    expect(row!.default_contribution_config?.mode).toBe('co-contribution');
    expect(Number(row!.default_contribution_config?.matchPct)).toBe(Number(matchPct));
    // eslint-disable-next-line no-console
    console.log(
      `[db] employers row inserted: id=${row!.id} name=${row!.name} fundingMode=${row!.default_contribution_config?.mode}`,
    );
  });
});
