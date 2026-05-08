import { describe, it, expect, beforeEach } from 'vitest';
import {
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
} from '../commissions';
import { COMMISSIONS, SETTLEMENT_RUNS } from '../../data/mockData';

describe('commissions service', () => {
  describe('getCommissionRate()', () => {
    it('returns a number', async () => {
      const rate = await getCommissionRate();
      expect(typeof rate).toBe('number');
    });

    it('returns the default rate of 5000 UGX', async () => {
      const rate = await getCommissionRate();
      expect(rate).toBe(5000);
    });
  });

  describe('setCommissionRate()', () => {
    it('updates the rate and returns the new value', async () => {
      const result = await setCommissionRate(7500);
      expect(result).toBe(7500);
      const updated = await getCommissionRate();
      expect(updated).toBe(7500);
    });

    it('restores the original rate', async () => {
      await setCommissionRate(5000);
      expect(await getCommissionRate()).toBe(5000);
    });
  });

  describe('getCommissionSummary()', () => {
    it('returns expected shape with all summary fields', async () => {
      const summary = await getCommissionSummary();
      expect(summary).toBeDefined();
      expect(typeof summary.totalCommissions).toBe('number');
      expect(typeof summary.totalPaid).toBe('number');
      expect(typeof summary.totalDue).toBe('number');
      expect(typeof summary.totalDisputed).toBe('number');
      expect(typeof summary.totalInRun).toBe('number');
      expect(typeof summary.totalReleased).toBe('number');
      expect(typeof summary.totalConfirmed).toBe('number');
      expect(typeof summary.countTotal).toBe('number');
      expect(typeof summary.countPaid).toBe('number');
      expect(typeof summary.countDue).toBe('number');
      expect(typeof summary.countDisputed).toBe('number');
      expect(typeof summary.countInRun).toBe('number');
    });

    it('has positive totalCommissions in the seeded dataset', async () => {
      const summary = await getCommissionSummary();
      expect(summary.totalCommissions).toBeGreaterThan(0);
      expect(summary.countTotal).toBeGreaterThan(0);
    });

    it('returns zeroes for an unknown branch', async () => {
      const all = await getCommissionSummary();
      const empty = await getCommissionSummary('nonexistent-branch');
      expect(empty.totalCommissions).toBe(0);
      expect(empty.countTotal).toBe(0);
      expect(all.countTotal).toBeGreaterThan(empty.countTotal);
    });
  });

  describe('getEntityCommissionSummary()', () => {
    beforeEach(() => invalidateSummaryCache());

    it('returns correct aggregation shape for country level', async () => {
      const summary = await getEntityCommissionSummary('country', 'ug');
      expect(typeof summary.totalPaid).toBe('number');
      expect(typeof summary.totalDue).toBe('number');
      expect(typeof summary.totalDisputed).toBe('number');
      expect(typeof summary.settlementRate).toBe('number');
    });

    it('total equals paid + due + disputed', async () => {
      const summary = await getEntityCommissionSummary('country', 'ug');
      expect(summary.total).toBe(summary.totalPaid + summary.totalDue + summary.totalDisputed);
      expect(summary.countTotal).toBe(summary.countPaid + summary.countDue + summary.countDisputed);
    });

    it('settlement rate is between 0 and 100', async () => {
      const summary = await getEntityCommissionSummary('country', 'ug');
      expect(summary.settlementRate).toBeGreaterThanOrEqual(0);
      expect(summary.settlementRate).toBeLessThanOrEqual(100);
    });

    it('returns aggregation for region level', async () => {
      const summary = await getEntityCommissionSummary('region', 'r-central');
      expect(summary.countTotal).toBeGreaterThan(0);
    });
  });

  describe('network cadence', () => {
    it('reads the seeded cadence', async () => {
      const cfg = await getNetworkCadence();
      expect(cfg.cadence).toBeDefined();
      expect(cfg.nextRunDate).toBeDefined();
    });

    it('updates the cadence and recomputes nextRunDate', async () => {
      const updated = await setNetworkCadence('weekly-friday');
      expect(updated.cadence).toBe('weekly-friday');
      expect(updated.nextRunDate).toBeDefined();
      // Restore default for other tests.
      await setNetworkCadence('monthly-first');
    });

    it('rejects an unknown cadence', async () => {
      await expect(setNetworkCadence('every-tuesday')).rejects.toThrow();
    });
  });

  describe('settlement runs', () => {
    it('exposes the currently open run', async () => {
      const run = await getCurrentRun();
      expect(run).not.toBeNull();
      expect(run.state).toBe('branch_review');
      expect(typeof run.canReleaseAny).toBe('boolean');
      expect(typeof run.branchCount).toBe('number');
    });

    it('releaseBranch on a pending branch is rejected', async () => {
      const run = await getCurrentRun();
      const pendingBranchId = Object.entries(run.branchReviews).find(
        ([, r]) => r.state === 'pending'
      )?.[0];
      if (pendingBranchId) {
        await expect(releaseBranch(run.id, pendingBranchId)).rejects.toThrow();
      }
    });

    it('getRunBranchBreakdown returns one row per branch with name + amount', async () => {
      const run = await getCurrentRun();
      const rows = await getRunBranchBreakdown(run.id);
      expect(rows.length).toBeGreaterThan(0);
      const sample = rows[0];
      expect(typeof sample.branchName).toBe('string');
      expect(typeof sample.amount).toBe('number');
      expect(typeof sample.count).toBe('number');
      expect(['pending', 'approved', 'released']).toContain(sample.state);
    });

    it('branchApproveAll + markBranchReviewed flips the branch row to approved', async () => {
      const run = await getCurrentRun();
      const branchId = Object.entries(run.branchReviews).find(
        ([, r]) => r.state === 'pending'
      )?.[0];
      if (!branchId) return;
      await branchApproveAll(run.id, branchId);
      const after = await markBranchReviewed(run.id, branchId);
      expect(after.branchReviews[branchId].state).toBe('approved');
    });

    it('branchHoldLine detaches a line from the run', async () => {
      const run = await getCurrentRun();
      // Find an in_run line
      const line = Object.values(COMMISSIONS).find((c) => c.runId === run.id && c.status === 'in_run');
      if (!line) return;
      const updated = await branchHoldLine(line.id, 'test hold');
      expect(updated.status).toBe('held');
      expect(updated.runId).toBeNull();

      // Restore for downstream tests.
      await branchApproveLine(line.id);
    });

    it('getRunForBranch returns lines scoped to the branch', async () => {
      const run = await getCurrentRun();
      const branchId = Object.keys(run.branchReviews)[0];
      const view = await getRunForBranch(run.id, branchId);
      expect(view.run.id).toBe(run.id);
      expect(Array.isArray(view.lines)).toBe(true);
      // Every returned line should belong to the requested branch.
      view.lines.forEach((c) => expect(c.branchId).toBe(branchId));
    });

    it('disputeCommission preserves previousStatus and detaches in_run lines', async () => {
      const open = await getCurrentRun();
      const inRunLine = Object.values(COMMISSIONS).find(
        (c) => c.runId === open.id && c.status === 'in_run'
      );
      if (!inRunLine) return;
      const before = inRunLine.status;
      const updated = await disputeCommission(inRunLine.id, 'test reason', 'agent');
      expect(updated.status).toBe('disputed');
      expect(updated.previousStatus).toBe(before);
      expect(updated.runId).toBeNull();
      expect(updated.disputedAt).toBeTruthy();
      expect(updated.disputedBy).toBe('agent');
      // Cleanup: withdraw to restore.
      await withdrawDispute(inRunLine.id);
      expect(COMMISSIONS[inRunLine.id].status).toBe(before);
    });

    it('approveDispute on a post-payment dispute restores released status', async () => {
      // Find a seeded post-payment dispute (previousStatus === 'released').
      const postPay = Object.values(COMMISSIONS).find(
        (c) => c.status === 'disputed' && c.previousStatus === 'released'
      );
      if (!postPay) return;
      const id = postPay.id;
      const updated = await approveDispute(id, { outcomeReason: 'reissued via MM-9931' });
      expect(updated.status).toBe('released');
      expect(updated.outcomeReason).toBe('reissued via MM-9931');
      expect(updated.resolvedAt).toBeTruthy();
      expect(updated.previousStatus).toBeNull();
    });

    it('rejectDispute on a pre-payment dispute marks rejected', async () => {
      const prePay = Object.values(COMMISSIONS).find(
        (c) => c.status === 'disputed' && c.previousStatus === 'in_run'
      );
      if (!prePay) return;
      const updated = await rejectDispute(prePay.id, { outcomeReason: 'invalid claim' });
      expect(updated.status).toBe('rejected');
      expect(updated.outcomeReason).toBe('invalid claim');
      expect(updated.resolvedAt).toBeTruthy();
    });

    it('withdrawDispute is a no-op once an admin has resolved', async () => {
      const resolved = Object.values(COMMISSIONS).find(
        (c) => c.resolvedAt && c.status !== 'disputed'
      );
      if (!resolved) return;
      // Already not 'disputed' so withdrawDispute should return null.
      const result = await withdrawDispute(resolved.id);
      expect(result).toBeNull();
    });

    it('branchDisputeLine tags disputedBy as branch', async () => {
      const open = await getCurrentRun();
      const line = Object.values(COMMISSIONS).find(
        (c) => c.runId === open.id && c.status === 'in_run'
      );
      if (!line) return;
      const updated = await branchDisputeLine(line.id, 'branch flagged');
      expect(updated.status).toBe('disputed');
      expect(updated.disputedBy).toBe('branch');
      // Cleanup
      await withdrawDispute(line.id);
    });

    it('releaseRun flips lines to released once all branches approve', async () => {
      const run = SETTLEMENT_RUNS[(await getCurrentRun()).id];
      // Force-approve every remaining pending branch via the service surface.
      for (const [bid, review] of Object.entries(run.branchReviews)) {
        if (review.state !== 'approved') {
          await branchApproveAll(run.id, bid);
          await markBranchReviewed(run.id, bid);
        }
      }
      const released = await releaseRun(run.id);
      expect(released.state).toBe('released');
      // Sanity: at least one line in this run should now be 'released'.
      const sampleReleased = Object.values(COMMISSIONS).find(
        (c) => c.runId === run.id && c.status === 'released'
      );
      expect(sampleReleased).toBeDefined();
    });
  });
});
