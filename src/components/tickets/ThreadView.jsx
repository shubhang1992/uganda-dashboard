import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { SENDER_ROLE, TICKET_PRIORITY } from '../../data/ticketsSeed';
import SkeletonRow from '../SkeletonRow';
import EmptyState from '../EmptyState';
import ErrorCard from '../feedback/ErrorCard';
import MessageBubble from './MessageBubble';
import TicketStatusBadge from './TicketStatusBadge';
import styles from './ThreadView.module.css';

/**
 * ThreadView — the read-only conversation surface shared by all four
 * dashboards (subscriber, agent, branch, distributor).
 *
 * It renders one ticket's header + scrollable message log and nothing more on
 * its own: the surface becomes *interactive* only when a caller passes a
 * `footer` (a composer) and/or `headerActions` (e.g. Close / Reopen buttons).
 * Subscriber and agent pass a composer; branch and distributor pass none, so
 * for those oversight roles the same component reads as a faithful, read-only
 * transcript. This keeps the four inboxes pixel-consistent without four copies
 * of the thread layout.
 *
 * "Mine" alignment is purely presentational: a message is right-aligned when
 * `message.sender === currentRole`, except SYSTEM lines which are always
 * rendered centred regardless of who is viewing. This single equality covers
 * every interactive role additively: subscriber, agent, and — Phase 7 —
 * 'employer' (an employer viewing its own employer↔platform thread sees its
 * `employer` messages on the right and the canned `system` support replies
 * centred). The oversight roles ('branch' | 'distributor') never match a
 * `SENDER_ROLE`, so every bubble sits on the left for them — exactly the
 * neutral observer framing we want.
 *
 * The log auto-scrolls to the newest message on mount and whenever the message
 * count grows (e.g. a fresh reply lands). The jump is instant when the user
 * prefers reduced motion, smooth otherwise.
 *
 * Loading / error / empty follow the project's standard async triad:
 * <SkeletonRow> while resolving, <ErrorCard onRetry> on failure, and an
 * <EmptyState kind="no-data"> when the ticket has no messages yet.
 *
 * Status / category / priority vocabulary is never inlined — the enum used
 * here (`SENDER_ROLE`) comes from the frozen contract in `ticketsSeed.js`, and
 * the <TicketStatusBadge> owns the status + priority chips.
 *
 * @param {Object} props
 * @param {Object} props.ticket — TicketSummary or full Ticket; reads
 *   `subject`, `status`, `priority`.
 * @param {Array}  [props.messages=[]] — Message[] oldest → newest.
 * @param {'subscriber'|'agent'|'employer'|'branch'|'distributor'} props.currentRole —
 *   the viewer's role; a message is "mine" when `message.sender === currentRole`.
 * @param {string} [props.participantLabel] — header subline (e.g. the agent or
 *   subscriber name) identifying the other party in the thread.
 * @param {React.ReactNode} [props.headerActions] — optional header slot for
 *   actions (Close / Reopen). Oversight roles pass none.
 * @param {React.ReactNode} [props.footer] — optional composer pinned to the
 *   bottom. Subscriber / agent pass one; branch / distributor pass none → the
 *   thread stays read-only.
 * @param {Function} [props.onBack] — optional `() => void`; renders a
 *   "All tickets" back affordance in the header when supplied.
 * @param {boolean} [props.loading] — show the loading skeleton.
 * @param {string|Error} [props.error] — show the error card when truthy.
 * @param {Function} [props.onRetry] — retry handler forwarded to <ErrorCard>.
 */
export default function ThreadView({
  ticket,
  messages = [],
  currentRole,
  participantLabel,
  headerActions,
  footer,
  onBack,
  loading,
  error,
  onRetry,
}) {
  const reduce = useReducedMotion();
  const logRef = useRef(null);
  const endRef = useRef(null);

  // Auto-scroll to the newest message on mount and whenever the thread grows.
  // We key the effect on the message count rather than the array identity so a
  // re-render that re-uses the same messages doesn't yank the user back down
  // mid-read. The scroll is instant under prefers-reduced-motion.
  const messageCount = messages.length;
  useEffect(() => {
    if (loading || error) return;
    const end = endRef.current;
    const log = logRef.current;
    if (!end || !log) return;
    end.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }, [messageCount, loading, error, reduce]);

  return (
    <section className={styles.thread} aria-label="Conversation">
      <header className={styles.header}>
        {onBack && (
          <button
            type="button"
            className={styles.backBtn}
            onClick={onBack}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
              <path
                d="M15 19l-7-7 7-7"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            All tickets
          </button>
        )}

        <div className={styles.headerMain}>
          <div className={styles.titleRow}>
            <h2 className={styles.subject}>{ticket?.subject}</h2>
            {ticket && (
              <TicketStatusBadge
                status={ticket.status}
                urgent={ticket.priority === TICKET_PRIORITY.URGENT}
              />
            )}
          </div>
          {participantLabel && (
            <p className={styles.participant}>{participantLabel}</p>
          )}
        </div>

        {headerActions && (
          <div className={styles.headerActions}>{headerActions}</div>
        )}
      </header>

      <div className={styles.logWrap}>
        {loading ? (
          <SkeletonRow
            count={4}
            variant="compact"
            label="Loading conversation"
            className={styles.skeleton}
          />
        ) : error ? (
          <div className={styles.stateWrap}>
            <ErrorCard
              title="We couldn't load this conversation"
              message={error}
              onRetry={onRetry}
            />
          </div>
        ) : messageCount === 0 ? (
          <div className={styles.stateWrap}>
            <EmptyState
              kind="no-data"
              title="No messages yet"
              body="Messages in this conversation will appear here."
              className={styles.empty}
            />
          </div>
        ) : (
          <ol
            ref={logRef}
            className={styles.log}
            role="log"
            aria-live="polite"
            aria-label="Messages"
          >
            {messages.map((msg) => (
              <li key={msg.id} className={styles.logItem}>
                <MessageBubble
                  sender={msg.sender}
                  body={msg.body}
                  at={msg.at}
                  mine={
                    msg.sender === currentRole &&
                    msg.sender !== SENDER_ROLE.SYSTEM
                  }
                />
              </li>
            ))}
            {/* Scroll anchor — kept after the last item so scrollIntoView
                lands on the newest message without measuring heights. */}
            <li ref={endRef} className={styles.scrollAnchor} aria-hidden="true" />
          </ol>
        )}
      </div>

      {footer && !loading && !error && (
        <div className={styles.footer}>{footer}</div>
      )}
    </section>
  );
}
