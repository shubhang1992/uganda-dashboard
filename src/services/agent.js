// Agent service — actions and reads scoped to a single agent's portfolio.
// When backend is ready, replace these with api.get / api.post calls.

import { SUBSCRIBERS } from '../data/mockData';

/**
 * @endpoint GET /api/agents/:agentId/subscribers
 * @param {string} agentId
 * @returns {Promise<Array<Object>>} Rich subscriber records scoped to the agent.
 * @description Returns full subscriber detail for everyone managed by the agent —
 *   used by the Subscribers page and home widgets.
 * @cache ['agentSubscribers', agentId]
 * @scope Agent (own portfolio only).
 */
export async function getAgentSubscriberList(agentId) {
  // Future: api.get(`/agents/${agentId}/subscribers`)
  return Object.values(SUBSCRIBERS)
    .filter((s) => s.parentId === agentId)
    .map((s) => {
      const last = s.contributionHistory?.[s.contributionHistory.length - 1] ?? 0;
      return {
        id: s.id,
        name: s.name,
        phone: s.phone,
        email: s.email,
        gender: s.gender,
        age: s.age,
        kycStatus: s.kycStatus,
        isActive: s.isActive,
        registeredDate: s.registeredDate,
        totalContributions: s.totalContributions,
        totalWithdrawals: s.totalWithdrawals,
        lastContribution: last,
        productsHeld: s.productsHeld,
        contributionSchedule: s.contributionSchedule,
        netBalance: s.netBalance,
      };
    });
}
