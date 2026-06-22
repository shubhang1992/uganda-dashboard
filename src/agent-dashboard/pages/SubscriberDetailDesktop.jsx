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
import ErrorCard from '../../components/feedback/ErrorCard';
import PageHeader from '../../components/PageHeader';
import { StatusPill, KycBadge } from './subscriber/SubscriberBadges';
import { deriveSubscriberMetrics } from './subscriber/subscriberMetrics';
import PolicyChips from './subscriber/PolicyChips';
import MessageLauncher from './MessageLauncher';
import pageStyles from './SubscriberDetailPage.module.css';
import styles from './SubscriberDetailDesktop.module.css';

const MessageIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none">
    <path d="M3 5.5A1.5 1.5 0 014.5 4h11A1.5 1.5 0 0117 5.5v7a1.5 1.5 0 01-1.5 1.5H8l-3.5 3v-3H4.5A1.5 1.5 0 013 12.5v-7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

/**
 * SubscriberDetailDesktop — desktop (>=1024px) layout for the agent's
 * subscriber detail sub-page. Forked from SubscriberDetailPage via the
 * useIsDesktop() gate; the mobile page is never mounted at this width, so this
 * component owns its own hooks (rules-of-hooks safe) and calls the SAME data
 * hook (useAgentSubscribers — React Query dedupes).
 *
 * It is a SUB-page (a routed detail destination), so it uses the default
 * PageHeader variant (back chevron + h1 = subscriber name). Every mobile section
 * is rendered — profile, the 4 KPI tiles, contribution schedule, support,
 * 12-month contribution rhythm, and the conditional products list — laid out in
 * a two-column desktop grid. The visual primitives (cards, KPI tiles, badges,
 * spark bars, product pills) are the EXACT same CSS Module classes the mobile
 * page uses (imported from SubscriberDetailPage.module.css), so the rendered
 * sections are byte-identical to mobile; only the surrounding shell differs.
 *
 * The not-found guard is preserved exactly: when no subscriber matches the route
 * id within this agent's own list, we render the same "not found" early return
 * the mobile page does. That guard IS the out-of-scope guard — an outsider is
 * never rendered as an h1.
 */
export default function SubscriberDetailDesktop() {
  const { id } = useParams();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { agentId } = useAgentScope();
  const { data: subscribers = [], isLoading, isError, error, refetch } = useAgentSubscribers(agentId);
  const [messageOpen, setMessageOpen] = useState(false);

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
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title={subscriber.name}
        subtitle={`${subscriber.phone} · joined ${formatDate(subscriber.registeredDate)}`}
        fallback="/dashboard/subscribers"
      />

      <motion.div
        className={styles.frame}
        initial={reducedMotion ? false : { opacity: 0, y: 10 }}
        animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
      >
        <div className={pageStyles.profileCard}>
          <div className={pageStyles.profileAvatar} data-gender={subscriber.gender}>
            {getInitials(subscriber.name)}
          </div>
          <div className={pageStyles.profileInfo}>
            <div className={pageStyles.profileName}>{subscriber.name}</div>
            <div className={pageStyles.profileMeta}>
              <span>{subscriber.phone}</span>
              {subscriber.email && <><span aria-hidden="true">·</span><span>{subscriber.email}</span></>}
            </div>
            <div className={pageStyles.profileBadges}>
              <KycBadge status={subscriber.kycStatus} />
              <StatusPill status={subscriber.isActive ? 'active' : 'dormant'} />
            </div>
          </div>
          <button
            type="button"
            className={pageStyles.messageBtn}
            onClick={() => setMessageOpen(true)}
          >
            <span aria-hidden="true">{MessageIcon}</span>
            Message
          </button>
        </div>

        <div className={pageStyles.kpiRow}>
          {kpis.map((kpi) => (
            <div key={kpi.label} className={pageStyles.kpiCard}>
              <span className={pageStyles.kpiLabel}>{kpi.label}</span>
              <span className={pageStyles.kpiValue} data-tone={kpi.tone}>{kpi.value}</span>
              <span className={pageStyles.kpiHint}>{kpi.hint}</span>
            </div>
          ))}
        </div>

        <div className={styles.grid}>
          <div className={styles.column}>
            <section className={pageStyles.section}>
              <header className={pageStyles.sectionHead}>
                <h2 className={pageStyles.sectionTitle}>Contribution schedule</h2>
                <button
                  type="button"
                  className={pageStyles.sectionAction}
                  onClick={() => navigate(`/dashboard/subscribers/${id}/schedule`)}
                >
                  {schedule ? 'Edit schedule' : 'Set schedule'}
                  <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" fill="none">
                    <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </header>
              {schedule ? (
                <div className={pageStyles.scheduleGrid}>
                  <div className={pageStyles.scheduleStat}>
                    <span className={pageStyles.scheduleLabel}>Frequency</span>
                    <span className={pageStyles.scheduleValue}>
                      {FREQUENCY_LABEL[normalizeFrequency(schedule.frequency)] || 'Monthly'}
                    </span>
                  </div>
                  <div className={pageStyles.scheduleStat}>
                    <span className={pageStyles.scheduleLabel}>Amount</span>
                    <span className={pageStyles.scheduleValue}>
                      {formatUGX(schedule.amount || 0, { compact: false })}
                    </span>
                  </div>
                  <div className={pageStyles.scheduleStat}>
                    <span className={pageStyles.scheduleLabel}>Split</span>
                    <span className={pageStyles.scheduleValue}>
                      {schedule.retirementPct ?? 80}% / {100 - (schedule.retirementPct ?? 80)}%
                    </span>
                    <span className={pageStyles.scheduleHint}>retirement / emergency</span>
                  </div>
                </div>
              ) : (
                <div className={pageStyles.scheduleEmpty}>
                  <p>No schedule set yet. Help {subscriber.name.split(' ')[0]} pick one.</p>
                </div>
              )}
            </section>
          </div>

          <div className={styles.column}>
            <section className={pageStyles.section}>
              <header className={pageStyles.sectionHead}>
                <h2 className={pageStyles.sectionTitle}>Insurance</h2>
              </header>
              <PolicyChips
                policies={subscriber.policies}
                emptyText={`${subscriber.name.split(' ')[0]} has no active cover yet.`}
              />
            </section>

            <section className={pageStyles.section}>
              <header className={pageStyles.sectionHead}>
                <h2 className={pageStyles.sectionTitle}>Support</h2>
                <button
                  type="button"
                  className={pageStyles.sectionAction}
                  onClick={() => navigate(`/dashboard/inbox?subscriberId=${id}`)}
                >
                  View tickets
                  <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" fill="none">
                    <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </header>
              <div className={pageStyles.scheduleEmpty}>
                <p>Open this subscriber&apos;s support conversations to triage or reply.</p>
              </div>
            </section>
          </div>
        </div>
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
