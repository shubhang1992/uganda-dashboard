// Agent service — actions and reads scoped to a single agent's portfolio.
//
// Routes go direct to Supabase with the agent's JWT — RLS scopes the
// `subscribers` SELECT to rows where `subscribers.agent_id = auth.jwt()
// ->> 'agentId'`. The fallback path (`!IS_SUPABASE_ENABLED`) still uses the
// frozen mockData for parity with the legacy demo build.

import { supabase } from './supabaseClient';
import { IS_SUPABASE_ENABLED } from './api';
import { normalizeFrequency } from '../utils/finance';
import { SUBSCRIBERS } from '../data/mockData';

/**
 * Map a joined subscriber+balance+schedule row from supabase-js into the flat
 * shape the agent dashboard expects. Callers like SubscribersPage and
 * SubscriberDetailPage read fields such as `netBalance`, `totalContributions`,
 * `contributionSchedule`, `productsHeld`, `isActive`, `registeredDate`, etc.
 *
 * Note: `totalContributions` here is approximated by `subscriber_balances.
 * total_balance` because there's no per-subscriber lifetime denorm column.
 * SubscriberDetailPage already falls back to (totalContributions - totalWithdrawals)
 * for the net balance display, so this is consistent. `totalWithdrawals` is 0
 * for now — the AgentDashboard's analytics will overcount slightly if the
 * subscriber has many withdrawals. A future migration could add a denorm.
 */
function mapAgentSubscriberRow(s) {
  const sched = Array.isArray(s.contribution_schedules)
    ? s.contribution_schedules[0]
    : s.contribution_schedules;
  const bal = Array.isArray(s.subscriber_balances)
    ? s.subscriber_balances[0]
    : s.subscriber_balances;
  const history = Array.isArray(s.contribution_history) ? s.contribution_history : [];

  return {
    id: s.id,
    name: s.name,
    phone: s.phone,
    email: s.email,
    gender: s.gender,
    age: s.age,
    kycStatus: s.kyc_status,
    isActive: !!s.is_active,
    registeredDate: s.registered_date,
    productsHeld: s.products_held ?? [],
    contributionHistory: history,
    lastContribution: history.length > 0 ? Number(history[history.length - 1] ?? 0) : 0,
    contributionSchedule: sched
      ? {
          frequency: normalizeFrequency(sched.frequency),
          amount: Number(sched.amount),
          retirementPct: Number(sched.retirement_pct ?? 80),
          emergencyPct: Number(sched.emergency_pct ?? 20),
          includeInsurance: !!sched.include_insurance,
          insuranceChoiceMade: !!sched.insurance_choice_made,
          nextDueDate: sched.next_due_date,
        }
      : null,
    netBalance: Number(bal?.total_balance ?? 0),
    retirementBalance: Number(bal?.retirement_balance ?? 0),
    emergencyBalance: Number(bal?.emergency_balance ?? 0),
    // No per-subscriber lifetime denorm — proxy from balance. See note above.
    totalContributions: Number(bal?.total_balance ?? 0),
    totalWithdrawals: 0,
  };
}

/**
 * @endpoint GET /api/agents/:agentId/subscribers
 * @param {string} agentId
 * @returns {Promise<Array<Object>>} Rich subscriber records scoped to the agent.
 * @description Returns full subscriber detail for everyone managed by the agent —
 *   used by the Subscribers page and home widgets. Joins
 *   `contribution_schedules` and `subscriber_balances` so the flat shape the
 *   dashboards need is delivered in a single round-trip.
 * @cache ['agentSubscribers', agentId]
 * @scope Agent (own portfolio only — RLS-enforced).
 */
export async function getAgentSubscriberList(agentId) {
  if (!IS_SUPABASE_ENABLED) {
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

  if (!agentId) return [];
  const { data, error } = await supabase
    .from('subscribers')
    .select('*, contribution_schedules(*), subscriber_balances(*)')
    .eq('agent_id', agentId);
  if (error) throw error;
  return (data ?? []).map(mapAgentSubscriberRow);
}
