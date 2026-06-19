/**
 * Agent-facing subscriber metrics for the detail page.
 *
 * The agent must NOT see a subscriber's balance or total contributions, so the
 * detail page shows engagement signals instead, derived here from the data the
 * agent service already exposes (contributionHistory / lastContribution /
 * insurance). Single source so the desktop + mobile detail pages stay in sync.
 *
 * "Ad hoc" contributions are derived relative to the subscriber's OWN usual
 * amount (months notably above their median), not the schedule — robust to the
 * contribution frequency and to seed noise, and a fair proxy for top-ups since
 * the agent data carries no per-transaction type.
 */
const AD_HOC_FACTOR = 1.25; // a period >25% above the usual amount = a top-up

export function deriveSubscriberMetrics(subscriber) {
  const history = (Array.isArray(subscriber?.contributionHistory) ? subscriber.contributionHistory : [])
    .map((v) => Math.max(0, Number(v) || 0));
  const nonZero = history.filter((v) => v > 0);

  const largest = nonZero.length ? Math.max(...nonZero) : null;

  const last = Number(subscriber?.lastContribution) > 0
    ? Number(subscriber.lastContribution)
    : (nonZero.length ? history[history.length - 1] : 0);
  const lastDate = subscriber?.lastContributionDate || null;

  // Ad hoc = periods notably above the subscriber's usual (median) amount.
  // Needs a few data points to have a meaningful baseline; otherwise unknown.
  let adHoc = null;
  if (nonZero.length >= 3) {
    const sorted = [...nonZero].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    // True median — average the two middle values for even-length series so the
    // baseline isn't biased upward (which would under-count top-ups).
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    adHoc = median > 0 ? nonZero.filter((v) => v > median * AD_HOC_FACTOR).length : 0;
  }

  const ins = subscriber?.insurance;
  const insured = !!ins && ins.status === 'active' && Number(ins.cover) > 0;
  const cover = insured ? Number(ins.cover) : 0;

  return { largest, last, lastDate, adHoc, insured, cover };
}
