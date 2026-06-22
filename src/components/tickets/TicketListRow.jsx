import { getInitials } from '../../utils/dashboard';
import { formatRelativeTime } from '../../utils/date';
import { TICKET_STATUS, TICKET_PRIORITY } from '../../data/ticketsSeed';
import TicketStatusBadge from './TicketStatusBadge';
import styles from './TicketListRow.module.css';

/**
 * One clickable row in a ticket inbox / list.
 *
 * Renders a button with a leading initials avatar, the subject (bold, single
 * line), a muted last-message preview, and a trailing column carrying the
 * relative `updatedAt`, an optional unread dot, and the status badge.
 *
 * Reused across roles: subscribers and agents see their own inbox; branch /
 * distributor oversight passes `title` (the counterpart's name) and `subtitle`
 * (an id) to relabel the leading line without changing the underlying ticket.
 *
 * Pure presentation — no data imports beyond the frozen contract enums.
 *
 * @param {object}   props
 * @param {object}   props.ticket        TicketSummary: { subject, lastMessagePreview, updatedAt, status, priority, unread, subscriberId, agentId }
 * @param {Function} [props.onClick]     Invoked with the ticket when the row is activated.
 * @param {'subscriber'|'agent'} [props.unreadFor]  Whose unread counter drives the dot.
 * @param {string}   [props.title]       Overrides the leading line (defaults to ticket.subject).
 * @param {string}   [props.subtitle]    Optional small line under the subject (oversight contexts).
 * @param {boolean}  [props.hideAvatar]  Drop the leading initials avatar (self-inbox contexts
 *                                        where it's just the subject's initials, not a person).
 */
export default function TicketListRow({ ticket, onClick, unreadFor, title, subtitle, hideAvatar = false }) {
  const { subject, lastMessagePreview, updatedAt, status, priority, unread } = ticket;

  const leadLine = title || subject;
  const hasUnread = unreadFor != null && (unread?.[unreadFor] ?? 0) > 0;
  // Urgent styling only applies while the ticket is still open — a closed
  // urgent ticket is resolved, so it reads as a plain closed badge.
  const isUrgent = priority === TICKET_PRIORITY.URGENT && status === TICKET_STATUS.OPEN;

  return (
    <button
      type="button"
      className={styles.row}
      data-no-avatar={hideAvatar || undefined}
      onClick={() => onClick?.(ticket)}
      aria-label={hasUnread ? `${leadLine} (unread)` : leadLine}
    >
      {!hideAvatar && (
        <span className={styles.avatar} aria-hidden="true">
          {getInitials(leadLine)}
        </span>
      )}

      <div className={styles.body}>
        <div className={styles.subject}>
          <span>{leadLine}</span>
        </div>
        {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
        <div className={styles.preview}>{lastMessagePreview}</div>
      </div>

      <div className={styles.trailing}>
        <time className={styles.time} dateTime={updatedAt}>
          {formatRelativeTime(updatedAt)}
        </time>
        <div className={styles.markers}>
          {hasUnread ? <span className={styles.unreadDot} aria-hidden="true" /> : null}
          <TicketStatusBadge status={status} urgent={isUrgent} />
        </div>
      </div>
    </button>
  );
}
