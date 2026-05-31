import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatUGX } from '../../../utils/currency';
import { useAgentCommissionDetail } from '../../../hooks/useCommission';
import styles from './CommissionsSnapshotCard.module.css';

/**
 * CommissionsSnapshotCard — white card surfacing the agent's outstanding (owed)
 * commission balance. Tapping anywhere routes to the Commissions page.
 *
 * The commission flow is now a flat `due → paid` settled by the distributor —
 * there's no payout cadence and no agent confirmation step, so the card just
 * shows what's still owed plus a count of due lines.
 */
export default function CommissionsSnapshotCard({ agentId }) {
  const navigate = useNavigate();
  const { data: detail } = useAgentCommissionDetail(agentId);

  const snapshot = useMemo(() => {
    const due = detail?.dueTransactions || [];
    const totalDue =
      detail?.totalDue ?? due.reduce((sum, c) => sum + (c.amount || 0), 0);
    return { totalDue, dueCount: due.length };
  }, [detail]);

  const countLabel =
    snapshot.dueCount === 0
      ? 'Nothing owed right now'
      : `${snapshot.dueCount} commission${snapshot.dueCount === 1 ? '' : 's'} awaiting payout`;

  return (
    <button
      type="button"
      className={styles.card}
      onClick={() => navigate('/dashboard/commissions')}
      aria-label="View commissions"
    >
      <header className={styles.head}>
        <span className={styles.eyebrow}>Commissions</span>
        <span className={styles.chevron} aria-hidden="true">
          <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
            <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </header>

      <div className={styles.payout}>
        <span className={styles.payoutLabel}>Outstanding</span>
        <span className={styles.payoutValue}>{formatUGX(snapshot.totalDue)}</span>
        <span className={styles.payoutDate}>Owed to you</span>
      </div>

      <div className={styles.confirm} data-pending={snapshot.dueCount > 0 ? 'true' : 'false'}>
        <span className={styles.confirmDot} aria-hidden="true" />
        <span className={styles.confirmText}>{countLabel}</span>
      </div>
    </button>
  );
}
