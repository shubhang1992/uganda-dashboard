// React Query hooks for commission data — components import these, never services directly.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as commissions from '../services/commissions';

/* ─── Rate ──────────────────────────────────────────────────────────────── */

export function useCommissionRate() {
  return useQuery({
    queryKey: ['commissionRate'],
    queryFn: commissions.getCommissionRate,
  });
}

export function useSetCommissionRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.setCommissionRate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissionRate'] });
    },
  });
}

/* ─── Summaries + listings ─────────────────────────────────────────────── */

export function useCommissionSummary(branchId = null) {
  return useQuery({
    queryKey: ['commissionSummary', branchId || 'all'],
    queryFn: () => commissions.getCommissionSummary(branchId),
  });
}

export function useAgentCommissionList(statusFocus) {
  return useQuery({
    queryKey: ['agentCommissions', statusFocus || 'all'],
    queryFn: () => commissions.getAgentCommissionList(statusFocus),
  });
}

export function useAgentCommissionDetail(agentId) {
  return useQuery({
    queryKey: ['agentCommissionDetail', agentId],
    queryFn: () => commissions.getAgentCommissionDetail(agentId),
    enabled: !!agentId,
  });
}

export function useCommissionSubscribers(agentId, filter) {
  return useQuery({
    queryKey: ['commissionSubscribers', agentId, filter || 'all'],
    queryFn: () => commissions.getCommissionSubscribers(agentId, filter),
    enabled: !!agentId,
  });
}

export function useEntityCommissionSummary(level, entityId) {
  return useQuery({
    queryKey: ['entityCommissionSummary', level, entityId],
    queryFn: () => commissions.getEntityCommissionSummary(level, entityId),
    enabled: !!entityId || level === 'country',
  });
}

/* ─── Pending dues + settlements ────────────────────────────────────────── */

export function usePendingDuesByAgent() {
  return useQuery({
    queryKey: ['pendingDuesByAgent'],
    queryFn: commissions.getPendingDuesByAgent,
  });
}

export function usePendingDuesByBranch() {
  return useQuery({
    queryKey: ['pendingDuesByBranch'],
    queryFn: commissions.getPendingDuesByBranch,
  });
}

export function useSettlementsList({ limit, branchId, agentId } = {}) {
  return useQuery({
    queryKey: ['settlementsList', branchId || 'all', agentId || 'all', limit ?? 'unlimited'],
    queryFn: () => commissions.listSettlements({ limit, branchId, agentId }),
  });
}

/* ─── Mutations ──────────────────────────────────────────────────────────── */

const ALL_COMMISSION_KEYS = [
  'commissionSummary', 'agentCommissions', 'agentCommissionDetail',
  'commissionSubscribers', 'entityCommissionSummary',
  'pendingDuesByAgent', 'pendingDuesByBranch', 'settlementsList',
  // Phase 3 adds these notification query keys; settlement should invalidate
  // the feed so freshly-emitted notifications appear.
  'notifications', 'notificationsUnread',
];

function invalidateAll(queryClient) {
  ALL_COMMISSION_KEYS.forEach((k) =>
    queryClient.invalidateQueries({ queryKey: [k] })
  );
}

export function useApplySettlement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.applySettlementUpload,
    onSuccess: () => invalidateAll(queryClient),
  });
}
