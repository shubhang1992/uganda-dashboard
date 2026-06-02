// React Query hooks for employer data — components import these, never
// `employerSeed` directly. Mirrors `src/hooks/useEntity.js`.
//
// Reads carry queryKey/enabled/staleTime. The config + insurance mutations
// follow the optimistic onMutate/onError/onSettled pattern (see
// useUpdateEmployeeContributionConfig). The contribution-run mutation is
// deliberately NON-optimistic — a run touches many rows and the server (RPC)
// re-derives every figure, so we let the server be the truth and only
// invalidate on success.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as employer from '../services/employer';

const READ_STALE_TIME = 5 * 60 * 1000;

/**
 * Fetch the employer profile.
 * @param {string} employerId
 * @returns {import('@tanstack/react-query').UseQueryResult<Object>}
 */
export function useEmployer(employerId) {
  return useQuery({
    queryKey: ['employer', employerId],
    queryFn: () => employer.getEmployer(employerId),
    enabled: !!employerId,
    staleTime: READ_STALE_TIME,
  });
}

/**
 * Fetch the employer's staff roster.
 * @param {string} employerId
 * @returns {import('@tanstack/react-query').UseQueryResult<Object[]>}
 */
export function useEmployees(employerId) {
  return useQuery({
    queryKey: ['employees', employerId],
    queryFn: () => employer.getEmployees(employerId),
    enabled: !!employerId,
    staleTime: READ_STALE_TIME,
  });
}

/**
 * Fetch a single employee by ID.
 * @param {string} employeeId
 * @returns {import('@tanstack/react-query').UseQueryResult<Object>}
 */
export function useEmployee(employeeId) {
  return useQuery({
    queryKey: ['employee', employeeId],
    queryFn: () => employer.getEmployee(employeeId),
    enabled: !!employeeId,
    staleTime: READ_STALE_TIME,
  });
}

/**
 * Fetch the employer's contribution-run history (newest-first).
 * @param {string} employerId
 * @returns {import('@tanstack/react-query').UseQueryResult<Object[]>}
 */
export function useContributionRuns(employerId) {
  return useQuery({
    queryKey: ['contributionRuns', employerId],
    queryFn: () => employer.getContributionRuns(employerId),
    enabled: !!employerId,
    staleTime: READ_STALE_TIME,
  });
}

/**
 * Fetch a single contribution run (header + per-employee lines).
 * @param {string} runId
 * @returns {import('@tanstack/react-query').UseQueryResult<{run:Object, lines:Object[]}>}
 */
export function useContributionRun(runId) {
  return useQuery({
    queryKey: ['contributionRun', runId],
    queryFn: () => employer.getContributionRun(runId),
    enabled: !!runId,
    staleTime: READ_STALE_TIME,
  });
}

/**
 * Fetch one employee's contribution history — their run-lines joined to the run
 * period/date, newest-first. Drives the transactions section of the employee
 * detail panel.
 * @param {string} employeeId
 * @returns {import('@tanstack/react-query').UseQueryResult<Object[]>}
 */
export function useEmployeeContributions(employeeId) {
  return useQuery({
    queryKey: ['employeeContributions', employeeId],
    queryFn: () => employer.getEmployeeContributions(employeeId),
    enabled: !!employeeId,
    staleTime: READ_STALE_TIME,
  });
}

/**
 * Aggregated metrics for the hero / overview (headcount, balances, YTD, mode
 * split). Threads `employerId` through the queryKey so it invalidates with the
 * roster even though the RPC reads scope from the JWT.
 * @param {string} employerId
 * @returns {import('@tanstack/react-query').UseQueryResult<Object>}
 */
export function useEmployerMetrics(employerId) {
  return useQuery({
    queryKey: ['employerMetrics', employerId],
    queryFn: () => employer.getEmployerMetrics(),
    enabled: !!employerId,
    staleTime: READ_STALE_TIME,
  });
}

/**
 * Mutation: patch the employer profile. Optimistically patches the cached
 * employer so settings/header chips reflect the change immediately; rolls back
 * on error.
 * @param {string} employerId
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useUpdateEmployerProfile(employerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch) => employer.updateEmployerProfile(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ['employer', employerId] });
      const previous = queryClient.getQueryData(['employer', employerId]);
      queryClient.setQueryData(['employer', employerId], (old) =>
        old ? { ...old, ...patch } : old,
      );
      return { previous };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(['employer', employerId], ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['employer', employerId] });
      queryClient.invalidateQueries({ queryKey: ['employerMetrics', employerId] });
    },
  });
}

/**
 * Mutation: replace an employee's contribution config. Optimistically patches
 * the cached employee so the detail panel reflects the change immediately;
 * rolls back on error.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useUpdateEmployeeContributionConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, config }) =>
      employer.updateEmployeeContributionConfig(employeeId, config),
    onMutate: async ({ employeeId, config }) => {
      await queryClient.cancelQueries({ queryKey: ['employee', employeeId] });
      const previous = queryClient.getQueryData(['employee', employeeId]);
      queryClient.setQueryData(['employee', employeeId], (old) =>
        old ? { ...old, contributionConfig: config } : old,
      );
      return { previous };
    },
    onError: (_err, { employeeId }, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(['employee', employeeId], ctx.previous);
      }
    },
    onSettled: (_data, _err, { employeeId }) => {
      queryClient.invalidateQueries({ queryKey: ['employee', employeeId] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employerMetrics'] });
    },
  });
}

/**
 * Mutation: set an employee's insurance cover + premium. Optimistically patches
 * the cached employee; rolls back on error.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useUpdateEmployeeInsurance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, cover, premium }) =>
      employer.updateEmployeeInsurance(employeeId, { cover, premium }),
    onMutate: async ({ employeeId, cover, premium }) => {
      await queryClient.cancelQueries({ queryKey: ['employee', employeeId] });
      const previous = queryClient.getQueryData(['employee', employeeId]);
      const status = Number(cover ?? 0) > 0 ? 'active' : 'inactive';
      queryClient.setQueryData(['employee', employeeId], (old) =>
        old
          ? {
              ...old,
              insuranceCover: Number(cover ?? 0),
              insurancePremiumMonthly: Number(premium ?? 0),
              insuranceStatus: status,
            }
          : old,
      );
      return { previous };
    },
    onError: (_err, { employeeId }, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(['employee', employeeId], ctx.previous);
      }
    },
    onSettled: (_data, _err, { employeeId }) => {
      queryClient.invalidateQueries({ queryKey: ['employee', employeeId] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employerMetrics'] });
    },
  });
}

/**
 * Mutation: submit a contribution run. NON-optimistic — the server re-derives
 * every figure and is the source of truth. On success, invalidates every read
 * the run could have moved: the roster, the drilled-in employee, the run
 * history, and the metrics.
 * @param {string} employerId
 * @returns {import('@tanstack/react-query').UseMutationResult}
 */
export function useRunContribution(employerId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rows, periodLabel, method, nonce }) =>
      employer.submitContributionRun(employerId, { rows, periodLabel, method, nonce }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees', employerId] });
      queryClient.invalidateQueries({ queryKey: ['employee'] });
      queryClient.invalidateQueries({ queryKey: ['employeeContributions'] });
      queryClient.invalidateQueries({ queryKey: ['contributionRuns', employerId] });
      queryClient.invalidateQueries({ queryKey: ['employerMetrics', employerId] });
    },
  });
}

/**
 * Invalidate every employer-scoped query. Convenience for cross-laptop demo
 * sync or a manual refresh button.
 * @param {import('@tanstack/react-query').QueryClient} queryClient
 */
export function invalidateAllEmployer(queryClient) {
  ['employer', 'employees', 'employee', 'employeeContributions', 'contributionRuns', 'contributionRun', 'employerMetrics']
    .forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
}
