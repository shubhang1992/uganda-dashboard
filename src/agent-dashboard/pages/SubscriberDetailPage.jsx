import { useParams, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { normalizeFrequency, FREQUENCY_LABEL } from '../../utils/finance';
import { EASE_OUT_EXPO } from '../../utils/motion';
import { formatUGX } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { getInitials } from '../../utils/dashboard';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useAgentSubscribers } from '../../hooks/useAgent';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import ErrorCard from '../../components/feedback/ErrorCard';
import PageHeader from '../../components/PageHeader';
import SubscriberDetailDesktop from './SubscriberDetailDesktop';
import styles from './SubscriberDetailPage.module.css';
import { StatusPill, KycBadge, SparkBars } from './subscriber/SubscriberBadges';

export default function SubscriberDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { agentId } = useAgentScope();
  const { data: subscribers = [], isLoading, isError, error, refetch } = useAgentSubscribers(agentId);

  const isDesktop = useIsDesktop();
  if (isDesktop) return <SubscriberDetailDesktop />;

  const subscriber = subscribers.find((s) => s.id === id);

  if (isLoading) {
    return (
      <div className={styles.page}>
        <PageHeader title="Loading…" fallback="/dashboard/subscribers" />
        <div className={styles.empty}><div className={styles.spinner} /></div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.page}>
        <PageHeader title="Subscriber" fallback="/dashboard/subscribers" />
        <div className={styles.empty}>
          <ErrorCard
            title="We couldn't load this subscriber"
            message={error}
            onRetry={refetch}
          />
        </div>
      </div>
    );
  }

  if (!subscriber) {
    return (
      <div className={styles.page}>
        <PageHeader title="Subscriber not found" fallback="/dashboard/subscribers" />
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>We couldn&apos;t find that subscriber.</p>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => navigate('/dashboard/subscribers')}
          >
            Back to subscribers
          </button>
        </div>
      </div>
    );
  }

  const balance = subscriber.netBalance ?? (subscriber.totalContributions - subscriber.totalWithdrawals);
  const schedule = subscriber.contributionSchedule;
  // Real per-month contribution series from the backend. When the agent
  // service doesn't supply one (mock-fallback list, partial RLS shape, etc.)
  // we render an em-dash rather than fabricating a sin-curve trend.
  const historyRaw = Array.isArray(subscriber.contributionHistory) ? subscriber.contributionHistory : [];
  const sparkValues = historyRaw
    .slice(-12)
    .map((v) => Math.max(0, Number(v) || 0));
  const hasSpark = sparkValues.some((v) => v > 0);

  return (
    <div className={styles.page}>
      <PageHeader
        title={subscriber.name}
        subtitle={`${subscriber.phone} · joined ${formatDate(subscriber.registeredDate)}`}
        fallback="/dashboard/subscribers"
      />

      <motion.div
        className={styles.body}
        initial={reducedMotion ? false : { opacity: 0, y: 10 }}
        animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
      >
        <div className={styles.profileCard}>
          <div className={styles.profileAvatar} data-gender={subscriber.gender}>
            {getInitials(subscriber.name)}
          </div>
          <div className={styles.profileInfo}>
            <div className={styles.profileName}>{subscriber.name}</div>
            <div className={styles.profileMeta}>
              <span>{subscriber.phone}</span>
              {subscriber.email && <><span aria-hidden="true">·</span><span>{subscriber.email}</span></>}
            </div>
            <div className={styles.profileBadges}>
              <KycBadge status={subscriber.kycStatus} />
              <StatusPill status={subscriber.isActive ? 'active' : 'dormant'} />
            </div>
          </div>
        </div>

        <div className={styles.kpiRow}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Balance</span>
            <span className={styles.kpiValue}>{formatUGX(balance)}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Total contributions</span>
            <span className={styles.kpiValue}>{formatUGX(subscriber.totalContributions)}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Last contribution</span>
            <span className={styles.kpiValue}>{formatUGX(subscriber.lastContribution || 0)}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Registered</span>
            <span className={styles.kpiValue}>{formatDate(subscriber.registeredDate)}</span>
          </div>
        </div>

        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Contribution schedule</h2>
            <button
              type="button"
              className={styles.sectionAction}
              onClick={() => navigate(`/dashboard/subscribers/${id}/schedule`)}
            >
              {schedule ? 'Edit schedule' : 'Set schedule'}
              <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" fill="none">
                <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </header>
          {schedule ? (
            <div className={styles.scheduleGrid}>
              <div className={styles.scheduleStat}>
                <span className={styles.scheduleLabel}>Frequency</span>
                <span className={styles.scheduleValue}>
                  {FREQUENCY_LABEL[normalizeFrequency(schedule.frequency)] || 'Monthly'}
                </span>
              </div>
              <div className={styles.scheduleStat}>
                <span className={styles.scheduleLabel}>Amount</span>
                <span className={styles.scheduleValue}>
                  {formatUGX(schedule.amount || 0, { compact: false })}
                </span>
              </div>
              <div className={styles.scheduleStat}>
                <span className={styles.scheduleLabel}>Split</span>
                <span className={styles.scheduleValue}>
                  {schedule.retirementPct ?? 80}% / {100 - (schedule.retirementPct ?? 80)}%
                </span>
                <span className={styles.scheduleHint}>retirement / emergency</span>
              </div>
            </div>
          ) : (
            <div className={styles.scheduleEmpty}>
              <p>No schedule set yet. Help {subscriber.name.split(' ')[0]} pick one.</p>
            </div>
          )}
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Support</h2>
            <button
              type="button"
              className={styles.sectionAction}
              onClick={() => navigate(`/dashboard/inbox?subscriberId=${id}`)}
            >
              View tickets
              <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" fill="none">
                <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </header>
          <div className={styles.scheduleEmpty}>
            <p>Open this subscriber&apos;s support conversations to triage or reply.</p>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Contribution rhythm</h2>
            <span className={styles.sectionHint}>12 months</span>
          </header>
          <div className={styles.trendCard}>
            {hasSpark ? (
              <SparkBars values={sparkValues} />
            ) : (
              <span className={styles.trendEmpty} aria-label="No contribution history available">—</span>
            )}
            <div className={styles.trendFooter}>
              <span>12 months</span>
              <span className={styles.trendValue}>{formatUGX(subscriber.totalContributions)}</span>
            </div>
          </div>
        </section>

        {subscriber.productsHeld?.length > 0 && (
          <section className={styles.section}>
            <header className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Products held</h2>
            </header>
            <div className={styles.productList}>
              {subscriber.productsHeld.map((p) => (
                <span key={p} className={styles.productPill}>{p}</span>
              ))}
            </div>
          </section>
        )}
      </motion.div>
    </div>
  );
}
