// Commission service — wraps mockData commission exports.
// When backend is ready, replace with api.get/post calls.

import {
  COMMISSIONS, COMMISSION_CONFIG,
  commissionsByAgent, commissionsByBranch,
  AGENTS, BRANCHES, SUBSCRIBERS,
} from '../data/mockData';

/** Get the current commission rate */
export async function getCommissionRate() {
  return COMMISSION_CONFIG.ratePerSubscriber;
}

/** Set the commission rate (mock — mutates in memory) */
export async function setCommissionRate(amount) {
  COMMISSION_CONFIG.ratePerSubscriber = amount;
  return amount;
}

/** Summary totals across all commissions */
export async function getCommissionSummary() {
  const all = Object.values(COMMISSIONS);
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

/** Get agent-level commission aggregates, optionally filtered by status focus */
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

/** Get detailed commissions for a single agent */
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

/** Get subscribers for an agent's commissions, optionally filtered */
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

/** Get agents with disputed commissions */
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

/** Get agents with settlement requests (due commissions flagged by agent) */
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

/** Approve a disputed commission — moves it back to 'due' so it can be settled */
export async function approveCommission(commissionId) {
  const c = COMMISSIONS[commissionId];
  if (!c) return null;
  c.status = 'due';
  c.disputeReason = null;
  return c;
}

/** Reject a commission — marks it as 'rejected' (voided, will not be paid) */
export async function rejectCommission(commissionId) {
  const c = COMMISSIONS[commissionId];
  if (!c) return null;
  c.status = 'rejected';
  c.settlementRequested = false;
  return c;
}

/** Bulk approve — approve multiple commissions at once */
export async function bulkApproveCommissions(commissionIds) {
  return Promise.all(commissionIds.map(approveCommission));
}

/** Bulk reject — reject multiple commissions at once */
export async function bulkRejectCommissions(commissionIds) {
  return Promise.all(commissionIds.map(rejectCommission));
}

/** Settle commissions — mark due commissions as paid */
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

  return { settled: commissionIds.length, paidDate };
}

/** Settle all due commissions for an agent */
export async function settleAgentCommissions(agentId) {
  const comms = commissionsByAgent[agentId] || [];
  const dueIds = comms.filter((c) => c.status === 'due').map((c) => c.id);
  return settleCommissions(dueIds);
}

/** Settle all due commissions globally */
export async function settleAllCommissions() {
  const dueIds = Object.values(COMMISSIONS)
    .filter((c) => c.status === 'due')
    .map((c) => c.id);
  return settleCommissions(dueIds);
}
