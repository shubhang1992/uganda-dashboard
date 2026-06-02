import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatUGX } from '../../../utils/currency';
import { useAgentSubscribers } from '../../../hooks/useAgent';
import { useAgentCommissionDetail } from '../../../hooks/useCommission';
import { computeAgentHomeSummary } from '../agentHomeSummary';
import styles from './MonthlyDataCard.module.css';

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

  const monthly = useMemo(
    () => computeAgentHomeSummary(subscribers, null).monthly,
    [subscribers],
  );

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
      </div>
    </button>
  );
}
