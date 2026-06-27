import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useBranchTickets, useBranchTicketMetrics } from '../../hooks/useTickets';
import { TICKET_STATUS, TICKET_PRIORITY } from '../../data/ticketsSeed';
import { formatNumber } from '../../utils/currency';
import { formatRelativeTime } from '../../utils/date';
import ErrorCard from '../../components/feedback/ErrorCard';
import styles from './branchMobile.module.css';

const EyeIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const STATUS_PILLS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
];

/**
 * SupportMobile — branch admin PHONE support oversight. READ-ONLY: mirrors
 * SupportDesktop's data wiring (useBranchTickets + useBranchTicketMetrics +
 * the byAgent→name map) but renders the approved mobile mockup: a grad hero
 * (open/closed counts + an "N unanswered" pill + a read-only note + an
 * Open/Closed/Avg-response statStrip shown only when the response metric
 * exists), filter pills (All/Open/Closed) plus a cosmetic agent select, and a
 * card of ticket rows. Each row links to the read-only thread at
 * /dashboard/support/:ticketId. NO compose / new-ticket — branch is oversight-only.
 */
export default function SupportMobile() {
  const { branchId } = useBranchScope();
  const { data: metrics } = useBranchTicketMetrics(branchId);
  const { data: tickets = [], isLoading, isError, error, refetch } = useBranchTickets(branchId);

  const [statusFilter, setStatusFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');

  const agentNames = useMemo(() => {
    const map = {};
    (metrics?.byAgent ?? []).forEach((a) => { map[a.agentId] = a.name; });
    return map;
  }, [metrics]);

  const agentOptions = useMemo(
    () => (metrics?.byAgent ?? []).map((a) => ({ value: a.agentId, label: a.name })),
    [metrics],
  );

  const filtered = useMemo(() => {
    let list = tickets;
    if (statusFilter !== 'all') list = list.filter((t) => t.status === statusFilter);
    if (agentFilter !== 'all') list = list.filter((t) => t.agentId === agentFilter);
    return list;
  }, [tickets, statusFilter, agentFilter]);

  if (isError) {
    return <ErrorCard title="We couldn't load support tickets" message={error} onRetry={refetch} />;
  }

  const openCount = metrics?.openCount ?? 0;
  const closedCount = metrics?.closedCount ?? 0;
  const unansweredCount = metrics?.unansweredCount ?? 0;
  // avgFirstResponseHours is null/undefined when no first responses exist —
  // only surface the Avg-response stat when there's a real figure to show.
  const avgHours = metrics?.avgFirstResponseHours;
  const hasAvg = typeof avgHours === 'number' && avgHours > 0;

  return (
    <>
      {/* HERO — oversight summary */}
      <section className={`${styles.card} ${styles.cardGrad}`} aria-label="Support oversight">
        <header className={styles.cardHd} style={{ marginBottom: 6 }}>
          <div>
            <div className={styles.eyebrow}>Support oversight</div>
            <h3 style={{ marginTop: 3 }}>
              {formatNumber(openCount)} open · {formatNumber(closedCount)} closed
            </h3>
          </div>
          {unansweredCount > 0 && (
            <span className={`${styles.pill} ${styles.warn}`}>
              <i />{formatNumber(unansweredCount)} unanswered
            </span>
          )}
        </header>
        <p className={styles.scoreNote}>
          Read-only view of tickets your agents are handling for subscribers across this branch.
        </p>
        <div className={styles.statStrip}>
          <div>
            <b style={{ color: 'var(--color-poor-ink, #B02530)' }}>{formatNumber(openCount)}</b>
            <small>Open</small>
          </div>
          <div>
            <b>{formatNumber(closedCount)}</b>
            <small>Closed</small>
          </div>
          <div>
            <b>{hasAvg ? `${avgHours.toFixed(1)}h` : '—'}</b>
            <small>Avg response</small>
          </div>
        </div>
      </section>

      {/* FILTERS — status pills + cosmetic agent select */}
      <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
        <div className={styles.actHead} style={{ flex: 1 }} role="group" aria-label="Filter by status">
          {STATUS_PILLS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`${styles.fpill} ${statusFilter === p.value ? styles.fpillOn : ''}`}
              aria-pressed={statusFilter === p.value}
              onClick={() => setStatusFilter(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <select
          className={styles.select}
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          aria-label="Filter by agent"
        >
          <option value="all">All agents</option>
          {agentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* TICKET LIST */}
      <section className={styles.card} aria-label="Tickets">
        {isLoading && !tickets.length ? (
          <p className={styles.scoreNote}>Loading tickets…</p>
        ) : filtered.length === 0 ? (
          <p className={styles.scoreNote}>
            No tickets to show. Support conversations raised by subscribers in this branch will
            appear here.
          </p>
        ) : (
          filtered.map((t) => {
            const isOpen = t.status === TICKET_STATUS.OPEN;
            const isUrgent = isOpen && t.priority === TICKET_PRIORITY.URGENT;
            const hasUnread = isOpen && (t.unread?.agent ?? 0) > 0;
            const agentName = agentNames[t.agentId] || 'Branch ticket';
            const statusPillClass = isUrgent ? styles.bad : isOpen ? styles.warn : styles.off;
            const statusLabel = isUrgent ? 'Urgent' : isOpen ? 'Open' : 'Closed';
            return (
              <NavLink
                to={`/dashboard/support/${t.id}`}
                key={t.id}
                className={`${styles.trow} ${hasUnread ? '' : styles.trowRead}`}
                aria-label={`${t.subject} — ${statusLabel}, ${agentName}`}
              >
                <span className={styles.unread} aria-hidden="true"><i /></span>
                <span className={styles.trowB}>
                  <span className={styles.trowTop}>
                    <b>{t.subject}</b>
                    <time>{formatRelativeTime(t.updatedAt)}</time>
                  </span>
                  <span className={styles.trowSub}>
                    <span
                      className={`${styles.pill} ${statusPillClass}`}
                      style={{ padding: '3px 8px' }}
                    >
                      <i />{statusLabel}
                    </span>
                    {agentName}
                  </span>
                </span>
              </NavLink>
            );
          })
        )}
      </section>

      {/* READ-ONLY OVERSIGHT NOTE */}
      <div className={styles.roNote}>
        {EyeIcon}
        You're viewing support as branch oversight. Replies are handled by the assigned agent — you
        can monitor conversations but not respond here.
      </div>
    </>
  );
}
