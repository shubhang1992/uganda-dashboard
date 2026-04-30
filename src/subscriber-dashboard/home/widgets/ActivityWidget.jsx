import { useNavigate } from 'react-router-dom';
import { formatUGXExact } from '../../../utils/finance';
import styles from './ActivityWidget.module.css';

const TX_META = {
  contribution: { label: 'Contribution', tone: 'positive', d: 'M10 3v14M3 10h14' },
  withdrawal:   { label: 'Withdrawal',   tone: 'teal',     d: 'M10 14V3M6 7l4-4 4 4' },
  premium:      { label: 'Premium',      tone: 'amber',    d: 'M10 2l6 2.5v4.5c0 4-2.5 7-6 8.5-3.5-1.5-6-4.5-6-8.5V4.5L10 2z' },
  claim:        { label: 'Claim payout', tone: 'indigo',   d: 'M3 4h14v12H3zM6 9h8M6 12h5' },
};

function formatTxDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-UG', { day: 'numeric', month: 'short' });
}

export default function ActivityWidget({ subscriber }) {
  const navigate = useNavigate();
  const transactions = (subscriber?.transactions || []).slice(0, 3);

  return (
    <section className={styles.card} aria-labelledby="activity-title">
      <header className={styles.head}>
        <div className={styles.headStack}>
          <span className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden="true" />
            Recent
          </span>
          <h3 id="activity-title" className={styles.title}>Activity</h3>
        </div>
        <button
          type="button"
          className={styles.viewAll}
          onClick={() => navigate('/dashboard/activity')}
        >
          View all
          <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" fill="none">
            <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </header>

      {transactions.length === 0 ? (
        <p className={styles.empty}>No transactions yet.</p>
      ) : (
        <ul className={styles.list}>
          {transactions.map((tx) => {
            const meta = TX_META[tx.type] || TX_META.contribution;
            const negative = tx.amount < 0;
            return (
              <li key={tx.id} className={styles.row}>
                <span className={styles.icon} data-tone={meta.tone} aria-hidden="true">
                  <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
                    <path d={meta.d} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div className={styles.main}>
                  <span className={styles.label}>{meta.label}</span>
                  <span className={styles.meta}>
                    {formatTxDate(tx.date)}
                    {tx.method && (
                      <>
                        <span className={styles.dot} aria-hidden="true">·</span>
                        {tx.method}
                      </>
                    )}
                  </span>
                </div>
                <span className={styles.amount} data-negative={negative || undefined}>
                  {negative ? '−' : '+'}{formatUGXExact(Math.abs(tx.amount))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
