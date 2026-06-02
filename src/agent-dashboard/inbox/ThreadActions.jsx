import { useCloseTicket, useReopenTicket } from '../../hooks/useTickets';
import { SENDER_ROLE, TICKET_STATUS } from '../../data/ticketsSeed';
import styles from '../pages/InboxPage.module.css';

// ─── Header actions (Resolve / Close · Reopen) ───────────────────────────────
export function ThreadActions({ ticketId, status }) {
  const closeTicket = useCloseTicket(ticketId);
  const reopenTicket = useReopenTicket(ticketId);
  const isOpen = status === TICKET_STATUS.OPEN;

  if (isOpen) {
    return (
      <button
        type="button"
        className={styles.actionBtn}
        onClick={() => closeTicket.mutate({ by: SENDER_ROLE.AGENT })}
        disabled={closeTicket.isPending}
      >
        <svg aria-hidden="true" viewBox="0 0 12 12" width="11" height="11" fill="none">
          <path d="M2.5 6.2l2.3 2.3L9.5 3.7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Resolve
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.actionBtn} ${styles.actionBtnGhost}`}
      onClick={() => reopenTicket.mutate({ by: SENDER_ROLE.AGENT })}
      disabled={reopenTicket.isPending}
    >
      <svg aria-hidden="true" viewBox="0 0 12 12" width="11" height="11" fill="none">
        <path d="M9.5 6a3.5 3.5 0 11-1-2.45M9.5 2v2H7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Reopen
    </button>
  );
}
