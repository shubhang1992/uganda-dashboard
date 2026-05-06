// React Query hooks for agent-scoped data — components import these,
// never the service directly.

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
 * Mutation: agent updates a subscriber's contribution schedule.
 * Wraps the same service mutation as `useUpdateSchedule` (subscriber-side) but
 * also invalidates the agent's portfolio query so the detail page reflects
 * the new schedule without a refresh.
 *
 * @param {string} subscriberId
 * @param {string} agentId
 */
export function useUpdateSubscriberSchedule(subscriberId, agentId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (schedule) => subscriberService.updateContributionSchedule(subscriberId, schedule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agentSubscribers', agentId] });
      queryClient.invalidateQueries({ queryKey: ['subscriberTransactions', subscriberId] });
    },
  });
}
