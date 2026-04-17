// React Query hooks for commission data — components import these, never services directly.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as commissions from '../services/commissions';

/**
 * Fetch the current commission rate configuration.
 * @returns {import('@tanstack/react-query').UseQueryResult<{rate: number, currency: string}>}
 */
export function useCommissionRate() {
  return useQuery({
    queryKey: ['commissionRate'],
    queryFn: commissions.getCommissionRate,
  });
}

/**
 * Mutation to update the commission rate.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useSetCommissionRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.setCommissionRate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissionRate'] });
    },
  });
}

/**
 * Fetch commission summary, optionally filtered by branch.
 * @param {string|null} [branchId=null] - Branch ID filter or null for all
 * @returns {import('@tanstack/react-query').UseQueryResult<Object>}
 */
export function useCommissionSummary(branchId = null) {
  return useQuery({
    queryKey: ['commissionSummary', branchId || 'all'],
    queryFn: () => commissions.getCommissionSummary(branchId),
  });
}

/**
 * Fetch list of agents with commission data, optionally filtered by status.
 * @param {string} [statusFocus] - Filter by commission status ('paid'|'due'|'disputed')
 * @returns {import('@tanstack/react-query').UseQueryResult<Object[]>}
 */
export function useAgentCommissionList(statusFocus) {
  return useQuery({
    queryKey: ['agentCommissions', statusFocus || 'all'],
    queryFn: () => commissions.getAgentCommissionList(statusFocus),
  });
}

/**
 * Fetch detailed commission data for a specific agent.
 * @param {string} agentId - Agent entity ID
 * @returns {import('@tanstack/react-query').UseQueryResult<Object>}
 */
export function useAgentCommissionDetail(agentId) {
  return useQuery({
    queryKey: ['agentCommissionDetail', agentId],
    queryFn: () => commissions.getAgentCommissionDetail(agentId),
    enabled: !!agentId,
  });
}

/**
 * Fetch subscribers with commission records for a specific agent.
 * @param {string} agentId - Agent entity ID
 * @param {string} [filter] - Status filter
 * @returns {import('@tanstack/react-query').UseQueryResult<Object[]>}
 */
export function useCommissionSubscribers(agentId, filter) {
  return useQuery({
    queryKey: ['commissionSubscribers', agentId, filter || 'all'],
    queryFn: () => commissions.getCommissionSubscribers(agentId, filter),
    enabled: !!agentId,
  });
}

/**
 * Fetch list of agents with disputed commissions.
 * @returns {import('@tanstack/react-query').UseQueryResult<Object[]>}
 */
export function useDisputedAgentList() {
  return useQuery({
    queryKey: ['disputedAgents'],
    queryFn: commissions.getDisputedAgentList,
  });
}

/**
 * Fetch list of pending settlement requests.
 * @returns {import('@tanstack/react-query').UseQueryResult<Object[]>}
 */
export function useSettlementRequestList() {
  return useQuery({
    queryKey: ['settlementRequests'],
    queryFn: commissions.getSettlementRequestList,
  });
}

/**
 * Fetch aggregated commission summary for any hierarchy level entity.
 * @param {string} level - Hierarchy level
 * @param {string} entityId - Entity ID (or 'ug' for country)
 * @returns {import('@tanstack/react-query').UseQueryResult<{totalPaid: number, totalDue: number, totalDisputed: number, countPaid: number, countDue: number, countDisputed: number, total: number, countTotal: number, settlementRate: number}>}
 */
export function useEntityCommissionSummary(level, entityId) {
  return useQuery({
    queryKey: ['entityCommissionSummary', level, entityId],
    queryFn: () => commissions.getEntityCommissionSummary(level, entityId),
    enabled: !!entityId || level === 'country',
  });
}

const ALL_COMMISSION_KEYS = ['commissionSummary', 'agentCommissions', 'agentCommissionDetail', 'disputedAgents', 'settlementRequests', 'entityCommissionSummary'];

/**
 * Mutation to approve a single commission. Invalidates all commission caches.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useApproveCommission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.approveCommission,
    onSuccess: () => {
      ALL_COMMISSION_KEYS.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    },
  });
}

/**
 * Mutation to reject a single commission.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useRejectCommission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.rejectCommission,
    onSuccess: () => {
      ALL_COMMISSION_KEYS.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    },
  });
}

/**
 * Mutation to bulk-approve multiple commissions.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useBulkApproveCommissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.bulkApproveCommissions,
    onSuccess: () => {
      ALL_COMMISSION_KEYS.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    },
  });
}

/**
 * Mutation to bulk-reject multiple commissions.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useBulkRejectCommissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.bulkRejectCommissions,
    onSuccess: () => {
      ALL_COMMISSION_KEYS.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    },
  });
}

/**
 * Mutation to settle commissions (mark as paid).
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useSettleCommissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.settleCommissions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissionSummary'] });
      queryClient.invalidateQueries({ queryKey: ['agentCommissions'] });
      queryClient.invalidateQueries({ queryKey: ['agentCommissionDetail'] });
    },
  });
}

/**
 * Mutation to settle all commissions for a specific agent.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useSettleAgentCommissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.settleAgentCommissions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissionSummary'] });
      queryClient.invalidateQueries({ queryKey: ['agentCommissions'] });
      queryClient.invalidateQueries({ queryKey: ['agentCommissionDetail'] });
    },
  });
}

/**
 * Mutation to settle all outstanding commissions platform-wide.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useSettleAllCommissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.settleAllCommissions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissionSummary'] });
      queryClient.invalidateQueries({ queryKey: ['agentCommissions'] });
      queryClient.invalidateQueries({ queryKey: ['agentCommissionDetail'] });
    },
  });
}
