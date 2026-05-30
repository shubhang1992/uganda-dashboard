// TicketStatusBadge — Phase 0 of the support-ticketing feature.
//
// Pure-prop, reusable status pill following the StatusPill idiom from
// `agent-dashboard/pages/SubscribersPage`: a small pill with a status dot
// (decorative, aria-hidden) + a text label (which carries the meaning).
//
// Zero data imports — it only consumes its props. It imports TICKET_STATUS
// from the ticketing seed purely as a CONTRACT CONSTANT (the frozen status
// vocabulary), never any seed data, so the badge can never drift from the
// canonical status strings.
import { TICKET_STATUS } from '../../data/ticketsSeed';
import styles from './TicketStatusBadge.module.css';

const LABEL = {
  [TICKET_STATUS.OPEN]: 'Open',
  [TICKET_STATUS.CLOSED]: 'Closed',
};

/**
 * @param {object} props
 * @param {'open' | 'closed'} props.status   Ticket lifecycle state.
 * @param {boolean} [props.urgent]           Flag urgency (only meaningful when open).
 * @param {'sm' | 'md'} [props.size='md']    Pill scale.
 */
export default function TicketStatusBadge({ status, urgent = false, size = 'md' }) {
  // `urgent` is only meaningful for open tickets — a closed ticket is never
  // shown as urgent, mirroring the two-state lifecycle in the contract.
  const isUrgent = urgent && status === TICKET_STATUS.OPEN;
  const label = LABEL[status] ?? status;

  return (
    <span
      className={styles.badge}
      data-tone={status}
      data-size={size}
      data-urgent={isUrgent ? '' : undefined}
    >
      <span className={styles.dot} aria-hidden="true" />
      {label}
      {isUrgent && (
        <>
          <span className={styles.urgentDot} aria-hidden="true" />
          <span className={styles.urgentLabel}>Urgent</span>
        </>
      )}
    </span>
  );
}
