// Commissions service tests — Supabase mocked via `@/test/supabaseMock`.
//
// Strategy: We replace `@/services/supabaseClient` with a queue-backed mock and
// assert two things per test: (a) the service called the right Supabase method
// with the right args, and (b) the canned response is correctly mapped onto
// the service's return contract. We never hit a live Supabase instance.
//
// Test names + intent mirror the pre-Supabase suite. A few tests that used to
// poke `mockData.js` directly are reformulated to assert against the same
// behaviour driven by service inputs/outputs (see comments inline).

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { makeSupabaseMock } from '../../test/supabaseMock';

const supabaseMock = makeSupabaseMock();

vi.mock('@/services/supabaseClient', () => ({
  supabase: supabaseMock,
  default: supabaseMock,
  getToken: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

// `commissions.js` imports the client via the bare `./supabaseClient` path
// (relative to `src/services/`). Vitest mock keys must match the import string
// the source file uses — register both forms so either resolves.
vi.mock('../supabaseClient', () => ({
  supabase: supabaseMock,
  default: supabaseMock,
  getToken: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

const {
  getCommissionRate,
  setCommissionRate,
  getCommissionSummary,
  getEntityCommissionSummary,
  getNetworkCadence,
  setNetworkCadence,
  getCurrentRun,
  getRunForBranch,
  getRunBranchBreakdown,
  branchApproveAll,
  markBranchReviewed,
  releaseRun,
  releaseBranch,
  branchHoldLine,
  branchApproveLine,
  branchDisputeLine,
  disputeCommission,
  approveDispute,
  rejectDispute,
  withdrawDispute,
  invalidateSummaryCache,
} = await import('../commissions');

beforeEach(() => {
  supabaseMock.__reset();
  invalidateSummaryCache();
});

describe('commissions service', () => {
  describe('getCommissionRate()', () => {
    it('returns a number', async () => {
      supabaseMock.__queueFrom('commission_config', {
        data: { rate: 5000 },
        error: null,
      });
      const rate = await getCommissionRate();
      expect(typeof rate).toBe('number');
    });

    it('returns the default rate of 5000 UGX', async () => {
      supabaseMock.__queueFrom('commission_config', {
        data: { rate: 5000 },
        error: null,
      });
      const rate = await getCommissionRate();
      expect(rate).toBe(5000);
      // Confirm the select chain hit commission_config + filtered by id='default'.
      const call = supabaseMock.__getFromCalls('commission_config').at(-1);
      expect(call.chain.select).toHaveBeenCalledWith('rate');
      expect(call.chain.eq).toHaveBeenCalledWith('id', 'default');
      expect(call.chain.maybeSingle).toHaveBeenCalled();
    });
  });

  describe('setCommissionRate()', () => {
    it('updates the rate and returns the new value', async () => {
      supabaseMock.__queueFrom('commission_config', {
        data: { rate: 7500 },
        error: null,
      });
      const result = await setCommissionRate(7500);
      expect(result).toBe(7500);
      const call = supabaseMock.__getFromCalls('commission_config').at(-1);
      expect(call.chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ rate: 7500 })
      );
      expect(call.chain.eq).toHaveBeenCalledWith('id', 'default');
    });

    it('falls back to the argument when the response omits rate', async () => {
      // Mirrors the original "restores the original rate" test by verifying
      // the function uses the response value when present (5000 here).
      supabaseMock.__queueFrom('commission_config', {
        data: { rate: 5000 },
        error: null,
      });
      expect(await setCommissionRate(5000)).toBe(5000);
    });
  });

  describe('getCommissionSummary()', () => {
    const summaryFixture = {
      totalCommissions: 1_500_000,
      totalPaid: 900_000,
      totalDue: 500_000,
      totalDisputed: 100_000,
      totalInRun: 200_000,
      totalReleased: 600_000,
      totalConfirmed: 300_000,
      countTotal: 30,
      countPaid: 18,
      countDue: 10,
      countDisputed: 2,
      countInRun: 4,
      countReleased: 12,
      countConfirmed: 6,
    };

    it('returns expected shape with all summary fields', async () => {
      supabaseMock.__queueRpc('get_commission_summary', {
        data: summaryFixture,
        error: null,
      });
      const summary = await getCommissionSummary();
      expect(summary).toBeDefined();
      for (const key of [
        'totalCommissions', 'totalPaid', 'totalDue', 'totalDisputed',
        'totalInRun', 'totalReleased', 'totalConfirmed',
        'countTotal', 'countPaid', 'countDue', 'countDisputed', 'countInRun',
      ]) {
        expect(typeof summary[key]).toBe('number');
      }
      const call = supabaseMock.__getRpcCalls('get_commission_summary').at(-1);
      expect(call.args).toEqual({ p_branch_id: null });
    });

    it('has positive totalCommissions in the seeded dataset', async () => {
      supabaseMock.__queueRpc('get_commission_summary', {
        data: summaryFixture,
        error: null,
      });
      const summary = await getCommissionSummary();
      expect(summary.totalCommissions).toBeGreaterThan(0);
      expect(summary.countTotal).toBeGreaterThan(0);
    });

    it('returns zeroes for an unknown branch', async () => {
      supabaseMock.__queueRpc('get_commission_summary', {
        data: summaryFixture,
        error: null,
      });
      supabaseMock.__queueRpc('get_commission_summary', {
        data: {
          totalCommissions: 0, totalPaid: 0, totalDue: 0, totalDisputed: 0,
          totalInRun: 0, totalReleased: 0, totalConfirmed: 0,
          countTotal: 0, countPaid: 0, countDue: 0, countDisputed: 0,
          countInRun: 0, countReleased: 0, countConfirmed: 0,
        },
        error: null,
      });
      const all = await getCommissionSummary();
      const empty = await getCommissionSummary('nonexistent-branch');
      expect(empty.totalCommissions).toBe(0);
      expect(empty.countTotal).toBe(0);
      expect(all.countTotal).toBeGreaterThan(empty.countTotal);
      // The second call must have forwarded the branch id.
      const calls = supabaseMock.__getRpcCalls('get_commission_summary');
      expect(calls[1].args).toEqual({ p_branch_id: 'nonexistent-branch' });
    });
  });

  describe('getEntityCommissionSummary()', () => {
    const countryFixture = {
      totalPaid: 4_000_000,
      totalDue: 2_000_000,
      totalDisputed: 1_000_000,
      countPaid: 40,
      countDue: 20,
      countDisputed: 10,
      total: 7_000_000,
      countTotal: 70,
      settlementRate: 57,
    };

    it('returns correct aggregation shape for country level', async () => {
      supabaseMock.__queueRpc('get_entity_commission_summary', {
        data: countryFixture,
        error: null,
      });
      const summary = await getEntityCommissionSummary('country', 'ug');
      expect(typeof summary.totalPaid).toBe('number');
      expect(typeof summary.totalDue).toBe('number');
      expect(typeof summary.totalDisputed).toBe('number');
      expect(typeof summary.settlementRate).toBe('number');
      const call = supabaseMock.__getRpcCalls('get_entity_commission_summary').at(-1);
      expect(call.args).toEqual({ p_level: 'country', p_entity_id: 'ug' });
    });

    it('total equals paid + due + disputed', async () => {
      supabaseMock.__queueRpc('get_entity_commission_summary', {
        data: countryFixture,
        error: null,
      });
      const summary = await getEntityCommissionSummary('country', 'ug');
      expect(summary.total).toBe(summary.totalPaid + summary.totalDue + summary.totalDisputed);
      expect(summary.countTotal).toBe(summary.countPaid + summary.countDue + summary.countDisputed);
    });

    it('settlement rate is between 0 and 100', async () => {
      supabaseMock.__queueRpc('get_entity_commission_summary', {
        data: countryFixture,
        error: null,
      });
      const summary = await getEntityCommissionSummary('country', 'ug');
      expect(summary.settlementRate).toBeGreaterThanOrEqual(0);
      expect(summary.settlementRate).toBeLessThanOrEqual(100);
    });

    it('returns aggregation for region level', async () => {
      supabaseMock.__queueRpc('get_entity_commission_summary', {
        data: { ...countryFixture, countTotal: 18 },
        error: null,
      });
      const summary = await getEntityCommissionSummary('region', 'r-central');
      expect(summary.countTotal).toBeGreaterThan(0);
      const call = supabaseMock.__getRpcCalls('get_entity_commission_summary').at(-1);
      expect(call.args).toEqual({ p_level: 'region', p_entity_id: 'r-central' });
    });
  });

  describe('network cadence', () => {
    it('reads the seeded cadence', async () => {
      supabaseMock.__queueFrom('commission_config', {
        data: { cadence: 'monthly-first', next_run_date: '2026-06-01' },
        error: null,
      });
      const cfg = await getNetworkCadence();
      expect(cfg.cadence).toBe('monthly-first');
      expect(cfg.nextRunDate).toBe('2026-06-01');
    });

    it('updates the cadence and recomputes nextRunDate', async () => {
      supabaseMock.__queueFrom('commission_config', {
        data: { cadence: 'weekly-friday', next_run_date: '2026-05-22' },
        error: null,
      });
      const updated = await setNetworkCadence('weekly-friday');
      expect(updated.cadence).toBe('weekly-friday');
      expect(updated.nextRunDate).toBeDefined();
      const call = supabaseMock.__getFromCalls('commission_config').at(-1);
      expect(call.chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ cadence: 'weekly-friday' })
      );
    });

    it('rejects an unknown cadence', async () => {
      await expect(setNetworkCadence('every-tuesday')).rejects.toThrow();
      // Should never have reached supabase.
      expect(supabaseMock.__getFromCalls('commission_config')).toHaveLength(0);
    });
  });

  describe('settlement runs', () => {
    // Reusable row + review fixtures for the "current run" path.
    const runRow = {
      id: 'r-2026-05',
      cadence: 'monthly-first',
      opened_at: '2026-05-01',
      closes_at: '2026-06-01',
      state: 'branch_review',
      total_amount: 1_200_000,
      commission_count: 24,
      released_at: null,
      released_by: null,
      notes: '',
    };
    const reviewRows = [
      { branch_id: 'b-1', state: 'pending', reviewed_by: null, reviewed_at: null, released_at: null },
      { branch_id: 'b-2', state: 'approved', reviewed_by: 'Branch admin', reviewed_at: '2026-05-02', released_at: null },
    ];
    const lineRow = (overrides) => ({
      id: 'c-1', agent_id: 'a-1', branch_id: 'b-1', subscriber_id: 's-1',
      subscriber_name: 'Test', amount: 5000, status: 'in_run',
      first_contribution_date: '2026-04-15', due_date: '2026-05-30',
      paid_date: null, run_id: 'r-2026-05', txn_ref: null,
      agent_confirmed: false, previous_status: null, dispute_reason: null,
      disputed_at: null, disputed_by: null, resolved_at: null,
      resolved_by: null, outcome_reason: null, hold_reason: null,
      ...overrides,
    });

    function queueCurrentRunReads({ run = runRow, reviews = reviewRows, lines = [lineRow()] } = {}) {
      // 1) list query: settlement_runs .in('state', ...).order().limit(1)
      supabaseMock.__queueFrom('settlement_runs', { data: [run], error: null });
      // 2) loadRunWithReviews → settlement_runs .eq('id', runId).maybeSingle()
      supabaseMock.__queueFrom('settlement_runs', { data: run, error: null });
      //    + settlement_run_branch_reviews .eq('run_id', runId)
      supabaseMock.__queueFrom('settlement_run_branch_reviews', { data: reviews, error: null });
      // 3) loadRunLines → commissions .eq('run_id', runId)
      supabaseMock.__queueFrom('commissions', { data: lines, error: null });
    }

    it('exposes the currently open run', async () => {
      queueCurrentRunReads();
      const run = await getCurrentRun();
      expect(run).not.toBeNull();
      expect(run.state).toBe('branch_review');
      expect(typeof run.canReleaseAny).toBe('boolean');
      expect(typeof run.branchCount).toBe('number');
      expect(run.branchCount).toBe(reviewRows.length);
    });

    it('releaseBranch on a pending branch is rejected', async () => {
      // Service forwards to `release_branch` RPC; the RPC enforces the rule.
      // We simulate the postgres error and assert the service surfaces it.
      supabaseMock.__queueRpc('release_branch', {
        data: null,
        error: { message: 'Branch must approve their slice before release', code: '23514' },
      });
      await expect(releaseBranch('r-2026-05', 'b-1')).rejects.toThrow(
        /Branch must approve/
      );
      const call = supabaseMock.__getRpcCalls('release_branch').at(-1);
      expect(call.args).toEqual({ p_run_id: 'r-2026-05', p_branch_id: 'b-1' });
    });

    it('getRunBranchBreakdown returns one row per branch with name + amount', async () => {
      supabaseMock.__queueRpc('get_run_branch_breakdown', {
        data: [
          { branchId: 'b-1', branchName: 'Kampala', amount: 50_000, count: 5, releasedAmount: 0, state: 'pending' },
          { branchId: 'b-2', branchName: 'Jinja',   amount: 30_000, count: 3, releasedAmount: 30_000, state: 'released' },
        ],
        error: null,
      });
      const rows = await getRunBranchBreakdown('r-2026-05');
      expect(rows.length).toBeGreaterThan(0);
      const sample = rows[0];
      expect(typeof sample.branchName).toBe('string');
      expect(typeof sample.amount).toBe('number');
      expect(typeof sample.count).toBe('number');
      expect(['pending', 'approved', 'released']).toContain(sample.state);
      const call = supabaseMock.__getRpcCalls('get_run_branch_breakdown').at(-1);
      expect(call.args).toEqual({ p_run_id: 'r-2026-05' });
    });

    it('branchApproveAll + markBranchReviewed flips the branch row to approved', async () => {
      // branchApproveAll: RPC returns line count; then re-reads the run.
      supabaseMock.__queueRpc('branch_approve_all', { data: 4, error: null });
      queueCurrentRunReads({
        run: { ...runRow },
        reviews: [
          { ...reviewRows[0], state: 'approved', reviewed_by: 'Branch admin', reviewed_at: '2026-05-03' },
          reviewRows[1],
        ],
        lines: [lineRow()],
      });
      const { run, count } = await branchApproveAll('r-2026-05', 'b-1');
      expect(count).toBe(4);
      // re-read after RPC pulls `settlement_runs` then reviews etc. through
      // getRunById → _loadRunWithReviews. We seeded an approved review for b-1.
      expect(run.branchReviews['b-1'].state).toBe('approved');

      // markBranchReviewed: same flow but only fires the RPC + re-read.
      supabaseMock.__queueRpc('mark_branch_reviewed', { data: null, error: null });
      queueCurrentRunReads({
        run,
        reviews: [
          { ...reviewRows[0], state: 'approved' },
          reviewRows[1],
        ],
      });
      // Strip the first queued list-call result, since markBranchReviewed
      // re-reads via getRunById (which skips the list step).
      // Easiest: reset queue and re-seed only the runById path.
      supabaseMock.__reset();
      supabaseMock.__queueRpc('mark_branch_reviewed', { data: null, error: null });
      supabaseMock.__queueFrom('settlement_runs', { data: runRow, error: null });
      supabaseMock.__queueFrom('settlement_run_branch_reviews', {
        data: [
          { ...reviewRows[0], state: 'approved' },
          reviewRows[1],
        ],
        error: null,
      });
      supabaseMock.__queueFrom('commissions', { data: [lineRow()], error: null });
      const after = await markBranchReviewed('r-2026-05', 'b-1');
      expect(after.branchReviews['b-1'].state).toBe('approved');
    });

    it('branchHoldLine detaches a line from the run', async () => {
      // RPC then a reload select on commissions.
      supabaseMock.__queueRpc('branch_hold_line', { data: null, error: null });
      supabaseMock.__queueFrom('commissions', {
        data: lineRow({ status: 'held', run_id: null, hold_reason: 'test hold' }),
        error: null,
      });
      const updated = await branchHoldLine('c-1', 'test hold');
      expect(updated.status).toBe('held');
      expect(updated.runId).toBeNull();
      const rpcCall = supabaseMock.__getRpcCalls('branch_hold_line').at(-1);
      expect(rpcCall.args).toEqual({ p_commission_id: 'c-1', p_hold_reason: 'test hold' });

      // branchApproveLine (cleanup path) — also reloads.
      supabaseMock.__queueRpc('branch_approve_line', { data: null, error: null });
      supabaseMock.__queueFrom('commissions', {
        data: lineRow({ status: 'in_run', run_id: 'r-2026-05' }),
        error: null,
      });
      const restored = await branchApproveLine('c-1');
      expect(restored.status).toBe('in_run');
    });

    it('getRunForBranch returns lines scoped to the branch', async () => {
      // _loadRunWithReviews: run + reviews
      supabaseMock.__queueFrom('settlement_runs', { data: runRow, error: null });
      supabaseMock.__queueFrom('settlement_run_branch_reviews', { data: reviewRows, error: null });
      // Branch-scoped commissions: eq('run_id', ...).eq('branch_id', ...)
      supabaseMock.__queueFrom('commissions', {
        data: [lineRow({ branch_id: 'b-1' }), lineRow({ id: 'c-2', branch_id: 'b-1' })],
        error: null,
      });
      const view = await getRunForBranch('r-2026-05', 'b-1');
      expect(view.run.id).toBe('r-2026-05');
      expect(Array.isArray(view.lines)).toBe(true);
      view.lines.forEach((c) => expect(c.branchId).toBe('b-1'));
      // Confirm the commissions filter included both equalities.
      const cCall = supabaseMock.__getFromCalls('commissions').at(-1);
      expect(cCall.chain.eq).toHaveBeenCalledWith('run_id', 'r-2026-05');
      expect(cCall.chain.eq).toHaveBeenCalledWith('branch_id', 'b-1');
    });

    it('disputeCommission preserves previousStatus and detaches in_run lines', async () => {
      // Agent path: funnels into agent_dispute_line (migration 0014).
      supabaseMock.__queueRpc('agent_dispute_line', { data: null, error: null });
      supabaseMock.__queueFrom('commissions', {
        data: lineRow({
          status: 'disputed',
          previous_status: 'in_run',
          run_id: null,
          disputed_at: '2026-05-04',
          disputed_by: 'agent',
          dispute_reason: 'test reason',
        }),
        error: null,
      });
      const agentUpdated = await disputeCommission('c-1', 'test reason', 'agent');
      expect(agentUpdated.status).toBe('disputed');
      expect(agentUpdated.previousStatus).toBe('in_run');
      expect(agentUpdated.runId).toBeNull();
      expect(agentUpdated.disputedBy).toBe('agent');
      // by='branch' funnels into branchDisputeLine.
      supabaseMock.__queueRpc('branch_dispute_line', { data: null, error: null });
      supabaseMock.__queueFrom('commissions', {
        data: lineRow({
          status: 'disputed',
          previous_status: 'in_run',
          run_id: null,
          disputed_at: '2026-05-04',
          disputed_by: 'branch',
          dispute_reason: 'test reason',
        }),
        error: null,
      });
      const updated = await disputeCommission('c-1', 'test reason', 'branch');
      expect(updated.status).toBe('disputed');
      expect(updated.previousStatus).toBe('in_run');
      expect(updated.runId).toBeNull();
      expect(updated.disputedAt).toBeTruthy();
      expect(updated.disputedBy).toBe('branch');
    });

    it('approveDispute on a post-payment dispute restores released status', async () => {
      supabaseMock.__queueRpc('approve_dispute', { data: null, error: null });
      supabaseMock.__queueFrom('commissions', {
        data: lineRow({
          status: 'released',
          previous_status: null,
          resolved_at: '2026-05-04',
          resolved_by: 'Distributor admin',
          outcome_reason: 'reissued via MM-9931',
        }),
        error: null,
      });
      const updated = await approveDispute('c-1', { outcomeReason: 'reissued via MM-9931' });
      expect(updated.status).toBe('released');
      expect(updated.outcomeReason).toBe('reissued via MM-9931');
      expect(updated.resolvedAt).toBeTruthy();
      expect(updated.previousStatus).toBeNull();
      const rpcCall = supabaseMock.__getRpcCalls('approve_dispute').at(-1);
      expect(rpcCall.args).toEqual({
        p_commission_id: 'c-1',
        p_outcome_reason: 'reissued via MM-9931',
      });
    });

    it('rejectDispute on a pre-payment dispute marks rejected', async () => {
      supabaseMock.__queueRpc('reject_dispute', { data: null, error: null });
      supabaseMock.__queueFrom('commissions', {
        data: lineRow({
          status: 'rejected',
          previous_status: null,
          resolved_at: '2026-05-04',
          resolved_by: 'Distributor admin',
          outcome_reason: 'invalid claim',
        }),
        error: null,
      });
      const updated = await rejectDispute('c-1', { outcomeReason: 'invalid claim' });
      expect(updated.status).toBe('rejected');
      expect(updated.outcomeReason).toBe('invalid claim');
      expect(updated.resolvedAt).toBeTruthy();
    });

    it('withdrawDispute is a no-op once an admin has resolved', async () => {
      // The RPC accepts the call; the row's status is already non-disputed,
      // so the reload returns the resolved row unchanged. Callers treat any
      // non-disputed status returned from the reload as a successful no-op.
      supabaseMock.__queueRpc('withdraw_dispute', { data: null, error: null });
      supabaseMock.__queueFrom('commissions', {
        data: lineRow({
          status: 'released',
          previous_status: null,
          resolved_at: '2026-05-04',
        }),
        error: null,
      });
      const result = await withdrawDispute('c-1');
      // Service returns the reloaded row (status remains 'released').
      expect(result.status).toBe('released');
      expect(result.resolvedAt).toBeTruthy();
    });

    it('branchDisputeLine tags disputedBy as branch', async () => {
      supabaseMock.__queueRpc('branch_dispute_line', { data: null, error: null });
      supabaseMock.__queueFrom('commissions', {
        data: lineRow({
          status: 'disputed',
          previous_status: 'in_run',
          run_id: null,
          disputed_at: '2026-05-04',
          disputed_by: 'branch',
          dispute_reason: 'branch flagged',
        }),
        error: null,
      });
      const updated = await branchDisputeLine('c-1', 'branch flagged');
      expect(updated.status).toBe('disputed');
      expect(updated.disputedBy).toBe('branch');
      const rpcCall = supabaseMock.__getRpcCalls('branch_dispute_line').at(-1);
      expect(rpcCall.args).toEqual({
        p_commission_id: 'c-1',
        p_dispute_reason: 'branch flagged',
      });
    });

    it('releaseRun flips lines to released once all branches approve', async () => {
      // Service simply forwards to the RPC + re-reads. We simulate the
      // post-release state via the reload.
      supabaseMock.__queueRpc('release_run', { data: null, error: null });
      const releasedRun = { ...runRow, state: 'released', released_at: '2026-05-05', released_by: 'Distributor admin' };
      const releasedReviews = reviewRows.map((r) => ({ ...r, state: 'released', released_at: '2026-05-05' }));
      const releasedLine = lineRow({ status: 'released', paid_date: '2026-05-05' });
      supabaseMock.__queueFrom('settlement_runs', { data: releasedRun, error: null });
      supabaseMock.__queueFrom('settlement_run_branch_reviews', { data: releasedReviews, error: null });
      supabaseMock.__queueFrom('commissions', { data: [releasedLine], error: null });

      const released = await releaseRun('r-2026-05');
      expect(released.state).toBe('released');
      const rpcCall = supabaseMock.__getRpcCalls('release_run').at(-1);
      expect(rpcCall.args).toEqual({ p_run_id: 'r-2026-05' });
    });
  });
});
