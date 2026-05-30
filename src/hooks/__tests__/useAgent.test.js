// Unit tests for `useAgent` family of hooks.
//
// Strategy: mock both `@/services/agent` and `@/services/subscriber` (the
// `useUpdateSubscriberSchedule` mutation calls into the subscriber service to
// reuse the same RPC).
//
// Optimistic-rollback path under test:
//   - `useUpdateSubscriberSchedule` patches a single subscriber INSIDE an
//     array — the cached value is `agentSubscribers` => Array<Subscriber>, so
//     the optimistic update has to `.map()` and replace the matching row. The
//     snapshot is the entire array; rollback restores the whole list, not a
//     row. Surprise: if the cache is missing or not an array, onMutate's setter
//     returns it unchanged — so the mutation still runs (no crash). The error
//     handler also checks `ctx.key` defensively because the `cancelQueries`
//     contract for an empty cache returns no snapshot.

import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../services/agent', () => ({
  getAgentSubscriberList: vi.fn(),
}));

vi.mock('../../services/subscriber', () => ({
  updateContributionSchedule: vi.fn(),
}));

const agentService = await import('../../services/agent');
const subscriberService = await import('../../services/subscriber');
const { useAgentSubscribers, useUpdateSubscriberSchedule } = await import('../useAgent');

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

describe('useAgentSubscribers — query', () => {
  it('returns subscriber list after mock resolves', async () => {
    const subs = [
      { id: 'sub-1', name: 'Alice', contributionSchedule: { frequency: 'monthly', amount: 1000 } },
      { id: 'sub-2', name: 'Bob', contributionSchedule: { frequency: 'weekly', amount: 500 } },
    ];
    agentService.getAgentSubscriberList.mockResolvedValue(subs);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAgentSubscribers('a-001'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(subs);
    expect(agentService.getAgentSubscriberList).toHaveBeenCalledWith('a-001');
  });

  it('is disabled without agentId', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAgentSubscribers(null), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(agentService.getAgentSubscriberList).not.toHaveBeenCalled();
  });

  it('caches by agentId — second mount within staleTime reuses the cached list', async () => {
    agentService.getAgentSubscriberList.mockResolvedValue([{ id: 'sub-1' }]);
    const { Wrapper } = makeWrapper();
    const { result, unmount } = renderHook(() => useAgentSubscribers('a-001'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    unmount();

    const { result: r2 } = renderHook(() => useAgentSubscribers('a-001'), { wrapper: Wrapper });
    expect(r2.current.data).toEqual([{ id: 'sub-1' }]);
    expect(agentService.getAgentSubscriberList).toHaveBeenCalledTimes(1);
  });

  it('differentiates cache between two agents', async () => {
    agentService.getAgentSubscriberList.mockResolvedValueOnce([{ id: 'sub-1' }]);
    agentService.getAgentSubscriberList.mockResolvedValueOnce([{ id: 'sub-2' }]);
    const { Wrapper } = makeWrapper();
    const { result: a } = renderHook(() => useAgentSubscribers('a-001'), { wrapper: Wrapper });
    const { result: b } = renderHook(() => useAgentSubscribers('a-002'), { wrapper: Wrapper });
    await waitFor(() => expect(a.current.isSuccess).toBe(true));
    await waitFor(() => expect(b.current.isSuccess).toBe(true));
    expect(a.current.data).toEqual([{ id: 'sub-1' }]);
    expect(b.current.data).toEqual([{ id: 'sub-2' }]);
  });
});

describe('useUpdateSubscriberSchedule — optimistic update + rollback', () => {
  it('optimistically patches the right subscriber in the agent portfolio array', async () => {
    let resolveUpdate;
    subscriberService.updateContributionSchedule.mockReturnValue(
      new Promise((res) => { resolveUpdate = res; }),
    );
    const { queryClient, Wrapper } = makeWrapper();
    const initial = [
      { id: 'sub-1', name: 'Alice', contributionSchedule: { frequency: 'monthly', amount: 1000 } },
      { id: 'sub-2', name: 'Bob', contributionSchedule: { frequency: 'weekly', amount: 500 } },
    ];
    queryClient.setQueryData(['agentSubscribers', 'a-001'], initial);

    const { result } = renderHook(
      () => useUpdateSubscriberSchedule('sub-2', 'a-001'),
      { wrapper: Wrapper },
    );
    const newSchedule = { frequency: 'monthly', amount: 999 };
    act(() => {
      result.current.mutate(newSchedule);
    });

    await waitFor(() => {
      const updated = queryClient.getQueryData(['agentSubscribers', 'a-001']);
      // Only sub-2's schedule was patched. sub-1 remains untouched.
      expect(updated).toEqual([
        { id: 'sub-1', name: 'Alice', contributionSchedule: { frequency: 'monthly', amount: 1000 } },
        { id: 'sub-2', name: 'Bob', contributionSchedule: newSchedule },
      ]);
    });

    await act(async () => {
      resolveUpdate({ ok: true });
    });
  });

  it('rolls back the whole array on error', async () => {
    subscriberService.updateContributionSchedule.mockRejectedValue(new Error('rls'));
    const { queryClient, Wrapper } = makeWrapper();
    const initial = [
      { id: 'sub-1', contributionSchedule: { frequency: 'monthly', amount: 1000 } },
      { id: 'sub-2', contributionSchedule: { frequency: 'weekly', amount: 500 } },
    ];
    queryClient.setQueryData(['agentSubscribers', 'a-001'], initial);

    const { result } = renderHook(
      () => useUpdateSubscriberSchedule('sub-2', 'a-001'),
      { wrapper: Wrapper },
    );
    await act(async () => {
      try {
        await result.current.mutateAsync({ frequency: 'monthly', amount: 999 });
      } catch {
        // Expected.
      }
    });

    // Whole array restored, including sub-2's untouched schedule.
    expect(queryClient.getQueryData(['agentSubscribers', 'a-001'])).toEqual(initial);
  });

  it('survives an empty cache (no snapshot to restore) without throwing', async () => {
    subscriberService.updateContributionSchedule.mockRejectedValue(new Error('rls'));
    const { queryClient, Wrapper } = makeWrapper();
    // Intentionally do NOT seed the cache.

    const { result } = renderHook(
      () => useUpdateSubscriberSchedule('sub-2', 'a-001'),
      { wrapper: Wrapper },
    );
    await act(async () => {
      try {
        await result.current.mutateAsync({ frequency: 'monthly', amount: 999 });
      } catch {
        // Expected.
      }
    });

    // No throw, no spurious cache entry created by the rollback.
    expect(queryClient.getQueryData(['agentSubscribers', 'a-001'])).toBeUndefined();
  });

  it('settles by invalidating agent portfolio + subscriber transactions on success', async () => {
    subscriberService.updateContributionSchedule.mockResolvedValue({ ok: true });
    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData(['agentSubscribers', 'a-001'], [
      { id: 'sub-2', contributionSchedule: { frequency: 'weekly', amount: 500 } },
    ]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => useUpdateSubscriberSchedule('sub-2', 'a-001'),
      { wrapper: Wrapper },
    );
    await act(async () => {
      await result.current.mutateAsync({ frequency: 'monthly', amount: 999 });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agentSubscribers', 'a-001'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['subscriberTransactions', 'sub-2'] });
  });

  it('settles by invalidating even on error path (onSettled, not onSuccess)', async () => {
    subscriberService.updateContributionSchedule.mockRejectedValue(new Error('rls'));
    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData(['agentSubscribers', 'a-001'], [
      { id: 'sub-2', contributionSchedule: { frequency: 'weekly', amount: 500 } },
    ]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => useUpdateSubscriberSchedule('sub-2', 'a-001'),
      { wrapper: Wrapper },
    );
    await act(async () => {
      try {
        await result.current.mutateAsync({ frequency: 'monthly', amount: 999 });
      } catch {
        // Expected.
      }
    });

    // onSettled invalidates regardless of outcome — the server has the truth.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agentSubscribers', 'a-001'] });
  });

  it('passes the schedule through to the service unchanged', async () => {
    subscriberService.updateContributionSchedule.mockResolvedValue({ ok: true });
    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData(['agentSubscribers', 'a-001'], []);

    const { result } = renderHook(
      () => useUpdateSubscriberSchedule('sub-2', 'a-001'),
      { wrapper: Wrapper },
    );
    const schedule = {
      frequency: 'monthly',
      amount: 50000,
      retirementPct: 80,
      emergencyPct: 20,
      includeInsurance: true,
    };
    await act(async () => {
      await result.current.mutateAsync(schedule);
    });

    expect(subscriberService.updateContributionSchedule).toHaveBeenCalledWith('sub-2', schedule);
  });
});
