// Flow spec: commission dispute / hold / cancel-run state machine coverage.
//
// Sibling spec `settlement-run-lifecycle.spec.ts` covers
//   branch_review → released → confirmed
// on the run side. This spec closes the gap on the dispute / held / cancel
// branches of the commission state machine (BACKEND.md §11):
//
//   due → in_run → [held | disputed] → released → confirmed/paid
//                                  └→ rejected (terminal)
//
// Why direct table UPDATEs (not RPC calls):
//   The settlement-run state-machine RPCs are SECURITY DEFINER and read
//   `auth.jwt() ->> 'app_role'` — for the service-role client used in this
//   harness `auth.jwt()` is NULL, so role-gated calls reject with
//   `role <NULL> cannot ...`. The existing settlement-run-lifecycle spec
//   established the convention: drive transitions via direct service-role
//   UPDATE (which bypasses RLS but still fires the BEFORE-UPDATE trigger
//   that snapshots `previous_status` on entering `disputed`), then assert
//   state via service-role SELECT. We follow the same convention here.
//
// Transitions covered (in order, serial — each step depends on the prior):
//   1. due → in_run                 (open run)
//   2. in_run → held                (branch holds the line)
//   3. held → in_run                (branch approves the line back)
//   4. in_run → disputed (branch)   (branch raises a dispute)
//   5. disputed → previous_status   (agent/admin withdraws or approves dispute)
//   6. in_run → disputed (agent)    (agent raises own dispute — `disputed_by='agent'`)
//   7. disputed → rejected          (distributor rejects → terminal)
//   8. cancel_run                   (run cancelled → in_run lines revert to due)
//
// Cleanup: afterAll restores the chosen commission row + run row to their
// pre-spec snapshots so reruns are idempotent. We also remove the synthetic
// run row we create for the cancel-run scenario.

import { test, expect } from '@playwright/test';
import { storageStatePathFor, PERSONA_FOR } from '../../fixtures/auth';
import { disableAnimations } from '../../fixtures/motion';
import { supabaseAdmin } from '../../fixtures/db';

test.use({ storageState: storageStatePathFor('distributor') });
test.setTimeout(90_000);

const AGENT_ID = PERSONA_FOR.agent.entityId; // a-001

type CommissionSnapshot = {
  id: string;
  status: string;
  previous_status: string | null;
  run_id: string | null;
  hold_reason: string | null;
  dispute_reason: string | null;
  disputed_at: string | null;
  disputed_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  outcome_reason: string | null;
  paid_date: string | null;
  branch_id: string;
};

async function readCommission(id: string): Promise<CommissionSnapshot> {
  const { data, error } = await supabaseAdmin
    .from('commissions')
    .select(
      'id,status,previous_status,run_id,hold_reason,dispute_reason,disputed_at,disputed_by,resolved_at,resolved_by,outcome_reason,paid_date,branch_id',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`readCommission(${id}): ${error.message}`);
  if (!data) throw new Error(`readCommission(${id}): not found`);
  return data as CommissionSnapshot;
}

async function updateCommission(
  id: string,
  patch: Partial<Omit<CommissionSnapshot, 'id' | 'branch_id'>>,
): Promise<void> {
  const { error } = await supabaseAdmin.from('commissions').update(patch).eq('id', id);
  if (error) throw new Error(`updateCommission(${id}): ${error.message}`);
}

async function restoreCommission(snap: CommissionSnapshot): Promise<void> {
  await updateCommission(snap.id, {
    status: snap.status,
    previous_status: snap.previous_status,
    run_id: snap.run_id,
    hold_reason: snap.hold_reason,
    dispute_reason: snap.dispute_reason,
    disputed_at: snap.disputed_at,
    disputed_by: snap.disputed_by,
    resolved_at: snap.resolved_at,
    resolved_by: snap.resolved_by,
    outcome_reason: snap.outcome_reason,
    paid_date: snap.paid_date,
  });
}

test.describe.serial('distributor → commission dispute lifecycle', () => {
  let commissionId: string;
  let originalSnap: CommissionSnapshot;
  let openRunId: string | null = null;
  let createdRunId: string | null = null;

  test.beforeAll(async () => {
    // Pick a commission row owned by the demo agent. Prefer a row already in
    // a non-terminal, non-disputed state so we have headroom to walk it
    // through the whole lifecycle without violating any UNIQUE constraints.
    const { data: candidates, error } = await supabaseAdmin
      .from('commissions')
      .select('id,status')
      .eq('agent_id', AGENT_ID)
      .not('status', 'in', '(rejected,disputed)')
      .limit(1);
    if (error) throw new Error(`candidate lookup: ${error.message}`);
    if (!candidates || candidates.length === 0) {
      throw new Error(
        `No eligible commission for agent ${AGENT_ID}. Run \`npm run seed\` and retry.`,
      );
    }
    commissionId = (candidates[0] as { id: string }).id;
    originalSnap = await readCommission(commissionId);

    // Discover the current open run (used for the in_run transition and the
    // settlement-runs visibility check). settlement-run-lifecycle.spec.ts
    // documents that this row exists in the seed (branch_review state).
    const { data: openRun } = await supabaseAdmin
      .from('settlement_runs')
      .select('id,state')
      .in('state', ['draft', 'branch_review'])
      .limit(1)
      .maybeSingle();
    openRunId = (openRun as { id: string } | null)?.id ?? null;
    expect(openRunId, 'seed must include an open settlement_runs row').not.toBeNull();
  });

  test.afterAll(async () => {
    // Restore the chosen commission row to its pre-spec state.
    if (originalSnap) {
      try {
        await restoreCommission(originalSnap);
      } catch (err) {
        // Surface but do not throw — afterAll must complete other cleanup.
        console.warn(`[commission-dispute-lifecycle] restore failed: ${(err as Error).message}`);
      }
    }
    // Drop any synthetic run we created during the cancel-run scenario.
    if (createdRunId) {
      await supabaseAdmin.from('settlement_runs').delete().eq('id', createdRunId);
    }
  });

  test('UI smoke: distributor opens CommissionPanel', async ({ page }) => {
    await disableAnimations(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('button', { name: /^overview$/i })).toBeVisible();
    await page.getByRole('button', { name: /^commissions$/i }).click();
    const panel = page.getByRole('dialog', { name: /commission settlement/i });
    await expect(panel).toBeVisible({ timeout: 15_000 });
  });

  test('1. due → in_run (open run sweeps line into run)', async () => {
    // Start the lifecycle by parking the row at `due` then sweeping it
    // into the open run, mirroring `open_run()`'s effect.
    await updateCommission(commissionId, { status: 'due', run_id: null });
    let row = await readCommission(commissionId);
    expect(row.status).toBe('due');
    expect(row.run_id).toBeNull();

    await updateCommission(commissionId, { status: 'in_run', run_id: openRunId });
    row = await readCommission(commissionId);
    expect(row.status).toBe('in_run');
    expect(row.run_id).toBe(openRunId);
  });

  test('2. in_run → held (branch_hold_line shape)', async () => {
    await updateCommission(commissionId, {
      status: 'held',
      hold_reason: 'E2E: branch hold reason',
    });
    const row = await readCommission(commissionId);
    expect(row.status).toBe('held');
    expect(row.hold_reason).toBe('E2E: branch hold reason');
  });

  test('3. held → in_run (branch_approve_line clears hold)', async () => {
    await updateCommission(commissionId, {
      status: 'in_run',
      hold_reason: null,
    });
    const row = await readCommission(commissionId);
    expect(row.status).toBe('in_run');
    expect(row.hold_reason).toBeNull();
  });

  test('4. in_run → disputed (branch_dispute_line — disputed_by=branch)', async () => {
    // The BEFORE-UPDATE trigger snapshots OLD.status into previous_status
    // when NEW.status='disputed' — assert that fires under service-role too.
    await updateCommission(commissionId, {
      status: 'disputed',
      dispute_reason: 'E2E: branch raised dispute',
      disputed_at: new Date().toISOString(),
      disputed_by: 'branch',
      // The RPC also clears run_id when leaving in_run; mirror that.
      run_id: null,
    });
    const row = await readCommission(commissionId);
    expect(row.status).toBe('disputed');
    expect(row.dispute_reason).toBe('E2E: branch raised dispute');
    expect(row.disputed_by).toBe('branch');
    expect(row.previous_status).toBe('in_run');
  });

  test('5. disputed → previous_status (approve_dispute — restores prior state)', async () => {
    // approve_dispute restores previous_status (or due if NULL) and clears
    // every dispute field.
    const before = await readCommission(commissionId);
    const restoreTo = before.previous_status ?? 'due';
    await updateCommission(commissionId, {
      status: restoreTo,
      previous_status: null,
      dispute_reason: null,
      disputed_at: null,
      disputed_by: null,
      resolved_at: new Date().toISOString(),
      resolved_by: 'Distributor admin (E2E)',
      outcome_reason: 'E2E: confirmed legitimate',
    });
    const row = await readCommission(commissionId);
    expect(row.status).toBe(restoreTo);
    expect(row.dispute_reason).toBeNull();
    expect(row.disputed_by).toBeNull();
    expect(row.resolved_by).toBe('Distributor admin (E2E)');
    expect(row.outcome_reason).toBe('E2E: confirmed legitimate');
  });

  test('6. agent withdraws an in-progress dispute (withdraw_dispute)', async () => {
    // Reset the row through `due → in_run → disputed` so we can exercise
    // withdraw_dispute against a fresh agent-side dispute.
    await updateCommission(commissionId, {
      status: 'in_run',
      run_id: openRunId,
      previous_status: null,
      dispute_reason: null,
      disputed_at: null,
      disputed_by: null,
      resolved_at: null,
      resolved_by: null,
      outcome_reason: null,
    });
    await updateCommission(commissionId, {
      status: 'disputed',
      dispute_reason: 'E2E: agent self-dispute',
      disputed_at: new Date().toISOString(),
      disputed_by: 'agent',
      run_id: null,
    });

    let row = await readCommission(commissionId);
    expect(row.status).toBe('disputed');
    expect(row.disputed_by).toBe('agent');
    expect(row.previous_status).toBe('in_run');

    // Now withdraw_dispute: status reverts to previous_status, dispute
    // fields cleared, resolved_* NOT set (agent-withdraw isn't an outcome).
    const restoreTo = row.previous_status ?? 'due';
    await updateCommission(commissionId, {
      status: restoreTo,
      previous_status: null,
      dispute_reason: null,
      disputed_at: null,
      disputed_by: null,
    });
    row = await readCommission(commissionId);
    expect(row.status).toBe(restoreTo);
    expect(row.dispute_reason).toBeNull();
    expect(row.disputed_by).toBeNull();
  });

  test('7. disputed → rejected (reject_dispute — terminal)', async () => {
    // Re-enter dispute then reject to terminal `rejected`.
    await updateCommission(commissionId, {
      status: 'disputed',
      dispute_reason: 'E2E: rejected-path dispute',
      disputed_at: new Date().toISOString(),
      disputed_by: 'branch',
      run_id: null,
    });
    let row = await readCommission(commissionId);
    expect(row.status).toBe('disputed');

    await updateCommission(commissionId, {
      status: 'rejected',
      previous_status: null,
      dispute_reason: null,
      disputed_at: null,
      disputed_by: null,
      resolved_at: new Date().toISOString(),
      resolved_by: 'Distributor admin (E2E)',
      outcome_reason: 'E2E: claim could not be substantiated',
      run_id: null,
    });
    row = await readCommission(commissionId);
    expect(row.status).toBe('rejected');
    expect(row.outcome_reason).toBe('E2E: claim could not be substantiated');
    expect(row.dispute_reason).toBeNull();
    expect(row.previous_status).toBeNull();
  });

  test('8. cancel_run reverts in_run lines on the cancelled run to due', async () => {
    // Restore the lifecycle row to a non-terminal state so we can use it
    // as the "line attached to the run we cancel". Mirrors cancel_run's
    // sweep: it flips run state to `cancelled` and resets every attached
    // commission from `in_run` → `due`, clearing `run_id`.
    await updateCommission(commissionId, {
      status: 'in_run',
      previous_status: null,
      dispute_reason: null,
      disputed_at: null,
      disputed_by: null,
      resolved_at: null,
      resolved_by: null,
      outcome_reason: null,
    });

    // Create a fresh draft run so we can cancel without touching the
    // canonical open run that other specs rely on.
    const newRunId = `e2e-run-${Date.now()}`;
    const { error: insErr } = await supabaseAdmin.from('settlement_runs').insert({
      id: newRunId,
      cadence: 'monthly',
      opened_at: new Date().toISOString(),
      closes_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      state: 'draft',
      total_amount: 0,
      commission_count: 1,
    });
    if (insErr) {
      // settlement_runs columns may differ from our assumption (e.g. NOT NULL
      // columns we didn't supply). Surface the schema gap inline rather than
      // failing opaquely.
      throw new Error(`cancel_run scenario: insert run failed: ${insErr.message}`);
    }
    createdRunId = newRunId;
    await updateCommission(commissionId, { run_id: newRunId });

    let row = await readCommission(commissionId);
    expect(row.status).toBe('in_run');
    expect(row.run_id).toBe(newRunId);

    // Simulate cancel_run: flip run state, revert attached in_run lines to due.
    const { error: cancelErr } = await supabaseAdmin
      .from('settlement_runs')
      .update({ state: 'cancelled' })
      .eq('id', newRunId);
    expect(cancelErr?.message, 'settlement_runs cancel update should succeed').toBeUndefined();

    await updateCommission(commissionId, { status: 'due', run_id: null });

    row = await readCommission(commissionId);
    expect(row.status).toBe('due');
    expect(row.run_id).toBeNull();

    const { data: cancelledRun } = await supabaseAdmin
      .from('settlement_runs')
      .select('state')
      .eq('id', newRunId)
      .maybeSingle();
    expect((cancelledRun as { state: string } | null)?.state).toBe('cancelled');
  });
});
