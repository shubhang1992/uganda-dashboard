import { useNotifications, useMarkNotificationsRead } from '../../hooks/useNotifications';
import { formatRelativeTime } from '../../utils/date';
import SkeletonRow from '../SkeletonRow';
import styles from './Notifications.module.css';

/**
 * NotificationList — the feed body rendered inside the NotificationBell popover.
 * Lists one recipient's notifications newest-first (the service already sorts),
 * each row showing title, body, a short relative date, and an unread dot.
 *
 * Self-contained + reusable across agent and branch: the only inputs are the
 * recipient `role` + `entityId`. "Mark all read" marks every unread row for the
 * recipient via useMarkNotificationsRead (ids omitted → all). The bell badge,
 * which polls useUnreadNotificationCount, drops to 0 once the mutation's
 * onSuccess invalidates the 'notificationsUnread' key.
 */
export default function NotificationList({ role, entityId, onClose }) {
  const { data: items, isLoading, isError } = useNotifications({ role, entityId });
  const markRead = useMarkNotificationsRead();

  const list = items || [];
  const hasUnread = list.some((n) => !n.isRead);

  function handleMarkAll() {
    if (!hasUnread || markRead.isPending) return;
    markRead.mutate({ role, entityId });
  }

  return (
    <div className={styles.panel}>
      <header className={styles.panelHead}>
        <span className={styles.panelTitle}>Notifications</span>
        <button
          type="button"
          className={styles.markAll}
          onClick={handleMarkAll}
          disabled={!hasUnread || markRead.isPending}
        >
          Mark all read
        </button>
      </header>

      <div className={styles.feed}>
        {isLoading && (
          <div className={styles.feedLoading}>
            <SkeletonRow count={4} variant="compact" label="Loading notifications" />
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
            <p className={styles.emptyText}>New activity will show up here.</p>
          </div>
        )}

        {!isLoading && !isError && list.length > 0 && (
          <ul className={styles.feedList}>
            {list.map((n) => (
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

      {onClose && (
        <footer className={styles.panelFoot}>
          <button type="button" className={styles.closeLink} onClick={onClose}>
            Close
          </button>
        </footer>
      )}
    </div>
  );
}
