import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { formatUGPhone } from '../../utils/phone';
import { getInitials } from '../../utils/dashboard';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useAgentSubscribers } from '../../hooks/useAgent';
import { isInsured } from '../home/agentHomeSummary';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import AgentMobileHero from '../shell/AgentMobileHero';
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
  const isDesktop = useIsDesktop();

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
      {isDesktop && (
        <PageHeader title="Insured members" subtitle="Subscribers with active life cover" />
      )}
      <div className={styles.body}>
        <motion.div
          className={styles.stack}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
        >
          {!isDesktop && (
            <AgentMobileHero
              eyebrow="Insured members"
              value={loading ? '—' : `${insured.length} member${insured.length === 1 ? '' : 's'}`}
            >
              Subscribers with active life cover
            </AgentMobileHero>
          )}

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
                    <span className={styles.rowAmountValue}>{sub.policies?.length || 0}</span>
                    <span className={styles.rowAmountLabel}>
                      {(sub.policies?.length || 0) === 1 ? 'policy' : 'policies'}
                    </span>
                  </div>
                </button>
              ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
