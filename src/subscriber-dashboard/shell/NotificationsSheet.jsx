import BottomSheet from './BottomSheet';
import { formatDate } from '../../utils/date';
import sheet from './subscriberSheets.module.css';

/**
 * NotificationsSheet — the Notifications bottom sheet opened from the mobile app
 * bar. Renders the client-derived feed from useSubscriberNotifications (lifted to
 * the shell so the app-bar unread dot and this list share one read-state).
 */
export default function NotificationsSheet({ open, onClose, items = [], isUnread, markAllRead, unread = 0 }) {
  const headerRight =
    unread > 0 ? (
      <button type="button" className={sheet.markAll} onClick={markAllRead}>
        Mark all read
      </button>
    ) : null;

  return (
    <BottomSheet open={open} onClose={onClose} title="Notifications" height="80%" headerRight={headerRight}>
      {items.length === 0 ? (
        <p className={sheet.empty}>You&apos;re all caught up.</p>
      ) : (
        items.map((item) => {
          const read = !isUnread?.(item);
          return (
            <div key={item.id} className={`${sheet.nrow} ${read ? sheet.read : ''}`}>
              <span className={sheet.ndot} aria-hidden="true">
                <i />
              </span>
              <div className={sheet.nbody}>
                <b>{item.title}</b>
                <p>{item.body}</p>
                {item.date && <time>{formatDate(item.date, { variant: 'day-month' })}</time>}
              </div>
            </div>
          );
        })
      )}
    </BottomSheet>
  );
}
