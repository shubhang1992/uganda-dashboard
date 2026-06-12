// React Query hooks for agent-scoped data — components import these,
// never the service directly.
//
// Mutations follow the optimistic-update pattern (snapshot → patch → rollback
// on error → invalidate on settle). See `useUpdateSubscriberSchedule` for the
// template — particularly for mutations that touch a subscriber inside an
// array of subscribers.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as agent from '../services/agent';
import * as subscriberService from '../services/subscriber';

/**
 * Fetch the rich subscriber list owned by an agent.
 * @param {string|null|undefined} agentId
 */
export function useAgentSubscribers(agentId) {
  return useQuery({
    queryKey: ['agentSubscribers', agentId],
    queryFn: () => agent.getAgentSubscriberList(agentId),
    enabled: !!agentId,
  });
}

/**
 * Contributions logged across the agent's book within [from, to) — powers the
 * "Contributions this month" drill-down. `to` is exclusive.
 * @param {string|null|undefined} agentId
 * @param {{ from?: string, to?: string }} [range]
 */
export function useAgentContributions(agentId, { from, to } = {}) {
  return useQuery({
    queryKey: ['agentContributions', agentId, from, to],
    queryFn: () => agent.getAgentContributions(agentId, { from, to }),
    enabled: !!agentId && !!from,
  });
}

/**
 * Mutation: agent updates a subscriber's contribution schedule.
 * Wraps the same service mutation as `useUpdateSchedule` (subscriber-side) but
 * optimistically patches the agent's portfolio query (an array) so the detail
 * page reflects the new schedule without waiting for the backend.
 *
 * @param {string} subscriberId
 * @param {string} agentId
 */
export function useUpdateSubscriberSchedule(subscriberId, agentId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (schedule) => subscriberService.updateContributionSchedule(subscriberId, schedule),
    onMutate: async (schedule) => {
      const key = ['agentSubscribers', agentId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((s) =>
          s.id === subscriberId ? { ...s, contributionSchedule: schedule } : s,
        );
      });
      return { previous, key };
    },
    onError: (_err, _schedule, ctx) => {
      if (ctx?.previous !== undefined && ctx?.key) {
        queryClient.setQueryData(ctx.key, ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['agentSubscribers', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agentContributions', agentId] });
      queryClient.invalidateQueries({ queryKey: ['subscriberTransactions', subscriberId] });
    },
  });
}
