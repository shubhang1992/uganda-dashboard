import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO, formatUGXExact, formatUGX } from '../../utils/finance';
import { formatDate } from '../../utils/date';
import { useCurrentSubscriber, useSubscriberTransactions } from '../../hooks/useSubscriber';
import PageHeader from '../../components/PageHeader';
import { PillChip, PillChipGroup } from '../../components/PillChip';
import { goBackOrFallback } from '../shell/navigation';
import styles from './ActivityPage.module.css';

// Client-side sign filters. Incoming = money received (amount > 0);
// Outgoing = money sent (amount < 0). No backend round-trip — the full
// transaction list is already cached.
const FILTERS = [
  { id: 'all',      label: 'All',      test: () => true },
  { id: 'incoming', label: 'Incoming', test: (t) => t.amount > 0 },
  { id: 'outgoing', label: 'Outgoing', test: (t) => t.amount < 0 },
];

// Map a transaction onto a human label for the row. Incoming contributions
// read as "Received"; outgoing withdrawals/claims read as "Sent".
function rowLabel(tx) {
  if (tx.amount > 0) return 'Received';
  return 'Sent';
}

function txYear(tx) {
  if (!tx.date) return null;
  const d = new Date(tx.date);
  return Number.isNaN(d.getTime()) ? null : d.getFullYear();
}

export default function ActivityPage() {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { data: sub } = useCurrentSubscriber();
  const [filter, setFilter] = useState('all');
  const { data: allTx = [] } = useSubscriberTransactions(sub?.id);

  // Anchor "this year" to the most recent transaction year in the feed (the
  // demo seed is anchored to MOCK_NOW = 2026), falling back to the wall clock
  // when there is no data. Components must not import mockData (CLAUDE.md §4),
  // so we derive the anchor from the data the hook already gave us.
  const thisYear = useMemo(() => {
    let max = null;
    allTx.forEach((t) => {
      const y = txYear(t);
      if (y != null && (max == null || y > max)) max = y;
    });
    return max ?? new Date().getFullYear();
  }, [allTx]);

  // Hero figure: net (incoming − outgoing) for that year only. This stays
  // anchored to the year regardless of the sign filter below, matching the
  // mockup where the dome always shows the year's net movement.
  const yearSummary = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    allTx.forEach((t) => {
      if (txYear(t) !== thisYear) return;
      if (t.amount > 0) inflow += t.amount;
      else outflow += Math.abs(t.amount);
    });
    return { inflow, outflow, net: inflow - outflow };
  }, [allTx, thisYear]);

  // Displayed list: this-year transactions narrowed by the sign filter.
  const visible = useMemo(() => {
    const test = FILTERS.find((f) => f.id === filter)?.test ?? (() => true);
    return allTx.filter((t) => txYear(t) === thisYear && test(t));
  }, [allTx, filter, thisYear]);

  return (
    <div className={styles.page}>
      <PageHeader
        variant="hero"
        title="Activity"
        eyebrow="THIS YEAR"
        prefix="UGX"
        amount={`${yearSummary.net < 0 ? '−' : ''}${formatUGXExact(Math.abs(yearSummary.net)).replace('UGX ', '')}`}
        statRow={(
          <>
            <span style={{ color: 'var(--color-green)' }}>
              ↑ <strong style={{ color: 'var(--color-green)' }}>{formatUGX(yearSummary.inflow)}</strong> in
            </span>
            <span>↓ <strong>{formatUGX(yearSummary.outflow)}</strong> out</span>
          </>
        )}
        onBack={() => goBackOrFallback(navigate, '/dashboard')}
      />

      <div className={styles.body}>
        <motion.div
          className={styles.stack}
          initial={reducedMotion ? false : { opacity: 0, y: 10 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
        >
          <PillChipGroup label="Filter activity" layout="row" className={styles.filters}>
            {FILTERS.map((f) => (
              <PillChip
                key={f.id}
                selected={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </PillChip>
            ))}
          </PillChipGroup>

          {visible.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                  <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M3 9h18M8 13h8M8 16h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </span>
              <span className={styles.emptyTitle}>
                {filter === 'all' ? 'No activity this year' : `No ${filter} activity`}
              </span>
              <span className={styles.emptyText}>
                Your transactions will show up here as they happen.
              </span>
            </div>
          ) : (
            <ul className={styles.list}>
              {visible.map((tx, i) => {
                const incoming = tx.amount > 0;
                return (
                  <li key={tx.id} className={styles.row} data-zebra={i % 2 === 1 || undefined}>
                    <div className={styles.main}>
                      <span className={styles.label} data-tone={incoming ? 'in' : 'out'}>
                        {rowLabel(tx)}
                      </span>
                      <span className={styles.meta}>
                        {tx.method}
                        {tx.method && tx.reference && (
                          <span className={styles.dot} aria-hidden="true">·</span>
                        )}
                        {tx.reference}
                      </span>
                    </div>
                    <div className={styles.figures}>
                      <span className={styles.amount} data-tone={incoming ? 'in' : 'out'}>
                        {incoming ? '+ ' : '− '}
                        {formatUGXExact(Math.abs(tx.amount))}
                      </span>
                      <span className={styles.date}>
                        {formatDate(tx.date, { variant: 'short' })}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <button
            type="button"
            className={styles.reportsLink}
            onClick={() => navigate('/dashboard/reports/all-transactions')}
          >
            View detailed reports
            <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none">
              <path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </motion.div>
      </div>
    </div>
  );
}
