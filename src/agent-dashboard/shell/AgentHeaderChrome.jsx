import { useNavigate } from 'react-router-dom';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useAgentUnreadTicketCount } from '../../hooks/useTickets';
import NotificationBell from '../../components/notifications/NotificationBell';
import styles from './AgentHeaderChrome.module.css';

// Cap the numeric badge so a busy inbox never blows out the icon footprint.
function badgeText(count) {
  return count > 9 ? '9+' : String(count);
}

// Instagram-style "Direct" paper-airplane glyph — the icon users associate with
// DMs/messages (shared with the Home PulseCard inbox action).
const InboxIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="21" height="21">
    <path d="M22 2L11 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * useAgentHeaderChrome — builds the agent's persistent mobile header actions for
 * the HeroCapsule dome top bar: the notification bell (leadingSlot, top-left)
 * and the inbox entry point (trailingSlot, top-right). Each is wrapped in a 44px
 * cell that hides its contents at >=1024px, so the desktop sidebar keeps sole
 * ownership of the bell (no duplicate) while the dome title stays centered.
 *
 * Drop the returned slots into any tab-root page's <PageHeader variant="hero" …>
 * (Subscribers / Analytics / Commissions / Settings / Inbox) or directly into a
 * <HeroCapsule …> (Home's PulseCard).
 *
 * @param {{ showInbox?: boolean }} [opts] - pass showInbox:false to omit the
 *   inbox action (the Inbox page itself, and Home which keeps its own inbox).
 * @returns {{ leadingSlot?: import('react').ReactNode, trailingSlot?: import('react').ReactNode }}
 */
export function useAgentHeaderChrome({ showInbox = true } = {}) {
  const { agentId } = useAgentScope();
  const navigate = useNavigate();
  const unreadCount = useAgentUnreadTicketCount(agentId);

  if (!agentId) return {};

  const hasUnread = unreadCount > 0;

  const leadingSlot = (
    <span className={styles.cell}>
      <NotificationBell role="agent" entityId={agentId} align="left" tone="onIndigo" />
    </span>
  );

  const trailingSlot = showInbox ? (
    <span className={styles.cell}>
      <button
        type="button"
        className={styles.inboxBtn}
        onClick={() => navigate('/dashboard/inbox')}
        aria-label={hasUnread ? `Open your inbox (${unreadCount} unread)` : 'Open your inbox'}
      >
        {InboxIcon}
        {hasUnread && (
          <span className={styles.inboxBadge} aria-hidden="true">{badgeText(unreadCount)}</span>
        )}
      </button>
    </span>
  ) : undefined;

  return { leadingSlot, trailingSlot };
}
