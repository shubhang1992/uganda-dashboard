// React Query hooks for the Subscriber dashboard.
// Components consume these; never import from mockData directly.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import * as subscriberService from '../services/subscriber';

/** Current subscriber derived from the authenticated phone. Falls back to
 *  the first mock record if no exact match (prototype only). */
export function useCurrentSubscriber() {
  const { user } = useAuth();
  const phone = user?.phone;
  return useQuery({
    queryKey: ['currentSubscriber', phone],
    queryFn: () => subscriberService.getCurrentSubscriber(phone),
  });
}

export function useSubscriberTransactions(id, filters) {
  return useQuery({
    queryKey: ['subscriberTransactions', id, filters],
    queryFn: () => subscriberService.getSubscriberTransactions(id, filters),
    enabled: !!id,
  });
}

export function useSubscriberClaims(id) {
  return useQuery({
    queryKey: ['subscriberClaims', id],
    queryFn: () => subscriberService.getSubscriberClaims(id),
    enabled: !!id,
  });
}

export function useSubscriberNominees(id) {
  return useQuery({
    queryKey: ['subscriberNominees', id],
    queryFn: () => subscriberService.getSubscriberNominees(id),
    enabled: !!id,
  });
}

function useInvalidateSubscriber(id) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['currentSubscriber'] });
    qc.invalidateQueries({ queryKey: ['subscriberTransactions', id] });
    qc.invalidateQueries({ queryKey: ['subscriberClaims', id] });
    qc.invalidateQueries({ queryKey: ['subscriberNominees', id] });
  };
}

export function useMakeContribution(id) {
  const invalidate = useInvalidateSubscriber(id);
  return useMutation({
    mutationFn: (payload) => subscriberService.makeAdHocContribution(id, payload),
    onSuccess: invalidate,
  });
}

export function useRequestWithdrawal(id) {
  const invalidate = useInvalidateSubscriber(id);
  return useMutation({
    mutationFn: (payload) => subscriberService.requestWithdrawal(id, payload),
    onSuccess: invalidate,
  });
}

export function useUpdateSchedule(id) {
  const invalidate = useInvalidateSubscriber(id);
  return useMutation({
    mutationFn: (schedule) => subscriberService.updateContributionSchedule(id, schedule),
    onSuccess: invalidate,
  });
}

export function useUpdateNominees(id) {
  const invalidate = useInvalidateSubscriber(id);
  return useMutation({
    mutationFn: (payload) => subscriberService.updateNominees(id, payload),
    onSuccess: invalidate,
  });
}

export function useSubmitClaim(id) {
  const invalidate = useInvalidateSubscriber(id);
  return useMutation({
    mutationFn: (payload) => subscriberService.submitClaim(id, payload),
    onSuccess: invalidate,
  });
}

export function useUpdateInsuranceCover(id) {
  const invalidate = useInvalidateSubscriber(id);
  return useMutation({
    mutationFn: (payload) => subscriberService.updateInsuranceCover(id, payload),
    onSuccess: invalidate,
  });
}
