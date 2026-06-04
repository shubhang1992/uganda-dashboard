// Commissions service tests — REAL (Supabase) branch for the 0041 aggregate
// RPCs (IS_SUPABASE_ENABLED defaults ON in the test env, like subscriber.test.js,
// so we do NOT mock `../api` here — that would force the mock branch, which the
// sibling commissions.test.js already covers).
//
// These lock the P4 refactor that routed the three commission FOLDS through the
// server-side 0041 RPCs (get_agent_commission_list / get_pending_dues_by_agent /
// get_pending_dues_by_branch), killing the prior 1000-row PostgREST truncation.
// We assert: the correct RPC name + args, the snake→camel mapper, rowset order
// preservation, empty/null handling, and error propagation. The 0041 RPCs
// RETURN TABLE rowsets, so `data` is an ARRAY (the mock queues arrays).
//
// NOTE: the LIVE equivalence proof (RPC total == full paginated read on real
// ~30k-row data) is a Gate-A step — it needs the restored DB. These tests prove
// the JS half (mapper + call shape) is faithful to the documented SQL math.

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
vi.mock('../supabaseClient', () => ({
  supabase: supabaseMock,
  default: supabaseMock,
  getToken: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

const {
  getAgentCommissionList,
  getPendingDuesByAgent,
  getPendingDuesByBranch,
} = await import('../commissions');

beforeEach(() => {
  supabaseMock.__reset();
});

describe('commissions service — Supabase branch (0041 aggregate RPCs)', () => {
  describe('getAgentCommissionList()', () => {
    it('calls get_agent_commission_list and maps the snake_case rowset to camelCase', async () => {
      // A 2-agent rowset shaped exactly like the 0041 RETURNS TABLE columns.
      supabaseMock.__queueRpc('get_agent_commission_list', {
        data: [
          {
            agent_id: 'a-001', agent_name: 'Asha', employee_id: 'E1',
            branch_id: 'b-1', branch_name: 'Kampala',
            total_commissions: 30000, total_paid: 10000, total_due: 20000,
            subscribers_onboarded: 3, active_subscribers: 3,
            filtered_amount: 20000, filtered_count: 2,
          },
          {
            agent_id: 'a-002', agent_name: 'Bob', employee_id: '',
            branch_id: 'b-2', branch_name: 'Gulu',
            total_commissions: 5000, total_paid: 5000, total_due: 0,
            subscribers_onboarded: 1, active_subscribers: 1,
            filtered_amount: 0, filtered_count: 0,
          },
        ],
        error: null,
      });

      const list = await getAgentCommissionList('due');

      // Mapper faithfully reproduces the prior fold's camelCase shape.
      expect(list).toEqual([
        {
          agentId: 'a-001', agentName: 'Asha', employeeId: 'E1',
          branchId: 'b-1', branchName: 'Kampala',
          totalCommissions: 30000, totalPaid: 10000, totalDue: 20000,
          subscribersOnboarded: 3, activeSubscribers: 3,
          filteredAmount: 20000, filteredCount: 2,
        },
        {
          agentId: 'a-002', agentName: 'Bob', employeeId: '',
          branchId: 'b-2', branchName: 'Gulu',
          totalCommissions: 5000, totalPaid: 5000, totalDue: 0,
          subscribersOnboarded: 1, activeSubscribers: 1,
          filteredAmount: 0, filteredCount: 0,
        },
      ]);
      // totalCommissions == totalPaid + totalDue per row (the fold invariant).
      list.forEach((a) => expect(a.totalCommissions).toBe(a.totalPaid + a.totalDue));
    });

    it('threads statusFocus into p_status_focus (and null when omitted)', async () => {
      supabaseMock.__queueRpc('get_agent_commission_list', { data: [], error: null });
      await getAgentCommissionList('paid');
      expect(supabaseMock.__getRpcCalls('get_agent_commission_list').at(-1).args)
        .toEqual({ p_status_focus: 'paid' });

      supabaseMock.__queueRpc('get_agent_commission_list', { data: [], error: null });
      await getAgentCommissionList();
      expect(supabaseMock.__getRpcCalls('get_agent_commission_list').at(-1).args)
        .toEqual({ p_status_focus: null });
    });

    it('coerces numeric strings (PostgREST numeric/bigint) to numbers', async () => {
      // PostgREST can serialise numeric/bigint as strings — the mapper must Number() them.
      supabaseMock.__queueRpc('get_agent_commission_list', {
        data: [{
          agent_id: 'a-1', agent_name: 'X', employee_id: '', branch_id: '', branch_name: 'Unknown',
          total_commissions: '12000', total_paid: '0', total_due: '12000',
          subscribers_onboarded: '4', active_subscribers: '4',
          filtered_amount: '12000', filtered_count: '4',
        }],
        error: null,
      });
      const [row] = await getAgentCommissionList('due');
      expect(row.totalCommissions).toBe(12000);
      expect(row.subscribersOnboarded).toBe(4);
      expect(row.filteredCount).toBe(4);
      expect(typeof row.totalDue).toBe('number');
    });

    it('returns [] for an empty/null rowset', async () => {
      supabaseMock.__queueRpc('get_agent_commission_list', { data: null, error: null });
      expect(await getAgentCommissionList()).toEqual([]);
    });

    it('throws a wrapped error when the RPC errors', async () => {
      supabaseMock.__queueRpc('get_agent_commission_list', {
        data: null, error: { message: 'boom', code: '42883' },
      });
      await expect(getAgentCommissionList('due')).rejects.toThrow('boom');
    });
  });

  describe('getPendingDuesByAgent()', () => {
    it('maps the rowset and preserves the RPC ordering (pendingAmount desc)', async () => {
      supabaseMock.__queueRpc('get_pending_dues_by_agent', {
        data: [
          { agent_id: 'a-1', agent_name: 'Big', employee_id: 'E1', branch_id: 'b-1', branch_name: 'K', pending_amount: 90000, pending_count: 9 },
          { agent_id: 'a-2', agent_name: 'Small', employee_id: 'E2', branch_id: 'b-2', branch_name: 'G', pending_amount: 5000, pending_count: 1 },
        ],
        error: null,
      });
      const rows = await getPendingDuesByAgent();
      expect(rows).toEqual([
        { agentId: 'a-1', agentName: 'Big', employeeId: 'E1', branchId: 'b-1', branchName: 'K', pendingAmount: 90000, pendingCount: 9 },
        { agentId: 'a-2', agentName: 'Small', employeeId: 'E2', branchId: 'b-2', branchName: 'G', pendingAmount: 5000, pendingCount: 1 },
      ]);
      // Order from the RPC's ORDER BY pending_amount DESC is preserved.
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1].pendingAmount).toBeGreaterThanOrEqual(rows[i].pendingAmount);
      }
      expect(supabaseMock.__getRpcCalls('get_pending_dues_by_agent').length).toBe(1);
    });

    it('returns [] for an empty rowset and throws on RPC error', async () => {
      supabaseMock.__queueRpc('get_pending_dues_by_agent', { data: [], error: null });
      expect(await getPendingDuesByAgent()).toEqual([]);
      supabaseMock.__queueRpc('get_pending_dues_by_agent', { data: null, error: { message: 'nope' } });
      await expect(getPendingDuesByAgent()).rejects.toThrow('nope');
    });
  });

  describe('getPendingDuesByBranch()', () => {
    it('maps the rowset including agentCount (COUNT DISTINCT agent_id)', async () => {
      supabaseMock.__queueRpc('get_pending_dues_by_branch', {
        data: [
          { branch_id: 'b-1', branch_name: 'Kampala', pending_amount: 120000, pending_count: 12, agent_count: 4 },
          { branch_id: 'b-2', branch_name: 'Gulu', pending_amount: 30000, pending_count: 3, agent_count: 2 },
        ],
        error: null,
      });
      const rows = await getPendingDuesByBranch();
      expect(rows).toEqual([
        { branchId: 'b-1', branchName: 'Kampala', pendingAmount: 120000, pendingCount: 12, agentCount: 4 },
        { branchId: 'b-2', branchName: 'Gulu', pendingAmount: 30000, pendingCount: 3, agentCount: 2 },
      ]);
    });

    it('returns [] for an empty rowset and throws on RPC error', async () => {
      supabaseMock.__queueRpc('get_pending_dues_by_branch', { data: null, error: null });
      expect(await getPendingDuesByBranch()).toEqual([]);
      supabaseMock.__queueRpc('get_pending_dues_by_branch', { data: null, error: { message: 'down' } });
      await expect(getPendingDuesByBranch()).rejects.toThrow('down');
    });
  });
});
