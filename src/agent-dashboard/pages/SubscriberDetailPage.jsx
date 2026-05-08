import { useParams, useNavigate } from 'react-router-dom';
import { formatUGX, formatUGXExact, normalizeFrequency, FREQUENCY_LABEL } from '../../utils/finance';
import { getInitials } from '../../utils/dashboard';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useAgentSubscribers } from '../../hooks/useAgent';
import ErrorCard from '../../components/feedback/ErrorCard';
import PageHeader from '../shell/PageHeader';
import styles from './SubscriberDetailPage.module.css';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusPill({ status }) {
  return (
    <span className={styles.statusPill} data-tone={status}>
      <span className={styles.statusDot} />
      {status === 'active' ? 'Active' : 'Dormant'}
    </span>
  );
}

function KycBadge() {
  return (
    <span className={styles.kycBadge} data-kyc="complete">
      <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true">
        <path d="M2.5 6.2l2.3 2.3L9.5 3.7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      KYC verified
    </span>
  );
}

function SparkBars({ values }) {
  // Values are derived deterministically from a sin curve over the subscriber's
  // contribution total (`sparkValues` in the parent) — they're an estimated
  // trend, not real per-month history. Replace once the backend supplies a
  // real `contributionHistory` array.
  const max = Math.max(...values, 1);
  return (
    <div className={styles.spark} aria-label="Estimated 12-month contribution trend">
      {values.map((v, i) => (
        <div key={i} className={styles.sparkBar} style={{ height: `${Math.max((v / max) * 100, 4)}%` }} />
      ))}
    </div>
  );
}

export default function SubscriberDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { agentId } = useAgentScope();
  const { data: subscribers = [], isLoading, isError, error, refetch } = useAgentSubscribers(agentId);

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
  const sparkValues = Array.from({ length: 12 }, (_, i) => Math.max(0, (subscriber.totalContributions / 12) * (0.5 + Math.sin(i + (subscriber.id?.length || 0)) * 0.5)));

  return (
    <div className={styles.page}>
      <PageHeader
        title={subscriber.name}
        subtitle={`${subscriber.phone} · joined ${formatDate(subscriber.registeredDate)}`}
        fallback="/dashboard/subscribers"
      />

      <div className={styles.body}>
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
              <KycBadge />
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
                  {formatUGXExact(schedule.amount || 0)}
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
            <h2 className={styles.sectionTitle}>Contribution rhythm</h2>
            <span className={styles.sectionHint}>estimated trend · 12 months</span>
          </header>
          <div className={styles.trendCard}>
            <SparkBars values={sparkValues} />
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
      </div>
    </div>
  );
}
