import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { formatUGX } from '../../utils/currency';
import { formatUGPhone } from '../../utils/phone';
import { getInitials } from '../../utils/dashboard';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useAgentSubscribers } from '../../hooks/useAgent';
import { isInsured } from '../home/agentHomeSummary';
import PageHeader from '../../components/PageHeader';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import ErrorCard from '../../components/feedback/ErrorCard';
import styles from './InsuredMembersPage.module.css';

/**
 * Drill-down for the Home insurance card "Insured members" stat — the agent's
 * subscribers with active life cover (same `isInsured` predicate as the card, so
 * the count matches). Rows tap through to the subscriber detail page.
 */
export default function InsuredMembersPage() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { agentId } = useAgentScope();
  const { data: subscribers = [], isLoading, isError, error, refetch } = useAgentSubscribers(agentId);

  const insured = useMemo(
    () =>
      subscribers
        .filter(isInsured)
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [subscribers],
  );
  const loading = isLoading && subscribers.length === 0;

  return (
    <div className={styles.page}>
      <PageHeader title="Insured members" subtitle="Subscribers with active life cover" />

      <div className={styles.body}>
        <motion.div
          className={styles.stack}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
        >
          <div className={styles.list}>
            {loading && <SkeletonRow count={5} label="Loading insured subscribers" />}
            {isError && !isLoading && (
              <ErrorCard title="We couldn't load subscribers" message={error} onRetry={refetch} />
            )}
            {!loading && !isError && insured.length === 0 && (
              <EmptyState
                kind="no-data"
                title="No insured members yet"
                body="Subscribers with active life cover will appear here. Open the uninsured list to invite members to add insurance."
              />
            )}
            {!loading &&
              !isError &&
              insured.map((sub) => (
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
                    <span className={styles.rowMeta}>{formatUGPhone(sub.phone)}</span>
                  </div>
                  <div className={styles.rowAmount}>
                    <span className={styles.rowAmountValue}>{formatUGX(sub.insurance?.cover)}</span>
                    <span className={styles.rowAmountLabel}>cover</span>
                  </div>
                </button>
              ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
