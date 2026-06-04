import { NavLink, useNavigate } from 'react-router-dom';
import { useCallback, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { useAuth } from '../../contexts/AuthContext';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useAgentUnreadTicketCount } from '../../hooks/useTickets';
import { useOutsideClick } from '../../hooks/useOutsideClick';
import {
  homeIcon,
  subscribersIcon,
  analyticsIcon,
  MOBILE_MORE_ITEMS as MORE_ITEMS,
} from './agentNav';
import styles from './BottomTabBar.module.css';

// Primary-tab icons come from the shared agentNav.js (same source the desktop
// rail uses) at the mobile 22px size — byte-identical to the SVGs that shipped
// here previously. The centre Onboard FAB glyph + the More glyph below stay
// inline: they are bottom-bar-bespoke (the FAB is a plus-only icon, not the
// rail's person+plus Onboard icon).
const HomeIcon = homeIcon(22);
const SubscribersIcon = subscribersIcon(22);
const AnalyticsIcon = analyticsIcon(22);

const MoreIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
    <circle cx="5" cy="12" r="1.6" fill="currentColor"/>
    <circle cx="12" cy="12" r="1.6" fill="currentColor"/>
    <circle cx="19" cy="12" r="1.6" fill="currentColor"/>
  </svg>
);

// Cap the numeric badge so a busy inbox never blows out the tab footprint.
function badgeText(count) {
  return count > 9 ? '9+' : String(count);
}

export default function BottomTabBar() {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);
  const { logout } = useAuth();
  const navigate = useNavigate();

  // Unread support badge — shared hook dedupes into the ['tickets','agent',id,'all']
  // fetch/poll used by the Inbox page, Home PulseCard, and mobile header chrome.
  const { agentId } = useAgentScope();
  const unreadCount = useAgentUnreadTicketCount(agentId);
  const hasUnread = unreadCount > 0;

  const closeMore = useCallback(() => setMoreOpen(false), []);
  // Memoise the refs array so useOutsideClick doesn't tear down + re-add its
  // document listeners on every render while the "More" popover is open.
  const moreOutsideRefs = useMemo(() => [moreRef], []);
  useOutsideClick(moreOpen, closeMore, moreOutsideRefs);

  function handleLogout() {
    closeMore();
    logout();
    navigate('/');
  }

  return (
    <nav className={styles.bar} aria-label="Quick navigation">
      <NavLink
        to="/dashboard"
        end
        className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
      >
        <span className={styles.tabIcon}>{HomeIcon}</span>
        <span className={styles.tabLabel}>Home</span>
      </NavLink>

      <NavLink
        to="/dashboard/subscribers"
        className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
      >
        <span className={styles.tabIcon}>{SubscribersIcon}</span>
        <span className={styles.tabLabel}>Subscribers</span>
      </NavLink>

      <NavLink
        to="/dashboard/onboard"
        className={({ isActive }) => `${styles.fab} ${isActive ? styles.fabActive : ''}`}
        aria-label="Onboard a subscriber"
      >
        <span className={styles.fabIcon}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="26" height="26">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"/>
          </svg>
        </span>
        <span className={styles.fabLabel}>Onboard</span>
      </NavLink>

      <NavLink
        to="/dashboard/analytics"
        className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
      >
        <span className={styles.tabIcon}>{AnalyticsIcon}</span>
        <span className={styles.tabLabel}>Analytics</span>
      </NavLink>

      <div className={styles.popoverWrap} ref={moreRef}>
        <button
          type="button"
          className={`${styles.tab} ${moreOpen ? styles.tabActive : ''}`}
          onClick={() => setMoreOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          aria-label="More options"
        >
          <span className={styles.tabIcon}>{MoreIcon}</span>
          <span className={styles.tabLabel}>More</span>
        </button>
        <AnimatePresence>
          {moreOpen && (
            <motion.div
              role="menu"
              className={styles.popoverMenu}
              data-anchor="right"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
            >
              {MORE_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={styles.popoverItem}
                  onClick={closeMore}
                  role="menuitem"
                >
                  {item.label}
                  {item.to === '/dashboard/inbox' && hasUnread && (
                    <span className={styles.popoverBadge}>{badgeText(unreadCount)}</span>
                  )}
                </NavLink>
              ))}
              <button
                type="button"
                className={`${styles.popoverItem} ${styles.popoverItemDanger}`}
                onClick={handleLogout}
                role="menuitem"
              >
                Log out
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}
