// React Query hooks for commission data — components import these, never services directly.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as commissions from '../services/commissions';

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

export function useDisputedAgentList() {
  return useQuery({
    queryKey: ['disputedAgents'],
    queryFn: commissions.getDisputedAgentList,
  });
}

export function useSettlementRequestList() {
  return useQuery({
    queryKey: ['settlementRequests'],
    queryFn: commissions.getSettlementRequestList,
  });
}

export function useEntityCommissionSummary(level, entityId) {
  return useQuery({
    queryKey: ['entityCommissionSummary', level, entityId],
    queryFn: () => commissions.getEntityCommissionSummary(level, entityId),
    enabled: !!entityId || level === 'country',
  });
}

const ALL_COMMISSION_KEYS = ['commissionSummary', 'agentCommissions', 'agentCommissionDetail', 'disputedAgents', 'settlementRequests', 'entityCommissionSummary'];

export function useApproveCommission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.approveCommission,
    onSuccess: () => {
      ALL_COMMISSION_KEYS.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    },
  });
}

export function useRejectCommission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.rejectCommission,
    onSuccess: () => {
      ALL_COMMISSION_KEYS.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    },
  });
}

export function useBulkApproveCommissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.bulkApproveCommissions,
    onSuccess: () => {
      ALL_COMMISSION_KEYS.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    },
  });
}

export function useBulkRejectCommissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.bulkRejectCommissions,
    onSuccess: () => {
      ALL_COMMISSION_KEYS.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    },
  });
}

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
