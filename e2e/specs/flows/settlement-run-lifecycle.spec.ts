// Flow spec: settlement-run lifecycle as observed by the distributor UI.
//
// The seeded `settlement_runs` table has an open run in `branch_review` state
// (mockData.js:965 / seed-supabase.mjs:712). CommissionPanel surfaces it via
// `useCurrentRun()`. There's no UI button to open a fresh run — that happens
// server-side on cadence, and `open_run()` SECURITY-DEFINER reads
// `auth.jwt() ->> 'role'` which is NULL for the service-role client, so we
// cannot invoke it directly. We observe the existing run, drive a state
// transition via direct UPDATE, then assert UI + DB reflection.
//
// State machine (migration 0001 settlement_run_state):
//   draft → branch_review → released | cancelled

import { test, expect } from '@playwright/test';
import { storageStatePathFor } from '../../fixtures/auth';
import { disableAnimations } from '../../fixtures/motion';
import { supabaseAdmin } from '../../fixtures/db';

test.use({ storageState: storageStatePathFor('distributor') });
test.setTimeout(60_000);

type RunRow = { id: string; state: string };

test.describe('distributor → settlement-run lifecycle', () => {
  let runId: string | null = null;
  let originalState: string | null = null;

  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
    const { data } = await supabaseAdmin
      .from('settlement_runs')
      .select('id,state')
      .in('state', ['draft', 'branch_review'])
      .limit(1)
      .maybeSingle();
    const row = data as RunRow | null;
    expect(row, 'seed must include an open settlement run').not.toBeNull();
    runId = row!.id;
    originalState = row!.state;
  });

  test.afterEach(async () => {
    if (runId && originalState) {
      await supabaseAdmin
        .from('settlement_runs')
        .update({ state: originalState, released_at: null, released_by: null })
        .eq('id', runId);
    }
  });

  test('open run renders → drive branch_review → released reflects in UI + DB', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('button', { name: /^overview$/i })).toBeVisible();

    await page.getByRole('button', { name: /^commissions$/i }).click();
    const panel = page.getByRole('dialog', { name: /commission settlement/i });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/active settlement run/i)).toBeVisible({ timeout: 15_000 });

    // Drive transition (service-role bypasses RLS; the SECURITY-DEFINER role
    // gate in release_run() would reject a NULL-jwt service-role call).
    const { error } = await supabaseAdmin
      .from('settlement_runs')
      .update({ state: 'released', released_at: new Date().toISOString(), released_by: 'E2E harness' })
      .eq('id', runId!);
    expect(error?.message, 'update should succeed').toBeUndefined();

    const after = await supabaseAdmin.from('settlement_runs').select('state,released_by').eq('id', runId!).maybeSingle();
    expect(after.data?.state).toBe('released');
    expect(after.data?.released_by).toBe('E2E harness');

    // useCurrentRun() filters for non-terminal states; reopening the panel
    // should now show the "No open run" empty state (CommissionPanel.jsx:698).
    await page.keyboard.press('Escape');
    await expect(panel).not.toBeVisible();
    await page.getByRole('button', { name: /^commissions$/i }).click();
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/no open run/i)).toBeVisible({ timeout: 15_000 });
  });
});
