// Commissions service tests — mock mode (IS_SUPABASE_ENABLED forced false).
//
// Phase 2 collapsed the commission flow to `due → paid`. These tests exercise
// the mock-backed branch of the service (the rollback path used when
// VITE_USE_SUPABASE=false). We force that branch by mocking `../api` so the
// service routes through its `_legacy_mock_*` implementations against the
// regenerated mockData store.
//
// supabaseClient is mocked to a no-op so importing the service never touches a
// live client; the mock branch never calls it.

import { describe, it, expect, vi } from 'vitest';
import { makeSupabaseMock } from '../../test/supabaseMock';

const supabaseMock = makeSupabaseMock();

// Force the rollback/mock branch in every service function.
vi.mock('../api', () => ({
  IS_SUPABASE_ENABLED: false,
}));

vi.mock('@/services/supabaseClient', () => ({
  supabase: supabaseMock,
  default: supabaseMock,
  getToken: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));
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
  getAgentCommissionList,
  getAgentCommissionDetail,
  getPendingDuesByAgent,
  getPendingDuesByBranch,
  applySettlementUpload,
  listSettlements,
} = await import('../commissions');
const { commissionsByAgent } = await import('../../data/mockData');

describe('commissions service (mock mode)', () => {
  describe('getCommissionRate / setCommissionRate', () => {
    it('returns a number', async () => {
      const rate = await getCommissionRate();
      expect(typeof rate).toBe('number');
      expect(rate).toBeGreaterThan(0);
    });

    it('updates the rate and returns the new value', async () => {
      const original = await getCommissionRate();
      const updated = await setCommissionRate(7500);
      expect(updated).toBe(7500);
      expect(await getCommissionRate()).toBe(7500);
      // restore so other tests aren't perturbed
      await setCommissionRate(original);
    });
  });

  describe('getCommissionSummary()', () => {
    it('returns the two-bucket shape with positive totals', async () => {
      const summary = await getCommissionSummary();
      for (const key of ['totalCommissions', 'totalPaid', 'totalDue', 'countTotal', 'countPaid', 'countDue']) {
        expect(typeof summary[key]).toBe('number');
      }
      // No legacy buckets leak through.
      expect(summary.totalDisputed).toBeUndefined();
      expect(summary.totalInRun).toBeUndefined();
      expect(summary.totalCommissions).toBeGreaterThan(0);
      expect(summary.countTotal).toBe(summary.countPaid + summary.countDue);
    });

    it('returns zeroes for an unknown branch', async () => {
      const empty = await getCommissionSummary('nonexistent-branch');
      expect(empty.totalCommissions).toBe(0);
      expect(empty.countTotal).toBe(0);
    });
  });

  describe('getEntityCommissionSummary()', () => {
    it('aggregates country level into paid + due only', async () => {
      const summary = await getEntityCommissionSummary('country', 'ug');
      expect(summary.total).toBe(summary.totalPaid + summary.totalDue);
      expect(summary.countTotal).toBe(summary.countPaid + summary.countDue);
      expect(summary.settlementRate).toBeGreaterThanOrEqual(0);
      expect(summary.settlementRate).toBeLessThanOrEqual(100);
      expect(summary.totalDisputed).toBeUndefined();
    });
  });

  describe('getAgentCommissionList()', () => {
    it('returns agents with paid + due tallies', async () => {
      const list = await getAgentCommissionList();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      const sample = list[0];
      expect(typeof sample.totalCommissions).toBe('number');
      expect(sample.totalCommissions).toBe(sample.totalPaid + sample.totalDue);
    });

    it("statusFocus='due' filters to outstanding only", async () => {
      const list = await getAgentCommissionList('due');
      // filteredAmount should never exceed totalDue for any agent.
      list.forEach((a) => expect(a.filteredAmount).toBeLessThanOrEqual(a.totalDue));
    });
  });

  describe('getAgentCommissionDetail()', () => {
    it('splits paid + due transactions and exposes paidAmount on paid lines', async () => {
      // Pick an agent that actually has commissions.
      const agentId = Object.keys(commissionsByAgent).find(
        (id) => (commissionsByAgent[id] || []).some((c) => c.status === 'paid')
      );
      const detail = await getAgentCommissionDetail(agentId);
      expect(detail.agentId).toBe(agentId);
      expect(Array.isArray(detail.paidTransactions)).toBe(true);
      expect(Array.isArray(detail.dueTransactions)).toBe(true);
      expect(detail.dormantSubscribers).toBe(0);
      if (detail.paidTransactions.length) {
        expect(detail.paidTransactions[0]).toHaveProperty('paidAmount');
        expect(detail.paidTransactions[0]).not.toHaveProperty('runId');
      }
    });
  });

  describe('getPendingDuesByAgent()', () => {
    it('only returns agents with pending dues, sorted desc by amount', async () => {
      const rows = await getPendingDuesByAgent();
      expect(Array.isArray(rows)).toBe(true);
      rows.forEach((r) => {
        expect(r.pendingCount).toBeGreaterThan(0);
        expect(r.pendingAmount).toBeGreaterThan(0);
      });
      // sorted descending by pendingAmount
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1].pendingAmount).toBeGreaterThanOrEqual(rows[i].pendingAmount);
      }
      // grouping matches the underlying due commissions for a sampled agent
      const sample = rows[0];
      const due = (commissionsByAgent[sample.agentId] || []).filter((c) => c.status === 'due');
      expect(sample.pendingCount).toBe(due.length);
      expect(sample.pendingAmount).toBe(due.reduce((s, c) => s + c.amount, 0));
    });
  });

  describe('getPendingDuesByBranch()', () => {
    it('only returns branches with pending dues, sorted desc, with agentCount', async () => {
      const rows = await getPendingDuesByBranch();
      expect(Array.isArray(rows)).toBe(true);
      rows.forEach((r) => {
        expect(r.pendingCount).toBeGreaterThan(0);
        expect(r.pendingAmount).toBeGreaterThan(0);
        expect(r.agentCount).toBeGreaterThan(0);
      });
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1].pendingAmount).toBeGreaterThanOrEqual(rows[i].pendingAmount);
      }
    });
  });

  describe('applySettlementUpload()', () => {
    it('fully settles an agent when the amount covers every due line; per-line paid_amount reconciles with the batch (BL-2)', async () => {
      // Choose an agent that has at least one due line.
      const agentId = Object.keys(commissionsByAgent).find(
        (id) => (commissionsByAgent[id] || []).some((c) => c.status === 'due')
      );
      expect(agentId).toBeTruthy();
      const dueBefore = (commissionsByAgent[agentId] || []).filter((c) => c.status === 'due');
      const dueCount = dueBefore.length;
      const dueTotal = dueBefore.reduce((s, c) => s + c.amount, 0);

      const settledBefore = await listSettlements({ branchId: undefined });
      const countBefore = settledBefore.length;

      // Pay exactly the full due total → all lines settle.
      const result = await applySettlementUpload({
        rows: [{ agentId, amountPaid: dueTotal, paymentRef: 'TX-TEST-1', paymentDate: '2026-05-20' }],
      });

      expect(result.agentsSettled).toBe(1);
      expect(result.linesSettled).toBe(dueCount);
      expect(result.totalPaid).toBe(dueTotal);
      expect(result.skipped).toEqual([]);

      // All previously-due lines for the agent are now paid, each stamped with
      // its OWN amount (NOT the whole-batch total — BL-2).
      const dueAfter = (commissionsByAgent[agentId] || []).filter((c) => c.status === 'due');
      expect(dueAfter.length).toBe(0);
      dueBefore.forEach((c) => {
        expect(c.status).toBe('paid');
        expect(c.txnRef).toBe('TX-TEST-1');
        expect(c.paidDate).toBe('2026-05-20');
        expect(c.paidAmount).toBe(c.amount); // per-line own amount
      });
      // Per-line paid_amount sums to the batch paid_amount.
      const sumPerLine = dueBefore.reduce((s, c) => s + c.paidAmount, 0);
      expect(sumPerLine).toBe(dueTotal);

      // A batch was recorded and is visible via listSettlements.
      const settledAfter = await listSettlements();
      expect(settledAfter.length).toBe(countBefore + 1);
      const newest = settledAfter[0];
      expect(newest.agentId).toBe(agentId);
      expect(newest.paidAmount).toBe(dueTotal);
      expect(newest.lineCount).toBe(dueCount);

      // A second settlement for the same (now fully-paid) agent finds no due lines.
      const second = await applySettlementUpload({
        rows: [{ agentId, amountPaid: 999, paymentRef: 'TX-TEST-2', paymentDate: '2026-05-21' }],
      });
      expect(second.agentsSettled).toBe(0);
      expect(second.linesSettled).toBe(0);
      expect(second.totalPaid).toBe(0);
      expect(second.skipped).toEqual([{ agentId, reason: 'no_due' }]);
    });

    it('settles only the lines a partial amount covers FIFO; the rest stay due (BL-1 INFORM-NOT-BLOCK)', async () => {
      // Find an agent with at least 3 due lines so a partial payment leaves a
      // genuine remainder.
      const agentId = Object.keys(commissionsByAgent).find(
        (id) => (commissionsByAgent[id] || []).filter((c) => c.status === 'due').length >= 3
      );
      expect(agentId).toBeTruthy();
      const dueBefore = (commissionsByAgent[agentId] || []).filter((c) => c.status === 'due');
      // Oldest-first order the FIFO walk uses.
      const ordered = [...dueBefore].sort((a, b) => {
        const da = a.dueDate || '';
        const db = b.dueDate || '';
        if (da !== db) return da.localeCompare(db);
        return (a.id || '').localeCompare(b.id || '');
      });
      // Pay enough for the first two lines + a little extra that can't cover a third.
      const partial = ordered[0].amount + ordered[1].amount + 1;

      const result = await applySettlementUpload({
        rows: [{ agentId, amountPaid: partial, paymentRef: 'TX-PARTIAL', paymentDate: '2026-05-22' }],
      });

      // Only the two covered lines settle; the rest stay genuinely `due`.
      expect(result.agentsSettled).toBe(1);
      expect(result.linesSettled).toBe(2);
      expect(result.totalPaid).toBe(ordered[0].amount + ordered[1].amount);

      expect(ordered[0].status).toBe('paid');
      expect(ordered[1].status).toBe('paid');
      expect(ordered[0].paidAmount).toBe(ordered[0].amount);
      expect(ordered[1].paidAmount).toBe(ordered[1].amount);
      // Remaining lines untouched.
      for (let i = 2; i < ordered.length; i++) {
        expect(ordered[i].status).toBe('due');
        expect(ordered[i].paidAmount).toBeNull();
      }

      // The batch records the actually-allocated total, not the entered amount.
      const newest = (await listSettlements())[0];
      expect(newest.paidAmount).toBe(ordered[0].amount + ordered[1].amount);
      expect(newest.lineCount).toBe(2);
    });

    it('skips an amount that cannot cover even the oldest due line (amount_too_low)', async () => {
      const agentId = Object.keys(commissionsByAgent).find(
        (id) => (commissionsByAgent[id] || []).some((c) => c.status === 'due')
      );
      const ordered = (commissionsByAgent[agentId] || [])
        .filter((c) => c.status === 'due')
        .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
      const tooLow = Math.max(1, ordered[0].amount - 1);

      const result = await applySettlementUpload({
        rows: [{ agentId, amountPaid: tooLow, paymentRef: 'TX-LOW', paymentDate: '2026-05-23' }],
      });
      expect(result.agentsSettled).toBe(0);
      expect(result.linesSettled).toBe(0);
      expect(result.skipped).toEqual([{ agentId, reason: 'amount_too_low' }]);
    });

    it('is idempotent for a replayed nonce — no duplicate batch (BL-13)', async () => {
      const agentId = Object.keys(commissionsByAgent).find(
        (id) => (commissionsByAgent[id] || []).some((c) => c.status === 'due')
      );
      const dueTotal = (commissionsByAgent[agentId] || [])
        .filter((c) => c.status === 'due')
        .reduce((s, c) => s + c.amount, 0);

      const countBefore = (await listSettlements()).length;
      const payload = {
        rows: [{ agentId, amountPaid: dueTotal, paymentRef: 'TX-NONCE', paymentDate: '2026-05-24' }],
        nonce: 'upload-nonce-123',
      };

      const first = await applySettlementUpload(payload);
      const afterFirst = (await listSettlements()).length;
      expect(afterFirst).toBe(countBefore + 1);

      // Replay with the same nonce → same result, NO new batch recorded.
      const replay = await applySettlementUpload(payload);
      expect(replay).toEqual(first);
      const afterReplay = (await listSettlements()).length;
      expect(afterReplay).toBe(afterFirst);
    });
  });

  describe('listSettlements() agentId scoping (mock has no RLS — BL-1 follow-up)', () => {
    it('returns ONLY the logged-in agent\'s batches when agentId is passed', async () => {
      // Settle two different agents so the mock store holds batches for both.
      const dueAgents = Object.keys(commissionsByAgent).filter(
        (id) => (commissionsByAgent[id] || []).some((c) => c.status === 'due'),
      );
      const [agentA, agentB] = dueAgents;
      expect(agentA).toBeTruthy();
      expect(agentB).toBeTruthy();
      expect(agentA).not.toBe(agentB);

      const dueTotalA = (commissionsByAgent[agentA] || [])
        .filter((c) => c.status === 'due')
        .reduce((s, c) => s + c.amount, 0);
      const dueTotalB = (commissionsByAgent[agentB] || [])
        .filter((c) => c.status === 'due')
        .reduce((s, c) => s + c.amount, 0);

      await applySettlementUpload({
        rows: [{ agentId: agentA, amountPaid: dueTotalA, paymentRef: 'TX-SCOPE-A', paymentDate: '2026-05-25' }],
      });
      await applySettlementUpload({
        rows: [{ agentId: agentB, amountPaid: dueTotalB, paymentRef: 'TX-SCOPE-B', paymentDate: '2026-05-25' }],
      });

      // Unscoped: both agents' batches are visible (no RLS in mock mode).
      const all = await listSettlements();
      expect(all.some((b) => b.agentId === agentA)).toBe(true);
      expect(all.some((b) => b.agentId === agentB)).toBe(true);

      // Scoped to agentA: ONLY agentA's batches — agentB's never leak through.
      // This is what the agent CommissionsPage relies on so its partial-payment
      // mismatch banner can never surface another agent's batch.
      const scopedToA = await listSettlements({ agentId: agentA });
      expect(scopedToA.length).toBeGreaterThan(0);
      expect(scopedToA.every((b) => b.agentId === agentA)).toBe(true);
      expect(scopedToA.some((b) => b.agentId === agentB)).toBe(false);
    });
  });
});
