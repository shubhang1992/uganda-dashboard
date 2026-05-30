import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatUGX } from '../../../utils/currency';
import { useAgentCommissionDetail, useNetworkCadence } from '../../../hooks/useCommission';
import { cycleWindow, formatPayoutDate, CADENCES } from '../../../utils/settlementCycle';
import styles from './CommissionsSnapshotCard.module.css';

/**
 * CommissionsSnapshotCard — white card surfacing the agent's next payout and
 * how many receipts await confirmation. Tapping anywhere routes to the
 * Commissions page. Reuses the read-only commission hooks + settlement-cycle
 * helpers; no data-layer changes.
 */
export default function CommissionsSnapshotCard({ agentId }) {
  const navigate = useNavigate();
  const { data: commissionDetail } = useAgentCommissionDetail(agentId);
  const { data: cadenceCfg } = useNetworkCadence();
  const cadence = cadenceCfg?.cadence || CADENCES.MONTHLY_FIRST;

  const snapshot = useMemo(() => {
    const all = commissionDetail?.commissions || [];
    const win = cycleWindow(cadence);

    let nextPayout = 0;
    let receiptsToConfirm = 0;
    for (const c of all) {
      if (c.status === 'released') receiptsToConfirm += 1;
      if (c.status === 'in_run') {
        nextPayout += c.amount || 0;
      } else if (c.status === 'due') {
        const d = c.dueDate ? new Date(c.dueDate).getTime() : null;
        if (d != null && !Number.isNaN(d) && d <= win.end.getTime()) {
          nextPayout += c.amount || 0;
        }
      }
    }
    return { nextPayout, receiptsToConfirm, payoutDate: formatPayoutDate(win.end) };
  }, [commissionDetail, cadence]);

  const confirmLabel =
    snapshot.receiptsToConfirm === 0
      ? 'No receipts to confirm'
      : `${snapshot.receiptsToConfirm} receipt${snapshot.receiptsToConfirm === 1 ? '' : 's'} to confirm`;

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
        <span className={styles.payoutLabel}>Next payout</span>
        <span className={styles.payoutValue}>{formatUGX(snapshot.nextPayout)}</span>
        <span className={styles.payoutDate}>Expected {snapshot.payoutDate}</span>
      </div>

      <div className={styles.confirm} data-pending={snapshot.receiptsToConfirm > 0 ? 'true' : 'false'}>
        <span className={styles.confirmDot} aria-hidden="true" />
        <span className={styles.confirmText}>{confirmLabel}</span>
      </div>
    </button>
  );
}
