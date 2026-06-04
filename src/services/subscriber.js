// Subscriber data service — Supabase-backed read/write for the Subscriber
// dashboard. All RLS reads use the user's JWT (injected by supabaseClient.js).
//
// Rollback: when `IS_SUPABASE_ENABLED === false`, every function falls back to
// the legacy in-memory mock-backed implementation that mutates frozen mockData
// through a per-session override Map. This lets us flip the platform back to
// mocks via `VITE_USE_SUPABASE=false` without redeploying.
//
// Field-name mapping (snake_case in DB → camelCase on the frontend):
//   subscribers.kyc_status            → kycStatus
//   subscribers.is_active             → isActive
//   subscribers.registered_date       → registeredDate
//   subscribers.contribution_history  → contributionHistory
//   subscribers.products_held         → productsHeld
//   subscribers.current_unit_value    → currentUnitValue
//   subscribers.unit_value_as_of      → unitValueAsOf
//   subscriber_balances.total_balance → netBalance
//   subscriber_balances.retirement_*  → retirementBalance
//   subscriber_balances.emergency_*   → emergencyBalance
//   subscriber_balances.units         → unitsHeld
// The mappers below preserve the legacy frontend shape so every existing
// caller (hooks, dashboard pages) keeps working.

import { supabase } from './supabaseClient';
import { IS_SUPABASE_ENABLED } from './api';
import { normalizeFrequency } from '../utils/finance';
import { derivePolicies } from '../utils/policies';
import { SUBSCRIBERS, AGENTS, BRANCHES, currentTime } from '../data/mockData';

// =============================================================================
// Legacy mock fallback (used when IS_SUPABASE_ENABLED === false)
// =============================================================================

/** In-memory mutation store (per session). Keyed by subscriber ID. */
const _sessionMutations = new Map();

function readSession(id) {
  if (!_sessionMutations.has(id)) {
    _sessionMutations.set(id, {
      extraTransactions: [],
      extraClaims: [],
      extraWithdrawals: [],
      scheduleOverride: null,
      nomineesOverride: null,
      insuranceOverride: null,
      profileOverride: null,
      // Per-policy renewal overrides (keyed by 'life' | 'health'). Each holds
      // { status, renewalDate, paidRef }; derivePolicies reads renewalDate to
      // flip a renewed policy back to active. Demo-only; resets on refresh.
      policyRenewals: {},
      balanceDelta: { retirement: 0, emergency: 0, total: 0 },
    });
  }
  return _sessionMutations.get(id);
}

function applyMutations(sub) {
  if (!sub) return sub;
  const m = readSession(sub.id);
  const mergedTx = [...m.extraTransactions, ...(sub.transactions || [])];
  mergedTx.sort((a, b) => b.date.localeCompare(a.date));
  return {
    ...sub,
    ...(m.profileOverride ?? null),
    contributionSchedule: m.scheduleOverride ?? sub.contributionSchedule,
    nominees: m.nomineesOverride ?? sub.nominees,
    insurance: m.insuranceOverride ?? sub.insurance,
    claims: [...m.extraClaims, ...(sub.claims || [])],
    withdrawals: [...m.extraWithdrawals, ...(sub.withdrawals || [])],
    transactions: mergedTx,
    netBalance: Math.max(0, (sub.netBalance || 0) + m.balanceDelta.total),
    retirementBalance: Math.max(0, (sub.retirementBalance || 0) + m.balanceDelta.retirement),
    emergencyBalance: Math.max(0, (sub.emergencyBalance || 0) + m.balanceDelta.emergency),
    unitsHeld: Math.max(0, sub.unitsHeld + (m.balanceDelta.total / (sub.currentUnitValue || 1))),
    totalContributions:
      (sub.totalContributions || 0) +
      m.extraTransactions
        .filter((t) => t.type === 'contribution')
        .reduce((s, t) => s + t.amount, 0),
  };
}

/**
 * Attach the derived `policies` array (life + synthesised health, with
 * active/expired computed from the demo clock and any session renewals) to a
 * subscriber. Runs for BOTH mock and Supabase reads so every consumer sees the
 * same shape. The pure derivation lives in utils/policies (which may not import
 * the demo clock); reading currentTime() here keeps that rule (§4.1) intact.
 */
function attachPolicies(sub) {
  if (!sub) return sub;
  const { policyRenewals } = readSession(sub.id);
  return {
    ...sub,
    policies: derivePolicies(sub, { now: currentTime(), renewalOverrides: policyRenewals }),
  };
}

/**
 * Set/clear the session life-renewal override so the derived life policy reads
 * as active (with a fresh year-long renewal) or reverts. Used by both
 * updateInsuranceCover (picking cover = activating) and renewPolicy. Works in
 * mock and Supabase modes because the session store is mode-independent.
 */
function setRenewalOverride(id, type, active) {
  const m = readSession(id);
  if (active) {
    m.policyRenewals = {
      ...m.policyRenewals,
      [type]: { status: 'active', renewalDate: renewalIsoFromNow(1) },
    };
  } else {
    const next = { ...m.policyRenewals };
    delete next[type];
    m.policyRenewals = next;
  }
  return m.policyRenewals[type];
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Format a Date as YYYY-MM-DD (local parts), matching mockData's date strings. */
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The demo clock + N years, as a YYYY-MM-DD string. */
function renewalIsoFromNow(years = 1) {
  const d = currentTime();
  d.setFullYear(d.getFullYear() + years);
  return isoDate(d);
}

// =============================================================================
// Supabase mappers
// =============================================================================

/**
 * Map a `subscribers` row + (optional) joined `subscriber_balances` /
 * `contribution_schedules` / `insurance_policies` rows into the camelCase
 * shape the frontend expects. Missing joined rows fall back to safe defaults
 * so consumers can always read `sub.netBalance ?? 0` etc.
 */
function mapSubscriberRow(row) {
  if (!row) return null;
  const bal = Array.isArray(row.subscriber_balances)
    ? row.subscriber_balances[0]
    : row.subscriber_balances;
  const sched = Array.isArray(row.contribution_schedules)
    ? row.contribution_schedules[0]
    : row.contribution_schedules;
  const ins = Array.isArray(row.insurance_policies)
    ? row.insurance_policies[0]
    : row.insurance_policies;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    gender: row.gender,
    age: row.age,
    dob: row.dob,
    nin: row.nin,
    occupation: row.occupation,
    parentId: row.agent_id,             // legacy field name kept for callers
    agentId: row.agent_id,
    districtId: row.district_id,
    kycStatus: row.kyc_status,
    isActive: row.is_active,
    registeredDate: row.registered_date,
    consentAt: row.consent_at,
    lastContributionDate: row.last_contribution_date,
    contributionHistory: row.contribution_history ?? [],
    productsHeld: row.products_held ?? [],
    currentUnitValue: row.current_unit_value,
    unitValueAsOf: row.unit_value_as_of,
    insuranceSameAsPension: row.insurance_same_as_pension,

    // Balance snapshot (from subscriber_balances)
    netBalance: Number(bal?.total_balance ?? 0),
    retirementBalance: Number(bal?.retirement_balance ?? 0),
    emergencyBalance: Number(bal?.emergency_balance ?? 0),
    unitsHeld: Number(bal?.units ?? 0),
    // Legacy callers still read totalContributions on subscriber summary —
    // pension total contributed is netBalance + total withdrawn, but the
    // dashboards approximate via lifetime trigger. With no separate denorm
    // column, expose total_balance as a conservative proxy. (Subscriber pages
    // that care about lifetime contributions should read the transactions
    // feed and aggregate themselves.)
    totalContributions: Number(bal?.total_balance ?? 0),
    totalWithdrawals: 0,

    // Schedule (from contribution_schedules)
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

    // Insurance (from insurance_policies); fall back to inactive 0/0 if missing
    insurance: ins
      ? {
          cover: Number(ins.cover ?? 0),
          premiumMonthly: Number(ins.premium_monthly ?? 0),
          policyStart: ins.policy_start,
          renewalDate: ins.renewal_date,
          status: ins.status ?? 'inactive',
        }
      : { cover: 0, premiumMonthly: 0, status: 'inactive' },
  };
}

function mapTransactionRow(row) {
  if (!row) return null;
  // Withdrawals are stored as positive magnitudes; the legacy mock shape
  // delivered them as negative numbers for display. Preserve that for the UI.
  const amount = row.type === 'withdrawal' ? -Math.abs(Number(row.amount)) : Number(row.amount);
  return {
    id: row.id,
    subscriberId: row.subscriber_id,
    agentId: row.agent_id,
    type: row.type,
    amount,
    date: row.date,
    status: row.status,
    method: row.method,
    reference: row.txn_ref,
    bucket: row.bucket,
    splitRetirement: row.split_retirement,
    splitEmergency: row.split_emergency,
  };
}

function mapClaimRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    subscriberId: row.subscriber_id,
    type: row.type,
    status: row.status,
    amount: Number(row.amount),
    incidentDate: row.incident_date,
    submittedDate: row.submitted_date,
    description: row.description,
  };
}

function mapWithdrawalRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    subscriberId: row.subscriber_id,
    amount: Number(row.amount),
    bucket: row.bucket,
    reason: row.reason,
    method: row.method,
    status: row.status,
    date: row.date,
    reference: row.reference,
  };
}

function mapNomineeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    subscriberId: row.subscriber_id,
    type: row.type,
    name: row.name,
    phone: row.phone,
    relationship: row.relationship,
    nin: row.nin,
    share: Number(row.share),
  };
}

function mapAgentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    employeeId: row.employee_id,
    parentId: row.branch_id,        // legacy field name kept for callers
    branchId: row.branch_id,
    branchName: row.branches?.name ?? '—',
    phone: row.phone,
    email: row.email,
    rating: Number(row.rating ?? 0),
    performance: row.performance,
    status: row.status,
    languages: row.languages ?? [],
    specialties: row.specialties ?? [],
    tenureMonths: row.tenure_months,
    joinedDate: row.joined_date,
  };
}

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// =============================================================================
// Reads
// =============================================================================

/**
 * Returns the current subscriber by phone. Joins `subscriber_balances`,
 * `contribution_schedules`, and `insurance_policies` so the dashboard gets a
 * single record with the legacy flat shape. RLS only exposes the caller's own
 * subscriber row, so the JWT-bearing client sees at most one match.
 *
 * Note: this JOIN approach was chosen over follow-up queries because (a) it's
 * a single round-trip, (b) all four tables are PK-joined by subscriber_id, so
 * the cost is minimal, and (c) the cached query in React Query can serve the
 * whole shape to every consumer without re-fetching.
 */
export async function getCurrentSubscriber(phone) {
  if (!IS_SUPABASE_ENABLED) {
    const list = Object.values(SUBSCRIBERS);
    if (!list.length) return null;
    if (phone) {
      const match = list.find((s) => s.phone?.endsWith(phone) || s.phone === phone);
      if (match) return attachPolicies(applyMutations(match));
    }
    const demo = list.find((s) =>
      typeof s.age === 'number' &&
      s.age >= 28 && s.age <= 42 &&
      s.contributionSchedule?.amount > 0
    );
    return attachPolicies(applyMutations(demo ?? list[0]));
  }

  // RLS (subscribers_select_self) already scopes to the JWT's subscriberId, so
  // the JWT-bearing client sees exactly one row — its own. Filtering by phone
  // on top is redundant AND fragile: if AuthContext.user.phone disagrees
  // byte-for-byte with the DB row's phone (e.g. legacy session stored a
  // pre-normalization value), the filter narrows the RLS-allowed row to zero
  // and the dashboard renders "No account found". The `phone` arg is kept in
  // the signature for the mock branch above.
  const { data, error } = await supabase
    .from('subscribers')
    .select('*, subscriber_balances(*), contribution_schedules(*), insurance_policies(*)')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return attachPolicies(mapSubscriberRow(data));
}

export async function getSubscriberTransactions(id, { type, range, status } = {}) {
  if (!IS_SUPABASE_ENABLED) {
    const sub = SUBSCRIBERS[id];
    if (!sub) return [];
    let tx = applyMutations(sub).transactions || [];
    if (type) tx = tx.filter((t) => t.type === type);
    if (status) tx = tx.filter((t) => t.status === status);
    if (range) {
      const [from, to] = range;
      tx = tx.filter((t) => t.date >= from && t.date <= to);
    }
    return tx;
  }

  if (!id) return [];
  // Narrowed from select('*') to exactly the columns mapTransactionRow reads
  // (the sole consumer of these rows). This is the highest-volume subscriber
  // list path, so trimming the over-fetch matters; keep this column set in sync
  // with mapTransactionRow if a new mapped field is added.
  let q = supabase
    .from('transactions')
    .select(
      'id, subscriber_id, agent_id, type, amount, date, status, method, txn_ref, bucket, split_retirement, split_emergency',
    )
    .eq('subscriber_id', id)
    .order('date', { ascending: false });
  if (type) q = q.eq('type', type);
  if (status) q = q.eq('status', status);
  if (range) {
    const [from, to] = range;
    if (from) q = q.gte('date', from);
    if (to) q = q.lte('date', to);
  }
  const rows = unwrap(await q);
  return (rows ?? []).map(mapTransactionRow);
}

export async function getSubscriberClaims(id) {
  if (!IS_SUPABASE_ENABLED) {
    const sub = SUBSCRIBERS[id];
    if (!sub) return [];
    return applyMutations(sub).claims || [];
  }
  if (!id) return [];
  const rows = unwrap(
    await supabase
      .from('claims')
      .select('*')
      .eq('subscriber_id', id)
      .order('submitted_date', { ascending: false }),
  );
  return (rows ?? []).map(mapClaimRow);
}

export async function getSubscriberWithdrawals(id) {
  if (!IS_SUPABASE_ENABLED) {
    const sub = SUBSCRIBERS[id];
    if (!sub) return [];
    return applyMutations(sub).withdrawals || [];
  }
  if (!id) return [];
  const rows = unwrap(
    await supabase
      .from('withdrawals')
      .select('*')
      .eq('subscriber_id', id)
      .order('date', { ascending: false }),
  );
  return (rows ?? []).map(mapWithdrawalRow);
}

/**
 * Returns nominees split by type — `{ pension: [...], insurance: [...] }` —
 * matching the legacy mock shape so callers don't have to filter inline.
 */
export async function getSubscriberNominees(id) {
  if (!IS_SUPABASE_ENABLED) {
    const sub = SUBSCRIBERS[id];
    if (!sub) return { pension: [], insurance: [] };
    return applyMutations(sub).nominees;
  }
  if (!id) return { pension: [], insurance: [] };
  const rows = unwrap(
    await supabase
      .from('nominees')
      .select('*')
      .eq('subscriber_id', id)
      .order('created_at', { ascending: true }),
  ) ?? [];
  const pension = [];
  const insurance = [];
  for (const r of rows) {
    const mapped = mapNomineeRow(r);
    if (r.type === 'insurance') insurance.push(mapped);
    else pension.push(mapped);
  }
  return { pension, insurance };
}

/**
 * Subscriber → assigned agent + branch name. The subscriber's RLS policy
 * allows reading their own agents row (the platform owner's read policy on
 * `agents` is keyed on `agents.id = subscribers.agent_id` for the caller's
 * subscriber); the branch join hops through `agents.branch_id → branches`.
 */
export async function getSubscriberAgent(subscriberId) {
  if (!IS_SUPABASE_ENABLED) {
    const sub = SUBSCRIBERS[subscriberId];
    if (!sub) return null;
    const agent = AGENTS[sub.parentId];
    if (!agent) return null;
    const branch = BRANCHES[agent.parentId];
    return {
      ...agent,
      branchName: branch?.name ?? '—',
    };
  }
  if (!subscriberId) return null;
  // Single-query embed: subscribers.agent_id → agents.id is a real FK
  // (0001_initial_schema.sql: `agent_id TEXT REFERENCES agents(id)`), so
  // PostgREST resolves agents as an embedded resource, and agents.branch_id →
  // branches gives the nested branch name. RLS is applied per embedded table
  // exactly as in the prior two-step (the subscriber's policies already allowed
  // reading their own agent + branch rows), so this collapses the round-trips
  // without changing what's visible. A plain (non-inner) embed is used so a
  // null/dangling agent_id still returns the subscriber row; the null-agent
  // guard below preserves the prior "no agent → null" behaviour.
  const row = unwrap(
    await supabase
      .from('subscribers')
      .select('agent_id, agents(*, branches(name))')
      .eq('id', subscriberId)
      .maybeSingle(),
  );
  if (!row?.agent_id) return null;
  // PostgREST returns the embedded agent as an object (or array for some
  // relationship shapes); normalise before mapping.
  const agent = Array.isArray(row.agents) ? row.agents[0] : row.agents;
  if (!agent) return null;
  return mapAgentRow(agent);
}

// =============================================================================
// Writes — Supabase triggers update subscriber_balances / commissions denorms
// =============================================================================

/**
 * Records an ad-hoc contribution. INSERTs into `transactions` with
 * type='contribution'; the AFTER INSERT trigger updates
 * `subscriber_balances` and (on first contribution) writes the commission
 * row. Returns the inserted transaction in the legacy mock shape.
 *
 * @param {string} id - subscriber ID
 * @param {{amount:number, retirementPct?:number, method?:string}} payload
 */
export async function makeAdHocContribution(id, { amount, retirementPct = 80, method = 'MTN Mobile Money' } = {}) {
  if (!IS_SUPABASE_ENABLED) {
    const sub = SUBSCRIBERS[id];
    if (!sub) throw new Error('Subscriber not found');
    const m = readSession(id);
    const retAmt = Math.round(amount * (retirementPct / 100));
    const emgAmt = amount - retAmt;
    const dateStr = todayIso();
    const tx = {
      id: `tx-${id}-adhoc-${Date.now()}`,
      type: 'contribution',
      amount,
      date: dateStr,
      status: 'settled',
      method,
      reference: `CT-${Math.floor(Math.random() * 900000) + 100000}`,
    };
    m.extraTransactions.unshift(tx);
    m.balanceDelta.retirement += retAmt;
    m.balanceDelta.emergency += emgAmt;
    m.balanceDelta.total += amount;
    return tx;
  }

  if (!id) throw new Error('Subscriber id required');
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('amount must be positive');
  }
  const ret = Math.round(amount * (retirementPct / 100));
  const emg = amount - ret;
  const ref = `CT-${Math.floor(Math.random() * 900000) + 100000}`;
  const txId = `tx-${id}-adhoc-${Date.now()}`;
  const row = unwrap(
    await supabase
      .from('transactions')
      .insert({
        id: txId,
        subscriber_id: id,
        type: 'contribution',
        amount,
        date: new Date().toISOString(),
        status: 'settled',
        method,
        txn_ref: ref,
        split_retirement: ret,
        split_emergency: emg,
      })
      .select()
      .single(),
  );
  return mapTransactionRow(row);
}

/**
 * Submits a withdrawal. The plan calls for both a `transactions` row (so the
 * balance trigger debits subscriber_balances) AND a `withdrawals` row (the
 * dedicated history table the WithdrawalsHistory report consumes). We write
 * BOTH because the legacy mock did so, and the dashboard pages still read
 * the `withdrawals` table for the reason/method/reference triple while the
 * `transactions` row carries the ledger entry that the balance trigger
 * watches. Returns the withdrawal record in the legacy mock shape.
 *
 * Bucket semantics: if `bucket` is provided we set the matching split half
 * to the full amount (the trigger will debit that bucket); else the trigger
 * falls back to "emergency-first, then retirement" via NULL split columns.
 */
export async function requestWithdrawal(
  id,
  { amount, bucket, reason, method = 'MTN Mobile Money', splitRetirement, splitEmergency } = {},
) {
  if (!IS_SUPABASE_ENABLED) {
    const sub = SUBSCRIBERS[id];
    if (!sub) throw new Error('Subscriber not found');
    const m = readSession(id);
    const dateStr = todayIso();
    const ref = `WD-${Math.floor(Math.random() * 900000) + 100000}`;
    const wd = {
      id: `wd-${id}-${Date.now()}`,
      amount,
      bucket,
      reason,
      method,
      status: 'processing',
      date: dateStr,
      reference: ref,
    };
    m.extraWithdrawals.unshift(wd);
    m.extraTransactions.unshift({
      id: `tx-${id}-wd-${Date.now()}`,
      type: 'withdrawal',
      amount: -amount,
      date: dateStr,
      status: 'processing',
      method,
      reference: ref,
      bucket,
    });
    if (bucket === 'retirement') {
      m.balanceDelta.retirement -= amount;
    } else {
      m.balanceDelta.emergency -= amount;
    }
    m.balanceDelta.total -= amount;
    return wd;
  }

  if (!id) throw new Error('Subscriber id required');
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('amount must be positive');
  }

  // Resolve splits — if the caller supplied explicit splitRetirement /
  // splitEmergency we honour them; if they supplied a bucket we route the
  // whole amount to that bucket; else NULL (trigger falls back).
  let sR = splitRetirement;
  let sE = splitEmergency;
  if (sR == null && sE == null && bucket) {
    if (bucket === 'retirement') { sR = amount; sE = 0; }
    else { sR = 0; sE = amount; }
  }

  const now = new Date();
  const isoDate = now.toISOString();
  const dateOnly = isoDate.slice(0, 10);
  const ref = `WD-${Math.floor(Math.random() * 900000) + 100000}`;
  const txId = `tx-${id}-wd-${Date.now()}`;
  const wdId = `wd-${id}-${Date.now()}`;

  // 1. transactions row → trigger debits subscriber_balances.
  unwrap(
    await supabase
      .from('transactions')
      .insert({
        id: txId,
        subscriber_id: id,
        type: 'withdrawal',
        amount,                   // magnitude — trigger uses ABS()
        date: isoDate,
        status: 'processing',
        method,
        txn_ref: ref,
        bucket,
        split_retirement: sR,
        split_emergency: sE,
      })
      .select()
      .single(),
  );

  // 2. withdrawals row → dashboard history.
  const wdRow = unwrap(
    await supabase
      .from('withdrawals')
      .insert({
        id: wdId,
        subscriber_id: id,
        amount,
        bucket: bucket ?? 'emergency',
        reason,
        method,
        status: 'processing',
        date: dateOnly,
        reference: ref,
      })
      .select()
      .single(),
  );

  return {
    id: wdRow.id,
    amount: Number(wdRow.amount),
    bucket: wdRow.bucket,
    reason: wdRow.reason,
    method: wdRow.method,
    status: wdRow.status,
    date: wdRow.date,
    reference: wdRow.reference,
  };
}

/** INSERTs a claim row. */
export async function submitClaim(id, payload = {}) {
  if (!IS_SUPABASE_ENABLED) {
    const sub = SUBSCRIBERS[id];
    if (!sub) throw new Error('Subscriber not found');
    const m = readSession(id);
    const dateStr = todayIso();
    const claim = {
      id: `clm-${id}-${Date.now()}`,
      status: 'submitted',
      submittedDate: dateStr,
      incidentDate: payload.incidentDate || dateStr,
      type: payload.type || 'medical',
      amount: payload.amount || 0,
      description: payload.description || '',
    };
    m.extraClaims.unshift(claim);
    return claim;
  }

  if (!id) throw new Error('Subscriber id required');
  const today = todayIso();
  const claimId = `clm-${id}-${Date.now()}`;
  const row = unwrap(
    await supabase
      .from('claims')
      .insert({
        id: claimId,
        subscriber_id: id,
        type: payload.type || 'medical',
        status: 'submitted',
        amount: Number(payload.amount ?? 0),
        incident_date: payload.incidentDate || today,
        submitted_date: today,
        description: payload.description ?? '',
      })
      .select()
      .single(),
  );
  return mapClaimRow(row);
}

/**
 * UPSERT into contribution_schedules. The frontend may send any subset of
 * `{frequency, amount, retirementPct, emergencyPct, includeInsurance,
 *  insuranceChoiceMade, nextDueDate}` — frequency is always normalised first.
 */
export async function updateContributionSchedule(id, schedule = {}) {
  if (!IS_SUPABASE_ENABLED) {
    const sub = SUBSCRIBERS[id];
    if (!sub) throw new Error('Subscriber not found');
    const m = readSession(id);
    m.scheduleOverride = {
      ...sub.contributionSchedule,
      ...schedule,
      frequency: normalizeFrequency(schedule.frequency ?? sub.contributionSchedule?.frequency),
    };
    return m.scheduleOverride;
  }

  if (!id) throw new Error('Subscriber id required');
  const patch = {};
  if (schedule.frequency !== undefined) {
    patch.frequency = normalizeFrequency(schedule.frequency);
  }
  if (schedule.amount !== undefined) patch.amount = Number(schedule.amount);
  if (schedule.retirementPct !== undefined) patch.retirement_pct = Number(schedule.retirementPct);
  if (schedule.emergencyPct !== undefined) patch.emergency_pct = Number(schedule.emergencyPct);
  if (schedule.includeInsurance !== undefined) patch.include_insurance = !!schedule.includeInsurance;
  if (schedule.insuranceChoiceMade !== undefined) patch.insurance_choice_made = !!schedule.insuranceChoiceMade;
  if (schedule.nextDueDate !== undefined) patch.next_due_date = schedule.nextDueDate;
  patch.updated_at = new Date().toISOString();

  const row = unwrap(
    await supabase
      .from('contribution_schedules')
      .update(patch)
      .eq('subscriber_id', id)
      .select()
      .single(),
  );
  return {
    frequency: normalizeFrequency(row.frequency),
    amount: Number(row.amount),
    retirementPct: Number(row.retirement_pct),
    emergencyPct: Number(row.emergency_pct),
    includeInsurance: !!row.include_insurance,
    insuranceChoiceMade: !!row.insurance_choice_made,
    nextDueDate: row.next_due_date,
  };
}

/**
 * Replaces the subscriber's nominees. Approach: DELETE everything for the
 * subscriber then INSERT the new rows. The nominees table's RLS policy lets
 * a subscriber DELETE/INSERT their own rows. Runs each step sequentially —
 * a failure on INSERT leaves the table empty (caller should handle).
 *
 * Payload: `{ pension: [...], insurance: [...] }`. Each nominee row needs
 * `name`, `relationship`, `share`, optionally `phone`, `nin`.
 */
export async function updateNominees(id, { pension, insurance } = {}) {
  if (!IS_SUPABASE_ENABLED) {
    const sub = SUBSCRIBERS[id];
    if (!sub) throw new Error('Subscriber not found');
    const m = readSession(id);
    m.nomineesOverride = {
      pension: pension ?? sub.nominees.pension,
      insurance: insurance ?? sub.nominees.insurance,
    };
    return m.nomineesOverride;
  }

  if (!id) throw new Error('Subscriber id required');

  // PR-5 fix (AUDIT-2-3 + AUDIT-4-6): route through SECURITY DEFINER RPC
  // that DELETE+INSERTs in one transaction AND enforces the sum-to-100
  // invariant per category. Previously this was a direct .delete + .insert
  // pair from the client, violating CLAUDE.md §5.6 ("don't write raw SQL from
  // the frontend — every database write goes through a SECURITY DEFINER RPC")
  // and silently allowing nominee shares to drift away from 100%.
  const result = unwrap(
    await supabase.rpc('upsert_nominees', {
      p_subscriber_id: id,
      p_pension: (pension ?? []).map((n) => ({
        id: n.id ?? null,
        name: n.name,
        phone: n.phone ?? null,
        relationship: n.relationship ?? null,
        nin: n.nin ?? null,
        share: Number(n.share ?? 0),
      })),
      p_insurance: (insurance ?? []).map((n) => ({
        id: n.id ?? null,
        name: n.name,
        phone: n.phone ?? null,
        relationship: n.relationship ?? null,
        nin: n.nin ?? null,
        share: Number(n.share ?? 0),
      })),
    }),
  );

  // RPC returns { pension: [...], insurance: [...] } already in the canonical
  // shape the UI consumes. Fall back to re-read if the result is unexpectedly
  // null (shouldn't happen — RPC always returns jsonb).
  if (result && typeof result === 'object' && ('pension' in result || 'insurance' in result)) {
    return result;
  }
  return getSubscriberNominees(id);
}

/**
 * UPSERT into insurance_policies. If no row exists (subscriber declined at
 * signup), INSERT a fresh one; otherwise UPDATE. Status derives from cover.
 */
export async function updateInsuranceCover(id, { cover, premiumMonthly } = {}) {
  const active = Number(cover ?? 0) > 0;
  if (!IS_SUPABASE_ENABLED) {
    const sub = SUBSCRIBERS[id];
    if (!sub) throw new Error('Subscriber not found');
    const m = readSession(id);
    m.insuranceOverride = {
      ...(m.insuranceOverride ?? sub.insurance),
      cover,
      premiumMonthly,
      status: active ? 'active' : 'inactive',
    };
    // Selecting cover (re)activates the life policy for a year — the policies
    // page derives active/expired from the renewal date, so push it forward.
    setRenewalOverride(id, 'life', active);
    return m.insuranceOverride;
  }

  if (!id) throw new Error('Subscriber id required');
  setRenewalOverride(id, 'life', active);
  const status = active ? 'active' : 'inactive';
  const row = unwrap(
    await supabase
      .from('insurance_policies')
      .upsert(
        {
          subscriber_id: id,
          cover: Number(cover ?? 0),
          premium_monthly: Number(premiumMonthly ?? 0),
          status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'subscriber_id' },
      )
      .select()
      .single(),
  );
  return {
    cover: Number(row.cover),
    premiumMonthly: Number(row.premium_monthly),
    policyStart: row.policy_start,
    renewalDate: row.renewal_date,
    status: row.status,
  };
}

/**
 * Renew a policy by recording a (demo) premium payment. Demo scope: there is no
 * real processor — paying flips the policy back to active for the session and
 * pushes its renewal date forward a year. The renewal is held as a session
 * override (health has no DB table, and even life renewal is demo-only), so it
 * behaves identically in mock and Supabase modes and resets on refresh.
 *
 * A 'premium'-type transaction is recorded for the activity / Insurance
 * Statement feed. 'premium' is excluded from balance math in applyMutations
 * (only 'contribution' rows count toward balances), so renewals never touch
 * savings balances.
 *
 * @param {string} id
 * @param {{ type: 'life'|'health', method?: string }} payload
 * @returns {Promise<{ policy: object, reference: string }>}
 */
export async function renewPolicy(id, { type, method = 'MTN Mobile Money' } = {}) {
  if (!id) throw new Error('Subscriber id required');
  if (type !== 'life' && type !== 'health') throw new Error('Unknown policy type');

  const reference = `RN-${Math.floor(Math.random() * 900000) + 100000}`;
  // Flip the policy active for a year (read back below to get the amount paid).
  setRenewalOverride(id, type, true);

  // Resolve the renewed policy so we can charge the exact renewal amount.
  let sub;
  if (!IS_SUPABASE_ENABLED) {
    const base = SUBSCRIBERS[id];
    if (!base) throw new Error('Subscriber not found');
    sub = attachPolicies(applyMutations(base));
  } else {
    sub = await getCurrentSubscriber();
  }
  const policy = sub?.policies?.find((p) => p.type === type);
  if (!policy) throw new Error('Policy not found');
  const amount = policy.renewalAmount;

  const tx = {
    id: `tx-${id}-rn-${Date.now()}`,
    type: 'premium',
    amount,
    date: todayIso(),
    status: 'settled',
    method,
    reference,
  };

  if (!IS_SUPABASE_ENABLED) {
    readSession(id).extraTransactions.unshift(tx);
  } else {
    // Supabase parity: record the premium in the transactions feed too. Direct
    // insert mirrors makeAdHocContribution; 'premium' is not counted as a
    // contribution by the balance trigger, so balances are unaffected. The
    // policy status/date renewal itself stays a session override (above), since
    // health has no table and we make no schema changes.
    try {
      await supabase.from('transactions').insert({
        id: tx.id,
        subscriber_id: id,
        type: 'premium',
        amount,
        date: new Date().toISOString(),
        status: 'settled',
        method,
        txn_ref: reference,
      });
    } catch {
      // Non-fatal in the demo — the policy still renews via the session override.
    }
  }

  return { policy, reference };
}

/**
 * Filters the patch to RLS-allowed columns (per 0006 trigger:
 *   name, email, phone, occupation, consent_at)
 * before UPDATEing. Anything else is silently dropped so the trigger never
 * needs to reject the write.
 */
export async function updateProfile(id, updates = {}) {
  if (!IS_SUPABASE_ENABLED) {
    const sub = SUBSCRIBERS[id];
    if (!sub) throw new Error('Subscriber not found');
    const m = readSession(id);
    m.profileOverride = { ...(m.profileOverride ?? {}), ...updates };
    return m.profileOverride;
  }

  if (!id) throw new Error('Subscriber id required');
  const patch = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.email !== undefined) patch.email = updates.email;
  if (updates.phone !== undefined) patch.phone = updates.phone;
  if (updates.occupation !== undefined) patch.occupation = updates.occupation;
  if (updates.consentAt !== undefined) patch.consent_at = updates.consentAt;
  if (Object.keys(patch).length === 0) {
    // Nothing to write — short-circuit to a fresh read so the caller still
    // gets a sensible object back.
    const fresh = unwrap(
      await supabase.from('subscribers').select('*').eq('id', id).maybeSingle(),
    );
    return mapSubscriberRow(fresh);
  }

  const row = unwrap(
    await supabase
      .from('subscribers')
      .update(patch)
      .eq('id', id)
      .select('*, subscriber_balances(*), contribution_schedules(*), insurance_policies(*)')
      .single(),
  );
  return mapSubscriberRow(row);
}

// =============================================================================
// Atomic-write RPCs
// =============================================================================

/**
 * Calls `create_subscriber_from_signup` — the SECURITY DEFINER RPC that
 * validates the payload, inserts the 5-table subscriber chain, and returns
 * the new subscriber ID. Used by the post-signup `/signup/contribution`
 * flow (Agent 13 wires the caller).
 *
 * @param {object} payload - SignupContext snapshot. See plan §"Signup → real
 *   subscriber persistence" for the exact field list.
 * @returns {Promise<{subscriberId: string}>}
 */
export async function createFromSignup(payload) {
  if (!IS_SUPABASE_ENABLED) {
    // Mock fallback: synthesise a fake subscriber ID so callers can pretend
    // the write succeeded. We don't actually insert anything into the mock.
    const id = `s-mock-${Date.now()}`;
    return { subscriberId: id };
  }
  const { data, error } = await supabase.rpc('create_subscriber_from_signup', { payload });
  if (error) throw error;
  return { subscriberId: data };
}

/**
 * Calls `create_subscriber_from_agent_onboard` — same shape as
 * `createFromSignup` but validates `calling_agent_id === auth.jwt() ->> 'agentId'`.
 *
 * @param {object} payload - SignupContext snapshot.
 * @param {string} agentId - The agent's authenticated agent_id.
 * @returns {Promise<{subscriberId: string}>}
 */
export async function createFromAgentOnboard(payload, agentId) {
  if (!IS_SUPABASE_ENABLED) {
    const id = `s-mock-${Date.now()}`;
    return { subscriberId: id };
  }
  const { data, error } = await supabase.rpc('create_subscriber_from_agent_onboard', {
    payload,
    calling_agent_id: agentId,
  });
  if (error) throw error;
  return { subscriberId: data };
}

// =============================================================================
// Cache invalidation hook (legacy export)
// =============================================================================

/**
 * @deprecated React Query caches are invalidated by the hooks in
 *   `src/hooks/useSubscriber.js` (`useInvalidateSubscriber`). This export is
 *   retained for API stability — it's now a no-op.
 */
export function invalidateSubscriber() {
  // Intentional no-op. React Query hooks in `src/hooks/useSubscriber.js`
  // (`useInvalidateSubscriber`) now drive every cache invalidation; this
  // export survives only so older callers don't break.
  return undefined;
}
