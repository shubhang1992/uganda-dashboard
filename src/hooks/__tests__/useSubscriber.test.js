// Unit tests for `useSubscriber` family of hooks.
//
// Strategy: mock both `@/services/subscriber` and `@/contexts/AuthContext`
// (since `useCurrentSubscriber` reads the authenticated phone from `useAuth`).
// Hook behavior — query gating, optimistic patching of nominees + profile,
// rollback on error — is asserted in isolation from Supabase, RLS, and routing.
//
// Optimistic-rollback paths under test:
//   - `useUpdateProfile`: snapshots all `['currentSubscriber']` queries, patches
//     in place, restores from snapshot on error.
//   - `useUpdateNominees`: snapshots BOTH `['subscriberNominees', id]` AND every
//     `['currentSubscriber']` query (it spreads `nominees` into the subscriber
//     payload). Surprise: it uses `setQueriesData` (plural), not `setQueryData`,
//     because the `currentSubscriber` key is parameterized by phone — there may
//     be multiple entries to patch.

import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../services/subscriber', () => ({
  getCurrentSubscriber: vi.fn(),
  getSubscriberTransactions: vi.fn(),
  getSubscriberClaims: vi.fn(),
  getSubscriberWithdrawals: vi.fn(),
  getSubscriberNominees: vi.fn(),
  getSubscriberAgent: vi.fn(),
  makeAdHocContribution: vi.fn(),
  requestWithdrawal: vi.fn(),
  updateContributionSchedule: vi.fn(),
  updateNominees: vi.fn(),
  submitClaim: vi.fn(),
  updateInsuranceCover: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const subscriberService = await import('../../services/subscriber');
const authCtx = await import('../../contexts/AuthContext');
const {
  useCurrentSubscriber,
  useSubscriberTransactions,
  useSubscriberClaims,
  useSubscriberWithdrawals,
  useSubscriberNominees,
  useSubscriberAgent,
  useMakeContribution,
  useRequestWithdrawal,
  useUpdateSchedule,
  useUpdateNominees,
  useSubmitClaim,
  useUpdateInsuranceCover,
  useUpdateProfile,
} = await import('../useSubscriber');

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
  authCtx.useAuth.mockReturnValue({ user: { phone: '+25671 100 0001' } });
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('useSubscriber hooks — queries', () => {
  it('useCurrentSubscriber reads phone from useAuth and fetches', async () => {
    subscriberService.getCurrentSubscriber.mockResolvedValue({ id: 'sub-1', phone: '+25671 100 0001' });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCurrentSubscriber(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: 'sub-1', phone: '+25671 100 0001' });
    expect(subscriberService.getCurrentSubscriber).toHaveBeenCalledWith('+25671 100 0001');
  });

  it('useCurrentSubscriber caches by phone — refetch within staleTime hits cache', async () => {
    subscriberService.getCurrentSubscriber.mockResolvedValue({ id: 'sub-1' });
    const { Wrapper } = makeWrapper();
    const { result, unmount } = renderHook(() => useCurrentSubscriber(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    unmount();

    const { result: r2 } = renderHook(() => useCurrentSubscriber(), { wrapper: Wrapper });
    expect(r2.current.data).toEqual({ id: 'sub-1' });
    expect(subscriberService.getCurrentSubscriber).toHaveBeenCalledTimes(1);
  });

  it('useSubscriberTransactions is disabled without id', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useSubscriberTransactions(null, {}),
      { wrapper: Wrapper },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(subscriberService.getSubscriberTransactions).not.toHaveBeenCalled();
  });

  it('useSubscriberTransactions threads filters into the queryKey', async () => {
    subscriberService.getSubscriberTransactions.mockResolvedValueOnce(['t1']);
    subscriberService.getSubscriberTransactions.mockResolvedValueOnce(['t2']);
    const { Wrapper } = makeWrapper();
    const { result: a } = renderHook(
      () => useSubscriberTransactions('sub-1', { kind: 'contribution' }),
      { wrapper: Wrapper },
    );
    const { result: b } = renderHook(
      () => useSubscriberTransactions('sub-1', { kind: 'withdrawal' }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(a.current.isSuccess).toBe(true));
    await waitFor(() => expect(b.current.isSuccess).toBe(true));
    expect(a.current.data).toEqual(['t1']);
    expect(b.current.data).toEqual(['t2']);
  });

  it('useSubscriberClaims is gated on id', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSubscriberClaims(null), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('useSubscriberWithdrawals is gated on id', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSubscriberWithdrawals(null), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('useSubscriberNominees fetches when id is present', async () => {
    subscriberService.getSubscriberNominees.mockResolvedValue({ retirement: [] });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSubscriberNominees('sub-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ retirement: [] });
  });

  it('useSubscriberAgent is gated on id', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSubscriberAgent(null), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useSubscriber hooks — invalidating mutations', () => {
  it('useMakeContribution invalidates the subscriber graph on success', async () => {
    subscriberService.makeAdHocContribution.mockResolvedValue({ ok: true });
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useMakeContribution('sub-1'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ amount: 10000 });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['currentSubscriber'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['subscriberTransactions', 'sub-1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['subscriberClaims', 'sub-1'] });
  });

  it('useRequestWithdrawal invalidates withdrawals on success', async () => {
    subscriberService.requestWithdrawal.mockResolvedValue({ ok: true });
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useRequestWithdrawal('sub-1'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ amount: 5000, reason: 'medical' });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['subscriberWithdrawals', 'sub-1'] });
  });

  it('useUpdateSchedule invalidates on success', async () => {
    subscriberService.updateContributionSchedule.mockResolvedValue({ ok: true });
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateSchedule('sub-1'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ frequency: 'monthly', amount: 50000 });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['currentSubscriber'] });
  });

  it('useSubmitClaim invalidates claims on success', async () => {
    subscriberService.submitClaim.mockResolvedValue({ id: 'claim-1' });
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useSubmitClaim('sub-1'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ type: 'insurance' });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['subscriberClaims', 'sub-1'] });
  });

  it('useUpdateInsuranceCover invalidates on success', async () => {
    subscriberService.updateInsuranceCover.mockResolvedValue({ ok: true });
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateInsuranceCover('sub-1'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ enabled: true });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['currentSubscriber'] });
  });
});

describe('useSubscriber hooks — optimistic updates + rollback', () => {
  it('useUpdateNominees optimistically patches nominees + currentSubscriber', async () => {
    let resolveUpdate;
    subscriberService.updateNominees.mockReturnValue(
      new Promise((res) => { resolveUpdate = res; }),
    );
    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData(['subscriberNominees', 'sub-1'], {
      retirement: [{ name: 'Old' }],
    });
    queryClient.setQueryData(['currentSubscriber', '+25671 100 0001'], {
      id: 'sub-1', nominees: { retirement: [{ name: 'Old' }] },
    });

    const { result } = renderHook(() => useUpdateNominees('sub-1'), { wrapper: Wrapper });
    act(() => {
      result.current.mutate({ retirement: [{ name: 'New' }] });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(['subscriberNominees', 'sub-1'])).toEqual({
        retirement: [{ name: 'New' }],
      });
    });
    // currentSubscriber's nominees branch should also reflect the patch.
    expect(queryClient.getQueryData(['currentSubscriber', '+25671 100 0001'])).toEqual({
      id: 'sub-1',
      nominees: { retirement: [{ name: 'New' }] },
    });

    await act(async () => {
      resolveUpdate({ ok: true });
    });
  });

  it('useUpdateNominees rolls back BOTH caches on error', async () => {
    subscriberService.updateNominees.mockRejectedValue(new Error('rls'));
    const { queryClient, Wrapper } = makeWrapper();
    const originalNominees = { retirement: [{ name: 'Old' }] };
    const originalSubscriber = { id: 'sub-1', nominees: { retirement: [{ name: 'Old' }] } };
    queryClient.setQueryData(['subscriberNominees', 'sub-1'], originalNominees);
    queryClient.setQueryData(['currentSubscriber', '+25671 100 0001'], originalSubscriber);

    const { result } = renderHook(() => useUpdateNominees('sub-1'), { wrapper: Wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ retirement: [{ name: 'New' }] });
      } catch {
        // Expected.
      }
    });

    // Both caches restored to their pre-mutation state.
    expect(queryClient.getQueryData(['subscriberNominees', 'sub-1'])).toEqual(originalNominees);
    expect(queryClient.getQueryData(['currentSubscriber', '+25671 100 0001'])).toEqual(originalSubscriber);
  });

  it('useUpdateProfile optimistically patches every cached currentSubscriber entry', async () => {
    let resolveUpdate;
    subscriberService.updateProfile.mockReturnValue(
      new Promise((res) => { resolveUpdate = res; }),
    );
    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData(['currentSubscriber', '+25671 100 0001'], {
      id: 'sub-1', name: 'Old Name',
    });
    // A second cached subscriber entry under a different phone — both should
    // patch because useUpdateProfile uses setQueriesData on the base key.
    queryClient.setQueryData(['currentSubscriber', '+25671 100 0002'], {
      id: 'sub-2', name: 'Other',
    });

    const { result } = renderHook(() => useUpdateProfile('sub-1'), { wrapper: Wrapper });
    act(() => {
      result.current.mutate({ name: 'New Name' });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(['currentSubscriber', '+25671 100 0001'])).toEqual({
        id: 'sub-1', name: 'New Name',
      });
    });
    // Surprise: the broad `setQueriesData` also rewrites the OTHER cached entry.
    // That's by design — `useUpdateProfile` doesn't filter by subscriber id,
    // it just spreads `updates` over every `currentSubscriber` cache entry.
    expect(queryClient.getQueryData(['currentSubscriber', '+25671 100 0002'])).toEqual({
      id: 'sub-2', name: 'New Name',
    });

    await act(async () => {
      resolveUpdate({ ok: true });
    });
  });

  it('useUpdateProfile rolls back on error', async () => {
    subscriberService.updateProfile.mockRejectedValue(new Error('rls'));
    const { queryClient, Wrapper } = makeWrapper();
    const original = { id: 'sub-1', name: 'Old Name' };
    queryClient.setQueryData(['currentSubscriber', '+25671 100 0001'], original);

    const { result } = renderHook(() => useUpdateProfile('sub-1'), { wrapper: Wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ name: 'New Name' });
      } catch {
        // Expected.
      }
    });

    expect(queryClient.getQueryData(['currentSubscriber', '+25671 100 0001'])).toEqual(original);
  });
});
