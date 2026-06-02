import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { formatUGX } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { getInitials } from '../../utils/dashboard';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useAgentSubscribers } from '../../hooks/useAgent';
import { deriveMonthAnchors, isOnboardedSince } from '../home/agentHomeSummary';
import PageHeader from '../../components/PageHeader';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import ErrorCard from '../../components/feedback/ErrorCard';
import styles from './OnboardedThisMonthPage.module.css';

/**
 * Drill-down for the Home "Onboarded this month" tile — the agent's subscribers
 * registered in the current month. Same predicate (deriveMonthAnchors +
 * isOnboardedSince) as the tile, so the count matches. Rows tap through to the
 * subscriber detail page.
 */
export default function OnboardedThisMonthPage() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { agentId } = useAgentScope();
  const { data: subscribers = [], isLoading, isError, error, refetch } = useAgentSubscribers(agentId);

  const onboarded = useMemo(() => {
    const { onboardStart } = deriveMonthAnchors(subscribers);
    return subscribers
      .filter((s) => isOnboardedSince(s, onboardStart))
      .sort((a, b) => (b.registeredDate || '').localeCompare(a.registeredDate || ''));
  }, [subscribers]);

  const monthLabel = subscribers.length
    ? formatDate(deriveMonthAnchors(subscribers).onboardStart, { variant: 'month-year' })
    : '';
  const loading = isLoading && subscribers.length === 0;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Onboarded this month"
        subtitle={monthLabel ? `New subscribers · ${monthLabel}` : 'New subscribers'}
      />

      <div className={styles.body}>
        <motion.div
          className={styles.stack}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
        >
          <div className={styles.list}>
            {loading && <SkeletonRow count={5} label="Loading this month's onboardees" />}
            {isError && !isLoading && (
              <ErrorCard title="We couldn't load subscribers" message={error} onRetry={refetch} />
            )}
            {!loading && !isError && onboarded.length === 0 && (
              <EmptyState
                kind="no-data"
                title="No one onboarded this month yet"
                body="Subscribers you onboard this month will appear here. Tap Onboard to add your next one."
              />
            )}
            {!loading &&
              !isError &&
              onboarded.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  className={styles.row}
                  onClick={() => navigate(`/dashboard/subscribers/${sub.id}`)}
                >
                  <span className={styles.avatar} data-gender={sub.gender} aria-hidden="true">
                    {getInitials(sub.name)}
                  </span>
                  <div className={styles.rowBody}>
                    <span className={styles.rowName}>{sub.name}</span>
                    <span className={styles.rowMeta}>
                      Joined {formatDate(sub.registeredDate, { variant: 'short' })}
                    </span>
                  </div>
                  <div className={styles.rowAmount}>
                    <span className={styles.rowAmountValue}>{formatUGX(sub.totalContributions)}</span>
                    <span className={styles.rowAmountLabel}>contributed</span>
                  </div>
                </button>
              ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
