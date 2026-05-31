// Unit tests for `useCommission` family of hooks.
//
// Strategy: mock the `@/services/commissions` service so we test the hook
// layer in isolation — React Query keys, the broad `invalidateAll` blast on
// settlement, query gating, and cache differentiation. The service module is
// covered directly in `src/services/__tests__/commissions.test.js`.
//
// Phase 2 collapsed the commission flow to `due → paid`; the only surviving
// mutation is `useApplySettlement`, which blasts ALL_COMMISSION_KEYS on
// success (including the Phase-3 notification keys so the feed refreshes).

import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../services/commissions', () => ({
  getCommissionRate: vi.fn(),
  setCommissionRate: vi.fn(),
  getCommissionSummary: vi.fn(),
  getAgentCommissionList: vi.fn(),
  getAgentCommissionDetail: vi.fn(),
  getCommissionSubscribers: vi.fn(),
  getEntityCommissionSummary: vi.fn(),
  getPendingDuesByAgent: vi.fn(),
  getPendingDuesByBranch: vi.fn(),
  listSettlements: vi.fn(),
  applySettlementUpload: vi.fn(),
}));

const commissions = await import('../../services/commissions');
const {
  useCommissionRate,
  useSetCommissionRate,
  useCommissionSummary,
  useAgentCommissionDetail,
  useCommissionSubscribers,
  useEntityCommissionSummary,
  usePendingDuesByAgent,
  usePendingDuesByBranch,
  useSettlementsList,
  useApplySettlement,
} = await import('../useCommission');

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 5 * 60 * 1000 },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  );
  return { queryClient, Wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('useCommission hooks — queries', () => {
  it('useCommissionRate caches — same QueryClient reuses cached value', async () => {
    commissions.getCommissionRate.mockResolvedValue(5000);
    const { Wrapper } = makeWrapper();
    const { result, unmount } = renderHook(() => useCommissionRate(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    unmount();

    const { result: r2 } = renderHook(() => useCommissionRate(), { wrapper: Wrapper });
    expect(r2.current.data).toBe(5000);
    expect(commissions.getCommissionRate).toHaveBeenCalledTimes(1);
  });

  it('useCommissionSummary differentiates cache by branchId', async () => {
    commissions.getCommissionSummary.mockResolvedValueOnce({ scope: 'all' });
    commissions.getCommissionSummary.mockResolvedValueOnce({ scope: 'b-1' });
    const { Wrapper } = makeWrapper();
    const { result: rAll } = renderHook(() => useCommissionSummary(), { wrapper: Wrapper });
    const { result: rBranch } = renderHook(() => useCommissionSummary('b-1'), { wrapper: Wrapper });

    await waitFor(() => expect(rAll.current.isSuccess).toBe(true));
    await waitFor(() => expect(rBranch.current.isSuccess).toBe(true));
    expect(rAll.current.data).toEqual({ scope: 'all' });
    expect(rBranch.current.data).toEqual({ scope: 'b-1' });
    expect(commissions.getCommissionSummary).toHaveBeenCalledTimes(2);
  });

  it('useAgentCommissionDetail is disabled without agentId', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAgentCommissionDetail(null), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(commissions.getAgentCommissionDetail).not.toHaveBeenCalled();
  });

  it('useCommissionSubscribers gates on agentId', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCommissionSubscribers(null, 'paid'), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('useEntityCommissionSummary enables for country level even without entityId', async () => {
    commissions.getEntityCommissionSummary.mockResolvedValue({ total: 0 });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useEntityCommissionSummary('country', null),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(commissions.getEntityCommissionSummary).toHaveBeenCalledWith('country', null);
  });

  it('usePendingDuesByAgent returns data', async () => {
    commissions.getPendingDuesByAgent.mockResolvedValue([{ agentId: 'a-1', pendingAmount: 5000 }]);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => usePendingDuesByAgent(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ agentId: 'a-1', pendingAmount: 5000 }]);
  });

  it('usePendingDuesByBranch returns data', async () => {
    commissions.getPendingDuesByBranch.mockResolvedValue([{ branchId: 'b-1', pendingAmount: 9000 }]);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => usePendingDuesByBranch(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ branchId: 'b-1', pendingAmount: 9000 }]);
  });

  it('useSettlementsList threads limit + branchId + agentId into the queryKey', async () => {
    commissions.listSettlements.mockResolvedValueOnce(['batch-1']);
    commissions.listSettlements.mockResolvedValueOnce(['batch-2']);
    commissions.listSettlements.mockResolvedValueOnce(['batch-3']);
    const { Wrapper } = makeWrapper();
    const { result: a } = renderHook(() => useSettlementsList({ limit: 5 }), { wrapper: Wrapper });
    const { result: b } = renderHook(
      () => useSettlementsList({ limit: 5, branchId: 'b-1' }),
      { wrapper: Wrapper },
    );
    // A distinct agentId must be a distinct cache entry from branch scope so the
    // agent page never reads a branch-scoped (or unscoped) feed.
    const { result: c } = renderHook(
      () => useSettlementsList({ limit: 5, agentId: 'a-001' }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(a.current.isSuccess).toBe(true));
    await waitFor(() => expect(b.current.isSuccess).toBe(true));
    await waitFor(() => expect(c.current.isSuccess).toBe(true));
    expect(a.current.data).toEqual(['batch-1']);
    expect(b.current.data).toEqual(['batch-2']);
    expect(c.current.data).toEqual(['batch-3']);
    expect(commissions.listSettlements).toHaveBeenCalledWith({ limit: 5, branchId: undefined, agentId: undefined });
    expect(commissions.listSettlements).toHaveBeenCalledWith({ limit: 5, branchId: 'b-1', agentId: undefined });
    expect(commissions.listSettlements).toHaveBeenCalledWith({ limit: 5, branchId: undefined, agentId: 'a-001' });
  });
});

describe('useCommission hooks — mutations + invalidation blast', () => {
  it('useSetCommissionRate invalidates the rate query on success', async () => {
    commissions.setCommissionRate.mockResolvedValue(5500);
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useSetCommissionRate(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(5500);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['commissionRate'] });
  });

  it('useApplySettlement forwards rows and blasts all commission keys on success', async () => {
    commissions.applySettlementUpload.mockResolvedValue({
      agentsSettled: 1, linesSettled: 3, totalPaid: 15000, skipped: [],
    });
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useApplySettlement(), { wrapper: Wrapper });

    // New contract (BL-13): the component passes { rows, nonce }; the hook is a
    // pass-through, so it forwards the object verbatim to the service.
    const payload = {
      rows: [{ agentId: 'a-1', amountPaid: 15000, paymentRef: 'TX-1', paymentDate: '2026-05-20' }],
      nonce: 'nonce-abc',
    };
    await act(async () => {
      await result.current.mutateAsync(payload);
    });

    expect(commissions.applySettlementUpload.mock.calls[0][0]).toEqual(payload);
    // Sample the broad invalidation blast (incl. Phase-3 notification keys).
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['commissionSummary'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agentCommissions'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pendingDuesByAgent'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pendingDuesByBranch'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['settlementsList'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notificationsUnread'] });
  });

  it('useApplySettlement does NOT invalidate on rejection (cache stays cold)', async () => {
    commissions.applySettlementUpload.mockRejectedValue(new Error('rls'));
    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData(['settlementsList', 'all', 'unlimited'], ['batch-1']);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useApplySettlement(), { wrapper: Wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync([{ agentId: 'a-1', amountPaid: 1, paymentRef: 'x' }]);
      } catch {
        // Expected.
      }
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['settlementsList', 'all', 'unlimited'])).toEqual(['batch-1']);
  });
});
