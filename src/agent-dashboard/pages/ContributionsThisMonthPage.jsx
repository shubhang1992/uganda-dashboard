import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { formatUGX, formatNumber } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { getInitials } from '../../utils/dashboard';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useAgentSubscribers, useAgentContributions } from '../../hooks/useAgent';
import { deriveMonthAnchors, monthRangeIso } from '../home/agentHomeSummary';
import PageHeader from '../../components/PageHeader';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import ErrorCard from '../../components/feedback/ErrorCard';
import styles from './ContributionsThisMonthPage.module.css';

/**
 * Drill-down for the Home "Monthly contribution volume" tile — the ACTUAL
 * contributions logged this month across the agent's book (per-payment rows +
 * a running total). Note this is distinct from the tile, which shows the agent's
 * SCHEDULED monthly volume (sum of monthlyEquivalent); the two can differ.
 *
 * "This month" is derived from the book's latest contribution date (deriveMonthAnchors)
 * — components must not import the demo clock (CLAUDE.md §4).
 */
export default function ContributionsThisMonthPage() {
  const reduce = useReducedMotion();
  const { agentId } = useAgentScope();
  const { data: subscribers = [], isLoading: subsLoading } = useAgentSubscribers(agentId);

  const { contribStart } = useMemo(() => deriveMonthAnchors(subscribers), [subscribers]);
  const haveSubs = subscribers.length > 0;
  const { from, to } = useMemo(() => monthRangeIso(contribStart), [contribStart]);

  const {
    data: contributions = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useAgentContributions(agentId, haveSubs ? { from, to } : {});

  const total = useMemo(
    () => contributions.reduce((sum, c) => sum + (c.amount || 0), 0),
    [contributions],
  );
  const monthLabel = haveSubs ? formatDate(contribStart, { variant: 'month-year' }) : '';
  const resolving = subsLoading || (!!from && isLoading);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Contributions this month"
        subtitle={monthLabel ? `Payments logged · ${monthLabel}` : 'Payments logged'}
      />

      <div className={styles.body}>
        <motion.div
          className={styles.stack}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
        >
          {!resolving && !isError && contributions.length > 0 && (
            <div className={styles.summary}>
              <div className={styles.summaryMain}>
                <span className={styles.summaryLabel}>Total received</span>
                <span className={styles.summaryValue}>{formatUGX(total, { compact: false })}</span>
              </div>
              <span className={styles.summaryCount}>
                {formatNumber(contributions.length)} payment{contributions.length === 1 ? '' : 's'}
              </span>
            </div>
          )}

          <div className={styles.list}>
            {resolving && <SkeletonRow count={6} label="Loading this month's contributions" />}
            {isError && !resolving && (
              <ErrorCard
                title="We couldn't load contributions"
                message={error}
                onRetry={refetch}
              />
            )}
            {!resolving && !isError && contributions.length === 0 && (
              <EmptyState
                kind="no-data"
                title="No contributions logged this month"
                body="Payments your subscribers make this month will appear here."
              />
            )}
            {!resolving &&
              !isError &&
              contributions.map((c) => (
                <div key={c.id} className={styles.row}>
                  <span className={styles.avatar} aria-hidden="true">{getInitials(c.subscriberName)}</span>
                  <div className={styles.rowBody}>
                    <span className={styles.rowName}>{c.subscriberName}</span>
                    <span className={styles.rowMeta}>{formatDate(c.date, { variant: 'short' })}</span>
                  </div>
                  <span className={styles.rowAmount}>{formatUGX(c.amount, { compact: false })}</span>
                </div>
              ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
