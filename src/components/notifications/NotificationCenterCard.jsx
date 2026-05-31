import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationsRead,
} from '../../hooks/useNotifications';
import { formatRelativeTime } from '../../utils/date';
import SkeletonRow from '../SkeletonRow';
import styles from './Notifications.module.css';

const MAX_VISIBLE = 4;

const BellIcon = (
  <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden="true">
    <path
      d="M6 9a6 6 0 0112 0c0 4.5 1.2 6 1.8 6.6a.6.6 0 01-.42 1.02H4.62a.6.6 0 01-.42-1.02C4.8 15 6 13.5 6 9z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M10 19.5a2 2 0 004 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

/**
 * NotificationCenterCard — a compact in-dashboard "notification centre" widget.
 * Unlike the nav-bar NotificationBell (a popover), this renders the feed inline
 * on a dashboard home/overview so it's always visible. Shows the latest few
 * notifications newest-first with an unread badge + "Mark all read"; any beyond
 * MAX_VISIBLE are summarised in the footer (the bell popover shows the full list).
 *
 * Reusable across agent (role="agent") and branch (role="branch") — the only
 * inputs are the recipient `role` + `entityId`. Reuses the shared feed-row +
 * empty/loading styles from Notifications.module.css.
 */
export default function NotificationCenterCard({ role, entityId, title = 'Notifications' }) {
  const { data: items, isLoading, isError } = useNotifications({ role, entityId });
  // Derive the unread count from the SAME cache entry the bell badge reads
  // (useUnreadNotificationCount → ['notificationsUnread']) rather than counting
  // this card's own list, so the inline card and the header bell can never show
  // disagreeing counts within a session. The list query (above) polls on the
  // same cadence, so the rendered rows stay in step with the count too.
  const { data: unread = 0 } = useUnreadNotificationCount({ role, entityId });
  const markRead = useMarkNotificationsRead();

  if (!role || !entityId) return null;

  const list = items || [];
  const visible = list.slice(0, MAX_VISIBLE);
  const remaining = Math.max(0, list.length - visible.length);

  function handleMarkAll() {
    if (unread === 0 || markRead.isPending) return;
    markRead.mutate({ role, entityId });
  }

  return (
    <section className={styles.card} aria-label="Notification centre">
      <header className={styles.cardHead}>
        <span className={styles.cardTitleWrap}>
          <span className={styles.cardBell} aria-hidden="true">{BellIcon}</span>
          <span className={styles.cardTitle}>{title}</span>
          {unread > 0 && (
            <span className={styles.cardBadge} aria-label={`${unread} unread`}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </span>
        <button
          type="button"
          className={styles.markAll}
          onClick={handleMarkAll}
          disabled={unread === 0 || markRead.isPending}
        >
          Mark all read
        </button>
      </header>

      <div className={styles.cardFeed}>
        {isLoading && (
          <div className={styles.feedLoading}>
            <SkeletonRow count={3} variant="compact" label="Loading notifications" />
          </div>
        )}

        {isError && !isLoading && (
          <div className={styles.feedEmpty}>
            <p className={styles.emptyTitle}>Couldn&apos;t load notifications</p>
            <p className={styles.emptyText}>Please try again in a moment.</p>
          </div>
        )}

        {!isLoading && !isError && list.length === 0 && (
          <div className={styles.feedEmpty}>
            <p className={styles.emptyTitle}>You&apos;re all caught up</p>
            <p className={styles.emptyText}>Settlement updates will show up here.</p>
          </div>
        )}

        {!isLoading && !isError && visible.length > 0 && (
          <ul className={styles.feedList}>
            {visible.map((n) => (
              <li key={n.id} className={styles.itemRow} data-unread={!n.isRead || undefined}>
                {!n.isRead && <span className={styles.unreadDot} aria-hidden="true" />}
                <div className={styles.itemBody}>
                  <div className={styles.itemTop}>
                    <span className={styles.itemTitle}>{n.title}</span>
                    <span className={styles.itemDate}>
                      {formatRelativeTime(n.createdAt, { now: n.nowAnchor })}
                    </span>
                  </div>
                  {n.body && <p className={styles.itemText}>{n.body}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {remaining > 0 && (
        <footer className={styles.cardMore}>
          +{remaining} earlier {remaining === 1 ? 'notification' : 'notifications'}
        </footer>
      )}
    </section>
  );
}
