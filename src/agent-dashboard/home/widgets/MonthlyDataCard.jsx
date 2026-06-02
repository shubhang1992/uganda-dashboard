import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatUGX, formatNumber } from '../../../utils/currency';
import { useAgentSubscribers } from '../../../hooks/useAgent';
import { useAgentCommissionDetail } from '../../../hooks/useCommission';
import { computeAgentHomeSummary } from '../agentHomeSummary';
import styles from './MonthlyDataCard.module.css';

/** Start-of-month (local) timestamp for a millisecond instant. */
function monthStartMs(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/**
 * MonthlyDataCard — mobile-only card sitting directly under the agent home dome.
 * Folds the agent's monthly activity into one lean block: the MONTHLY
 * CONTRIBUTION VOLUME (the figure the dome headline used to carry, before it
 * switched to lifetime totals) plus the COMMISSIONS OWED that previously had a
 * card of its own. Tapping anywhere routes to the Commissions page, preserving
 * the navigation the standalone commissions card provided.
 *
 * NOTE (E2E contract): the literal string "Monthly contribution volume" MUST
 * stay present and visible here on mobile — the agent-dashboard smoke spec
 * asserts getByText on it (the desktop KPI row carries the same string, so the
 * two never co-render in one viewport).
 *
 * Desktop is unaffected: HomeDesktop renders its own KPI row plus the shared
 * PortfolioCard / CommissionsSnapshotCard, which are intentionally left intact.
 */
export default function MonthlyDataCard({ agentId }) {
  const navigate = useNavigate();
  const { data: subscribers = [] } = useAgentSubscribers(agentId);
  const { data: detail } = useAgentCommissionDetail(agentId);

  const { monthly, onboardedThisMonth, pendingContribution } = useMemo(() => {
    const monthly = computeAgentHomeSummary(subscribers, null).monthly;

    // The demo seed is anchored to a fixed "now" (MOCK_NOW), and components must
    // not import the demo clock (CLAUDE.md §4) — so reckon "this month" from the
    // latest dates in the book itself (same approach as ActivityPage). Onboarding
    // and contribution get separate anchors so a stale dimension can't skew the
    // other. An empty dimension (no dates) leaves its anchor at the epoch, which
    // correctly yields a zero count for that metric.
    let maxReg = 0;
    let maxContrib = 0;
    for (const s of subscribers) {
      const r = s.registeredDate ? new Date(s.registeredDate).getTime() : 0;
      if (r > maxReg) maxReg = r;
      const c = s.lastContributionDate ? new Date(s.lastContributionDate).getTime() : 0;
      if (c > maxContrib) maxContrib = c;
    }
    const onboardStart = monthStartMs(maxReg);
    const contribStart = monthStartMs(maxContrib);

    let onboardedThisMonth = 0;
    let pendingContribution = 0;
    for (const s of subscribers) {
      if (s.registeredDate && new Date(s.registeredDate).getTime() >= onboardStart) {
        onboardedThisMonth += 1;
      }
      // No contribution date = never contributed → still owes this month.
      const lcd = s.lastContributionDate ? new Date(s.lastContributionDate).getTime() : null;
      if (lcd == null || lcd < contribStart) pendingContribution += 1;
    }

    return { monthly, onboardedThisMonth, pendingContribution };
  }, [subscribers]);

  // Mirror CommissionsSnapshotCard's fallback verbatim so the owed figure here,
  // the desktop "Owed" KPI tile, and the Commissions page never disagree.
  const totalDue = useMemo(() => {
    const due = detail?.dueTransactions || [];
    return detail?.totalDue ?? due.reduce((sum, c) => sum + (c.amount || 0), 0);
  }, [detail]);

  return (
    <button
      type="button"
      className={styles.card}
      onClick={() => navigate('/dashboard/commissions')}
      aria-label="View commissions"
    >
      <header className={styles.head}>
        <span className={styles.eyebrow}>Monthly data</span>
        <span className={styles.chevron} aria-hidden="true">
          <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
            <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </header>

      <div className={styles.statGrid}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Monthly contribution volume</span>
          <span className={styles.statValue}>{formatUGX(monthly)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Commissions owed</span>
          <span className={styles.statValue}>{formatUGX(totalDue)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Onboarded this month</span>
          <span className={styles.statValue}>{formatNumber(onboardedThisMonth)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Yet to contribute</span>
          <span className={styles.statValue}>{formatNumber(pendingContribution)}</span>
        </div>
      </div>
    </button>
  );
}
