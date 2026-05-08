// Commission service — wraps mockData commission exports.
// When backend is ready, replace with api.get/post calls.

import {
  COMMISSIONS, COMMISSION_CONFIG,
  commissionsByAgent, commissionsByBranch, commissionsByRun,
  AGENTS, BRANCHES, DISTRICTS, SUBSCRIBERS,
  SETTLEMENT_RUNS, runsByBranch,
  MOCK_NOW,
} from '../data/mockData';
import { nextCycleEnd } from '../utils/settlementCycle';

/* ─── Status helpers ─────────────────────────────────────────────────────── */
// `paid` is now a derived bucket spanning released + confirmed (money has
// actually moved). `due` covers everything still outstanding for the agent.
const STATUSES_PAID = new Set(['released', 'confirmed']);
const STATUSES_OUTSTANDING = new Set(['due', 'in_run', 'held']);
const isPaid = (c) => STATUSES_PAID.has(c.status);
const isOutstanding = (c) => STATUSES_OUTSTANDING.has(c.status);

const VALID_CADENCES = new Set(['weekly-friday', 'biweekly-friday', 'monthly-first']);

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ─── Network cadence (distributor-controlled) ─────────────────────────── */

/**
 * @endpoint GET /api/commissions/cadence
 * @returns {Promise<{cadence: string, nextRunDate: string}>}
 * @description Returns the network-wide settlement cadence and the next
 *   scheduled run-open date. Replaces the per-agent localStorage cadence.
 * @cache ['networkCadence']
 * @scope All authenticated roles (read).
 */
export async function getNetworkCadence() {
  return {
    cadence: COMMISSION_CONFIG.cadence,
    nextRunDate: COMMISSION_CONFIG.nextRunDate,
  };
}

/**
 * @endpoint PUT /api/commissions/cadence
 * @param {string} cadence - 'weekly-friday' | 'biweekly-friday' | 'monthly-first'
 * @returns {Promise<{cadence: string, nextRunDate: string}>}
 * @cache Invalidates: ['networkCadence']
 * @scope Distributor only.
 */
export async function setNetworkCadence(cadence) {
  if (!VALID_CADENCES.has(cadence)) {
    throw new Error(`Invalid cadence: ${cadence}`);
  }
  COMMISSION_CONFIG.cadence = cadence;
  COMMISSION_CONFIG.nextRunDate = fmtDate(nextCycleEnd(cadence, MOCK_NOW));
  return getNetworkCadence();
}

/* ─── Commission rate ────────────────────────────────────────────────────── */

/**
 * @endpoint GET /api/commissions/rate
 * @returns {Promise<number>} Current commission rate per subscriber (UGX)
 * @cache ['commissionRate']
 * @scope All authenticated roles (read).
 */
export async function getCommissionRate() {
  return COMMISSION_CONFIG.ratePerSubscriber;
}

/**
 * @endpoint PUT /api/commissions/rate
 * @param {number} amount - New rate in UGX
 * @returns {Promise<number>} The updated rate
 * @cache Invalidates: ['commissionRate']
 * @scope Distributor only.
 */
export async function setCommissionRate(amount) {
  COMMISSION_CONFIG.ratePerSubscriber = amount;
  return amount;
}

/* ─── Summaries ─────────────────────────────────────────────────────────── */

/**
 * @endpoint GET /api/commissions/summary?branchId=:branchId
 * @param {string|null} branchId - Optional branch scope. Null = all commissions.
 * @returns {Promise<Object>} Aggregated totals.
 * @description Aggregated commission totals. `totalPaid` covers released+confirmed
 *   (money has moved). `totalDue` covers due+in_run+held (everything outstanding).
 *   New fine-grained buckets `totalInRun`, `countInRun`, `totalReleased`,
 *   `countReleased` expose run-aware splits for the new dashboards.
 * @cache ['commissionSummary', branchId || 'all']
 * @scope Distributor: all or filtered. Branch: own branch only.
 */
export async function getCommissionSummary(branchId = null) {
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

  return {
    totalCommissions,
    totalPaid: paid.reduce((sum, c) => sum + c.amount, 0),
    totalDue: due.reduce((sum, c) => sum + c.amount, 0),
    totalDisputed: disputed.reduce((sum, c) => sum + c.amount, 0),
    totalInRun: inRun.reduce((sum, c) => sum + c.amount, 0),
    totalReleased: released.reduce((sum, c) => sum + c.amount, 0),
    totalConfirmed: confirmed.reduce((sum, c) => sum + c.amount, 0),
    countTotal: all.length,
    countPaid: paid.length,
    countDue: due.length,
    countDisputed: disputed.length,
    countInRun: inRun.length,
    countReleased: released.length,
    countConfirmed: confirmed.length,
  };
}

/* ─── Agent / subscriber listings ───────────────────────────────────────── */

/**
 * @endpoint GET /api/commissions/agents?status=:statusFocus
 * @param {string|undefined} statusFocus - 'paid' | 'due' | 'disputed' (legacy buckets)
 * @returns {Promise<Array<Object>>}
 * @cache ['agentCommissions', statusFocus || 'all']
 * @scope Distributor: all agents. Branch: own branch's agents.
 */
export async function getAgentCommissionList(statusFocus) {
  const agentIds = Object.keys(commissionsByAgent);
  return agentIds.map((agentId) => {
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
  }).filter((a) => a.subscribersOnboarded > 0);
}

/**
 * @endpoint GET /api/commissions/agents/:agentId
 * @param {string} agentId - Agent ID
 * @returns {Promise<Object>} Agent commission detail
 * @description Detailed commission data for a single agent. `paidTransactions`
 *   includes both `released` and `confirmed` lines. `dueTransactions` covers
 *   anything still outstanding (`due | in_run | held`). Status flag on each
 *   transaction lets the consumer render badges accurately.
 * @cache ['agentCommissionDetail', agentId]
 * @scope Distributor: any agent. Branch: own branch's agents. Agent: own data only.
 */
export async function getAgentCommissionDetail(agentId) {
  const agent = AGENTS[agentId];
  const branch = BRANCHES[agent?.parentId];
  const comms = commissionsByAgent[agentId] || [];

  const paid = comms.filter(isPaid);
  const due = comms.filter(isOutstanding);
  const disputed = comms.filter((c) => c.status === 'disputed');

  return {
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
  };
}

/**
 * @endpoint GET /api/commissions/agents/:agentId/subscribers?filter=:filter
 * @cache ['commissionSubscribers', agentId, filter || 'all']
 * @scope Same as getAgentCommissionDetail.
 */
export async function getCommissionSubscribers(agentId, filter) {
  const comms = commissionsByAgent[agentId] || [];

  let filtered = comms;
  if (filter === 'active') {
    filtered = comms.filter((c) => c.status !== 'disputed' && c.status !== 'rejected');
  } else if (filter === 'dormant') {
    filtered = comms.filter((c) => c.status === 'disputed');
  }

  return filtered.map((c) => {
    const sub = SUBSCRIBERS[c.subscriberId];
    return {
      subscriberId: c.subscriberId,
      subscriberName: c.subscriberName,
      registeredDate: sub?.registeredDate || c.firstContributionDate,
      lastContribution: sub ? sub.contributionHistory[sub.contributionHistory.length - 1] : 0,
      lastContributionDate: sub ? `2026-03-${String(Math.min(28, parseInt(sub.registeredDate.split('-')[2]) + 5)).padStart(2, '0')}` : '',
      totalContributions: sub?.totalContributions || 0,
      isActive: sub?.isActive || false,
    };
  });
}

/**
 * @endpoint GET /api/commissions/disputed
 * @cache ['disputedAgents']
 * @scope Distributor: all. Branch: own branch's agents.
 */
export async function getDisputedAgentList() {
  const agentIds = Object.keys(commissionsByAgent);
  return agentIds.map((agentId) => {
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
  }).filter(Boolean);
}

/* ─── Settlement runs ────────────────────────────────────────────────────── */

function _runWithDerivedFields(run) {
  if (!run) return null;
  const reviews = Object.values(run.branchReviews || {});
  const approvedCount = reviews.filter((r) => r.state === 'approved').length;
  const pendingCount = reviews.filter((r) => r.state === 'pending').length;
  const releasedCount = reviews.filter((r) => r.state === 'released').length;

  // Distinct agents touched by this run + amount currently approved-and-not-yet-released.
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
    // Distributor can release any branch currently in `approved` state.
    canReleaseAny: run.state === 'branch_review' && approvedCount > 0,
  };
}

/**
 * Per-branch amount + line count inside a run. Used by the run-detail table.
 */
export async function getRunBranchBreakdown(runId) {
  const run = SETTLEMENT_RUNS[runId];
  if (!run) return [];
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
  // Make sure every branchReview has a row, even if all its lines are held/disputed.
  Object.keys(run.branchReviews).forEach((bid) => {
    if (!map.has(bid)) {
      map.set(bid, { branchId: bid, count: 0, amount: 0, releasedAmount: 0 });
    }
  });

  return Array.from(map.values()).map((row) => {
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
  }).sort((a, b) => a.branchName.localeCompare(b.branchName));
}

/**
 * Agent-grouped lines for a single branch's slice of a run. Used by the
 * run-branch detail view so the distributor can drill from a branch row into
 * the agent / commission breakdown.
 */
export async function getRunBranchAgents(runId, branchId) {
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
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

/**
 * @endpoint GET /api/runs/current
 * @returns {Promise<Object|null>} Currently open run (if any).
 * @cache ['currentRun']
 */
export async function getCurrentRun() {
  const open = Object.values(SETTLEMENT_RUNS).find(
    (r) => r.state === 'draft' || r.state === 'branch_review'
  );
  return _runWithDerivedFields(open || null);
}

/**
 * @endpoint GET /api/runs/:runId
 * @cache ['settlementRun', runId]
 */
export async function getRunById(runId) {
  return _runWithDerivedFields(SETTLEMENT_RUNS[runId] || null);
}

/**
 * @endpoint GET /api/runs?branchId=:branchId&limit=:limit
 * @param {{ limit?: number, branchId?: string|null }} options
 * @returns {Promise<Array<Object>>} Runs newest-first. If branchId is provided,
 *   only runs that touched that branch are returned.
 * @cache ['settlementRunsList', branchId || 'all']
 */
export async function listRuns({ limit, branchId } = {}) {
  const pool = branchId
    ? (runsByBranch[branchId] || [])
    : Object.values(SETTLEMENT_RUNS);
  const sorted = [...pool].sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || ''));
  const sliced = typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
  return sliced.map(_runWithDerivedFields);
}

/**
 * @endpoint POST /api/runs/open
 * @description Distributor-initiated. Opens a new run that pulls every `due`
 *   commission into it. Initialises a `pending` branchReview row for every
 *   touched branch.
 * @cache Invalidates: ['currentRun'], ['settlementRunsList'], all summaries
 * @scope Distributor only.
 */
export async function openRun() {
  if (await getCurrentRun()) {
    throw new Error('A settlement run is already open');
  }
  const id = `r-${MOCK_NOW.getFullYear()}-${String(MOCK_NOW.getMonth() + 1).padStart(2, '0')}-${Date.now().toString(36).slice(-4)}`;
  const dueLines = Object.values(COMMISSIONS).filter((c) => c.status === 'due');
  if (dueLines.length === 0) {
    throw new Error('No due commissions to bundle into a run');
  }

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
  invalidateSummaryCache();
  return _runWithDerivedFields(run);
}

/**
 * @endpoint POST /api/runs/:runId/cancel
 * @description Aborts an open run. All `in_run` lines fall back to `due`,
 *   `held` lines stay held. Run state → 'cancelled'.
 * @cache Invalidates: ['currentRun'], ['settlementRunsList'], summaries
 * @scope Distributor only.
 */
export async function cancelRun(runId) {
  const run = SETTLEMENT_RUNS[runId];
  if (!run || run.state === 'released' || run.state === 'cancelled') return run;
  (commissionsByRun[runId] || []).forEach((c) => {
    if (c.status === 'in_run') {
      c.status = 'due';
      c.runId = null;
    }
  });
  run.state = 'cancelled';
  invalidateSummaryCache();
  return _runWithDerivedFields(run);
}

/**
 * @endpoint GET /api/runs/:runId/branch/:branchId
 * @returns {Promise<{ run, lines, reviewState }>}
 * @cache ['runForBranch', runId, branchId]
 * @scope Distributor: any. Branch: own branch only.
 */
export async function getRunForBranch(runId, branchId) {
  const run = SETTLEMENT_RUNS[runId];
  if (!run) return null;
  const lines = (commissionsByRun[runId] || []).filter((c) => c.branchId === branchId);
  return {
    run: _runWithDerivedFields(run),
    lines,
    reviewState: run.branchReviews[branchId]?.state || 'pending',
  };
}

/**
 * @endpoint POST /api/commissions/:commissionId/branch-approve
 * @description Branch sign-off on a single line. Re-asserts `in_run` status
 *   if the line was previously held.
 * @scope Branch (own commissions) + Distributor (override).
 */
export async function branchApproveLine(commissionId) {
  const c = COMMISSIONS[commissionId];
  if (!c) return null;
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
  invalidateSummaryCache();
  return c;
}

/**
 * @endpoint POST /api/commissions/:commissionId/branch-hold
 * @param {string} commissionId
 * @param {string} [reason] - Free-text note about why the line was held
 * @description Branch holds a line out of the current run. Falls back to
 *   `held`; the line returns to `due` when the next run opens (the held →
 *   due transition happens at openRun via the filter).
 * @scope Branch (own commissions) + Distributor (override).
 */
export async function branchHoldLine(commissionId, reason) {
  const c = COMMISSIONS[commissionId];
  if (!c || c.status !== 'in_run') return null;
  // Detach from the run
  if (c.runId && commissionsByRun[c.runId]) {
    commissionsByRun[c.runId] = commissionsByRun[c.runId].filter((x) => x.id !== c.id);
  }
  c.status = 'held';
  c.runId = null;
  if (reason) c.holdReason = reason;
  invalidateSummaryCache();
  return c;
}

/**
 * @endpoint POST /api/runs/:runId/branch/:branchId/approve-all
 * @description Approve every pending in_run line for a branch and mark the
 *   branch's review state as `approved`.
 * @scope Branch (own branch only) + Distributor (override).
 */
export async function branchApproveAll(runId, branchId) {
  const run = SETTLEMENT_RUNS[runId];
  if (!run) return null;
  const lines = (commissionsByRun[runId] || []).filter((c) => c.branchId === branchId);
  run.branchReviews[branchId] = {
    state: 'approved',
    reviewedBy: 'Branch admin',
    reviewedAt: fmtDate(MOCK_NOW),
  };
  invalidateSummaryCache();
  return { run: _runWithDerivedFields(run), count: lines.length };
}

/**
 * @endpoint POST /api/runs/:runId/branch/:branchId/sign-off
 * @description Marks the branch row as approved without per-line action.
 *   Useful when the branch has already touched every line individually.
 */
export async function markBranchReviewed(runId, branchId) {
  const run = SETTLEMENT_RUNS[runId];
  if (!run) return null;
  if (!run.branchReviews[branchId]) {
    run.branchReviews[branchId] = { state: 'approved' };
  }
  run.branchReviews[branchId].state = 'approved';
  run.branchReviews[branchId].reviewedBy = 'Branch admin';
  run.branchReviews[branchId].reviewedAt = fmtDate(MOCK_NOW);
  invalidateSummaryCache();
  return _runWithDerivedFields(run);
}

/**
 * @endpoint POST /api/runs/:runId/branch/:branchId/release
 * @description Distributor releases a single branch's slice of a run. The
 *   branch's review state must already be `approved`. Pending or held
 *   branches are unaffected — partial release is a feature: one slow branch
 *   shouldn't gate every other agent's payout.
 *
 *   When every branch in the run reaches `released`, the run as a whole flips
 *   to `released` automatically.
 * @scope Distributor only.
 */
export async function releaseBranch(runId, branchId, { txnRefByAgent } = {}) {
  const run = SETTLEMENT_RUNS[runId];
  if (!run) throw new Error(`Run not found: ${runId}`);
  const review = run.branchReviews[branchId];
  if (!review) throw new Error(`Branch ${branchId} not in run ${runId}`);
  if (review.state !== 'approved') {
    throw new Error('Branch must approve their slice before release');
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

  // If every branch is now released, promote the run.
  const allReleased = Object.values(run.branchReviews).every((r) => r.state === 'released');
  if (allReleased) {
    run.state = 'released';
    run.releasedAt = paidDate;
    run.releasedBy = 'Distributor admin';
  }
  invalidateSummaryCache();
  return _runWithDerivedFields(run);
}

/**
 * @endpoint POST /api/runs/:runId/release
 * @description Bulk version of releaseBranch. Releases every branch currently
 *   in `approved` state. Branches still `pending` are left untouched and the
 *   run stays in `branch_review` until they sign off (or are released later).
 *   Throws if there is no approved branch to release.
 * @scope Distributor only.
 */
export async function releaseRun(runId, { txnRefByAgent } = {}) {
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
    await releaseBranch(runId, bid, { txnRefByAgent });
  }
  return _runWithDerivedFields(run);
}

/* ─── Dispute lifecycle ──────────────────────────────────────────────────── */
// State machine:
//   disputeCommission    → status: previousStatus → 'disputed'  (saves prev)
//   approveDispute       → status: 'disputed' → restored prev (post-payment)
//                                              or 'due'        (pre-payment)
//   rejectDispute        → status: 'disputed' → restored prev (post-payment)
//                                              or 'rejected'   (pre-payment)
//   withdrawDispute      → status: 'disputed' → previousStatus (agent only,
//                                              only while resolvedAt === null)
//
// When previousStatus was `released` or `confirmed` the line had already been
// paid out, so neither approve nor reject should void it — the audit record
// stands either way and the outcomeReason captures what actually happened
// off-ledger (re-issue, proof of payment, etc.).

const POST_PAYMENT_STATUSES = new Set(['released', 'confirmed']);

function _detachFromRun(c) {
  if (c.runId && commissionsByRun[c.runId]) {
    commissionsByRun[c.runId] = commissionsByRun[c.runId].filter((x) => x.id !== c.id);
  }
  c.runId = null;
}

/**
 * @endpoint POST /api/commissions/:commissionId/dispute
 * @description Raise a dispute. Saves the pre-dispute status so it can be
 *   restored later. Only detaches from an open run if the line was `in_run`;
 *   for already-paid lines we keep `runId` + `txnRef` + `paidDate` intact so
 *   the audit trail survives the dispute round-trip.
 * @scope Agent (own) / Branch (own branch).
 */
export async function disputeCommission(commissionId, reason, by = 'agent') {
  const c = COMMISSIONS[commissionId];
  if (!c) return null;
  if (c.status === 'disputed') return c;
  if (c.status === 'rejected') return null;

  c.previousStatus = c.status;
  if (c.status === 'in_run') _detachFromRun(c);

  c.status = 'disputed';
  c.disputeReason = reason || 'Dispute raised';
  c.disputedAt = fmtDate(MOCK_NOW);
  c.disputedBy = by;
  c.resolvedAt = null;
  c.resolvedBy = null;
  c.outcomeReason = null;
  invalidateSummaryCache();
  return c;
}

/**
 * Branch-side dispute raised from the run-review screen. Same semantics as
 * disputeCommission but tagged disputedBy='branch'.
 */
export async function branchDisputeLine(commissionId, reason) {
  return disputeCommission(commissionId, reason, 'branch');
}

/**
 * @endpoint POST /api/commissions/:commissionId/withdraw-dispute
 * @description Agent withdraws their own pending dispute. Allowed only while
 *   the dispute is still untouched by an admin (resolvedAt === null). Restores
 *   the line to whatever it was before the dispute.
 * @scope Agent (own commissions only).
 */
export async function withdrawDispute(commissionId) {
  const c = COMMISSIONS[commissionId];
  if (!c) return null;
  if (c.status !== 'disputed' || c.resolvedAt) return null;

  const prev = c.previousStatus || 'due';
  c.status = prev;
  c.previousStatus = null;
  c.disputeReason = null;
  c.disputedAt = null;
  c.disputedBy = null;
  c.resolvedAt = null;
  c.resolvedBy = null;
  c.outcomeReason = null;
  invalidateSummaryCache();
  return c;
}

/**
 * @endpoint POST /api/commissions/:commissionId/approve-dispute
 * @description Resolve a dispute in the agent's favour.
 *   - Pre-payment dispute (previousStatus was due/in_run/held) → status `due`
 *   - Post-payment dispute (previousStatus was released/confirmed) → restore
 *     the previous status so the payment record stands. The distributor is
 *     expected to re-issue offline; outcomeReason captures what was done.
 * @scope Distributor / Branch Admin (own branch).
 */
export async function approveDispute(commissionId, { outcomeReason, resolvedBy } = {}) {
  const c = COMMISSIONS[commissionId];
  if (!c || c.status !== 'disputed') return null;
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
  invalidateSummaryCache();
  return c;
}

/**
 * @endpoint POST /api/commissions/:commissionId/reject-dispute
 * @description Resolve a dispute against the agent.
 *   - Pre-payment dispute → `rejected` (commission is voided)
 *   - Post-payment dispute → restore previous status. The release record stands
 *     (we have proof of payment); outcomeReason explains the resolution.
 * @scope Distributor / Branch Admin (own branch).
 */
export async function rejectDispute(commissionId, { outcomeReason, resolvedBy } = {}) {
  const c = COMMISSIONS[commissionId];
  if (!c || c.status !== 'disputed') return null;
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
  invalidateSummaryCache();
  return c;
}

export async function bulkApproveDisputes(commissionIds, options) {
  return Promise.all(commissionIds.map((id) => approveDispute(id, options)));
}

export async function bulkRejectDisputes(commissionIds, options) {
  return Promise.all(commissionIds.map((id) => rejectDispute(id, options)));
}

/* ─── Agent-side: confirm receipt ─────────────────────────────────────── */

/**
 * @endpoint POST /api/commissions/:commissionId/confirm
 * @description Agent confirms they received the released payment. Status
 *   transitions `released → confirmed`. No-op for other statuses.
 * @scope Agent (own commissions only).
 */
export async function confirmCommission(commissionId) {
  const c = COMMISSIONS[commissionId];
  if (!c || c.status !== 'released') return null;
  c.status = 'confirmed';
  invalidateSummaryCache();
  return c;
}

/* ─── Entity-level commission aggregation ─────────────────────────────────── */

const _summaryCache = new Map();

export function invalidateSummaryCache() {
  _summaryCache.clear();
}

function aggregateRecords(records) {
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

function computeEntitySummary(level, entityId) {
  if (level === 'agent') {
    return aggregateRecords(commissionsByAgent[entityId] || []);
  }
  if (level === 'branch') {
    return aggregateRecords(commissionsByBranch[entityId] || []);
  }
  if (level === 'district') {
    const records = Object.values(BRANCHES)
      .filter((b) => b.parentId === entityId)
      .flatMap((b) => commissionsByBranch[b.id] || []);
    return aggregateRecords(records);
  }
  if (level === 'region') {
    const districtIds = new Set(
      Object.values(DISTRICTS).filter((d) => d.parentId === entityId).map((d) => d.id)
    );
    const records = Object.values(BRANCHES)
      .filter((b) => districtIds.has(b.parentId))
      .flatMap((b) => commissionsByBranch[b.id] || []);
    return aggregateRecords(records);
  }
  // Country level — all commissions
  return aggregateRecords(Object.values(COMMISSIONS));
}

/**
 * @endpoint GET /api/commissions/entity-summary/:level/:entityId
 * @cache ['entityCommissionSummary', level, entityId]
 * @scope Distributor: any entity. Branch: own branch only.
 */
export async function getEntityCommissionSummary(level, entityId) {
  const key = `${level}:${entityId}`;
  if (_summaryCache.has(key)) return _summaryCache.get(key);
  const result = computeEntitySummary(level, entityId);
  _summaryCache.set(key, result);
  return result;
}
