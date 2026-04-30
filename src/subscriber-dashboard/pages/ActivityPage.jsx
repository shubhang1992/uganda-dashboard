import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGXExact, formatUGX } from '../../utils/finance';
import { useCurrentSubscriber } from '../../hooks/useSubscriber';
import PageHeader from '../shell/PageHeader';
import styles from './ActivityPage.module.css';

const TX_META = {
  contribution: { label: 'Contribution', tone: 'positive', d: 'M10 3v14M3 10h14' },
  withdrawal:   { label: 'Withdrawal',   tone: 'teal',     d: 'M10 14V3M6 7l4-4 4 4' },
  premium:      { label: 'Premium',      tone: 'amber',    d: 'M10 2l6 2.5v4.5c0 4-2.5 7-6 8.5-3.5-1.5-6-4.5-6-8.5V4.5L10 2z' },
  claim:        { label: 'Claim payout', tone: 'indigo',   d: 'M3 4h14v12H3zM6 9h8M6 12h5' },
};

const FILTERS = [
  { id: 'all',           label: 'All',          test: () => true },
  { id: 'contribution',  label: 'Contributions', test: (t) => t.type === 'contribution' },
  { id: 'withdrawal',    label: 'Withdrawals',   test: (t) => t.type === 'withdrawal' },
  { id: 'premium',       label: 'Premiums',      test: (t) => t.type === 'premium' },
  { id: 'claim',         label: 'Claims',        test: (t) => t.type === 'claim' },
];

function formatTxDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function groupByMonth(transactions) {
  const groups = new Map();
  transactions.forEach((tx) => {
    const d = tx.date ? new Date(tx.date) : new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-UG', { month: 'long', year: 'numeric' });
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key).items.push(tx);
  });
  return Array.from(groups.values());
}

export default function ActivityPage() {
  const { data: sub } = useCurrentSubscriber();
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    const all = sub?.transactions || [];
    const filterFn = FILTERS.find((f) => f.id === filter)?.test ?? (() => true);
    return all.filter(filterFn);
  }, [sub?.transactions, filter]);

  const totals = useMemo(() => {
    let inflow = 0, outflow = 0;
    filtered.forEach((t) => {
      if (t.amount > 0) inflow += t.amount;
      else outflow += Math.abs(t.amount);
    });
    return { inflow, outflow, net: inflow - outflow };
  }, [filtered]);

  const groups = useMemo(() => groupByMonth(filtered), [filtered]);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Activity"
        subtitle={`${filtered.length} transaction${filtered.length === 1 ? '' : 's'}`}
        fallback="/dashboard"
      />

      <div className={styles.body}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
        >
          <section className={styles.summary}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Money in</span>
              <span className={styles.summaryValue}>{formatUGX(totals.inflow)}</span>
            </div>
            <span className={styles.summaryDivider} aria-hidden="true" />
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Money out</span>
              <span className={styles.summaryValue}>{formatUGX(totals.outflow)}</span>
            </div>
            <span className={styles.summaryDivider} aria-hidden="true" />
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Net</span>
              <span className={styles.summaryValue} data-tone={totals.net >= 0 ? 'positive' : 'negative'}>
                {totals.net >= 0 ? '+' : '−'}{formatUGX(Math.abs(totals.net))}
              </span>
            </div>
          </section>

          <div className={styles.filterRow} role="radiogroup" aria-label="Filter activity">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={filter === f.id}
                className={styles.filterChip}
                data-active={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                  <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M3 9h18M8 13h8M8 16h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
              <span className={styles.emptyTitle}>No activity yet</span>
              <span className={styles.emptyText}>Your transactions will show up here as they happen.</span>
            </div>
          ) : (
            <div className={styles.groupList}>
              {groups.map((group) => (
                <section key={group.label} className={styles.group}>
                  <h2 className={styles.groupHead}>{group.label}</h2>
                  <ul className={styles.list}>
                    {group.items.map((tx) => {
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
                              {tx.reference && (
                                <>
                                  <span className={styles.dot} aria-hidden="true">·</span>
                                  {tx.reference}
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
                </section>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
