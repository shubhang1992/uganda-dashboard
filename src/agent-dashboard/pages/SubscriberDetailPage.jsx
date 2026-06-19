import { useState } from 'react';
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
import MessageLauncher from './MessageLauncher';
import styles from './SubscriberDetailPage.module.css';
import { StatusPill, KycBadge } from './subscriber/SubscriberBadges';
import { deriveSubscriberMetrics } from './subscriber/subscriberMetrics';

const MessageIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none">
    <path d="M3 5.5A1.5 1.5 0 014.5 4h11A1.5 1.5 0 0117 5.5v7a1.5 1.5 0 01-1.5 1.5H8l-3.5 3v-3H4.5A1.5 1.5 0 013 12.5v-7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

export default function SubscriberDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { agentId } = useAgentScope();
  const { data: subscribers = [], isLoading, isError, error, refetch } = useAgentSubscribers(agentId);
  const [messageOpen, setMessageOpen] = useState(false);

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

  const schedule = subscriber.contributionSchedule;
  // The agent must NOT see the subscriber's balance or total contributions, so
  // the page shows engagement signals derived from the same data instead.
  const metrics = deriveSubscriberMetrics(subscriber);
  const kpis = [
    {
      label: 'Largest contribution',
      value: metrics.largest != null ? formatUGX(metrics.largest, { compact: false }) : '—',
      hint: 'single largest',
    },
    {
      label: 'Last contribution',
      value: metrics.last > 0 ? formatUGX(metrics.last, { compact: false }) : '—',
      hint: metrics.lastDate ? formatDate(metrics.lastDate) : 'most recent',
    },
    {
      label: 'Ad hoc contributions',
      value: metrics.adHoc != null ? String(metrics.adHoc) : '—',
      hint: 'above their usual',
    },
    {
      label: 'Insurance cover',
      value: metrics.insured ? formatUGX(metrics.cover, { compact: false }) : 'No cover',
      hint: metrics.insured ? 'active cover' : 'not insured',
      tone: metrics.insured ? 'insured' : 'muted',
    },
  ];

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
          <button
            type="button"
            className={styles.messageBtn}
            onClick={() => setMessageOpen(true)}
          >
            <span aria-hidden="true">{MessageIcon}</span>
            Message
          </button>
        </div>

        <div className={styles.kpiRow}>
          {kpis.map((kpi) => (
            <div key={kpi.label} className={styles.kpiCard}>
              <span className={styles.kpiLabel}>{kpi.label}</span>
              <span className={styles.kpiValue} data-tone={kpi.tone}>{kpi.value}</span>
              <span className={styles.kpiHint}>{kpi.hint}</span>
            </div>
          ))}
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

      </motion.div>

      {messageOpen && (
        <MessageLauncher
          open
          onClose={() => setMessageOpen(false)}
          subscriber={subscriber}
        />
      )}
    </div>
  );
}
