import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useTicketThread, useBranchTicketMetrics } from '../../hooks/useTickets';
import { SENDER_ROLE, TICKET_STATUS, TICKET_PRIORITY } from '../../data/ticketsSeed';
import { formatDate } from '../../utils/date';
import ErrorCard from '../../components/feedback/ErrorCard';
import EmptyState from '../../components/EmptyState';
import styles from './branchMobile.module.css';

/* Darker teal for the agent (support-side) bubble — a one-off the approved
   mockup uses for AA-contrast white text; no token maps to it. */
const AGENT_BUBBLE = '#1F6E7A';

const EyeIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/* Per-sender bubble label. The thread carries no display names, so the
   requester is a generic "Subscriber" and the support side names the assigned
   agent when the branch metrics resolve it (else a neutral "Support agent"). */
function whoLabel(sender, agentName) {
  switch (sender) {
    case SENDER_ROLE.SUBSCRIBER:
      return 'Subscriber';
    case SENDER_ROLE.AGENT:
      return agentName ? `Agent · ${agentName}` : 'Agent';
    case SENDER_ROLE.SYSTEM:
      return 'Support';
    default:
      return 'Message';
  }
}

/**
 * ThreadMobile — the branch admin PHONE support thread (read-only oversight).
 * Reached via /dashboard/support/:ticketId. Mirrors SupportDesktop's data
 * honesty: useTicketThread(id) for the transcript and useBranchTicketMetrics
 * for the assigned-agent name (the thread itself carries no display names).
 * Branch can MONITOR but not reply — there is no composer, only a read-only
 * oversight note. Subscriber/system messages sit left (cloud), the agent's
 * replies sit right in a darker-teal bubble for AA-contrast white text.
 */
export default function ThreadMobile() {
  const { ticketId } = useParams();
  const { branchId } = useBranchScope();

  const { data: thread, isLoading, isError, error, refetch } = useTicketThread(ticketId);
  const { data: metrics } = useBranchTicketMetrics(branchId);

  const agentName = useMemo(() => {
    if (!thread?.agentId) return null;
    const row = (metrics?.byAgent ?? []).find((a) => a.agentId === thread.agentId);
    return row?.name ?? null;
  }, [thread, metrics]);

  if (isError) {
    return (
      <ErrorCard
        title="We couldn't load this conversation"
        message={error}
        onRetry={refetch}
      />
    );
  }

  if (isLoading && !thread) {
    return <div className={styles.loading}><div className={styles.spinner} /></div>;
  }

  if (!thread) {
    return (
      <section className={styles.card} aria-label="Support thread">
        <EmptyState
          kind="no-data"
          title="Conversation not found"
          body="This ticket may have been removed, or the link is no longer valid. Head back to the support inbox to pick another conversation."
        />
      </section>
    );
  }

  const messages = thread.messages ?? [];
  const isClosed = thread.status === TICKET_STATUS.CLOSED;
  const isUrgent = thread.priority === TICKET_PRIORITY.URGENT;
  // Status pill: closed → neutral; open+urgent → red; open → amber.
  const pillTone = isClosed ? styles.off : isUrgent ? styles.bad : styles.warn;
  const pillText = isClosed ? 'Closed' : isUrgent ? 'Urgent' : 'Open';

  const handledBy = agentName ? `handled by ${agentName}` : 'unassigned';
  const openedOn = formatDate(thread.createdAt, { variant: 'day-month' });

  return (
    <>
      {/* HEADER — subject + status + handling summary */}
      <section className={`${styles.card} ${styles.cardGrad}`} aria-label="Ticket summary">
        <header className={styles.cardHd} style={{ marginBottom: 6 }}>
          <h3 style={{ fontSize: 15 }}>{thread.subject || 'Support ticket'}</h3>
          <span className={`${styles.pill} ${pillTone}`}>
            <i />{pillText}
          </span>
        </header>
        <div style={{ fontSize: 11.5, color: 'var(--color-gray)' }}>
          Subscriber · {handledBy} · opened {openedOn}
        </div>
      </section>

      {/* TRANSCRIPT — read-only bubbles */}
      <section className={styles.card} aria-label="Conversation">
        {messages.length === 0 ? (
          <p className={styles.scoreNote}>No messages in this conversation yet.</p>
        ) : (
          messages.map((m) => {
            const mine = m.sender === SENDER_ROLE.AGENT || m.sender === SENDER_ROLE.EMPLOYER;
            return (
              <div
                key={m.id}
                className={`${styles.msg} ${mine ? styles.msgYou : styles.msgThem}`}
                style={mine ? { background: AGENT_BUBBLE } : undefined}
              >
                <div className={styles.msgWho} style={mine ? { color: 'var(--color-white)' } : undefined}>
                  {whoLabel(m.sender, agentName)}
                </div>
                {m.body}
              </div>
            );
          })
        )}
      </section>

      {/* READ-ONLY OVERSIGHT NOTE — branch can monitor, not reply */}
      <div className={styles.roNote}>
        {EyeIcon}
        You&rsquo;re viewing this as branch oversight. Replies are handled by the assigned agent &mdash; you can monitor but not respond here.
      </div>
    </>
  );
}
