import { monthlyEquivalent } from '../../utils/finance';

/**
 * Pure derivation of the agent home dome's summary figures. Extracted from
 * PulseCard so both the mobile dome and the desktop fork compute identical
 * numbers from the same inputs (no behavioural change — the math below is the
 * verbatim body of PulseCard's two useMemo blocks).
 *
 * @param {Array<{contributionSchedule?: object, isActive?: boolean}>} subscribers
 * @param {{totalPaid?: number|null, paidTransactions?: Array<{amount?: number}>}|null|undefined} commissionDetail
 * @returns {{monthly: number, active: number, total: number, activePct: number, commissionsTotal: number}}
 */
export function computeAgentHomeSummary(subscribers, commissionDetail) {
  let monthly = 0;
  let active = 0;
  for (const s of subscribers) {
    monthly += monthlyEquivalent(s.contributionSchedule);
    if (s.isActive) active += 1;
  }
  const total = subscribers.length;
  const activePct = total > 0 ? Math.round((active / total) * 100) : 0;

  // Flat `due → paid` flow: lifetime commissions = the total paid figure the
  // detail already sums (falls back to summing paid lines if absent).
  let commissionsTotal;
  if (commissionDetail?.totalPaid != null) {
    commissionsTotal = commissionDetail.totalPaid;
  } else {
    commissionsTotal = (commissionDetail?.paidTransactions || []).reduce(
      (sum, c) => sum + (c.amount || 0),
      0,
    );
  }

  return { monthly, active, total, activePct, commissionsTotal };
}
