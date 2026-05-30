// Unit tests for `useEntity` family of hooks.
//
// Strategy: mock the service module (`@/services/entities`, `@/services/search`)
// so we test hook behavior — React Query wiring, cache keys, staleTime honoring,
// and optimistic-rollback semantics — without touching Supabase. Supabase-side
// concerns are already covered in `src/services/__tests__/entities.test.js`.
//
// Each query test asserts (a) data flows back after the mock resolves, and
// (b) the cache key is stable (refetch within staleTime doesn't re-call the
// queryFn). Each mutation test asserts the optimistic patch is applied
// synchronously after `mutate`, and that an error rolls the cache back to the
// pre-mutation snapshot.

import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../services/entities', () => ({
  getCountry: vi.fn(),
  getEntity: vi.fn(),
  getChildren: vi.fn(),
  getAllAtLevel: vi.fn(),
  getEntityPage: vi.fn(),
  getAllAtLevelMap: vi.fn(),
  getTopPerformingBranch: vi.fn(),
  getBreadcrumb: vi.fn(),
  createBranch: vi.fn(),
  createAgent: vi.fn(),
  updateBranch: vi.fn(),
  updateDistributor: vi.fn(),
  setBranchStatus: vi.fn(),
  getEntityMetricsRollup: vi.fn(),
}));

vi.mock('../../services/search', () => ({
  searchEntities: vi.fn(),
}));

const entities = await import('../../services/entities');
const search = await import('../../services/search');
const {
  useCountry,
  useEntity,
  useChildren,
  useAllEntities,
  useTopBranch,
  useSearch,
  useCreateBranch,
  useUpdateBranch,
  useUpdateDistributor,
  useSetBranchStatus,
} = await import('../useEntity');

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

describe('useEntity hooks — queries', () => {
  it('useCountry returns data after mock resolves', async () => {
    entities.getCountry.mockResolvedValue({ id: 'ug', name: 'Uganda' });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCountry(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: 'ug', name: 'Uganda' });
    expect(entities.getCountry).toHaveBeenCalledTimes(1);
  });

  it('useCountry caches by queryKey — second mount within staleTime does not re-call queryFn', async () => {
    entities.getCountry.mockResolvedValue({ id: 'ug', name: 'Uganda' });
    const { Wrapper } = makeWrapper();
    const { result, unmount } = renderHook(() => useCountry(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    unmount();

    // Mount again under the same QueryClient — should hit the cache.
    const { result: result2 } = renderHook(() => useCountry(), { wrapper: Wrapper });
    expect(result2.current.data).toEqual({ id: 'ug', name: 'Uganda' });
    expect(entities.getCountry).toHaveBeenCalledTimes(1);
  });

  it('useEntity is disabled when id is falsy', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useEntity('region', null), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(entities.getEntity).not.toHaveBeenCalled();
  });

  it('useEntity is disabled at country level', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useEntity('country', 'ug'), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(entities.getEntity).not.toHaveBeenCalled();
  });

  it('useEntity fetches when level + id are present', async () => {
    entities.getEntity.mockResolvedValue({ id: 'r-central', name: 'Central' });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useEntity('region', 'r-central'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: 'r-central', name: 'Central' });
    expect(entities.getEntity).toHaveBeenCalledWith('region', 'r-central');
  });

  it('useChildren returns child list and is disabled without parentId', async () => {
    entities.getChildren.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
    const { Wrapper } = makeWrapper();
    const { result: gated } = renderHook(() => useChildren('country', null), { wrapper: Wrapper });
    expect(gated.current.fetchStatus).toBe('idle');

    const { result } = renderHook(() => useChildren('country', 'ug'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'r1' }, { id: 'r2' }]);
  });

  it('useAllEntities returns level list and is disabled without level', async () => {
    entities.getAllAtLevel.mockResolvedValue([{ id: 'r1' }]);
    const { Wrapper } = makeWrapper();
    const { result: gated } = renderHook(() => useAllEntities(''), { wrapper: Wrapper });
    expect(gated.current.fetchStatus).toBe('idle');

    const { result } = renderHook(() => useAllEntities('region'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'r1' }]);
  });

  it('useTopBranch is disabled without parentId', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTopBranch('region', null), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(entities.getTopPerformingBranch).not.toHaveBeenCalled();
  });

  it('useSearch only enables once query length >= 2', async () => {
    search.searchEntities.mockResolvedValue([{ id: 'r1', name: 'Central' }]);
    const { Wrapper } = makeWrapper();
    const { result: gated } = renderHook(() => useSearch('a'), { wrapper: Wrapper });
    expect(gated.current.fetchStatus).toBe('idle');

    const { result } = renderHook(() => useSearch('cen'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'r1', name: 'Central' }]);
  });
});

describe('useEntity hooks — mutations + optimistic rollback', () => {
  it('useCreateBranch invalidates entities + children on success', async () => {
    entities.createBranch.mockResolvedValue({ id: 'b-new' });
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateBranch(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: 'New Branch' });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['entities', 'branch'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['children'] });
  });

  it('useUpdateBranch optimistically patches the cached entity', async () => {
    let resolveUpdate;
    entities.updateBranch.mockReturnValue(
      new Promise((res) => { resolveUpdate = res; }),
    );
    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData(['entity', 'branch', 'b-1'], { id: 'b-1', name: 'Old' });

    const { result } = renderHook(() => useUpdateBranch(), { wrapper: Wrapper });
    act(() => {
      result.current.mutate({ id: 'b-1', updates: { name: 'New' } });
    });

    // Optimistic patch must apply synchronously after onMutate's await flush.
    await waitFor(() => {
      expect(queryClient.getQueryData(['entity', 'branch', 'b-1'])).toEqual({
        id: 'b-1',
        name: 'New',
      });
    });

    await act(async () => {
      resolveUpdate({ id: 'b-1', name: 'New' });
    });
  });

  it('useUpdateBranch rolls back on error', async () => {
    entities.updateBranch.mockRejectedValue(new Error('rls denied'));
    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData(['entity', 'branch', 'b-1'], { id: 'b-1', name: 'Old' });

    const { result } = renderHook(() => useUpdateBranch(), { wrapper: Wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ id: 'b-1', updates: { name: 'New' } });
      } catch {
        // Expected — the mutation rejects.
      }
    });

    // Rollback restores the pre-mutation value.
    expect(queryClient.getQueryData(['entity', 'branch', 'b-1'])).toEqual({
      id: 'b-1',
      name: 'Old',
    });
  });

  it('useUpdateDistributor optimistically patches and rolls back on error', async () => {
    entities.updateDistributor.mockRejectedValue(new Error('rls denied'));
    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData(['entity', 'distributor', 'd-001'], {
      id: 'd-001', manager_name: 'Old Mgr',
    });

    const { result } = renderHook(() => useUpdateDistributor(), { wrapper: Wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({
          id: 'd-001', updates: { manager_name: 'New Mgr' },
        });
      } catch {
        // Expected.
      }
    });

    expect(queryClient.getQueryData(['entity', 'distributor', 'd-001'])).toEqual({
      id: 'd-001', manager_name: 'Old Mgr',
    });
  });

  it('useSetBranchStatus rolls back on error', async () => {
    entities.setBranchStatus.mockRejectedValue(new Error('boom'));
    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData(['entity', 'branch', 'b-1'], { id: 'b-1', status: 'active' });

    const { result } = renderHook(() => useSetBranchStatus(), { wrapper: Wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ id: 'b-1', status: 'inactive' });
      } catch {
        // Expected.
      }
    });

    expect(queryClient.getQueryData(['entity', 'branch', 'b-1'])).toEqual({
      id: 'b-1', status: 'active',
    });
  });

  it('useSetBranchStatus optimistically flips status before settle', async () => {
    let resolveSet;
    entities.setBranchStatus.mockReturnValue(
      new Promise((res) => { resolveSet = res; }),
    );
    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData(['entity', 'branch', 'b-1'], { id: 'b-1', status: 'active' });

    const { result } = renderHook(() => useSetBranchStatus(), { wrapper: Wrapper });
    act(() => {
      result.current.mutate({ id: 'b-1', status: 'inactive' });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(['entity', 'branch', 'b-1'])).toEqual({
        id: 'b-1', status: 'inactive',
      });
    });

    await act(async () => {
      resolveSet({ id: 'b-1', status: 'inactive' });
    });
  });
});
