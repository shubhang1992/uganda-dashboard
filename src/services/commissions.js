// Commission service — wraps mockData commission exports.
// When backend is ready, replace with api.get/post calls.

import {
  COMMISSIONS, COMMISSION_CONFIG,
  commissionsByAgent, commissionsByBranch,
  AGENTS, BRANCHES, DISTRICTS, SUBSCRIBERS,
} from '../data/mockData';

/**
 * @endpoint GET /api/commissions/rate
 * @returns {Promise<number>} Current commission rate per subscriber (UGX)
 * @description Returns the system-wide commission rate. Currently a flat fee per
 *   subscriber's first contribution.
 * @cache ['commissionRate']
 * @scope All authenticated roles (read-only for most).
 */
export async function getCommissionRate() {
  return COMMISSION_CONFIG.ratePerSubscriber;
}

/**
 * @endpoint PUT /api/commissions/rate
 * @param {number} amount - New rate in UGX
 * @returns {Promise<number>} The updated rate
 * @description Updates the commission rate. UNCLEAR — confirm: should this apply
 *   retroactively to existing "due" commissions, or only to new ones?
 * @cache Invalidates: ['commissionRate']
 * @scope Distributor only.
 */
export async function setCommissionRate(amount) {
  COMMISSION_CONFIG.ratePerSubscriber = amount;
  return amount;
}

/**
 * @endpoint GET /api/commissions/summary?branchId=:branchId
 * @param {string|null} branchId - Optional branch scope. Null = all commissions.
 * @returns {Promise<{totalCommissions: number, totalPaid: number, totalDue: number, totalDisputed: number, totalRequested: number, countTotal: number, countPaid: number, countDue: number, countDisputed: number, countRequested: number}>}
 * @description Aggregated commission totals. Used by CommissionPanel home view.
 * @cache ['commissionSummary', branchId || 'all']
 * @scope Distributor: all or filtered. Branch: own branch only.
 */
export async function getCommissionSummary(branchId = null) {
  const all = branchId
    ? (commissionsByBranch[branchId] || [])
    : Object.values(COMMISSIONS);
  const totalCommissions = all.reduce((sum, c) => sum + c.amount, 0);
  const paid = all.filter((c) => c.status === 'paid');
  const due = all.filter((c) => c.status === 'due');
  const disputed = all.filter((c) => c.status === 'disputed');

  const requested = all.filter((c) => c.settlementRequested);

  return {
    totalCommissions,
    totalPaid: paid.reduce((sum, c) => sum + c.amount, 0),
    totalDue: due.reduce((sum, c) => sum + c.amount, 0),
    totalDisputed: disputed.reduce((sum, c) => sum + c.amount, 0),
    totalRequested: requested.reduce((sum, c) => sum + c.amount, 0),
    countTotal: all.length,
    countPaid: paid.length,
    countDue: due.length,
    countDisputed: disputed.length,
    countRequested: requested.length,
  };
}

/**
 * @endpoint GET /api/commissions/agents?status=:statusFocus
 * @param {string|undefined} statusFocus - Optional status filter (paid|due|disputed)
 * @returns {Promise<Array<{agentId: string, agentName: string, branchId: string, branchName: string, totalCommissions: number, totalPaid: number, totalDue: number, subscribersOnboarded: number, activeSubscribers: number, filteredAmount: number, filteredCount: number}>>}
 * @description Lists agents with their commission aggregates. Used by CommissionPanel
 *   agents view. Supports filtering by commission status.
 * @cache ['agentCommissions', statusFocus || 'all']
 * @scope Distributor: all agents. Branch: own branch's agents.
 */
export async function getAgentCommissionList(statusFocus) {
  const agentIds = Object.keys(commissionsByAgent);
  return agentIds.map((agentId) => {
    const agent = AGENTS[agentId];
    const branch = BRANCHES[agent?.parentId];
    const comms = commissionsByAgent[agentId] || [];
    const filtered = statusFocus ? comms.filter((c) => c.status === statusFocus) : comms;

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
      activeSubscribers: comms.filter((c) => c.status === 'paid' || c.status === 'due').length,
      filteredAmount: filtered.reduce((s, c) => s + c.amount, 0),
      filteredCount: filtered.length,
    };
  }).filter((a) => a.subscribersOnboarded > 0);
}

/**
 * @endpoint GET /api/commissions/agents/:agentId
 * @param {string} agentId - Agent ID
 * @returns {Promise<{agentId: string, agentName: string, agentPhone: string, branchId: string, branchName: string, rating: number, totalCommissions: number, totalPaid: number, totalDue: number, subscribersOnboarded: number, activeSubscribers: number, dormantSubscribers: number, paidTransactions: Array, dueTransactions: Array, commissions: Array}>}
 * @description Detailed commission data for a single agent including transaction lists.
 *   `dueTransactions` includes `daysToDate` (days until/since due date).
 * @cache ['agentCommissionDetail', agentId]
 * @scope Distributor: any agent. Branch: own branch's agents. Agent: own data only.
 */
export async function getAgentCommissionDetail(agentId) {
  const agent = AGENTS[agentId];
  const branch = BRANCHES[agent?.parentId];
  const comms = commissionsByAgent[agentId] || [];

  const paid = comms.filter((c) => c.status === 'paid');
  const due = comms.filter((c) => c.status === 'due');
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
    activeSubscribers: comms.filter((c) => {
      // Check if subscriber is active via imported data
      return c.status !== 'disputed';
    }).length,
    dormantSubscribers: disputed.length,
    paidTransactions: paid.map((c) => ({
      id: c.id,
      transactionDate: c.paidDate,
      amount: c.amount,
      agentConfirmed: c.agentConfirmed,
      subscriberId: c.subscriberId,
      subscriberName: c.subscriberName,
    })),
    dueTransactions: due.map((c) => {
      const dueDate = new Date(c.dueDate);
      const now = new Date(2026, 3, 8);
      const daysToDate = Math.ceil((dueDate - now) / 86400000);
      return {
        id: c.id,
        dueDate: c.dueDate,
        daysToDate,
        amount: c.amount,
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
 * @param {string} agentId - Agent ID
 * @param {string} [filter] - 'active' | 'dormant' | undefined (all)
 * @returns {Promise<Array<{subscriberId: string, subscriberName: string, registeredDate: string, lastContribution: number, lastContributionDate: string, totalContributions: number, isActive: boolean}>>}
 * @description Lists subscribers linked to an agent's commissions, with contribution data.
 * @cache ['commissionSubscribers', agentId, filter || 'all']
 * @scope Same as getAgentCommissionDetail.
 */
export async function getCommissionSubscribers(agentId, filter) {
  const comms = commissionsByAgent[agentId] || [];

  let filtered = comms;
  if (filter === 'active') {
    filtered = comms.filter((c) => c.status === 'paid' || c.status === 'due');
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
 * @returns {Promise<Array<{agentId: string, agentName: string, branchId: string, branchName: string, disputedCount: number, disputedAmount: number, disputes: Array<{id: string, subscriberId: string, subscriberName: string, amount: number, dueDate: string, reason: string}>}>>}
 * @description Lists agents who have disputed commissions, with dispute details.
 *   Used by CommissionPanel's "Needs Attention" section.
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
      })),
    };
  }).filter(Boolean);
}

/**
 * @endpoint GET /api/commissions/settlement-requests
 * @returns {Promise<Array<{agentId: string, agentName: string, branchId: string, branchName: string, requestedCount: number, requestedAmount: number, requests: Array<{id: string, subscriberId: string, subscriberName: string, amount: number, dueDate: string}>}>>}
 * @description Lists agents who have flagged commissions for settlement.
 * @cache ['settlementRequests']
 * @scope Distributor: all. Branch: own branch's agents.
 */
export async function getSettlementRequestList() {
  const agentIds = Object.keys(commissionsByAgent);
  return agentIds.map((agentId) => {
    const agent = AGENTS[agentId];
    const branch = BRANCHES[agent?.parentId];
    const comms = commissionsByAgent[agentId] || [];
    const requested = comms.filter((c) => c.settlementRequested);
    if (requested.length === 0) return null;

    return {
      agentId,
      agentName: agent?.name || 'Unknown',
      employeeId: agent?.employeeId || '',
      branchId: agent?.parentId || '',
      branchName: branch?.name || 'Unknown',
      requestedCount: requested.length,
      requestedAmount: requested.reduce((s, c) => s + c.amount, 0),
      requests: requested.map((c) => ({
        id: c.id,
        subscriberId: c.subscriberId,
        subscriberName: c.subscriberName,
        amount: c.amount,
        dueDate: c.dueDate,
      })),
    };
  }).filter(Boolean);
}

/**
 * @endpoint POST /api/commissions/:commissionId/approve
 * @param {string} commissionId - Commission to approve
 * @returns {Promise<Object>} Updated commission (status → 'due', disputeReason → null)
 * @description Resolves a disputed commission by moving it back to 'due' status.
 * @cache Invalidates: all commission query keys
 * @scope Distributor and Branch Admin.
 */
export async function approveCommission(commissionId) {
  const c = COMMISSIONS[commissionId];
  if (!c) return null;
  c.status = 'due';
  c.disputeReason = null;
  invalidateSummaryCache();
  return c;
}

/**
 * @endpoint POST /api/commissions/:commissionId/reject
 * @param {string} commissionId - Commission to reject
 * @returns {Promise<Object>} Updated commission (status → 'rejected', settlementRequested → false)
 * @description Voids a commission permanently. The agent will not be paid.
 * @cache Invalidates: all commission query keys
 * @scope Distributor and Branch Admin.
 */
export async function rejectCommission(commissionId) {
  const c = COMMISSIONS[commissionId];
  if (!c) return null;
  c.status = 'rejected';
  c.settlementRequested = false;
  invalidateSummaryCache();
  return c;
}

/**
 * @endpoint POST /api/commissions/bulk-approve
 * @param {string[]} commissionIds - Array of commission IDs to approve
 * @returns {Promise<Array<Object>>} Array of updated commissions
 * @description Approves multiple disputed commissions at once.
 * @cache Invalidates: all commission query keys
 * @scope Distributor and Branch Admin.
 */
export async function bulkApproveCommissions(commissionIds) {
  return Promise.all(commissionIds.map(approveCommission));
}

/**
 * @endpoint POST /api/commissions/bulk-reject
 * @param {string[]} commissionIds - Array of commission IDs to reject
 * @returns {Promise<Array<Object>>} Array of updated commissions
 * @description Rejects multiple commissions at once.
 * @cache Invalidates: all commission query keys
 * @scope Distributor and Branch Admin.
 */
export async function bulkRejectCommissions(commissionIds) {
  return Promise.all(commissionIds.map(rejectCommission));
}

/**
 * @endpoint POST /api/commissions/settle
 * @param {string[]} commissionIds - Array of due commission IDs to settle
 * @returns {Promise<{settled: number, paidDate: string}>} Count of settled commissions and payment date
 * @description Marks due commissions as paid. Sets paidDate and agentConfirmed=false
 *   (pending agent confirmation).
 * @cache Invalidates: ['commissionSummary'], ['agentCommissions'], ['agentCommissionDetail']
 * @scope Distributor and Branch Admin.
 */
export async function settleCommissions(commissionIds) {
  const now = new Date(2026, 3, 8);
  const paidDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  commissionIds.forEach((id) => {
    const c = COMMISSIONS[id];
    if (c && c.status === 'due') {
      c.status = 'paid';
      c.paidDate = paidDate;
      c.agentConfirmed = false; // pending agent confirmation
    }
  });

  invalidateSummaryCache();
  return { settled: commissionIds.length, paidDate };
}

/**
 * @endpoint POST /api/commissions/agents/:agentId/settle
 * @param {string} agentId - Agent whose due commissions to settle
 * @returns {Promise<{settled: number, paidDate: string}>}
 * @description Settles all due commissions for a single agent.
 * @cache Invalidates: ['commissionSummary'], ['agentCommissions'], ['agentCommissionDetail']
 * @scope Distributor and Branch Admin.
 */
export async function settleAgentCommissions(agentId) {
  const comms = commissionsByAgent[agentId] || [];
  const dueIds = comms.filter((c) => c.status === 'due').map((c) => c.id);
  return settleCommissions(dueIds);
}

/* ─── Entity-level commission aggregation ─────────────────────────────────── */

const _summaryCache = new Map();

/**
 * @description Clears the entity-level commission summary memo cache.
 *   Called internally after any mutation. Not an API endpoint.
 */
export function invalidateSummaryCache() {
  _summaryCache.clear();
}

function aggregateRecords(records) {
  let totalPaid = 0, totalDue = 0, totalDisputed = 0;
  let countPaid = 0, countDue = 0, countDisputed = 0;
  for (const c of records) {
    if (c.status === 'paid') { totalPaid += c.amount; countPaid++; }
    else if (c.status === 'due') { totalDue += c.amount; countDue++; }
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
 * @param {string} level - Hierarchy level (country|region|district|branch|agent)
 * @param {string} entityId - Entity ID (or 'ug' for country)
 * @returns {Promise<{totalPaid: number, totalDue: number, totalDisputed: number, countPaid: number, countDue: number, countDisputed: number, total: number, countTotal: number, settlementRate: number}>}
 * @description Commission summary aggregated for any entity in the hierarchy. Memoized.
 *   Used by OverlayPanel and BranchOverview for commission overview cards.
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

/**
 * @endpoint POST /api/commissions/settle-all?branchId=:branchId
 * @param {string|null} branchId - Optional branch scope. Null = all due commissions.
 * @returns {Promise<{settled: number, paidDate: string}>}
 * @description Settles every due commission, optionally scoped to a branch.
 * @cache Invalidates: ['commissionSummary'], ['agentCommissions'], ['agentCommissionDetail']
 * @scope Distributor: all or scoped. Branch: own branch only.
 */
export async function settleAllCommissions(branchId = null) {
  const pool = branchId
    ? (commissionsByBranch[branchId] || [])
    : Object.values(COMMISSIONS);
  const dueIds = pool.filter((c) => c.status === 'due').map((c) => c.id);
  return settleCommissions(dueIds);
}
