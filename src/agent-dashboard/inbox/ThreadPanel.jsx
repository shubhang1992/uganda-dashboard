import { useEffect, useRef } from 'react';
import { useTicketThread, useMarkTicketRead } from '../../hooks/useTickets';
import { SENDER_ROLE, TICKET_STATUS } from '../../data/ticketsSeed';
import ThreadView from '../../components/tickets/ThreadView';
import { ThreadActions } from './ThreadActions';
import { ReplyComposer } from './ReplyComposer';
import styles from '../pages/InboxPage.module.css';

// ─── Selected-thread surface ─────────────────────────────────────────────────
// Pulls the full thread, marks it read for the agent once on open, and renders
// the shared ThreadView with an agent composer + Close/Reopen actions.
export function ThreadPanel({ ticketId, participantLabel, onBack }) {
  const { data: ticket, isLoading, isError, error, refetch } = useTicketThread(ticketId);
  const markRead = useMarkTicketRead(ticketId);

  // Mark read exactly once per opened ticket. The mutation is idempotent (it
  // zeroes the agent's unread counter), but we still guard so a poll-driven
  // refetch doesn't re-fire it.
  const markedRef = useRef(null);
  useEffect(() => {
    if (!ticket || markedRef.current === ticketId) return;
    if ((ticket.unread?.agent ?? 0) > 0) {
      markRead.mutate({ viewer: SENDER_ROLE.AGENT });
    }
    markedRef.current = ticketId;
  }, [ticket, ticketId, markRead]);

  const status = ticket?.status;
  const isClosed = status === TICKET_STATUS.CLOSED;

  return (
    <div className={styles.threadWrap}>
      <ThreadView
        ticket={ticket}
        messages={ticket?.messages ?? []}
        currentRole="agent"
        participantLabel={participantLabel}
        onBack={onBack}
        loading={isLoading && !ticket}
        error={isError ? error : undefined}
        onRetry={refetch}
        headerActions={ticket ? <ThreadActions ticketId={ticketId} status={status} /> : null}
        footer={ticket ? <ReplyComposer ticketId={ticketId} disabled={isClosed} /> : null}
      />
    </div>
  );
}
