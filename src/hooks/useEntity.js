// React Query hooks for entity data — components import these, never mockData directly.
// When backend is ready, only the service layer changes. These hooks stay the same.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as entities from '../services/entities';
import * as searchService from '../services/search';

export function useCountry() {
  return useQuery({
    queryKey: ['country'],
    queryFn: entities.getCountry,
  });
}

export function useEntity(level, id) {
  return useQuery({
    queryKey: ['entity', level, id],
    queryFn: () => entities.getEntity(level, id),
    enabled: !!id && !!level && level !== 'country',
  });
}

export function useCurrentEntity(level, selectedIds) {
  const id = level === 'country' ? null : selectedIds[level];
  const countryQuery = useCountry();
  const entityQuery = useEntity(level, id);

  if (level === 'country') {
    return { data: countryQuery.data, isLoading: countryQuery.isLoading };
  }
  return { data: entityQuery.data, isLoading: entityQuery.isLoading };
}

export function useChildren(level, parentId) {
  return useQuery({
    queryKey: ['children', level, parentId],
    queryFn: () => entities.getChildren(level, parentId),
    enabled: !!parentId,
  });
}

export function useAllEntities(level) {
  return useQuery({
    queryKey: ['entities', level],
    queryFn: () => entities.getAllAtLevel(level),
    enabled: !!level,
  });
}

export function useTopBranch(level, parentId) {
  return useQuery({
    queryKey: ['topBranch', level, parentId],
    queryFn: () => entities.getTopPerformingBranch(level, parentId),
    enabled: !!level && !!parentId,
  });
}

export function useBreadcrumb(currentLevel, selectedIds) {
  return useQuery({
    queryKey: ['breadcrumb', currentLevel, selectedIds],
    queryFn: () => entities.getBreadcrumb(currentLevel, selectedIds),
    enabled: currentLevel !== 'country',
  });
}

export function useSearch(query) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => searchService.searchEntities(query),
    enabled: query.length >= 2,
  });
}

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
