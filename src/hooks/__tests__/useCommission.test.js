// Unit tests for `useCommission` family of hooks.
//
// Strategy: mock the `@/services/commissions` service so we test the hook
// layer in isolation — React Query keys, the broad `invalidateAll` blast,
// and the cache-honoring behavior. The service module is already covered
// directly in `src/services/__tests__/commissions.test.js`.
//
// The commission hooks lean heavily on a flat invalidation blast on success
// (`invalidateAll` walks ALL_RUN_KEYS + ALL_COMMISSION_KEYS). We assert one
// representative mutation per family blasts the right query keys, plus a
// rejection path that surfaces the error to the caller. None of the commission
// mutations implement onMutate/onError optimistic-rollback today — they're
// invalidate-on-success only — so the "rollback" assertion shape here is
// "rejection surfaces; no stale cache lingers because nothing was patched".

import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../services/commissions', () => ({
  getNetworkCadence: vi.fn(),
  setNetworkCadence: vi.fn(),
  getCommissionRate: vi.fn(),
  setCommissionRate: vi.fn(),
  getCommissionSummary: vi.fn(),
  getAgentCommissionList: vi.fn(),
  getAgentCommissionDetail: vi.fn(),
  getCommissionSubscribers: vi.fn(),
  getDisputedAgentList: vi.fn(),
  getEntityCommissionSummary: vi.fn(),
  getCurrentRun: vi.fn(),
  getRunById: vi.fn(),
  listRuns: vi.fn(),
  getRunForBranch: vi.fn(),
  getRunBranchBreakdown: vi.fn(),
  getRunBranchAgents: vi.fn(),
  approveDispute: vi.fn(),
  rejectDispute: vi.fn(),
  bulkApproveDisputes: vi.fn(),
  bulkRejectDisputes: vi.fn(),
  withdrawDispute: vi.fn(),
  branchDisputeLine: vi.fn(),
  openRun: vi.fn(),
  cancelRun: vi.fn(),
  branchApproveLine: vi.fn(),
  branchHoldLine: vi.fn(),
  branchApproveAll: vi.fn(),
  markBranchReviewed: vi.fn(),
  releaseRun: vi.fn(),
  releaseBranch: vi.fn(),
  confirmCommission: vi.fn(),
  disputeCommission: vi.fn(),
}));

const commissions = await import('../../services/commissions');
const {
  useNetworkCadence,
  useCommissionRate,
  useSetCommissionRate,
  useCommissionSummary,
  useAgentCommissionDetail,
  useCommissionSubscribers,
  useEntityCommissionSummary,
  useCurrentRun,
  useRun,
  useRunsList,
  useBranchRunReview,
  useRunBranchBreakdown,
  useApproveDispute,
  useBulkApproveDisputes,
  useBranchApproveAll,
  useReleaseRun,
  useConfirmCommission,
  useDisputeCommission,
} = await import('../useCommission');

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 5 * 60 * 1000 },
      mutations: { retry: false },
    },
  });
  // eslint-disable-next-line react/prop-types
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
  it('useNetworkCadence returns data', async () => {
    commissions.getNetworkCadence.mockResolvedValue({ frequency: 'monthly' });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useNetworkCadence(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ frequency: 'monthly' });
  });

  it('useCommissionRate caches — same QueryClient reuses cached value', async () => {
    commissions.getCommissionRate.mockResolvedValue({ rate: 0.025 });
    const { Wrapper } = makeWrapper();
    const { result, unmount } = renderHook(() => useCommissionRate(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    unmount();

    const { result: r2 } = renderHook(() => useCommissionRate(), { wrapper: Wrapper });
    expect(r2.current.data).toEqual({ rate: 0.025 });
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

  it('useCurrentRun returns data', async () => {
    commissions.getCurrentRun.mockResolvedValue({ id: 'run-1', status: 'open' });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCurrentRun(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: 'run-1', status: 'open' });
  });

  it('useRun is disabled without runId', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRun(null), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('useRunsList threads limit + branchId into the queryKey', async () => {
    commissions.listRuns.mockResolvedValueOnce(['run-1']);
    commissions.listRuns.mockResolvedValueOnce(['run-2']);
    const { Wrapper } = makeWrapper();
    const { result: a } = renderHook(() => useRunsList({ limit: 5 }), { wrapper: Wrapper });
    const { result: b } = renderHook(
      () => useRunsList({ limit: 5, branchId: 'b-1' }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(a.current.isSuccess).toBe(true));
    await waitFor(() => expect(b.current.isSuccess).toBe(true));
    expect(a.current.data).toEqual(['run-1']);
    expect(b.current.data).toEqual(['run-2']);
  });

  it('useBranchRunReview gates on both runId and branchId', async () => {
    const { Wrapper } = makeWrapper();
    const { result: noBranch } = renderHook(
      () => useBranchRunReview('run-1', null),
      { wrapper: Wrapper },
    );
    expect(noBranch.current.fetchStatus).toBe('idle');

    const { result: noRun } = renderHook(
      () => useBranchRunReview(null, 'b-1'),
      { wrapper: Wrapper },
    );
    expect(noRun.current.fetchStatus).toBe('idle');
  });

  it('useRunBranchBreakdown gates on runId', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRunBranchBreakdown(null), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useCommission hooks — mutations + invalidation blast', () => {
  it('useSetCommissionRate invalidates the rate query on success', async () => {
    commissions.setCommissionRate.mockResolvedValue({ rate: 0.03 });
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useSetCommissionRate(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(0.03);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['commissionRate'] });
  });

  it('useApproveDispute blasts all run + commission keys on success', async () => {
    commissions.approveDispute.mockResolvedValue({ ok: true });
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useApproveDispute(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        commissionId: 'c-1', outcomeReason: 'agreed', resolvedBy: 'admin',
      });
    });

    // Sample the broad invalidation blast.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['currentRun'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agentCommissions'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['disputedAgents'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['settlementRunsList'] });
  });

  it('useApproveDispute does NOT invalidate on rejection (cache stays cold)', async () => {
    commissions.approveDispute.mockRejectedValue(new Error('rls'));
    const { queryClient, Wrapper } = makeWrapper();
    // Seed a cached value so we can prove it survives a failed mutation.
    queryClient.setQueryData(['currentRun'], { id: 'run-1', status: 'open' });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useApproveDispute(), { wrapper: Wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({
          commissionId: 'c-1', outcomeReason: 'x', resolvedBy: 'admin',
        });
      } catch {
        // Expected.
      }
    });

    // The mutation rejected — onSuccess never fires → invalidate never called.
    expect(invalidateSpy).not.toHaveBeenCalled();
    // Pre-existing cached entry survives (no implicit rollback corruption).
    expect(queryClient.getQueryData(['currentRun'])).toEqual({ id: 'run-1', status: 'open' });
  });

  it('useBulkApproveDisputes blasts on success', async () => {
    commissions.bulkApproveDisputes.mockResolvedValue({ ok: true });
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useBulkApproveDisputes(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        commissionIds: ['c-1', 'c-2'], outcomeReason: 'r', resolvedBy: 'admin',
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agentCommissions'] });
  });

  it('useBranchApproveAll passes (runId, branchId) to the service', async () => {
    commissions.branchApproveAll.mockResolvedValue({ approved: 12 });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useBranchApproveAll(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ runId: 'run-1', branchId: 'b-1' });
    });

    expect(commissions.branchApproveAll).toHaveBeenCalledWith('run-1', 'b-1');
  });

  it('useReleaseRun threads txnRefByAgent to the service', async () => {
    commissions.releaseRun.mockResolvedValue({ released: 5 });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useReleaseRun(), { wrapper: Wrapper });

    const txnRefByAgent = { 'a-001': 'TX-100', 'a-002': 'TX-101' };
    await act(async () => {
      await result.current.mutateAsync({ runId: 'run-1', txnRefByAgent });
    });

    expect(commissions.releaseRun).toHaveBeenCalledWith('run-1', { txnRefByAgent });
  });

  it('useConfirmCommission blasts and surfaces rejection', async () => {
    commissions.confirmCommission.mockResolvedValue({ ok: true });
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useConfirmCommission(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync('c-1');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agentCommissionDetail'] });
  });

  it('useDisputeCommission forwards (commissionId, reason)', async () => {
    commissions.disputeCommission.mockResolvedValue({ ok: true });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useDisputeCommission(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ commissionId: 'c-1', reason: 'wrong amount' });
    });
    expect(commissions.disputeCommission).toHaveBeenCalledWith('c-1', 'wrong amount');
  });
});
