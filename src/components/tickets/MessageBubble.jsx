import styles from './MessageBubble.module.css';
import { SENDER_ROLE } from '../../data/ticketsSeed';
import { formatDate } from '../../utils/date';

/**
 * MessageBubble — a single message in a support-ticket thread. Phase 0 of the
 * subscriber ⇄ agent support inbox.
 *
 * Pure presentational primitive: it owns no state, fetches nothing, and takes
 * no callbacks — the parent thread view decides which messages to render and
 * whether each is "mine". (The `SENDER_ROLE` import is a frozen contract enum
 * from `ticketsSeed`, not data — see that file's header.)
 *
 * Three visual modes:
 *   - mine === true            → right-aligned, filled indigo bubble, light text
 *     (the current viewer's own messages, whichever role they are).
 *   - mine === false (default) → left-aligned, neutral/lavender bubble, dark
 *     text (the other party's messages).
 *   - sender === 'system'      → centered muted pill, no bubble tail, `mine`
 *     ignored (lifecycle lines such as "Ticket reopened by subscriber").
 *
 * The clock time is rendered beneath the body via the shared `formatDate`
 * helper (`variant: 'time'` → "14:32") so timestamp formatting stays in one
 * place; the bubble never does its own date math.
 *
 * @param {Object} props
 * @param {'subscriber'|'agent'|'system'} props.sender — who wrote the message.
 * @param {string} props.body — the message text.
 * @param {string} props.at — ISO timestamp; formatted to a clock time.
 * @param {boolean} [props.mine] — true aligns/styles the bubble as the viewer's
 *   own message. Ignored for `system` messages.
 */
export default function MessageBubble({ sender, body, at, mine = false }) {
  const time = formatDate(at, { variant: 'time' });

  // System lines are lifecycle markers, not conversation: centered, muted, no
  // alignment to either party and `mine` is never consulted.
  if (sender === SENDER_ROLE.SYSTEM) {
    return (
      <div className={styles.systemRow}>
        <p className={styles.systemPill}>
          <span className={styles.systemBody}>{body}</span>
          <time className={styles.systemTime} dateTime={at}>{time}</time>
        </p>
      </div>
    );
  }

  const rowClass = `${styles.row} ${mine ? styles.rowMine : styles.rowTheirs}`;
  const bubbleClass = `${styles.bubble} ${mine ? styles.mine : styles.theirs}`;

  return (
    <div className={rowClass}>
      <div className={bubbleClass}>
        <p className={styles.body}>{body}</p>
        <time className={styles.time} dateTime={at}>{time}</time>
      </div>
    </div>
  );
}
