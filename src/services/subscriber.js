// Subscriber data service — read/write for the Subscriber dashboard.
// Only file (beside entities.js) that touches mockData for subscriber details.
// When backend is ready, swap these implementations for api.get()/api.post() calls.

import { SUBSCRIBERS } from '../data/mockData';

/** In-memory mutation store (per session). Keyed by subscriber ID. Holds
    additive records created from the dashboard so the UI updates optimistically
    without mutating the frozen mock data. */
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
 * Returns the current subscriber. Looks up by auth phone; falls back to the
 * first available subscriber in the mock map so the dashboard is always
 * populated in prototype mode.
 */
export async function getCurrentSubscriber(phone) {
  const list = Object.values(SUBSCRIBERS);
  if (!list.length) return null;
  if (phone) {
    const match = list.find((s) => s.phone?.endsWith(phone) || s.phone === phone);
    if (match) return applyMutations(match);
  }
  return applyMutations(list[0]);
}

export async function getSubscriberTransactions(id, { type, range, status } = {}) {
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

export async function getSubscriberClaims(id) {
  const sub = SUBSCRIBERS[id];
  if (!sub) return [];
  return applyMutations(sub).claims || [];
}

export async function getSubscriberNominees(id) {
  const sub = SUBSCRIBERS[id];
  if (!sub) return { pension: [], insurance: [] };
  return applyMutations(sub).nominees;
}

/** Record an ad-hoc contribution. Returns the created transaction. */
export async function makeAdHocContribution(id, { amount, retirementPct = 80, method = 'MTN Mobile Money' }) {
  const sub = SUBSCRIBERS[id];
  if (!sub) throw new Error('Subscriber not found');
  const m = readSession(id);
  const retAmt = Math.round(amount * (retirementPct / 100));
  const emgAmt = amount - retAmt;
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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

/** Request a withdrawal. Returns the created withdrawal record. */
export async function requestWithdrawal(id, { amount, bucket, reason, method = 'MTN Mobile Money' }) {
  const sub = SUBSCRIBERS[id];
  if (!sub) throw new Error('Subscriber not found');
  const m = readSession(id);
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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

export async function updateContributionSchedule(id, schedule) {
  const sub = SUBSCRIBERS[id];
  if (!sub) throw new Error('Subscriber not found');
  const m = readSession(id);
  m.scheduleOverride = { ...sub.contributionSchedule, ...schedule };
  return m.scheduleOverride;
}

export async function updateNominees(id, { pension, insurance }) {
  const sub = SUBSCRIBERS[id];
  if (!sub) throw new Error('Subscriber not found');
  const m = readSession(id);
  m.nomineesOverride = {
    pension: pension ?? sub.nominees.pension,
    insurance: insurance ?? sub.nominees.insurance,
  };
  return m.nomineesOverride;
}

export async function submitClaim(id, payload) {
  const sub = SUBSCRIBERS[id];
  if (!sub) throw new Error('Subscriber not found');
  const m = readSession(id);
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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

export async function updateInsuranceCover(id, { cover, premiumMonthly }) {
  const sub = SUBSCRIBERS[id];
  if (!sub) throw new Error('Subscriber not found');
  const m = readSession(id);
  m.insuranceOverride = {
    ...(m.insuranceOverride ?? sub.insurance),
    cover,
    premiumMonthly,
    status: cover > 0 ? 'active' : 'inactive',
  };
  return m.insuranceOverride;
}
