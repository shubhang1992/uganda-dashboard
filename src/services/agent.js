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
  const ins = Array.isArray(s.insurance_policies) ? s.insurance_policies[0] : s.insurance_policies;

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
    lastContributionDate: s.last_contribution_date ?? null,
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
    // Life-cover policy, for the agent Home insurance card. RLS-filtered embed →
    // null when the agent can't read the row; HomeDesktop treats null as uninsured.
    insurance: ins
      ? {
          cover: Number(ins.cover) || 0,
          premiumMonthly: Number(ins.premium_monthly) || 0,
          status: ins.status || 'inactive',
        }
      : null,
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
          // Mock has no scalar last-contribution date — derive it from the most
          // recent settled contribution txn (transactions are sorted newest-first).
          lastContributionDate:
            s.transactions?.find((t) => t.type === 'contribution')?.date ?? null,
          totalContributions: s.totalContributions,
          totalWithdrawals: s.totalWithdrawals,
          lastContribution: last,
          productsHeld: s.productsHeld,
          contributionSchedule: s.contributionSchedule,
          netBalance: s.netBalance,
          insurance: s.insurance
            ? {
                cover: Number(s.insurance.cover) || 0,
                premiumMonthly: Number(s.insurance.premiumMonthly) || 0,
                status: s.insurance.status || 'inactive',
              }
            : null,
        };
      });
  }

  if (!agentId) return [];
  // Explicit columns only — `mapAgentSubscriberRow` is the sole consumer of this
  // row, so we fetch exactly the scalar columns + embed fields it reads (no `*`).
  // Dropped from the old wide pull: subscribers.{dob, nin, occupation, agent_id,
  // district_id, is_demo_signup, insurance_same_as_pension, consent_at,
  // current_unit_value, unit_value_as_of, created_at} and subscriber_balances.units
  // — none are referenced by the mapper or any list-page consumer.
  const { data, error } = await supabase
    .from('subscribers')
    .select(
      'id, name, phone, email, gender, age, kyc_status, is_active, ' +
        'registered_date, last_contribution_date, products_held, contribution_history, ' +
        'contribution_schedules(frequency, amount, retirement_pct, emergency_pct, ' +
        'include_insurance, insurance_choice_made, next_due_date), ' +
        'subscriber_balances(total_balance, retirement_balance, emergency_balance), ' +
        'insurance_policies(cover, premium_monthly, status)',
    )
    .eq('agent_id', agentId);
  if (error) throw error;
  return (data ?? []).map(mapAgentSubscriberRow);
}

/**
 * Individual contribution transactions across the agent's whole book within a
 * date window. Powers the "Contributions this month" Home drill-down. Mirrors
 * subscriber.js `getSubscriberTransactions` but scoped by `agent_id` + the
 * `contribution` type, and joins the subscriber name for display.
 *
 * @param {string} agentId
 * @param {{ from?: string, to?: string }} [range] - ISO date bounds; `to` is
 *   EXCLUSIVE (pass the first day of next month so timestamps on the last day
 *   of the window aren't dropped).
 * @returns {Promise<Array<{id, subscriberId, subscriberName, amount, date, method}>>}
 */
export async function getAgentContributions(agentId, { from, to } = {}) {
  if (!IS_SUPABASE_ENABLED) {
    const out = [];
    for (const s of Object.values(SUBSCRIBERS)) {
      if (s.parentId !== agentId) continue;
      for (const t of s.transactions || []) {
        if (t.type !== 'contribution') continue;
        if (from && t.date < from) continue;
        if (to && t.date >= to) continue;
        out.push({
          id: t.id,
          subscriberId: s.id,
          subscriberName: s.name,
          amount: Number(t.amount) || 0,
          date: t.date,
          method: t.method || null,
        });
      }
    }
    return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  if (!agentId) return [];
  let q = supabase
    .from('transactions')
    .select('id, amount, date, method, subscriber_id, subscribers(name)')
    .eq('agent_id', agentId)
    .eq('type', 'contribution')
    .order('date', { ascending: false });
  if (from) q = q.gte('date', from);
  if (to) q = q.lt('date', to);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    subscriberId: row.subscriber_id,
    subscriberName: row.subscribers?.name ?? '—',
    amount: Number(row.amount) || 0,
    date: row.date,
    method: row.method ?? null,
  }));
}
