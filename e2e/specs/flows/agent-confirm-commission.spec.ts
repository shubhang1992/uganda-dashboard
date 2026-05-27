// Flow spec: agent confirms a released commission, status flips to confirmed.
//
// State machine (BACKEND.md §10):
//   released → confirmed  via `agent_confirm_commission(p_commission_id)` RPC
//   (migration 0004) — wired to the "Confirm receipt" CTA on each released
//   line in /dashboard/commissions/confirm (CommissionsPage.jsx → CommissionRow).
//
// Seeded data: ~15% of paid commissions are 'released' (mockData.js:832).
// If seed drift drops the count to 0, the test skips with a clear marker.
// Cleanup: revert to `released` so reruns are idempotent.

import { test, expect } from '@playwright/test';
import { storageStatePathFor, PERSONA_FOR } from '../../fixtures/auth';
import { disableAnimations } from '../../fixtures/motion';
import { supabaseAdmin } from '../../fixtures/db';

test.use({ storageState: storageStatePathFor('agent') });
test.setTimeout(60_000);

const AGENT_ID = PERSONA_FOR.agent.entityId; // a-001

type CommissionRow = { id: string; status: string };

test.describe('agent → confirm commission receipt', () => {
  let commissionId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
    const { data } = await supabaseAdmin
      .from('commissions')
      .select('id,status')
      .eq('agent_id', AGENT_ID)
      .eq('status', 'released')
      .limit(1)
      .maybeSingle();
    const row = data as CommissionRow | null;
    if (!row) test.skip(true, `no released commissions for ${AGENT_ID} — re-run npm run seed`);
    commissionId = row!.id;
  });

  test.afterEach(async () => {
    if (commissionId) {
      await supabaseAdmin
        .from('commissions')
        .update({ status: 'released', agent_confirmed: false })
        .eq('id', commissionId);
    }
  });

  test('released commission flips to confirmed after clicking Confirm receipt', async ({ page }) => {
    await page.goto('/dashboard/commissions/confirm');
    await expect(page.getByRole('heading', { level: 1, name: /confirm receipts/i })).toBeVisible();

    // CommissionRow.jsx:147 renders one "Confirm receipt" button per released line.
    const confirmBtn = page.getByRole('button', { name: /^confirm receipt$/i }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 15_000 });

    const rpcPromise = page.waitForResponse(
      (r) => r.url().includes('/rest/v1/rpc/agent_confirm_commission') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await confirmBtn.click();
    const rpcResponse = await rpcPromise;
    expect(rpcResponse.status(), 'agent_confirm_commission RPC must succeed').toBe(204);

    await expect(page.getByText(/receipt confirmed/i)).toBeVisible({ timeout: 10_000 });

    const { data: after } = await supabaseAdmin
      .from('commissions')
      .select('status,agent_confirmed')
      .eq('id', commissionId!)
      .maybeSingle();
    expect(after?.status).toBe('confirmed');
    expect(after?.agent_confirmed).toBe(true);
  });
});
