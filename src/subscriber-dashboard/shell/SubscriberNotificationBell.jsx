import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { useCurrentSubscriber } from '../../hooks/useSubscriber';
import { useOutsideClick } from '../../hooks/useOutsideClick';
import { formatRelativeTime } from '../../utils/date';
import { useSubscriberNotifications } from './useSubscriberNotifications';
import styles from '../../components/notifications/Notifications.module.css';

const BellIcon = (
  <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
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
 * SubscriberNotificationBell — the desktop subscriber's notification centre,
 * mounted in SubscriberDesktopShell's top-right corner beside the Ask-AI pill
 * (mirrors the agent shell's NotificationBell placement).
 *
 * The shared NotificationBell is bound to the agent/branch notifications service,
 * so this is a subscriber-owned twin: it reuses Notifications.module.css for
 * styling (import-only — no edit to the shared component) and renders a
 * CLIENT-DERIVED feed from useSubscriberNotifications. Self-hides until the
 * subscriber resolves. Non-modal disclosure: aria-expanded + aria-controls,
 * Escape + click-outside close (shared useOutsideClick), body-portal popover with
 * fixed positioning measured from the bell so it escapes the shell's
 * overflow:hidden and stays anchored on resize/scroll.
 */
export default function SubscriberNotificationBell() {
  const { data: sub } = useCurrentSubscriber();
  const { items, unread, isUnread, markAllRead } = useSubscriberNotifications(sub);

  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const popoverId = useId();
  const wrapRef = useRef(null);
  const popoverRef = useRef(null);
  const reduceMotion = useReducedMotion();

  const close = useCallback(() => setOpen(false), []);
  // When portaled, the popover leaves `.wrap`, so a click inside it would count
  // as "outside" and self-close — treat the popover node as inside too.
  const outsideRefs = useMemo(() => [wrapRef, popoverRef], []);
  useOutsideClick(open, close, outsideRefs);

  // Pin the portaled popover with fixed positioning measured from the bell so it
  // renders outside the shell's clipping ancestor; recompute while open.
  useLayoutEffect(() => {
    if (!open) return undefined;
    function measure() {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCoords({ top: r.bottom + 10, right: window.innerWidth - r.right });
    }
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open]);

  if (!sub) return null;

  const badgeLabel = unread > 9 ? '9+' : String(unread);

  function handleMarkAll() {
    if (unread === 0) return;
    markAllRead();
  }

  const popoverTree = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={popoverRef}
          id={popoverId}
          className={`${styles.popover} ${styles.popoverFixed}`}
          style={coords || undefined}
          role="region"
          aria-label="Notifications"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.2, ease: EASE_OUT_EXPO }}
        >
          <div className={styles.panel}>
            <header className={styles.panelHead}>
              <span className={styles.panelTitle}>Notifications</span>
              <button
                type="button"
                className={styles.markAll}
                onClick={handleMarkAll}
                disabled={unread === 0}
              >
                Mark all read
              </button>
            </header>

            <div className={styles.feed}>
              {items.length === 0 ? (
                <div className={styles.feedEmpty}>
                  <p className={styles.emptyTitle}>You&apos;re all caught up</p>
                  <p className={styles.emptyText}>New activity will show up here.</p>
                </div>
              ) : (
                <ul className={styles.feedList}>
                  {items.map((n) => {
                    const unreadItem = isUnread(n);
                    return (
                      <li key={n.id} className={styles.itemRow} data-unread={unreadItem || undefined}>
                        {unreadItem && <span className={styles.unreadDot} aria-hidden="true" />}
                        <div className={styles.itemBody}>
                          <div className={styles.itemTop}>
                            <span className={styles.itemTitle}>{n.title}</span>
                            <span className={styles.itemDate}>{formatRelativeTime(n.date)}</span>
                          </div>
                          {n.body && <p className={styles.itemText}>{n.body}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <footer className={styles.panelFoot}>
              <button type="button" className={styles.closeLink} onClick={close}>
                Close
              </button>
            </footer>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.bell}
        aria-label="Notifications"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={styles.bellIcon}>{BellIcon}</span>
        {unread > 0 && (
          <span className={styles.badge} aria-label={`${unread} unread`}>
            {badgeLabel}
          </span>
        )}
      </button>

      {createPortal(popoverTree, document.body)}
    </div>
  );
}
