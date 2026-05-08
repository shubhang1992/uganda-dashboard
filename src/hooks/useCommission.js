// React Query hooks for commission data — components import these, never services directly.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as commissions from '../services/commissions';

/* ─── Cadence + rate ────────────────────────────────────────────────────── */

export function useNetworkCadence() {
  return useQuery({
    queryKey: ['networkCadence'],
    queryFn: commissions.getNetworkCadence,
  });
}

export function useSetNetworkCadence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.setNetworkCadence,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['networkCadence'] });
    },
  });
}

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

export function useDisputedAgentList() {
  return useQuery({
    queryKey: ['disputedAgents'],
    queryFn: commissions.getDisputedAgentList,
  });
}

export function useEntityCommissionSummary(level, entityId) {
  return useQuery({
    queryKey: ['entityCommissionSummary', level, entityId],
    queryFn: () => commissions.getEntityCommissionSummary(level, entityId),
    enabled: !!entityId || level === 'country',
  });
}

/* ─── Settlement runs ───────────────────────────────────────────────────── */

export function useCurrentRun() {
  return useQuery({
    queryKey: ['currentRun'],
    queryFn: commissions.getCurrentRun,
  });
}

export function useRun(runId) {
  return useQuery({
    queryKey: ['settlementRun', runId],
    queryFn: () => commissions.getRunById(runId),
    enabled: !!runId,
  });
}

export function useRunsList({ limit, branchId } = {}) {
  return useQuery({
    queryKey: ['settlementRunsList', branchId || 'all', limit ?? 'unlimited'],
    queryFn: () => commissions.listRuns({ limit, branchId }),
  });
}

export function useBranchRunReview(runId, branchId) {
  return useQuery({
    queryKey: ['runForBranch', runId, branchId],
    queryFn: () => commissions.getRunForBranch(runId, branchId),
    enabled: !!runId && !!branchId,
  });
}

export function useRunBranchBreakdown(runId) {
  return useQuery({
    queryKey: ['runBranchBreakdown', runId],
    queryFn: () => commissions.getRunBranchBreakdown(runId),
    enabled: !!runId,
  });
}

export function useRunBranchAgents(runId, branchId) {
  return useQuery({
    queryKey: ['runBranchAgents', runId, branchId],
    queryFn: () => commissions.getRunBranchAgents(runId, branchId),
    enabled: !!runId && !!branchId,
  });
}

/* ─── Mutations ──────────────────────────────────────────────────────────── */

const ALL_RUN_KEYS = [
  'currentRun', 'settlementRun', 'settlementRunsList', 'runForBranch',
  'runBranchBreakdown', 'runBranchAgents',
];
const ALL_COMMISSION_KEYS = [
  'commissionSummary', 'agentCommissions', 'agentCommissionDetail',
  'commissionSubscribers', 'disputedAgents', 'entityCommissionSummary',
];

function invalidateAll(queryClient) {
  [...ALL_RUN_KEYS, ...ALL_COMMISSION_KEYS].forEach((k) =>
    queryClient.invalidateQueries({ queryKey: [k] })
  );
}

export function useApproveDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commissionId, outcomeReason, resolvedBy }) =>
      commissions.approveDispute(commissionId, { outcomeReason, resolvedBy }),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useRejectDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commissionId, outcomeReason, resolvedBy }) =>
      commissions.rejectDispute(commissionId, { outcomeReason, resolvedBy }),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useBulkApproveDisputes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commissionIds, outcomeReason, resolvedBy }) =>
      commissions.bulkApproveDisputes(commissionIds, { outcomeReason, resolvedBy }),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useBulkRejectDisputes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commissionIds, outcomeReason, resolvedBy }) =>
      commissions.bulkRejectDisputes(commissionIds, { outcomeReason, resolvedBy }),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useWithdrawDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.withdrawDispute,
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useBranchDisputeLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commissionId, reason }) => commissions.branchDisputeLine(commissionId, reason),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useOpenRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.openRun,
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useCancelRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.cancelRun,
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useBranchApproveLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.branchApproveLine,
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useBranchHoldLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commissionId, reason }) => commissions.branchHoldLine(commissionId, reason),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useBranchApproveAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, branchId }) => commissions.branchApproveAll(runId, branchId),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useMarkBranchReviewed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, branchId }) => commissions.markBranchReviewed(runId, branchId),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useReleaseRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, txnRefByAgent }) => commissions.releaseRun(runId, { txnRefByAgent }),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useReleaseBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, branchId, txnRefByAgent }) =>
      commissions.releaseBranch(runId, branchId, { txnRefByAgent }),
    onSuccess: () => invalidateAll(queryClient),
  });
}

/* ─── Agent-side mutations ──────────────────────────────────────────────── */

export function useConfirmCommission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commissions.confirmCommission,
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useDisputeCommission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commissionId, reason }) => commissions.disputeCommission(commissionId, reason),
    onSuccess: () => invalidateAll(queryClient),
  });
}
