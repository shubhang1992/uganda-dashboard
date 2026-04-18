// React Query hooks for entity data — components import these, never mockData directly.
// When backend is ready, only the service layer changes. These hooks stay the same.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as entities from '../services/entities';
import * as searchService from '../services/search';

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
 * @param {string} currentLevel - Current hierarchy level
 * @param {Record<string, string>} selectedIds - Map of level to entity ID
 * @returns {import('@tanstack/react-query').UseQueryResult<Array<{level: string, name: string}>>}
 */
export function useBreadcrumb(currentLevel, selectedIds) {
  return useQuery({
    queryKey: ['breadcrumb', currentLevel, selectedIds],
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
