import { motion } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGXExact } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import styles from './RecentTransactionsCard.module.css';

const TYPE_META = {
  contribution: {
    label: 'Contribution',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
        <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
    tone: 'positive',
  },
  withdrawal: {
    label: 'Withdrawal',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
        <path d="M10 3v10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <path d="M6 7l4-4 4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4 14v2a2 2 0 002 2h8a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
    tone: 'teal',
  },
  premium: {
    label: 'Insurance premium',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
        <path d="M10 2l6 2.5v4.5c0 4-2.5 7-6 8.5-3.5-1.5-6-4.5-6-8.5V4.5L10 2z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
      </svg>
    ),
    tone: 'amber',
  },
  claim: {
    label: 'Claim payout',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
        <rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
    tone: 'indigo',
  },
};

function statusTone(status) {
  if (status === 'paid' || status === 'settled') return 'ok';
  if (status === 'processing' || status === 'submitted' || status === 'under_review') return 'pending';
  if (status === 'scheduled') return 'scheduled';
  return 'ok';
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function niceStatus(status) {
  if (!status) return '';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function RecentTransactionsCard({ subscriber }) {
  const { setSubscriberReportsOpen, setReportContext, closeAllPanels } = useDashboard();
  const transactions = (subscriber?.transactions || []).slice(0, 5);

  function openAll() {
    closeAllPanels();
    setReportContext('all-transactions');
    setSubscriberReportsOpen(true);
  }

  return (
    <motion.section
      className={styles.card}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35, ease: EASE_OUT_EXPO }}
      aria-labelledby="tx-heading"
    >
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Activity</span>
          <h2 id="tx-heading" className={styles.title}>Recent transactions</h2>
        </div>
        <button type="button" className={styles.viewAll} onClick={openAll}>
          View all
          <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10">
            <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </button>
      </header>

      <ul className={styles.list}>
        {transactions.length === 0 && (
          <li className={styles.empty}>
            <span className={styles.emptyIcon}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="24" height="24">
                <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M3 9h18M8 13h8M8 16h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </span>
            <span className={styles.emptyText}>No transactions yet.</span>
          </li>
        )}
        {transactions.map((tx, i) => {
          const meta = TYPE_META[tx.type] || TYPE_META.contribution;
          const isNegative = tx.amount < 0;
          const absAmt = Math.abs(tx.amount);
          return (
            <motion.li
              key={tx.id}
              className={styles.row}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.5 + i * 0.04, ease: EASE_OUT_EXPO }}
            >
              <span className={styles.rowIcon} data-tone={meta.tone} aria-hidden="true">{meta.icon}</span>
              <div className={styles.rowText}>
                <span className={styles.rowLabel}>{meta.label}</span>
                <span className={styles.rowMeta}>
                  {formatDate(tx.date)}
                  <span className={styles.rowDot} aria-hidden="true">·</span>
                  {tx.method}
                </span>
              </div>
              <div className={styles.rowAmountCol}>
                <span className={styles.rowAmount} data-negative={isNegative || undefined}>
                  {isNegative ? '−' : '+'}{formatUGXExact(absAmt)}
                </span>
                <span className={styles.rowStatus} data-tone={statusTone(tx.status)}>
                  <span className={styles.statusDot} />
                  {niceStatus(tx.status)}
                </span>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </motion.section>
  );
}
