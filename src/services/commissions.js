// Commission service — Supabase-backed with mock fallback under VITE_USE_SUPABASE=false.
//
// State-machine mutations ALWAYS go through `supabase.rpc(<sql_name>, { p_arg })`.
// Direct SELECTs are used for simple list/lookup reads; aggregate reads delegate
// to the read RPCs in 0002_rpc_functions.sql. RLS allows only SELECT on the
// commission/run/review tables — every commission mutation lives in an RPC
// (0004_commission_run_rpcs.sql).
//
// Hook contracts in src/hooks/useCommission.js are preserved verbatim, so the
// React Query layer and every component remains untouched.
//
// Rollback strategy (plan §"Rollback strategy"): when IS_SUPABASE_ENABLED is
// false the file falls back to the original mockData-backed implementation.
// The legacy code lives below the Supabase wrappers as `_legacy_mock_*`.

import { supabase } from './supabaseClient';
import { IS_SUPABASE_ENABLED } from './api';
import {
  COMMISSIONS, COMMISSION_CONFIG,
  commissionsByAgent, commissionsByBranch, commissionsByRun,
  AGENTS, BRANCHES, DISTRICTS, SUBSCRIBERS,
  SETTLEMENT_RUNS, runsByBranch,
  MOCK_NOW,
} from '../data/mockData';
import { nextCycleEnd } from '../utils/settlementCycle';

/* ─── Shared helpers ─────────────────────────────────────────────────────── */

const VALID_CADENCES = new Set(['weekly-friday', 'biweekly-friday', 'monthly-first']);

const STATUSES_PAID = new Set(['released', 'confirmed']);
const STATUSES_OUTSTANDING = new Set(['due', 'in_run', 'held']);
const isPaid = (c) => STATUSES_PAID.has(c.status);
const isOutstanding = (c) => STATUSES_OUTSTANDING.has(c.status);

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _rpcError(err, fnName) {
  const message = err?.message || `RPC ${fnName} failed`;
  const wrapped = new Error(message);
  wrapped.code = err?.code || 'rpc_error';
  wrapped.details = err?.details;
  wrapped.hint = err?.hint;
  return wrapped;
}

/** Map a snake_case DB commission row to the camelCase shape the UI expects. */
function _rowToCommission(row) {
  if (!row) return row;
  return {
    id: row.id,
    agentId: row.agent_id,
    branchId: row.branch_id,
    subscriberId: row.subscriber_id,
    subscriberName: row.subscriber_name,
    amount: Number(row.amount),
    status: row.status,
    firstContributionDate: row.first_contribution_date,
    dueDate: row.due_date,
    paidDate: row.paid_date,
    runId: row.run_id,
    txnRef: row.txn_ref,
    agentConfirmed: row.agent_confirmed,
    previousStatus: row.previous_status,
    disputeReason: row.dispute_reason,
    disputedAt: row.disputed_at,
    disputedBy: row.disputed_by,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    outcomeReason: row.outcome_reason,
    holdReason: row.hold_reason,
  };
}

/** Map a snake_case settlement_runs row + reviews to the camelCase run object. */
function _rowToRun(row, reviewRows = []) {
  if (!row) return null;
  const branchReviews = {};
  for (const r of reviewRows) {
    branchReviews[r.branch_id] = {
      state: r.state,
      reviewedBy: r.reviewed_by ?? null,
      reviewedAt: r.reviewed_at ?? null,
      releasedAt: r.released_at ?? null,
    };
  }
  return {
    id: row.id,
    cadence: row.cadence,
    openedAt: row.opened_at,
    closesAt: row.closes_at,
    state: row.state,
    totalAmount: Number(row.total_amount ?? 0),
    commissionCount: row.commission_count ?? 0,
    branchReviews,
    releasedAt: row.released_at,
    releasedBy: row.released_by,
    notes: row.notes ?? '',
  };
}

/**
 * Derive UI summary fields on top of a run object (matches the shape the
 * legacy JS exposed via _runWithDerivedFields). `lines` is the full set of
 * commission rows attached to the run (already mapped to camelCase).
 */
function _enrichRun(run, lines = []) {
  if (!run) return null;
  const reviews = Object.values(run.branchReviews || {});
  const approvedCount = reviews.filter((r) => r.state === 'approved').length;
  const pendingCount = reviews.filter((r) => r.state === 'pending').length;
  const releasedCount = reviews.filter((r) => r.state === 'released').length;

  const approvedBranchIds = new Set(
    Object.entries(run.branchReviews || {})
      .filter(([, r]) => r.state === 'approved')
      .map(([bid]) => bid)
  );
  const distinctAgents = new Set();
  let approvedAmount = 0;
  for (const c of lines) {
    if (c.agentId) distinctAgents.add(c.agentId);
    if (c.status === 'in_run' && approvedBranchIds.has(c.branchId)) {
      approvedAmount += c.amount;
    }
  }

  return {
    ...run,
    branchCount: reviews.length,
    branchApprovedCount: approvedCount,
    branchPendingCount: pendingCount,
    branchReleasedCount: releasedCount,
    agentCount: distinctAgents.size,
    approvedAmount,
    canReleaseAny: run.state === 'branch_review' && approvedCount > 0,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * NETWORK CADENCE + COMMISSION RATE
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @endpoint GET commission_config (table)
 * @returns {Promise<{cadence: string, nextRunDate: string}>}
 * @cache ['networkCadence']
 */
export async function getNetworkCadence() {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getNetworkCadence();
  const { data, error } = await supabase
    .from('commission_config')
    .select('cadence, next_run_date')
    .eq('id', 'default')
    .maybeSingle();
  if (error) throw _rpcError(error, 'getNetworkCadence');
  return {
    cadence: data?.cadence ?? 'monthly-first',
    nextRunDate: data?.next_run_date ?? null,
  };
}

/**
 * @endpoint PUT commission_config (table)
 * @scope Distributor only — RLS allows distributor UPDATE on commission_config.
 */
export async function setNetworkCadence(cadence) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_setNetworkCadence(cadence);
  if (!VALID_CADENCES.has(cadence)) {
    throw new Error(`Invalid cadence: ${cadence}`);
  }
  const nextRunDate = fmtDate(nextCycleEnd(cadence, new Date()));
  const { data, error } = await supabase
    .from('commission_config')
    .update({ cadence, next_run_date: nextRunDate, updated_at: new Date().toISOString() })
    .eq('id', 'default')
    .select('cadence, next_run_date')
    .maybeSingle();
  if (error) throw _rpcError(error, 'setNetworkCadence');
  return {
    cadence: data?.cadence ?? cadence,
    nextRunDate: data?.next_run_date ?? nextRunDate,
  };
}

/**
 * @endpoint GET commission_config.rate
 * @cache ['commissionRate']
 */
export async function getCommissionRate() {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getCommissionRate();
  const { data, error } = await supabase
    .from('commission_config')
    .select('rate')
    .eq('id', 'default')
    .maybeSingle();
  if (error) throw _rpcError(error, 'getCommissionRate');
  return data?.rate != null ? Number(data.rate) : 0;
}

/**
 * @endpoint PUT commission_config.rate
 * @scope Distributor only.
 */
export async function setCommissionRate(amount) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_setCommissionRate(amount);
  const { data, error } = await supabase
    .from('commission_config')
    .update({ rate: amount, updated_at: new Date().toISOString() })
    .eq('id', 'default')
    .select('rate')
    .maybeSingle();
  if (error) throw _rpcError(error, 'setCommissionRate');
  return data?.rate != null ? Number(data.rate) : amount;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SUMMARIES
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @endpoint RPC get_commission_summary(p_branch_id)
 * @scope Distributor: any. Branch: own branch (RLS-enforced).
 */
export async function getCommissionSummary(branchId = null) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getCommissionSummary(branchId);
  const { data, error } = await supabase.rpc('get_commission_summary', {
    p_branch_id: branchId,
  });
  if (error) throw _rpcError(error, 'get_commission_summary');
  // The RPC already returns camelCase JSON; coerce numerics defensively.
  const d = data || {};
  return {
    totalCommissions: Number(d.totalCommissions ?? 0),
    totalPaid: Number(d.totalPaid ?? 0),
    totalDue: Number(d.totalDue ?? 0),
    totalDisputed: Number(d.totalDisputed ?? 0),
    totalInRun: Number(d.totalInRun ?? 0),
    totalReleased: Number(d.totalReleased ?? 0),
    totalConfirmed: Number(d.totalConfirmed ?? 0),
    countTotal: Number(d.countTotal ?? 0),
    countPaid: Number(d.countPaid ?? 0),
    countDue: Number(d.countDue ?? 0),
    countDisputed: Number(d.countDisputed ?? 0),
    countInRun: Number(d.countInRun ?? 0),
    countReleased: Number(d.countReleased ?? 0),
    countConfirmed: Number(d.countConfirmed ?? 0),
  };
}

/**
 * @endpoint RPC get_entity_commission_summary(p_level, p_entity_id)
 * @cache ['entityCommissionSummary', level, entityId]
 */
export async function getEntityCommissionSummary(level, entityId) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getEntityCommissionSummary(level, entityId);
  const { data, error } = await supabase.rpc('get_entity_commission_summary', {
    p_level: level,
    p_entity_id: entityId ?? null,
  });
  if (error) throw _rpcError(error, 'get_entity_commission_summary');
  const d = data || {};
  return {
    totalPaid: Number(d.totalPaid ?? 0),
    totalDue: Number(d.totalDue ?? 0),
    totalDisputed: Number(d.totalDisputed ?? 0),
    countPaid: Number(d.countPaid ?? 0),
    countDue: Number(d.countDue ?? 0),
    countDisputed: Number(d.countDisputed ?? 0),
    total: Number(d.total ?? 0),
    countTotal: Number(d.countTotal ?? 0),
    settlementRate: Number(d.settlementRate ?? 0),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * AGENT / SUBSCRIBER LISTINGS
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @endpoint Custom SELECT — agents joined to their commission tallies.
 * @description The legacy JS aggregates per-agent in JS; we mirror that by
 *   pulling agent rows + their commission rows in two queries and folding
 *   client-side. The dataset (~2k agents, ~30k commissions) is small enough
 *   to stream once into the dashboard.
 *
 * @scope RLS: distributor sees everyone; branch sees own branch; agent sees own.
 */
export async function getAgentCommissionList(statusFocus) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getAgentCommissionList(statusFocus);

  // Pull every commission row visible to the caller; group in JS. This trades
  // a single round-trip for not needing a per-agent aggregation RPC.
  const [{ data: commissions, error: cErr }, { data: agents, error: aErr }, { data: branches, error: bErr }] =
    await Promise.all([
      supabase.from('commissions').select(
        'id, agent_id, branch_id, amount, status, paid_date, due_date, run_id, txn_ref, subscriber_id, subscriber_name'
      ),
      supabase.from('agents').select('id, name, employee_id, branch_id'),
      supabase.from('branches').select('id, name'),
    ]);
  if (cErr) throw _rpcError(cErr, 'getAgentCommissionList:commissions');
  if (aErr) throw _rpcError(aErr, 'getAgentCommissionList:agents');
  if (bErr) throw _rpcError(bErr, 'getAgentCommissionList:branches');

  const agentMap = new Map((agents || []).map((a) => [a.id, a]));
  const branchMap = new Map((branches || []).map((b) => [b.id, b]));
  const byAgent = new Map();
  for (const row of commissions || []) {
    const c = _rowToCommission(row);
    if (!byAgent.has(c.agentId)) byAgent.set(c.agentId, []);
    byAgent.get(c.agentId).push(c);
  }

  const result = [];
  for (const [agentId, comms] of byAgent.entries()) {
    const agent = agentMap.get(agentId) || {};
    const branch = branchMap.get(agent.branch_id) || {};
    let filtered = comms;
    if (statusFocus === 'paid') filtered = comms.filter(isPaid);
    else if (statusFocus === 'due') filtered = comms.filter(isOutstanding);
    else if (statusFocus === 'disputed') filtered = comms.filter((c) => c.status === 'disputed');

    const totalAmount = comms.reduce((s, c) => s + c.amount, 0);
    const paidAmount = comms.filter(isPaid).reduce((s, c) => s + c.amount, 0);
    const dueAmount = comms.filter(isOutstanding).reduce((s, c) => s + c.amount, 0);

    result.push({
      agentId,
      agentName: agent.name || 'Unknown',
      employeeId: agent.employee_id || '',
      branchId: agent.branch_id || '',
      branchName: branch.name || 'Unknown',
      totalCommissions: totalAmount,
      totalPaid: paidAmount,
      totalDue: dueAmount,
      subscribersOnboarded: comms.length,
      activeSubscribers: comms.filter((c) => c.status !== 'disputed' && c.status !== 'rejected').length,
      filteredAmount: filtered.reduce((s, c) => s + c.amount, 0),
      filteredCount: filtered.length,
    });
  }
  return result.filter((a) => a.subscribersOnboarded > 0);
}

/**
 * @endpoint RPC get_agent_commission_detail(p_agent_id)
 * @cache ['agentCommissionDetail', agentId]
 */
export async function getAgentCommissionDetail(agentId) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getAgentCommissionDetail(agentId);
  const { data, error } = await supabase.rpc('get_agent_commission_detail', {
    p_agent_id: agentId,
  });
  if (error) throw _rpcError(error, 'get_agent_commission_detail');
  if (!data) return null;

  // Also pull the underlying commission rows so callers that need the raw set
  // (e.g. Agent dashboard CommissionsPage.groupByPaidCycle) still get it. The
  // RPC returns separate paid/due arrays; commissions[] is the concatenation.
  const { data: rawRows, error: cErr } = await supabase
    .from('commissions')
    .select(
      'id, agent_id, branch_id, subscriber_id, subscriber_name, amount, status, first_contribution_date, due_date, paid_date, run_id, txn_ref, agent_confirmed, previous_status, dispute_reason, disputed_at, disputed_by, resolved_at, resolved_by, outcome_reason, hold_reason'
    )
    .eq('agent_id', agentId);
  if (cErr) throw _rpcError(cErr, 'get_agent_commission_detail:rows');

  return {
    ...data,
    totalCommissions: Number(data.totalCommissions ?? 0),
    totalPaid: Number(data.totalPaid ?? 0),
    totalDue: Number(data.totalDue ?? 0),
    commissions: (rawRows || []).map(_rowToCommission),
  };
}

/**
 * @endpoint SELECT subscribers JOIN commissions WHERE agent_id = ?
 * @cache ['commissionSubscribers', agentId, filter]
 */
export async function getCommissionSubscribers(agentId, filter) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getCommissionSubscribers(agentId, filter);

  const [{ data: commissions, error: cErr }, { data: subscribers, error: sErr }] = await Promise.all([
    supabase.from('commissions').select('subscriber_id, subscriber_name, status, first_contribution_date').eq('agent_id', agentId),
    supabase.from('subscribers').select('id, name, registered_date, total_contributions, is_active').eq('agent_id', agentId),
  ]);
  if (cErr) throw _rpcError(cErr, 'getCommissionSubscribers:commissions');
  if (sErr) throw _rpcError(sErr, 'getCommissionSubscribers:subscribers');

  const subMap = new Map((subscribers || []).map((s) => [s.id, s]));
  let rows = commissions || [];
  if (filter === 'active') rows = rows.filter((c) => c.status !== 'disputed' && c.status !== 'rejected');
  else if (filter === 'dormant') rows = rows.filter((c) => c.status === 'disputed');

  return rows.map((c) => {
    const sub = subMap.get(c.subscriber_id) || {};
    return {
      subscriberId: c.subscriber_id,
      subscriberName: c.subscriber_name || sub.name || 'Unknown',
      registeredDate: sub.registered_date || c.first_contribution_date,
      lastContribution: 0,           // not surfaced by current schema; left at 0 for backwards-compat
      lastContributionDate: '',      // ditto
      totalContributions: Number(sub.total_contributions ?? 0),
      isActive: !!sub.is_active,
    };
  });
}

/**
 * @endpoint SELECT commissions WHERE status='disputed' grouped by agent.
 * @cache ['disputedAgents']
 */
export async function getDisputedAgentList() {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getDisputedAgentList();

  const [{ data: commissions, error: cErr }, { data: agents, error: aErr }, { data: branches, error: bErr }] =
    await Promise.all([
      supabase
        .from('commissions')
        .select('id, agent_id, branch_id, subscriber_id, subscriber_name, amount, status, due_date, dispute_reason, disputed_at, disputed_by, previous_status')
        .eq('status', 'disputed'),
      supabase.from('agents').select('id, name, employee_id, branch_id'),
      supabase.from('branches').select('id, name'),
    ]);
  if (cErr) throw _rpcError(cErr, 'getDisputedAgentList:commissions');
  if (aErr) throw _rpcError(aErr, 'getDisputedAgentList:agents');
  if (bErr) throw _rpcError(bErr, 'getDisputedAgentList:branches');

  const agentMap = new Map((agents || []).map((a) => [a.id, a]));
  const branchMap = new Map((branches || []).map((b) => [b.id, b]));
  const byAgent = new Map();
  for (const row of commissions || []) {
    if (!byAgent.has(row.agent_id)) byAgent.set(row.agent_id, []);
    byAgent.get(row.agent_id).push(row);
  }

  const result = [];
  for (const [agentId, disputes] of byAgent.entries()) {
    const agent = agentMap.get(agentId) || {};
    const branch = branchMap.get(agent.branch_id) || {};
    result.push({
      agentId,
      agentName: agent.name || 'Unknown',
      employeeId: agent.employee_id || '',
      branchId: agent.branch_id || '',
      branchName: branch.name || 'Unknown',
      disputedCount: disputes.length,
      disputedAmount: disputes.reduce((s, c) => s + Number(c.amount), 0),
      disputes: disputes.map((c) => ({
        id: c.id,
        subscriberId: c.subscriber_id,
        subscriberName: c.subscriber_name,
        amount: Number(c.amount),
        dueDate: c.due_date,
        reason: c.dispute_reason,
        disputedAt: c.disputed_at,
        disputedBy: c.disputed_by,
        previousStatus: c.previous_status,
      })),
    });
  }
  return result;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SETTLEMENT RUNS — reads
 * ═══════════════════════════════════════════════════════════════════════════ */

async function _loadRunWithReviews(runId) {
  const [{ data: runRow, error: rErr }, { data: reviews, error: rvErr }] = await Promise.all([
    supabase.from('settlement_runs').select('*').eq('id', runId).maybeSingle(),
    supabase.from('settlement_run_branch_reviews').select('*').eq('run_id', runId),
  ]);
  if (rErr) throw _rpcError(rErr, 'loadRun:run');
  if (rvErr) throw _rpcError(rvErr, 'loadRun:reviews');
  return _rowToRun(runRow, reviews || []);
}

async function _loadRunLines(runId) {
  const { data, error } = await supabase
    .from('commissions')
    .select('id, agent_id, branch_id, subscriber_id, subscriber_name, amount, status, run_id, paid_date, due_date, txn_ref')
    .eq('run_id', runId);
  if (error) throw _rpcError(error, 'loadRunLines');
  return (data || []).map(_rowToCommission);
}

/**
 * @endpoint GET /api/runs/current
 * @cache ['currentRun']
 */
export async function getCurrentRun() {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getCurrentRun();

  const { data: rows, error } = await supabase
    .from('settlement_runs')
    .select('*')
    .in('state', ['draft', 'branch_review'])
    .order('opened_at', { ascending: false })
    .limit(1);
  if (error) throw _rpcError(error, 'getCurrentRun');
  const row = rows && rows[0];
  if (!row) return null;

  const [run, lines] = await Promise.all([
    _loadRunWithReviews(row.id),
    _loadRunLines(row.id),
  ]);
  return _enrichRun(run, lines);
}

/**
 * @endpoint GET /api/runs/:runId
 * @cache ['settlementRun', runId]
 */
export async function getRunById(runId) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getRunById(runId);
  if (!runId) return null;
  const [run, lines] = await Promise.all([
    _loadRunWithReviews(runId),
    _loadRunLines(runId),
  ]);
  return run ? _enrichRun(run, lines) : null;
}

/**
 * @endpoint GET /api/runs?branchId=:branchId&limit=:limit
 * @cache ['settlementRunsList', branchId, limit]
 */
export async function listRuns({ limit, branchId } = {}) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_listRuns({ limit, branchId });

  let runIds;
  if (branchId) {
    const { data, error } = await supabase
      .from('settlement_run_branch_reviews')
      .select('run_id')
      .eq('branch_id', branchId);
    if (error) throw _rpcError(error, 'listRuns:branchReviews');
    runIds = Array.from(new Set((data || []).map((r) => r.run_id)));
    if (runIds.length === 0) return [];
  }

  let q = supabase.from('settlement_runs').select('*').order('opened_at', { ascending: false });
  if (runIds) q = q.in('id', runIds);
  if (typeof limit === 'number') q = q.limit(limit);
  const { data: runRows, error: rErr } = await q;
  if (rErr) throw _rpcError(rErr, 'listRuns:runs');
  if (!runRows || runRows.length === 0) return [];

  const ids = runRows.map((r) => r.id);
  const [{ data: reviews, error: rvErr }, { data: lines, error: lErr }] = await Promise.all([
    supabase.from('settlement_run_branch_reviews').select('*').in('run_id', ids),
    supabase
      .from('commissions')
      .select('id, agent_id, branch_id, amount, status, run_id')
      .in('run_id', ids),
  ]);
  if (rvErr) throw _rpcError(rvErr, 'listRuns:reviews');
  if (lErr) throw _rpcError(lErr, 'listRuns:lines');

  const reviewsByRun = new Map();
  for (const r of reviews || []) {
    if (!reviewsByRun.has(r.run_id)) reviewsByRun.set(r.run_id, []);
    reviewsByRun.get(r.run_id).push(r);
  }
  const linesByRun = new Map();
  for (const c of lines || []) {
    if (!linesByRun.has(c.run_id)) linesByRun.set(c.run_id, []);
    linesByRun.get(c.run_id).push(_rowToCommission(c));
  }

  return runRows.map((row) => {
    const run = _rowToRun(row, reviewsByRun.get(row.id) || []);
    return _enrichRun(run, linesByRun.get(row.id) || []);
  });
}

/**
 * @endpoint GET /api/runs/:runId/branch/:branchId
 * @cache ['runForBranch', runId, branchId]
 */
export async function getRunForBranch(runId, branchId) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getRunForBranch(runId, branchId);
  if (!runId || !branchId) return null;

  const [run, lines] = await Promise.all([
    _loadRunWithReviews(runId),
    (async () => {
      const { data, error } = await supabase
        .from('commissions')
        .select('id, agent_id, branch_id, subscriber_id, subscriber_name, amount, status, run_id, paid_date, due_date, txn_ref, hold_reason, dispute_reason, disputed_at, disputed_by, previous_status')
        .eq('run_id', runId)
        .eq('branch_id', branchId);
      if (error) throw _rpcError(error, 'getRunForBranch:lines');
      return (data || []).map(_rowToCommission);
    })(),
  ]);
  if (!run) return null;
  const enriched = _enrichRun(run, lines);
  return {
    run: enriched,
    lines,
    reviewState: run.branchReviews[branchId]?.state || 'pending',
  };
}

/**
 * @endpoint RPC get_run_branch_breakdown(p_run_id)
 * @cache ['runBranchBreakdown', runId]
 */
export async function getRunBranchBreakdown(runId) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getRunBranchBreakdown(runId);
  if (!runId) return [];
  const { data, error } = await supabase.rpc('get_run_branch_breakdown', { p_run_id: runId });
  if (error) throw _rpcError(error, 'get_run_branch_breakdown');
  return (data || []).map((row) => ({
    ...row,
    amount: Number(row.amount ?? 0),
    releasedAmount: Number(row.releasedAmount ?? 0),
    count: Number(row.count ?? 0),
  }));
}

/**
 * @endpoint SELECT commissions WHERE run_id=? AND branch_id=? grouped by agent.
 * @cache ['runBranchAgents', runId, branchId]
 */
export async function getRunBranchAgents(runId, branchId) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getRunBranchAgents(runId, branchId);
  if (!runId || !branchId) return [];

  const [{ data: rows, error: cErr }, { data: agents, error: aErr }] = await Promise.all([
    supabase
      .from('commissions')
      .select('id, agent_id, branch_id, subscriber_id, subscriber_name, amount, status, run_id, paid_date, due_date, txn_ref')
      .eq('run_id', runId)
      .eq('branch_id', branchId),
    supabase.from('agents').select('id, name, employee_id, branch_id').eq('branch_id', branchId),
  ]);
  if (cErr) throw _rpcError(cErr, 'getRunBranchAgents:lines');
  if (aErr) throw _rpcError(aErr, 'getRunBranchAgents:agents');

  const agentMap = new Map((agents || []).map((a) => [a.id, a]));
  const byAgent = new Map();
  for (const row of rows || []) {
    const c = _rowToCommission(row);
    if (!byAgent.has(c.agentId)) {
      const agent = agentMap.get(c.agentId) || {};
      byAgent.set(c.agentId, {
        agentId: c.agentId,
        agentName: agent.name || c.agentId,
        employeeId: agent.employee_id || '',
        count: 0,
        amount: 0,
        commissions: [],
      });
    }
    const entry = byAgent.get(c.agentId);
    entry.count += 1;
    entry.amount += c.amount;
    entry.commissions.push(c);
  }
  return Array.from(byAgent.values()).sort((a, b) => b.amount - a.amount);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SETTLEMENT RUNS — state-machine mutations (RPC-only)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @endpoint RPC open_run()
 * @scope Distributor only.
 */
export async function openRun() {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_openRun();
  const { data: newRunId, error } = await supabase.rpc('open_run');
  if (error) throw _rpcError(error, 'open_run');
  return getRunById(newRunId);
}

/**
 * @endpoint RPC cancel_run(p_run_id)
 * @scope Distributor only.
 */
export async function cancelRun(runId) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_cancelRun(runId);
  if (!runId) return null;
  const { error } = await supabase.rpc('cancel_run', { p_run_id: runId });
  if (error) throw _rpcError(error, 'cancel_run');
  return getRunById(runId);
}

/**
 * @endpoint RPC release_run(p_run_id)
 * @scope Distributor only.
 * @note `txnRefByAgent` is accepted for API compatibility with the legacy JS
 *   but is NOT forwarded — the SQL RPC does not currently support per-agent
 *   txn references (see plan §"Service-layer migration" open questions and
 *   Agent 5's report). Persisting txn refs is deferred to a follow-up RPC.
 */
export async function releaseRun(runId, { txnRefByAgent } = {}) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_releaseRun(runId, { txnRefByAgent });
  if (!runId) throw new Error('runId is required');
  const { error } = await supabase.rpc('release_run', { p_run_id: runId });
  if (error) throw _rpcError(error, 'release_run');
  return getRunById(runId);
}

/**
 * @endpoint RPC release_branch(p_run_id, p_branch_id)
 * @scope Distributor only.
 * @note `txnRefByAgent` accepted for compatibility; not forwarded (see releaseRun).
 */
export async function releaseBranch(runId, branchId, { txnRefByAgent } = {}) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_releaseBranch(runId, branchId, { txnRefByAgent });
  if (!runId) throw new Error('runId is required');
  if (!branchId) throw new Error('branchId is required');
  const { error } = await supabase.rpc('release_branch', {
    p_run_id: runId,
    p_branch_id: branchId,
  });
  if (error) throw _rpcError(error, 'release_branch');
  return getRunById(runId);
}

/**
 * @endpoint RPC branch_approve_all(p_run_id)
 * @scope Branch only. The RPC reads branchId from JWT; the JS branchId arg is
 *   kept for caller-side ergonomics but is NOT forwarded — the SQL function
 *   derives it from the authenticated session.
 */
export async function branchApproveAll(runId, branchId) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_branchApproveAll(runId, branchId);
  if (!runId) throw new Error('runId is required');
  const { data: count, error } = await supabase.rpc('branch_approve_all', { p_run_id: runId });
  if (error) throw _rpcError(error, 'branch_approve_all');
  const run = await getRunById(runId);
  return { run, count: Number(count ?? 0) };
}

/**
 * @endpoint RPC mark_branch_reviewed(p_run_id)
 * @scope Branch only — branchId derived from JWT (see branchApproveAll).
 */
export async function markBranchReviewed(runId, branchId) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_markBranchReviewed(runId, branchId);
  if (!runId) throw new Error('runId is required');
  const { error } = await supabase.rpc('mark_branch_reviewed', { p_run_id: runId });
  if (error) throw _rpcError(error, 'mark_branch_reviewed');
  return getRunById(runId);
}

/**
 * @endpoint RPC branch_approve_line(p_commission_id)
 * @scope Branch only — RLS + RPC enforce branch ownership.
 */
export async function branchApproveLine(commissionId) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_branchApproveLine(commissionId);
  if (!commissionId) return null;
  const { error } = await supabase.rpc('branch_approve_line', { p_commission_id: commissionId });
  if (error) throw _rpcError(error, 'branch_approve_line');
  const { data: row, error: sErr } = await supabase
    .from('commissions')
    .select('*')
    .eq('id', commissionId)
    .maybeSingle();
  if (sErr) throw _rpcError(sErr, 'branch_approve_line:reload');
  return _rowToCommission(row);
}

/**
 * @endpoint RPC branch_hold_line(p_commission_id, p_hold_reason)
 */
export async function branchHoldLine(commissionId, reason) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_branchHoldLine(commissionId, reason);
  if (!commissionId) return null;
  const { error } = await supabase.rpc('branch_hold_line', {
    p_commission_id: commissionId,
    p_hold_reason: reason ?? null,
  });
  if (error) throw _rpcError(error, 'branch_hold_line');
  const { data: row, error: sErr } = await supabase
    .from('commissions')
    .select('*')
    .eq('id', commissionId)
    .maybeSingle();
  if (sErr) throw _rpcError(sErr, 'branch_hold_line:reload');
  return _rowToCommission(row);
}

/**
 * @endpoint RPC branch_dispute_line(p_commission_id, p_dispute_reason)
 * @scope Branch only — disputed_by recorded as the literal 'branch'.
 */
export async function branchDisputeLine(commissionId, reason) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_branchDisputeLine(commissionId, reason);
  if (!commissionId) return null;
  const { error } = await supabase.rpc('branch_dispute_line', {
    p_commission_id: commissionId,
    p_dispute_reason: reason ?? null,
  });
  if (error) throw _rpcError(error, 'branch_dispute_line');
  const { data: row, error: sErr } = await supabase
    .from('commissions')
    .select('*')
    .eq('id', commissionId)
    .maybeSingle();
  if (sErr) throw _rpcError(sErr, 'branch_dispute_line:reload');
  return _rowToCommission(row);
}

/**
 * Branch-side dispute calls `branch_dispute_line`; agent-side dispute calls
 * `agent_dispute_line` (added in migration 0014 — mirrors the branch RPC,
 * SECURITY DEFINER, granted to authenticated).
 *
 * @scope by='branch': branch admin; by='agent': field agent.
 */
export async function disputeCommission(commissionId, reason, by = 'agent') {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_disputeCommission(commissionId, reason, by);
  if (!commissionId) return null;

  if (by === 'branch') {
    return branchDisputeLine(commissionId, reason);
  }
  const { error } = await supabase.rpc('agent_dispute_line', {
    p_commission_id: commissionId,
    p_dispute_reason: reason ?? null,
  });
  if (error) throw _rpcError(error, 'agent_dispute_line');
  const { data: row, error: sErr } = await supabase
    .from('commissions')
    .select('*')
    .eq('id', commissionId)
    .maybeSingle();
  if (sErr) throw _rpcError(sErr, 'agent_dispute_line:reload');
  return _rowToCommission(row);
}

/**
 * @endpoint RPC approve_dispute(p_commission_id, p_outcome_reason)
 * @scope Distributor only. `resolvedBy` is set inside the RPC as 'Distributor admin'.
 */
export async function approveDispute(commissionId, { outcomeReason, resolvedBy } = {}) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_approveDispute(commissionId, { outcomeReason, resolvedBy });
  if (!commissionId) return null;
  const { error } = await supabase.rpc('approve_dispute', {
    p_commission_id: commissionId,
    p_outcome_reason: outcomeReason ?? null,
  });
  if (error) throw _rpcError(error, 'approve_dispute');
  const { data: row, error: sErr } = await supabase
    .from('commissions')
    .select('*')
    .eq('id', commissionId)
    .maybeSingle();
  if (sErr) throw _rpcError(sErr, 'approve_dispute:reload');
  return _rowToCommission(row);
}

/**
 * @endpoint RPC reject_dispute(p_commission_id, p_outcome_reason)
 * @scope Distributor only.
 */
export async function rejectDispute(commissionId, { outcomeReason, resolvedBy } = {}) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_rejectDispute(commissionId, { outcomeReason, resolvedBy });
  if (!commissionId) return null;
  const { error } = await supabase.rpc('reject_dispute', {
    p_commission_id: commissionId,
    p_outcome_reason: outcomeReason ?? null,
  });
  if (error) throw _rpcError(error, 'reject_dispute');
  const { data: row, error: sErr } = await supabase
    .from('commissions')
    .select('*')
    .eq('id', commissionId)
    .maybeSingle();
  if (sErr) throw _rpcError(sErr, 'reject_dispute:reload');
  return _rowToCommission(row);
}

export async function bulkApproveDisputes(commissionIds, options) {
  return Promise.all((commissionIds || []).map((id) => approveDispute(id, options)));
}

export async function bulkRejectDisputes(commissionIds, options) {
  return Promise.all((commissionIds || []).map((id) => rejectDispute(id, options)));
}

/**
 * @endpoint RPC withdraw_dispute(p_commission_id)
 * @scope Agent only — agentId in JWT must own the commission.
 */
export async function withdrawDispute(commissionId) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_withdrawDispute(commissionId);
  if (!commissionId) return null;
  const { error } = await supabase.rpc('withdraw_dispute', { p_commission_id: commissionId });
  if (error) throw _rpcError(error, 'withdraw_dispute');
  const { data: row, error: sErr } = await supabase
    .from('commissions')
    .select('*')
    .eq('id', commissionId)
    .maybeSingle();
  if (sErr) throw _rpcError(sErr, 'withdraw_dispute:reload');
  return _rowToCommission(row);
}

/**
 * @endpoint RPC agent_confirm_commission(p_commission_id)
 * @scope Agent only. Idempotent on already-confirmed commissions.
 */
export async function confirmCommission(commissionId) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_confirmCommission(commissionId);
  if (!commissionId) return null;
  const { error } = await supabase.rpc('agent_confirm_commission', { p_commission_id: commissionId });
  if (error) throw _rpcError(error, 'agent_confirm_commission');
  const { data: row, error: sErr } = await supabase
    .from('commissions')
    .select('*')
    .eq('id', commissionId)
    .maybeSingle();
  if (sErr) throw _rpcError(sErr, 'agent_confirm_commission:reload');
  return _rowToCommission(row);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Legacy summary-cache shim — kept exported for tests that still import it.
 * React Query is the source of caching now; this is a no-op when Supabase is on.
 * ═══════════════════════════════════════════════════════════════════════════ */

const _summaryCache = new Map();

export function invalidateSummaryCache() {
  _summaryCache.clear();
}

/* ═══════════════════════════════════════════════════════════════════════════
 * LEGACY MOCK IMPLEMENTATIONS — preserved verbatim under IS_SUPABASE_ENABLED=false
 * (Plan §"Rollback strategy" requires the prior behaviour to remain reachable.)
 * ═══════════════════════════════════════════════════════════════════════════ */

function _legacy_mock_getNetworkCadence() {
  return Promise.resolve({
    cadence: COMMISSION_CONFIG.cadence,
    nextRunDate: COMMISSION_CONFIG.nextRunDate,
  });
}

function _legacy_mock_setNetworkCadence(cadence) {
  if (!VALID_CADENCES.has(cadence)) {
    return Promise.reject(new Error(`Invalid cadence: ${cadence}`));
  }
  COMMISSION_CONFIG.cadence = cadence;
  COMMISSION_CONFIG.nextRunDate = fmtDate(nextCycleEnd(cadence, MOCK_NOW));
  return _legacy_mock_getNetworkCadence();
}

function _legacy_mock_getCommissionRate() {
  return Promise.resolve(COMMISSION_CONFIG.ratePerSubscriber);
}

function _legacy_mock_setCommissionRate(amount) {
  COMMISSION_CONFIG.ratePerSubscriber = amount;
  return Promise.resolve(amount);
}

function _legacy_mock_getCommissionSummary(branchId = null) {
  const all = branchId
    ? (commissionsByBranch[branchId] || [])
    : Object.values(COMMISSIONS);
  const totalCommissions = all.reduce((sum, c) => sum + c.amount, 0);
  const paid = all.filter(isPaid);
  const due = all.filter(isOutstanding);
  const disputed = all.filter((c) => c.status === 'disputed');
  const inRun = all.filter((c) => c.status === 'in_run');
  const released = all.filter((c) => c.status === 'released');
  const confirmed = all.filter((c) => c.status === 'confirmed');
  return Promise.resolve({
    totalCommissions,
    totalPaid: paid.reduce((s, c) => s + c.amount, 0),
    totalDue: due.reduce((s, c) => s + c.amount, 0),
    totalDisputed: disputed.reduce((s, c) => s + c.amount, 0),
    totalInRun: inRun.reduce((s, c) => s + c.amount, 0),
    totalReleased: released.reduce((s, c) => s + c.amount, 0),
    totalConfirmed: confirmed.reduce((s, c) => s + c.amount, 0),
    countTotal: all.length,
    countPaid: paid.length,
    countDue: due.length,
    countDisputed: disputed.length,
    countInRun: inRun.length,
    countReleased: released.length,
    countConfirmed: confirmed.length,
  });
}

function _legacy_mock_getAgentCommissionList(statusFocus) {
  const agentIds = Object.keys(commissionsByAgent);
  return Promise.resolve(
    agentIds
      .map((agentId) => {
        const agent = AGENTS[agentId];
        const branch = BRANCHES[agent?.parentId];
        const comms = commissionsByAgent[agentId] || [];
        let filtered = comms;
        if (statusFocus === 'paid') filtered = comms.filter(isPaid);
        else if (statusFocus === 'due') filtered = comms.filter(isOutstanding);
        else if (statusFocus === 'disputed') filtered = comms.filter((c) => c.status === 'disputed');
        const totalAmount = comms.reduce((s, c) => s + c.amount, 0);
        const paidAmount = comms.filter(isPaid).reduce((s, c) => s + c.amount, 0);
        const dueAmount = comms.filter(isOutstanding).reduce((s, c) => s + c.amount, 0);
        return {
          agentId,
          agentName: agent?.name || 'Unknown',
          employeeId: agent?.employeeId || '',
          branchId: agent?.parentId || '',
          branchName: branch?.name || 'Unknown',
          totalCommissions: totalAmount,
          totalPaid: paidAmount,
          totalDue: dueAmount,
          subscribersOnboarded: comms.length,
          activeSubscribers: comms.filter((c) => c.status !== 'disputed' && c.status !== 'rejected').length,
          filteredAmount: filtered.reduce((s, c) => s + c.amount, 0),
          filteredCount: filtered.length,
        };
      })
      .filter((a) => a.subscribersOnboarded > 0)
  );
}

function _legacy_mock_getAgentCommissionDetail(agentId) {
  const agent = AGENTS[agentId];
  const branch = BRANCHES[agent?.parentId];
  const comms = commissionsByAgent[agentId] || [];
  const paid = comms.filter(isPaid);
  const due = comms.filter(isOutstanding);
  const disputed = comms.filter((c) => c.status === 'disputed');
  return Promise.resolve({
    agentId,
    agentName: agent?.name || 'Unknown',
    employeeId: agent?.employeeId || '',
    agentPhone: agent?.phone || '',
    branchId: agent?.parentId || '',
    branchName: branch?.name || 'Unknown',
    rating: agent?.rating || 0,
    totalCommissions: comms.reduce((s, c) => s + c.amount, 0),
    totalPaid: paid.reduce((s, c) => s + c.amount, 0),
    totalDue: due.reduce((s, c) => s + c.amount, 0),
    subscribersOnboarded: comms.length,
    activeSubscribers: comms.filter((c) => c.status !== 'disputed' && c.status !== 'rejected').length,
    dormantSubscribers: disputed.length,
    paidTransactions: paid.map((c) => ({
      id: c.id,
      transactionDate: c.paidDate,
      amount: c.amount,
      status: c.status,
      runId: c.runId,
      txnRef: c.txnRef,
      subscriberId: c.subscriberId,
      subscriberName: c.subscriberName,
    })),
    dueTransactions: due.map((c) => {
      const dueDate = new Date(c.dueDate);
      const daysToDate = Math.ceil((dueDate - MOCK_NOW) / 86400000);
      return {
        id: c.id,
        dueDate: c.dueDate,
        daysToDate,
        amount: c.amount,
        status: c.status,
        runId: c.runId,
        branchId: c.branchId,
        branchName: branch?.name || 'Unknown',
        subscriberId: c.subscriberId,
        subscriberName: c.subscriberName,
      };
    }),
    commissions: comms,
  });
}

function _legacy_mock_getCommissionSubscribers(agentId, filter) {
  const comms = commissionsByAgent[agentId] || [];
  let filtered = comms;
  if (filter === 'active') {
    filtered = comms.filter((c) => c.status !== 'disputed' && c.status !== 'rejected');
  } else if (filter === 'dormant') {
    filtered = comms.filter((c) => c.status === 'disputed');
  }
  return Promise.resolve(
    filtered.map((c) => {
      const sub = SUBSCRIBERS[c.subscriberId];
      return {
        subscriberId: c.subscriberId,
        subscriberName: c.subscriberName,
        registeredDate: sub?.registeredDate || c.firstContributionDate,
        lastContribution: sub ? sub.contributionHistory[sub.contributionHistory.length - 1] : 0,
        lastContributionDate: sub
          ? `2026-03-${String(Math.min(28, parseInt(sub.registeredDate.split('-')[2]) + 5)).padStart(2, '0')}`
          : '',
        totalContributions: sub?.totalContributions || 0,
        isActive: sub?.isActive || false,
      };
    })
  );
}

function _legacy_mock_getDisputedAgentList() {
  const agentIds = Object.keys(commissionsByAgent);
  return Promise.resolve(
    agentIds
      .map((agentId) => {
        const agent = AGENTS[agentId];
        const branch = BRANCHES[agent?.parentId];
        const comms = commissionsByAgent[agentId] || [];
        const disputed = comms.filter((c) => c.status === 'disputed');
        if (disputed.length === 0) return null;
        return {
          agentId,
          agentName: agent?.name || 'Unknown',
          employeeId: agent?.employeeId || '',
          branchId: agent?.parentId || '',
          branchName: branch?.name || 'Unknown',
          disputedCount: disputed.length,
          disputedAmount: disputed.reduce((s, c) => s + c.amount, 0),
          disputes: disputed.map((c) => ({
            id: c.id,
            subscriberId: c.subscriberId,
            subscriberName: c.subscriberName,
            amount: c.amount,
            dueDate: c.dueDate,
            reason: c.disputeReason,
            disputedAt: c.disputedAt,
            disputedBy: c.disputedBy,
            previousStatus: c.previousStatus,
          })),
        };
      })
      .filter(Boolean)
  );
}

function _legacy_runWithDerivedFields(run) {
  if (!run) return null;
  const reviews = Object.values(run.branchReviews || {});
  const approvedCount = reviews.filter((r) => r.state === 'approved').length;
  const pendingCount = reviews.filter((r) => r.state === 'pending').length;
  const releasedCount = reviews.filter((r) => r.state === 'released').length;
  const lines = commissionsByRun[run.id] || [];
  const distinctAgents = new Set();
  let approvedAmount = 0;
  const approvedBranchIds = new Set(
    Object.entries(run.branchReviews || {})
      .filter(([, r]) => r.state === 'approved')
      .map(([bid]) => bid)
  );
  for (const c of lines) {
    if (c.agentId) distinctAgents.add(c.agentId);
    if (c.status === 'in_run' && approvedBranchIds.has(c.branchId)) {
      approvedAmount += c.amount;
    }
  }
  return {
    ...run,
    branchCount: reviews.length,
    branchApprovedCount: approvedCount,
    branchPendingCount: pendingCount,
    branchReleasedCount: releasedCount,
    agentCount: distinctAgents.size,
    approvedAmount,
    canReleaseAny: run.state === 'branch_review' && approvedCount > 0,
  };
}

function _legacy_mock_getRunBranchBreakdown(runId) {
  const run = SETTLEMENT_RUNS[runId];
  if (!run) return Promise.resolve([]);
  const lines = commissionsByRun[runId] || [];
  const map = new Map();
  for (const c of lines) {
    if (!map.has(c.branchId)) {
      map.set(c.branchId, { branchId: c.branchId, count: 0, amount: 0, releasedAmount: 0 });
    }
    const entry = map.get(c.branchId);
    entry.count += 1;
    entry.amount += c.amount;
    if (c.status === 'released' || c.status === 'confirmed') entry.releasedAmount += c.amount;
  }
  Object.keys(run.branchReviews).forEach((bid) => {
    if (!map.has(bid)) {
      map.set(bid, { branchId: bid, count: 0, amount: 0, releasedAmount: 0 });
    }
  });
  return Promise.resolve(
    Array.from(map.values())
      .map((row) => {
        const review = run.branchReviews[row.branchId] || {};
        const branch = BRANCHES[row.branchId];
        return {
          ...row,
          branchName: branch?.name || row.branchId,
          branchEmployeeId: branch?.employeeId || null,
          state: review.state || 'pending',
          reviewedAt: review.reviewedAt || null,
          reviewedBy: review.reviewedBy || null,
          releasedAt: review.releasedAt || null,
        };
      })
      .sort((a, b) => a.branchName.localeCompare(b.branchName))
  );
}

function _legacy_mock_getRunBranchAgents(runId, branchId) {
  const lines = (commissionsByRun[runId] || []).filter((c) => c.branchId === branchId);
  const map = new Map();
  for (const c of lines) {
    if (!map.has(c.agentId)) {
      const agent = AGENTS[c.agentId];
      map.set(c.agentId, {
        agentId: c.agentId,
        agentName: agent?.name || c.agentId,
        employeeId: agent?.employeeId || '',
        count: 0,
        amount: 0,
        commissions: [],
      });
    }
    const entry = map.get(c.agentId);
    entry.count += 1;
    entry.amount += c.amount;
    entry.commissions.push(c);
  }
  return Promise.resolve(Array.from(map.values()).sort((a, b) => b.amount - a.amount));
}

function _legacy_mock_getCurrentRun() {
  const open = Object.values(SETTLEMENT_RUNS).find(
    (r) => r.state === 'draft' || r.state === 'branch_review'
  );
  return Promise.resolve(_legacy_runWithDerivedFields(open || null));
}

function _legacy_mock_getRunById(runId) {
  return Promise.resolve(_legacy_runWithDerivedFields(SETTLEMENT_RUNS[runId] || null));
}

function _legacy_mock_listRuns({ limit, branchId } = {}) {
  const pool = branchId
    ? (runsByBranch[branchId] || [])
    : Object.values(SETTLEMENT_RUNS);
  const sorted = [...pool].sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || ''));
  const sliced = typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
  return Promise.resolve(sliced.map(_legacy_runWithDerivedFields));
}

function _legacy_mock_getRunForBranch(runId, branchId) {
  const run = SETTLEMENT_RUNS[runId];
  if (!run) return Promise.resolve(null);
  const lines = (commissionsByRun[runId] || []).filter((c) => c.branchId === branchId);
  return Promise.resolve({
    run: _legacy_runWithDerivedFields(run),
    lines,
    reviewState: run.branchReviews[branchId]?.state || 'pending',
  });
}

function _legacy_mock_openRun() {
  const open = Object.values(SETTLEMENT_RUNS).find(
    (r) => r.state === 'draft' || r.state === 'branch_review'
  );
  if (open) return Promise.reject(new Error('A settlement run is already open'));
  const id = `r-${MOCK_NOW.getFullYear()}-${String(MOCK_NOW.getMonth() + 1).padStart(2, '0')}-${Date.now().toString(36).slice(-4)}`;
  const dueLines = Object.values(COMMISSIONS).filter((c) => c.status === 'due');
  if (dueLines.length === 0) return Promise.reject(new Error('No due commissions to bundle into a run'));

  const branchIds = new Set();
  let totalAmount = 0;
  dueLines.forEach((c) => {
    c.status = 'in_run';
    c.runId = id;
    branchIds.add(c.branchId);
    totalAmount += c.amount;
    if (!commissionsByRun[id]) commissionsByRun[id] = [];
    commissionsByRun[id].push(c);
  });
  const branchReviews = {};
  branchIds.forEach((bid) => {
    branchReviews[bid] = { state: 'pending', reviewedBy: null, reviewedAt: null };
    if (!runsByBranch[bid]) runsByBranch[bid] = [];
  });
  const run = {
    id,
    cadence: COMMISSION_CONFIG.cadence,
    openedAt: fmtDate(MOCK_NOW),
    closesAt: fmtDate(nextCycleEnd(COMMISSION_CONFIG.cadence, MOCK_NOW)),
    state: 'branch_review',
    totalAmount,
    commissionCount: dueLines.length,
    branchReviews,
    releasedAt: null,
    releasedBy: null,
    notes: '',
  };
  SETTLEMENT_RUNS[id] = run;
  branchIds.forEach((bid) => runsByBranch[bid].unshift(run));
  return Promise.resolve(_legacy_runWithDerivedFields(run));
}

function _legacy_mock_cancelRun(runId) {
  const run = SETTLEMENT_RUNS[runId];
  if (!run || run.state === 'released' || run.state === 'cancelled') return Promise.resolve(run);
  (commissionsByRun[runId] || []).forEach((c) => {
    if (c.status === 'in_run') {
      c.status = 'due';
      c.runId = null;
    }
  });
  run.state = 'cancelled';
  return Promise.resolve(_legacy_runWithDerivedFields(run));
}

function _legacy_mock_branchApproveLine(commissionId) {
  const c = COMMISSIONS[commissionId];
  if (!c) return Promise.resolve(null);
  if (c.status === 'held') {
    const open = Object.values(SETTLEMENT_RUNS).find(
      (r) => r.state === 'branch_review' || r.state === 'draft'
    );
    if (open) {
      c.status = 'in_run';
      c.runId = open.id;
      if (!commissionsByRun[open.id]) commissionsByRun[open.id] = [];
      if (!commissionsByRun[open.id].includes(c)) commissionsByRun[open.id].push(c);
    } else {
      c.status = 'due';
      c.runId = null;
    }
    c.holdReason = null;
  }
  return Promise.resolve(c);
}

function _legacy_mock_branchHoldLine(commissionId, reason) {
  const c = COMMISSIONS[commissionId];
  if (!c || c.status !== 'in_run') return Promise.resolve(null);
  if (c.runId && commissionsByRun[c.runId]) {
    commissionsByRun[c.runId] = commissionsByRun[c.runId].filter((x) => x.id !== c.id);
  }
  c.status = 'held';
  c.runId = null;
  if (reason) c.holdReason = reason;
  return Promise.resolve(c);
}

function _legacy_mock_branchApproveAll(runId, branchId) {
  const run = SETTLEMENT_RUNS[runId];
  if (!run) return Promise.resolve(null);
  const lines = (commissionsByRun[runId] || []).filter((c) => c.branchId === branchId);
  run.branchReviews[branchId] = {
    state: 'approved',
    reviewedBy: 'Branch admin',
    reviewedAt: fmtDate(MOCK_NOW),
  };
  return Promise.resolve({ run: _legacy_runWithDerivedFields(run), count: lines.length });
}

function _legacy_mock_markBranchReviewed(runId, branchId) {
  const run = SETTLEMENT_RUNS[runId];
  if (!run) return Promise.resolve(null);
  if (!run.branchReviews[branchId]) {
    run.branchReviews[branchId] = { state: 'approved' };
  }
  run.branchReviews[branchId].state = 'approved';
  run.branchReviews[branchId].reviewedBy = 'Branch admin';
  run.branchReviews[branchId].reviewedAt = fmtDate(MOCK_NOW);
  return Promise.resolve(_legacy_runWithDerivedFields(run));
}

function _legacy_mock_releaseBranch(runId, branchId, { txnRefByAgent } = {}) {
  const run = SETTLEMENT_RUNS[runId];
  if (!run) return Promise.reject(new Error(`Run not found: ${runId}`));
  const review = run.branchReviews[branchId];
  if (!review) return Promise.reject(new Error(`Branch ${branchId} not in run ${runId}`));
  if (review.state !== 'approved') {
    return Promise.reject(new Error('Branch must approve their slice before release'));
  }
  const paidDate = fmtDate(MOCK_NOW);
  (commissionsByRun[runId] || []).forEach((c) => {
    if (c.branchId !== branchId || c.status !== 'in_run') return;
    c.status = 'released';
    c.paidDate = paidDate;
    if (txnRefByAgent && txnRefByAgent[c.agentId]) {
      c.txnRef = txnRefByAgent[c.agentId];
    }
  });
  review.state = 'released';
  review.releasedAt = paidDate;
  review.releasedBy = 'Distributor admin';
  const allReleased = Object.values(run.branchReviews).every((r) => r.state === 'released');
  if (allReleased) {
    run.state = 'released';
    run.releasedAt = paidDate;
    run.releasedBy = 'Distributor admin';
  }
  return Promise.resolve(_legacy_runWithDerivedFields(run));
}

async function _legacy_mock_releaseRun(runId, { txnRefByAgent } = {}) {
  const run = SETTLEMENT_RUNS[runId];
  if (!run) throw new Error(`Run not found: ${runId}`);
  if (run.state !== 'branch_review' && run.state !== 'draft') {
    throw new Error(`Run cannot be released from state: ${run.state}`);
  }
  const approvedBranchIds = Object.entries(run.branchReviews)
    .filter(([, r]) => r.state === 'approved')
    .map(([bid]) => bid);
  if (approvedBranchIds.length === 0) {
    throw new Error('No approved branches to release');
  }
  for (const bid of approvedBranchIds) {
    await _legacy_mock_releaseBranch(runId, bid, { txnRefByAgent });
  }
  return _legacy_runWithDerivedFields(run);
}

function _legacyDetachFromRun(c) {
  if (c.runId && commissionsByRun[c.runId]) {
    commissionsByRun[c.runId] = commissionsByRun[c.runId].filter((x) => x.id !== c.id);
  }
  c.runId = null;
}

function _legacy_mock_disputeCommission(commissionId, reason, by = 'agent') {
  const c = COMMISSIONS[commissionId];
  if (!c) return Promise.resolve(null);
  if (c.status === 'disputed') return Promise.resolve(c);
  if (c.status === 'rejected') return Promise.resolve(null);
  c.previousStatus = c.status;
  if (c.status === 'in_run') _legacyDetachFromRun(c);
  c.status = 'disputed';
  c.disputeReason = reason || 'Dispute raised';
  c.disputedAt = fmtDate(MOCK_NOW);
  c.disputedBy = by;
  c.resolvedAt = null;
  c.resolvedBy = null;
  c.outcomeReason = null;
  return Promise.resolve(c);
}

function _legacy_mock_branchDisputeLine(commissionId, reason) {
  return _legacy_mock_disputeCommission(commissionId, reason, 'branch');
}

function _legacy_mock_withdrawDispute(commissionId) {
  const c = COMMISSIONS[commissionId];
  if (!c) return Promise.resolve(null);
  if (c.status !== 'disputed' || c.resolvedAt) return Promise.resolve(null);
  const prev = c.previousStatus || 'due';
  c.status = prev;
  c.previousStatus = null;
  c.disputeReason = null;
  c.disputedAt = null;
  c.disputedBy = null;
  c.resolvedAt = null;
  c.resolvedBy = null;
  c.outcomeReason = null;
  return Promise.resolve(c);
}

const POST_PAYMENT_STATUSES = new Set(['released', 'confirmed']);

function _legacy_mock_approveDispute(commissionId, { outcomeReason, resolvedBy } = {}) {
  const c = COMMISSIONS[commissionId];
  if (!c || c.status !== 'disputed') return Promise.resolve(null);
  const prev = c.previousStatus;
  if (POST_PAYMENT_STATUSES.has(prev)) {
    c.status = prev;
  } else {
    c.status = 'due';
    c.runId = null;
  }
  c.previousStatus = null;
  c.disputeReason = null;
  c.resolvedAt = fmtDate(MOCK_NOW);
  c.resolvedBy = resolvedBy || 'Distributor admin';
  c.outcomeReason = outcomeReason || null;
  return Promise.resolve(c);
}

function _legacy_mock_rejectDispute(commissionId, { outcomeReason, resolvedBy } = {}) {
  const c = COMMISSIONS[commissionId];
  if (!c || c.status !== 'disputed') return Promise.resolve(null);
  const prev = c.previousStatus;
  if (POST_PAYMENT_STATUSES.has(prev)) {
    c.status = prev;
  } else {
    c.status = 'rejected';
    c.runId = null;
  }
  c.previousStatus = null;
  c.disputeReason = null;
  c.resolvedAt = fmtDate(MOCK_NOW);
  c.resolvedBy = resolvedBy || 'Distributor admin';
  c.outcomeReason = outcomeReason || null;
  return Promise.resolve(c);
}

function _legacy_mock_confirmCommission(commissionId) {
  const c = COMMISSIONS[commissionId];
  if (!c || c.status !== 'released') return Promise.resolve(null);
  c.status = 'confirmed';
  return Promise.resolve(c);
}

function _legacyAggregateRecords(records) {
  let totalPaid = 0, totalDue = 0, totalDisputed = 0;
  let countPaid = 0, countDue = 0, countDisputed = 0;
  for (const c of records) {
    if (isPaid(c)) { totalPaid += c.amount; countPaid++; }
    else if (isOutstanding(c)) { totalDue += c.amount; countDue++; }
    else if (c.status === 'disputed') { totalDisputed += c.amount; countDisputed++; }
  }
  const countTotal = countPaid + countDue + countDisputed;
  return {
    totalPaid, totalDue, totalDisputed,
    countPaid, countDue, countDisputed,
    total: totalPaid + totalDue + totalDisputed,
    countTotal,
    settlementRate: countTotal > 0 ? Math.round((countPaid / countTotal) * 100) : 0,
  };
}

function _legacy_mock_getEntityCommissionSummary(level, entityId) {
  const key = `${level}:${entityId}`;
  if (_summaryCache.has(key)) return Promise.resolve(_summaryCache.get(key));
  let result;
  if (level === 'agent') {
    result = _legacyAggregateRecords(commissionsByAgent[entityId] || []);
  } else if (level === 'branch') {
    result = _legacyAggregateRecords(commissionsByBranch[entityId] || []);
  } else if (level === 'district') {
    const records = Object.values(BRANCHES)
      .filter((b) => b.parentId === entityId)
      .flatMap((b) => commissionsByBranch[b.id] || []);
    result = _legacyAggregateRecords(records);
  } else if (level === 'region') {
    const districtIds = new Set(
      Object.values(DISTRICTS).filter((d) => d.parentId === entityId).map((d) => d.id)
    );
    const records = Object.values(BRANCHES)
      .filter((b) => districtIds.has(b.parentId))
      .flatMap((b) => commissionsByBranch[b.id] || []);
    result = _legacyAggregateRecords(records);
  } else {
    result = _legacyAggregateRecords(Object.values(COMMISSIONS));
  }
  _summaryCache.set(key, result);
  return Promise.resolve(result);
}
