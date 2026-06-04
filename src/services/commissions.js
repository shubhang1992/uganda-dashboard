// Commission service — Supabase-backed with mock fallback under VITE_USE_SUPABASE=false.
//
// Phase 2 of the commission-flow simplification collapsed the lifecycle to two
// states: `due → paid`. Settlement is now a single distributor action
// (apply_settlement, migration 0031) that stamps an agent's `due` commissions
// `paid`, records a settlement_batches row (0030), and emits notifications.
//
// Reads delegate to the slimmed read RPCs (get_commission_summary,
// get_entity_commission_summary, get_agent_commission_detail re-emitted in
// 0029). Direct SELECTs back the per-agent/per-branch list folds and the
// settlement batches feed.
//
// Hook contracts in src/hooks/useCommission.js are preserved, so the React
// Query layer remains the source of caching.
//
// Rollback strategy: when IS_SUPABASE_ENABLED is false the file falls back to
// mockData-backed implementations. The legacy code lives below the Supabase
// wrappers as `_legacy_mock_*`.

import { supabase } from './supabaseClient';
import { IS_SUPABASE_ENABLED } from './api';
import { createCommissionSettledNotifications } from './notifications';
import {
  COMMISSIONS, COMMISSION_CONFIG,
  commissionsByAgent, commissionsByBranch,
  AGENTS, BRANCHES, DISTRICTS, SUBSCRIBERS,
  SETTLEMENT_BATCHES,
  MOCK_NOW,
} from '../data/mockData';

/* ─── Shared helpers ─────────────────────────────────────────────────────── */

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
    txnRef: row.txn_ref,
    paidAmount: row.paid_amount != null ? Number(row.paid_amount) : null,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * COMMISSION RATE
 * ═══════════════════════════════════════════════════════════════════════════ */

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
  const d = data || {};
  return {
    totalCommissions: Number(d.totalCommissions ?? 0),
    totalPaid: Number(d.totalPaid ?? 0),
    totalDue: Number(d.totalDue ?? 0),
    countTotal: Number(d.countTotal ?? 0),
    countPaid: Number(d.countPaid ?? 0),
    countDue: Number(d.countDue ?? 0),
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
    countPaid: Number(d.countPaid ?? 0),
    countDue: Number(d.countDue ?? 0),
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
 * @description Pull every visible commission row + agents + branches in one
 *   round-trip and fold per-agent in JS.
 * @param {('paid'|'due'|null)} statusFocus
 * @scope RLS: distributor sees everyone; branch sees own branch; agent sees own.
 */
export async function getAgentCommissionList(statusFocus) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getAgentCommissionList(statusFocus);

  const [{ data: commissions, error: cErr }, { data: agents, error: aErr }, { data: branches, error: bErr }] =
    await Promise.all([
      supabase.from('commissions').select(
        'id, agent_id, branch_id, amount, status, paid_date, due_date, txn_ref, paid_amount, subscriber_id, subscriber_name'
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
    if (statusFocus === 'paid') filtered = comms.filter((c) => c.status === 'paid');
    else if (statusFocus === 'due') filtered = comms.filter((c) => c.status === 'due');

    const totalAmount = comms.reduce((s, c) => s + c.amount, 0);
    const paidAmount = comms.filter((c) => c.status === 'paid').reduce((s, c) => s + c.amount, 0);
    const dueAmount = comms.filter((c) => c.status === 'due').reduce((s, c) => s + c.amount, 0);

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
      activeSubscribers: comms.length,
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

  // The RPC already returns the per-line breakdown the UI consumes as
  // `paidTransactions` / `dueTransactions`; no consumer reads a separate raw
  // `commissions` array off this detail, so a second SELECT for those rows was
  // dead weight (one round-trip saved). If a caller ever needs the full raw set
  // here, prefer extending the RPC rather than reintroducing the extra query.
  return {
    ...data,
    totalCommissions: Number(data.totalCommissions ?? 0),
    totalPaid: Number(data.totalPaid ?? 0),
    totalDue: Number(data.totalDue ?? 0),
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
  const rows = commissions || [];

  return rows.map((c) => {
    const sub = subMap.get(c.subscriber_id) || {};
    return {
      subscriberId: c.subscriber_id,
      subscriberName: c.subscriber_name || sub.name || 'Unknown',
      registeredDate: sub.registered_date || c.first_contribution_date,
      lastContribution: 0,           // not surfaced by current schema; left at 0 for backwards-compat
      lastContributionDate: '',      // ditto — CommissionPanel hides the "Last:" line when empty (BL-36)
      totalContributions: Number(sub.total_contributions ?? 0),
      isActive: !!sub.is_active,
    };
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * PENDING DUES — settlement-prep reads
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @endpoint SELECT due commissions joined to agents/branches, folded per agent.
 * @returns {Promise<Array<{agentId, agentName, employeeId, branchId, branchName,
 *   pendingAmount, pendingCount}>>} only agents with pendingCount > 0, sorted by
 *   pendingAmount desc.
 * @cache ['pendingDuesByAgent']
 */
export async function getPendingDuesByAgent() {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getPendingDuesByAgent();

  const [{ data: commissions, error: cErr }, { data: agents, error: aErr }, { data: branches, error: bErr }] =
    await Promise.all([
      supabase.from('commissions').select('agent_id, branch_id, amount, status').eq('status', 'due'),
      supabase.from('agents').select('id, name, employee_id, branch_id'),
      supabase.from('branches').select('id, name'),
    ]);
  if (cErr) throw _rpcError(cErr, 'getPendingDuesByAgent:commissions');
  if (aErr) throw _rpcError(aErr, 'getPendingDuesByAgent:agents');
  if (bErr) throw _rpcError(bErr, 'getPendingDuesByAgent:branches');

  const agentMap = new Map((agents || []).map((a) => [a.id, a]));
  const branchMap = new Map((branches || []).map((b) => [b.id, b]));
  const byAgent = new Map();
  for (const row of commissions || []) {
    if (!byAgent.has(row.agent_id)) byAgent.set(row.agent_id, { amount: 0, count: 0 });
    const entry = byAgent.get(row.agent_id);
    entry.amount += Number(row.amount);
    entry.count += 1;
  }

  const result = [];
  for (const [agentId, agg] of byAgent.entries()) {
    if (agg.count === 0) continue;
    const agent = agentMap.get(agentId) || {};
    const branch = branchMap.get(agent.branch_id) || {};
    result.push({
      agentId,
      agentName: agent.name || 'Unknown',
      employeeId: agent.employee_id || '',
      branchId: agent.branch_id || '',
      branchName: branch.name || 'Unknown',
      pendingAmount: agg.amount,
      pendingCount: agg.count,
    });
  }
  return result.sort((a, b) => b.pendingAmount - a.pendingAmount);
}

/**
 * @endpoint SELECT due commissions joined to branches, folded per branch.
 * @returns {Promise<Array<{branchId, branchName, pendingAmount, pendingCount,
 *   agentCount}>>} only branches with pendingCount > 0, sorted by pendingAmount desc.
 * @cache ['pendingDuesByBranch']
 */
export async function getPendingDuesByBranch() {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getPendingDuesByBranch();

  const [{ data: commissions, error: cErr }, { data: branches, error: bErr }] = await Promise.all([
    supabase.from('commissions').select('agent_id, branch_id, amount, status').eq('status', 'due'),
    supabase.from('branches').select('id, name'),
  ]);
  if (cErr) throw _rpcError(cErr, 'getPendingDuesByBranch:commissions');
  if (bErr) throw _rpcError(bErr, 'getPendingDuesByBranch:branches');

  const branchMap = new Map((branches || []).map((b) => [b.id, b]));
  const byBranch = new Map();
  for (const row of commissions || []) {
    if (!byBranch.has(row.branch_id)) {
      byBranch.set(row.branch_id, { amount: 0, count: 0, agents: new Set() });
    }
    const entry = byBranch.get(row.branch_id);
    entry.amount += Number(row.amount);
    entry.count += 1;
    if (row.agent_id) entry.agents.add(row.agent_id);
  }

  const result = [];
  for (const [branchId, agg] of byBranch.entries()) {
    if (agg.count === 0) continue;
    const branch = branchMap.get(branchId) || {};
    result.push({
      branchId,
      branchName: branch.name || 'Unknown',
      pendingAmount: agg.amount,
      pendingCount: agg.count,
      agentCount: agg.agents.size,
    });
  }
  return result.sort((a, b) => b.pendingAmount - a.pendingAmount);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SETTLEMENT — write + batches feed
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @endpoint RPC apply_settlement(p_rows jsonb, p_nonce text)
 * @scope Distributor only.
 * @description Stamps each agent's `due` commissions `paid` FIFO (oldest-first)
 *   up to the entered Amount Paid, records a `settlement_batches` row, and emits
 *   notifications. INFORM-NOT-BLOCK partial semantics: when the entered amount
 *   is less than the agent's due total, only the lines the amount fully covers
 *   are settled — the remainder stays genuinely `due` (BL-1/BL-2). `paid_amount`
 *   is allocated per line (the line's own amount), so summing per-line
 *   `paid_amount` reconciles with `settlement_batches.paid_amount`.
 * @param {{ rows: Array<{agentId, amountPaid, paymentRef, paymentDate}>, nonce?: string }} params
 *   `nonce` is a per-upload idempotency key (BL-13) — a re-submit / reload /
 *   second-tab replay with the same nonce returns the original result without
 *   re-recording batches or re-notifying.
 * @returns {Promise<{agentsSettled, linesSettled, totalPaid,
 *   skipped: Array<{agentId, reason}>}>}
 */
export async function applySettlementUpload({ rows, nonce } = {}) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_applySettlementUpload(rows, nonce);
  const { data, error } = await supabase.rpc('apply_settlement', {
    p_rows: rows,
    p_nonce: nonce ?? null,
  });
  if (error) throw _rpcError(error, 'apply_settlement');
  return data;
}

/**
 * @endpoint SELECT settlement_batches (+ agent/branch names), newest first.
 * @param {{ limit?: number, branchId?: string, agentId?: string }} [opts]
 *   `agentId` narrows the feed to a single agent's batches. In LIVE mode RLS
 *   already scopes `settlement_batches` to the caller, but this explicit filter
 *   also lets the agent page surface only its OWN batches in MOCK mode (where
 *   there is no RLS) — see `_legacy_mock_listSettlements`.
 * @returns {Promise<Array<{id, agentId, agentName, branchId, branchName,
 *   pendingTotal, paidAmount, txnRef, paidDate, lineCount, createdAt}>>}
 * @cache ['settlementsList', branchId, agentId, limit]
 */
export async function listSettlements({ limit, branchId, agentId } = {}) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_listSettlements({ limit, branchId, agentId });

  let q = supabase
    .from('settlement_batches')
    .select('id, agent_id, branch_id, pending_total, paid_amount, txn_ref, paid_date, line_count, created_at')
    .order('created_at', { ascending: false });
  if (branchId) q = q.eq('branch_id', branchId);
  if (agentId) q = q.eq('agent_id', agentId);
  if (typeof limit === 'number') q = q.limit(limit);
  const { data: batches, error: bErr } = await q;
  if (bErr) throw _rpcError(bErr, 'listSettlements:batches');
  if (!batches || batches.length === 0) return [];

  const agentIds = Array.from(new Set(batches.map((b) => b.agent_id).filter(Boolean)));
  const branchIds = Array.from(new Set(batches.map((b) => b.branch_id).filter(Boolean)));
  const [{ data: agents, error: aErr }, { data: branches, error: brErr }] = await Promise.all([
    agentIds.length
      ? supabase.from('agents').select('id, name').in('id', agentIds)
      : Promise.resolve({ data: [], error: null }),
    branchIds.length
      ? supabase.from('branches').select('id, name').in('id', branchIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (aErr) throw _rpcError(aErr, 'listSettlements:agents');
  if (brErr) throw _rpcError(brErr, 'listSettlements:branches');

  const agentMap = new Map((agents || []).map((a) => [a.id, a]));
  const branchMap = new Map((branches || []).map((b) => [b.id, b]));

  return batches.map((b) => ({
    id: b.id,
    agentId: b.agent_id,
    agentName: agentMap.get(b.agent_id)?.name || 'Unknown',
    branchId: b.branch_id,
    branchName: branchMap.get(b.branch_id)?.name || 'Unknown',
    pendingTotal: Number(b.pending_total ?? 0),
    paidAmount: Number(b.paid_amount ?? 0),
    txnRef: b.txn_ref,
    paidDate: b.paid_date,
    lineCount: Number(b.line_count ?? 0),
    createdAt: b.created_at,
  }));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * LEGACY MOCK IMPLEMENTATIONS — used under IS_SUPABASE_ENABLED=false
 * ═══════════════════════════════════════════════════════════════════════════ */

// Session-mutable settlement batches store: clone the seed so settlements
// persist for the session without freezing/mutating the shared mockData export.
const _mockBatches = (SETTLEMENT_BATCHES || []).map((b) => ({ ...b }));

// Idempotency ledger (BL-13): per-upload nonce → the result returned the first
// time it was processed. A SEQUENTIAL re-submit / reload / second-tab replay
// with the same nonce returns the original result without re-recording batches
// or notifying. Mirrors the server-side settlement_uploads ledger added in
// migration 0032 — which likewise covers the sequential-replay case; true
// concurrency on the server is handled by the FOR UPDATE row lock on the due
// lines, not the ledger (n/a here: this mock branch is single-threaded JS).
const _mockSettlementNonces = new Map();

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
  const paid = all.filter((c) => c.status === 'paid');
  const due = all.filter((c) => c.status === 'due');
  return Promise.resolve({
    totalCommissions,
    totalPaid: paid.reduce((s, c) => s + c.amount, 0),
    totalDue: due.reduce((s, c) => s + c.amount, 0),
    countTotal: all.length,
    countPaid: paid.length,
    countDue: due.length,
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
        if (statusFocus === 'paid') filtered = comms.filter((c) => c.status === 'paid');
        else if (statusFocus === 'due') filtered = comms.filter((c) => c.status === 'due');
        const totalAmount = comms.reduce((s, c) => s + c.amount, 0);
        const paidAmount = comms.filter((c) => c.status === 'paid').reduce((s, c) => s + c.amount, 0);
        const dueAmount = comms.filter((c) => c.status === 'due').reduce((s, c) => s + c.amount, 0);
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
          activeSubscribers: comms.length,
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
  const paid = comms.filter((c) => c.status === 'paid');
  const due = comms.filter((c) => c.status === 'due');
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
    activeSubscribers: comms.length,
    dormantSubscribers: 0,
    paidTransactions: paid.map((c) => ({
      id: c.id,
      transactionDate: c.paidDate,
      amount: c.amount,
      paidAmount: c.paidAmount,
      status: c.status,
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
  if (filter === 'active' || filter === 'dormant') {
    // No dormant concept survives the collapse; both filters return the full set.
    filtered = comms;
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

function _legacy_mock_getPendingDuesByAgent() {
  const result = [];
  for (const agentId of Object.keys(commissionsByAgent)) {
    const due = (commissionsByAgent[agentId] || []).filter((c) => c.status === 'due');
    if (due.length === 0) continue;
    const agent = AGENTS[agentId];
    const branch = BRANCHES[agent?.parentId];
    result.push({
      agentId,
      agentName: agent?.name || 'Unknown',
      employeeId: agent?.employeeId || '',
      branchId: agent?.parentId || '',
      branchName: branch?.name || 'Unknown',
      pendingAmount: due.reduce((s, c) => s + c.amount, 0),
      pendingCount: due.length,
    });
  }
  return Promise.resolve(result.sort((a, b) => b.pendingAmount - a.pendingAmount));
}

function _legacy_mock_getPendingDuesByBranch() {
  const result = [];
  for (const branchId of Object.keys(commissionsByBranch)) {
    const due = (commissionsByBranch[branchId] || []).filter((c) => c.status === 'due');
    if (due.length === 0) continue;
    const agents = new Set(due.map((c) => c.agentId).filter(Boolean));
    const branch = BRANCHES[branchId];
    result.push({
      branchId,
      branchName: branch?.name || 'Unknown',
      pendingAmount: due.reduce((s, c) => s + c.amount, 0),
      pendingCount: due.length,
      agentCount: agents.size,
    });
  }
  return Promise.resolve(result.sort((a, b) => b.pendingAmount - a.pendingAmount));
}

function _legacy_mock_applySettlementUpload(rows, nonce) {
  // Idempotency short-circuit (BL-13): replay the prior result for a seen nonce.
  if (nonce != null && nonce !== '' && _mockSettlementNonces.has(nonce)) {
    return Promise.resolve(_mockSettlementNonces.get(nonce));
  }

  const today = fmtDate(MOCK_NOW);
  const skipped = [];
  let agentsSettled = 0;
  let linesSettled = 0;
  let totalPaid = 0;

  for (const row of rows || []) {
    const agentId = row?.agentId;
    if (!agentId) {
      skipped.push({ agentId: agentId ?? null, reason: 'missing_agent_id' });
      continue;
    }
    const dueLines = (commissionsByAgent[agentId] || []).filter((c) => c.status === 'due');
    if (dueLines.length === 0) {
      skipped.push({ agentId, reason: 'no_due' });
      continue;
    }

    // Round to whole UGX at the boundary (BL-8) — defence-in-depth even though
    // the upload normalizer already rounds via the canonical parseAmount.
    const amountPaid = Math.round(Number(row.amountPaid ?? 0));
    const paymentRef = row.paymentRef ?? null;
    const paidDate = row.paymentDate || today;
    const pendingTotal = dueLines.reduce((s, c) => s + c.amount, 0);

    // FIFO allocation (BL-1/BL-2): settle the oldest due lines first, stamping
    // each settled line with its OWN amount as paid_amount (not the batch
    // total). When the entered amount can't cover the next line in full, stop —
    // the remaining lines stay genuinely `due` (INFORM-NOT-BLOCK: a partial
    // payment settles only what it covers; it does NOT clear unpaid lines).
    //
    // >>> PRODUCT-OWNER DECISION (confirmed 2026-05-31) <<<
    // FIFO inform-not-block is CONFIRMED: settle the oldest due lines fully
    // covered by the paid amount; uncovered lines stay Outstanding; the agent
    // is informed via the partial-settlement banner + a support mailto (no hard
    // block). This is the settled semantics — keep this FIFO loop as-is.
    // (If this is ever reversed to "any payment clears ALL the agent's due
    // lines" / all-or-nothing per agent, replace this loop with: settle every
    // line in `ordered`, set settledTotal = pendingTotal. One-line change here
    // + the matching branch in migration 0032's apply_settlement.)
    const ordered = [...dueLines].sort((a, b) => {
      const da = a.dueDate || '';
      const db = b.dueDate || '';
      if (da !== db) return da.localeCompare(db);
      return (a.id || '').localeCompare(b.id || '');
    });

    let remaining = amountPaid;
    let settledCount = 0;
    let settledTotal = 0;
    for (const c of ordered) {
      if (remaining < c.amount) break; // can't cover this line in full — leave it due
      c.status = 'paid';
      c.paidDate = paidDate;
      c.txnRef = paymentRef;
      c.paidAmount = c.amount; // per-line own amount, reconciles with the batch
      remaining -= c.amount;
      settledCount += 1;
      settledTotal += c.amount;
    }

    // The entered amount covered no full line (e.g. paid < the cheapest due
    // line): nothing settles, surface it as a skip so the distributor sees why.
    if (settledCount === 0) {
      skipped.push({ agentId, reason: 'amount_too_low' });
      continue;
    }

    // Record the settlement batch in the session-mutable store. paid_amount is
    // the actually-allocated total (= sum of settled lines), so it reconciles
    // with SUM(paid_amount) across the settled commission lines.
    const branchId = AGENTS[agentId]?.parentId || null;
    const batchId = `sb-${MOCK_NOW.getFullYear()}-${Date.now().toString(36)}-${agentId}`;
    _mockBatches.unshift({
      id: batchId,
      agentId,
      branchId,
      pendingTotal,
      paidAmount: settledTotal,
      txnRef: paymentRef,
      paidDate,
      lineCount: settledCount,
      createdAt: new Date().toISOString(),
    });

    // Emit the "Commission settled" in-app notifications for the agent (and
    // their branch, if any). Mirrors the apply_settlement RPC's server-side
    // INSERTs; in mock mode the notifications service stores them in-memory.
    createCommissionSettledNotifications({
      agentId,
      branchId,
      amount: settledTotal,
      lineCount: settledCount,
      refId: batchId,
    });

    agentsSettled += 1;
    linesSettled += settledCount;
    totalPaid += settledTotal;
  }

  const result = { agentsSettled, linesSettled, totalPaid, skipped };
  if (nonce != null && nonce !== '') _mockSettlementNonces.set(nonce, result);
  return Promise.resolve(result);
}

function _legacy_mock_listSettlements({ limit, branchId, agentId } = {}) {
  let pool = _mockBatches;
  if (branchId) pool = pool.filter((b) => b.branchId === branchId);
  // No RLS in mock mode, so honor an explicit agentId filter — without it the
  // agent CommissionsPage (which has no branch scope) would otherwise see every
  // agent's batches and could surface another agent's partial-settlement
  // mismatch banner. LIVE mode relies on RLS; this keeps mock mode equivalent.
  if (agentId) pool = pool.filter((b) => b.agentId === agentId);
  const sorted = [...pool].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const sliced = typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
  return Promise.resolve(
    sliced.map((b) => {
      const agent = AGENTS[b.agentId];
      const branch = BRANCHES[b.branchId];
      return {
        id: b.id,
        agentId: b.agentId,
        agentName: agent?.name || 'Unknown',
        branchId: b.branchId,
        branchName: branch?.name || 'Unknown',
        pendingTotal: b.pendingTotal,
        paidAmount: b.paidAmount,
        txnRef: b.txnRef,
        paidDate: b.paidDate,
        lineCount: b.lineCount,
        createdAt: b.createdAt,
      };
    })
  );
}

function _legacyAggregateRecords(records) {
  let totalPaid = 0, totalDue = 0;
  let countPaid = 0, countDue = 0;
  for (const c of records) {
    if (c.status === 'paid') { totalPaid += c.amount; countPaid++; }
    else if (c.status === 'due') { totalDue += c.amount; countDue++; }
  }
  const countTotal = countPaid + countDue;
  return {
    totalPaid, totalDue,
    countPaid, countDue,
    total: totalPaid + totalDue,
    countTotal,
    settlementRate: countTotal > 0 ? Math.round((countPaid / countTotal) * 100) : 0,
  };
}

function _legacy_mock_getEntityCommissionSummary(level, entityId) {
  if (level === 'agent') {
    return Promise.resolve(_legacyAggregateRecords(commissionsByAgent[entityId] || []));
  }
  if (level === 'branch') {
    return Promise.resolve(_legacyAggregateRecords(commissionsByBranch[entityId] || []));
  }
  if (level === 'district') {
    const records = Object.values(BRANCHES)
      .filter((b) => b.parentId === entityId)
      .flatMap((b) => commissionsByBranch[b.id] || []);
    return Promise.resolve(_legacyAggregateRecords(records));
  }
  if (level === 'region') {
    const districtIds = new Set(
      Object.values(DISTRICTS).filter((d) => d.parentId === entityId).map((d) => d.id)
    );
    const records = Object.values(BRANCHES)
      .filter((b) => districtIds.has(b.parentId))
      .flatMap((b) => commissionsByBranch[b.id] || []);
    return Promise.resolve(_legacyAggregateRecords(records));
  }
  return Promise.resolve(_legacyAggregateRecords(Object.values(COMMISSIONS)));
}
