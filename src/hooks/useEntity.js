// React Query hooks for entity data — components import these, never mockData directly.
// When backend is ready, only the service layer changes. These hooks stay the same.
//
// Mutations follow the optimistic-update pattern: onMutate snapshots, applies a
// patch, and returns the snapshot; onError restores it; onSettled invalidates
// for the server's truth. See `useUpdateBranch` and `useSetBranchStatus` for
// templates new mutations should follow.

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import * as entities from '../services/entities';
import * as searchService from '../services/search';

const CHILD_LEVEL = {
  country: 'region',
  region: 'district',
  district: 'branch',
  branch: 'agent',
};

/**
 * Fetch the top-level country entity.
 * @returns {import('@tanstack/react-query').UseQueryResult<Object>}
 */
export function useCountry() {
  return useQuery({
    queryKey: ['country'],
    queryFn: entities.getCountry,
  });
}

/**
 * Fetch a single entity by level and ID.
 * @param {string} level - Hierarchy level
 * @param {string} id - Entity ID
 * @returns {import('@tanstack/react-query').UseQueryResult<Object>}
 */
export function useEntity(level, id) {
  return useQuery({
    queryKey: ['entity', level, id],
    queryFn: () => entities.getEntity(level, id),
    enabled: !!id && !!level && level !== 'country',
  });
}

/**
 * Fetch the current entity based on drill-down level and selected IDs.
 * @param {string} level - Current drill-down level
 * @param {Record<string, string>} selectedIds - Map of level to entity ID
 * @returns {{ data: Object|undefined, isLoading: boolean }}
 */
export function useCurrentEntity(level, selectedIds) {
  const id = level === 'country' ? null : selectedIds[level];
  const countryQuery = useCountry();
  const entityQuery = useEntity(level, id);

  if (level === 'country') {
    return { data: countryQuery.data, isLoading: countryQuery.isLoading };
  }
  return { data: entityQuery.data, isLoading: entityQuery.isLoading };
}

/**
 * Fetch child entities for a given parent.
 * @param {string} level - Parent's hierarchy level
 * @param {string} parentId - Parent entity ID
 * @returns {import('@tanstack/react-query').UseQueryResult<Object[]>}
 */
export function useChildren(level, parentId) {
  return useQuery({
    queryKey: ['children', level, parentId],
    queryFn: () => entities.getChildren(level, parentId),
    enabled: !!parentId,
  });
}

/**
 * Fetch all entities at a given hierarchy level.
 * @param {string} level - Hierarchy level
 * @returns {import('@tanstack/react-query').UseQueryResult<Object[]>}
 */
export function useAllEntities(level) {
  return useQuery({
    queryKey: ['entities', level],
    queryFn: () => entities.getAllAtLevel(level),
    enabled: !!level,
  });
}

/**
 * Server-side paginated + filtered + sorted entity list. Used by
 * ViewSubscribers to replace the 30-page subscriber fetch (AUDIT-1-7,
 * AUDIT-2-1). One page = 1000 rows; the virtualizer's `onEndReached` calls
 * `fetchNextPage`. Each page carries the full filtered `total` so the
 * "Showing X of Y" header can render after the first page lands.
 *
 * Search / status / sort are passed through to the server via PostgREST
 * `or=`, `eq=`, `order=`. The query key threads them so cache invalidates
 * cleanly on filter change.
 *
 * @param {string} level - 'subscriber' (others coming follow-up)
 * @param {Object} [opts]
 * @param {string} [opts.search='']
 * @param {string} [opts.statusFilter='all'] - 'all' | 'active' | 'inactive'
 * @param {string} [opts.sortKey='balance'] - 'balance' | 'contributions' | 'name' | 'registration'
 * @param {number} [opts.pageSize=1000]
 * @returns {import('@tanstack/react-query').UseInfiniteQueryResult}
 */
export function useInfiniteEntityList(level, opts = {}) {
  const { search = '', statusFilter = 'all', sortKey = 'balance', pageSize = 1000 } = opts;
  return useInfiniteQuery({
    queryKey: ['entity-page', level, { search, statusFilter, sortKey, pageSize }],
    queryFn: ({ pageParam = 0, signal }) =>
      entities.getEntityPage(level, {
        offset: pageParam,
        limit: pageSize,
        search,
        statusFilter,
        sortKey,
        signal,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      const loaded = allPages.reduce((acc, p) => acc + p.rows.length, 0);
      return loaded;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!level,
  });
}

/**
 * Fetch all entities at a level as a Map keyed by ID.
 * @param {string} level - Hierarchy level
 * @returns {import('@tanstack/react-query').UseQueryResult<Map<string, Object>>}
 */
export function useAllEntitiesMap(level) {
  return useQuery({
    queryKey: ['entitiesMap', level],
    queryFn: () => entities.getAllAtLevelMap(level),
    enabled: !!level,
  });
}

/**
 * Fetch the top-performing branch under a given parent entity.
 * @param {string} level - Parent hierarchy level
 * @param {string} parentId - Parent entity ID
 * @returns {import('@tanstack/react-query').UseQueryResult<{name: string, contribution: number}|null>}
 */
export function useTopBranch(level, parentId) {
  return useQuery({
    queryKey: ['topBranch', level, parentId],
    queryFn: () => entities.getTopPerformingBranch(level, parentId),
    enabled: !!level && !!parentId,
  });
}

/**
 * Build breadcrumb trail from the current drill-down position.
 *
 * `selectedIds` is recreated on every parent render (it's the
 * DashboardContext map), so feeding the object straight into the queryKey
 * thrashed the cache — TanStack Query does referential equality on key
 * elements. We serialise to a stable string so the key only changes when an
 * actual ID changes. `JSON.stringify` here is the same pattern `MetricsRow`
 * already uses to stabilise this object for keyed remounts (F13).
 *
 * @param {string} currentLevel - Current hierarchy level
 * @param {Record<string, string>} selectedIds - Map of level to entity ID
 * @returns {import('@tanstack/react-query').UseQueryResult<Array<{level: string, name: string}>>}
 */
export function useBreadcrumb(currentLevel, selectedIds) {
  const selectedIdsKey = JSON.stringify(selectedIds ?? {});
  return useQuery({
    queryKey: ['breadcrumb', currentLevel, selectedIdsKey],
    queryFn: () => entities.getBreadcrumb(currentLevel, selectedIds),
    enabled: currentLevel !== 'country',
  });
}

/**
 * Search entities by name across all levels.
 * @param {string} query - Search string (enabled when length >= 2)
 * @returns {import('@tanstack/react-query').UseQueryResult<Array<{id: string, name: string, level: string, label: string}>>}
 */
export function useSearch(query) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => searchService.searchEntities(query),
    enabled: query.length >= 2,
  });
}

/**
 * Mutation to create a new branch entity. Invalidates entity caches on success.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useCreateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: entities.createBranch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities', 'branch'] });
      queryClient.invalidateQueries({ queryKey: ['children'] });
    },
  });
}

/**
 * Mutation to create a new agent under a branch. Invalidates the parent
 * branch's children list and the flat agent collection on success.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: entities.createAgent,
    onSuccess: (_agent, variables) => {
      queryClient.invalidateQueries({ queryKey: ['entities', 'agent'] });
      queryClient.invalidateQueries({ queryKey: ['children', 'branch', variables.branchId] });
      queryClient.invalidateQueries({ queryKey: ['entity', 'branch', variables.branchId] });
    },
  });
}

/**
 * Mutation to apply partial updates to a branch (admin info, name, etc).
 * Optimistically patches the cached entity so the detail panel reflects the
 * change immediately; rolls back on error.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useUpdateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }) => entities.updateBranch(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['entity', 'branch', id] });
      const previous = queryClient.getQueryData(['entity', 'branch', id]);
      queryClient.setQueryData(['entity', 'branch', id], (old) =>
        old ? { ...old, ...updates } : old,
      );
      return { previous };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(['entity', 'branch', id], ctx.previous);
      }
    },
    onSettled: (_data, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['entity', 'branch', id] });
      queryClient.invalidateQueries({ queryKey: ['entities', 'branch'] });
      queryClient.invalidateQueries({ queryKey: ['children'] });
    },
  });
}

/**
 * Batch metrics for a parent's children — used by OverlayPanel child rows,
 * the per-row "subscribers" counts in regions/districts/branches/agents lists,
 * and any report view that maps over `useChildren` results.
 *
 * Runs in parallel with `useChildren`; the children list paints first, then
 * the metrics overlay arrives. queryKey threads `ids` so the cache invalidates
 * cleanly when the parent's children set changes.
 *
 * @param {string} parentLevel - 'country' | 'region' | 'district' | 'branch'
 * @param {string} parentId
 * @returns {import('@tanstack/react-query').UseQueryResult<Record<string, Object>>}
 */
export function useChildrenMetrics(parentLevel, parentId) {
  const childLevel = CHILD_LEVEL[parentLevel];
  const { data: children = [] } = useChildren(parentLevel, parentId);
  const ids = useMemo(() => children.map((c) => c.id), [children]);
  return useQuery({
    queryKey: ['childrenMetrics', parentLevel, parentId, ids],
    queryFn: () => entities.getEntityMetricsRollup(childLevel, ids),
    enabled: !!childLevel && ids.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Metrics for one drilled-into entity — used by OverlayPanel hero card,
 * MetricsRow, ViewBranches/ViewAgents detail panes. Returns the full 8-field
 * rollup at any level (country/region/district/branch/agent).
 *
 * @param {string} level - 'region' | 'district' | 'branch' | 'agent' | 'country'
 * @param {string} id
 * @returns {import('@tanstack/react-query').UseQueryResult<Object|null>}
 */
export function useEntityMetrics(level, id) {
  return useQuery({
    queryKey: ['entityMetrics', level, id],
    queryFn: async () => {
      const result = await entities.getEntityMetricsRollup(level, [id]);
      return result[id] ?? null;
    },
    enabled: !!id && !!level,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Batch metrics for ALL entities at a level — used by report views
 * (AllBranches, AllAgents, AgentPerformance, BranchPerformance,
 * DistributionSummary, etc.) that today reach into `row.metrics` from a
 * `useAllEntities(level)` list and would otherwise see zeros.
 *
 * @param {string} level
 * @returns {import('@tanstack/react-query').UseQueryResult<Record<string, Object>>}
 */
export function useAllEntitiesMetrics(level) {
  const { data: entityList = [] } = useAllEntities(level);
  const ids = useMemo(() => entityList.map((e) => e.id), [entityList]);
  return useQuery({
    queryKey: ['allEntitiesMetrics', level, ids],
    queryFn: () => entities.getEntityMetricsRollup(level, ids),
    enabled: !!level && ids.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Mutation to apply partial updates to the distributor row (manager_name /
 * phone / email). Optimistically patches the cached entity so header chips
 * reflect the new value immediately; rolls back on error. RLS gates via
 * `distributors_update_self` — caller must hold the distributor JWT.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useUpdateDistributor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }) => entities.updateDistributor(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['entity', 'distributor', id] });
      const previous = queryClient.getQueryData(['entity', 'distributor', id]);
      queryClient.setQueryData(['entity', 'distributor', id], (old) =>
        old ? { ...old, ...updates } : old,
      );
      return { previous };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(['entity', 'distributor', id], ctx.previous);
      }
    },
    onSettled: (_data, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['entity', 'distributor', id] });
    },
  });
}

/**
 * Mutation to flip a branch between active and inactive. Optimistically
 * updates the cached entity so the status pill flips instantly; rolls back
 * on error.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useSetBranchStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => entities.setBranchStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['entity', 'branch', id] });
      const previous = queryClient.getQueryData(['entity', 'branch', id]);
      queryClient.setQueryData(['entity', 'branch', id], (old) =>
        old ? { ...old, status } : old,
      );
      return { previous };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(['entity', 'branch', id], ctx.previous);
      }
    },
    onSettled: (_data, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['entity', 'branch', id] });
      queryClient.invalidateQueries({ queryKey: ['entities', 'branch'] });
      queryClient.invalidateQueries({ queryKey: ['children'] });
    },
  });
}
