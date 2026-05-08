import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useAuth } from '../../contexts/AuthContext';
import { useOutsideClick } from '../../hooks/useOutsideClick';
import styles from './BottomTabBar.module.css';

const SUBSCRIBER_OPTIONS = [
  { to: '/dashboard/subscribers', label: 'View subscribers' },
  { to: '/dashboard/onboard', label: 'Onboard a new subscriber' },
];

const MORE_ITEMS = [
  { to: '/dashboard/analytics', label: 'Analytics' },
  { to: '/dashboard/settings', label: 'Settings' },
];

const HomeIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
    <path d="M3 11l9-7 9 7v9a2 2 0 01-2 2h-4v-6h-6v6H5a2 2 0 01-2-2v-9z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
  </svg>
);

const SubscribersIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
    <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.75"/>
    <path d="M3 19a6 6 0 0112 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    <circle cx="17" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.75"/>
    <path d="M16 14h1.5a4 4 0 014 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
  </svg>
);

const CommissionsIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
    <rect x="2.5" y="6" width="19" height="13" rx="2" stroke="currentColor" strokeWidth="1.75"/>
    <path d="M2.5 10h19" stroke="currentColor" strokeWidth="1.75"/>
    <circle cx="12" cy="14.5" r="1.6" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);

const MoreIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
    <circle cx="5" cy="12" r="1.6" fill="currentColor"/>
    <circle cx="12" cy="12" r="1.6" fill="currentColor"/>
    <circle cx="19" cy="12" r="1.6" fill="currentColor"/>
  </svg>
);

export default function BottomTabBar() {
  const [moreOpen, setMoreOpen] = useState(false);
  const [subsOpen, setSubsOpen] = useState(false);
  const moreRef = useRef(null);
  const subsRef = useRef(null);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const closeMore = useCallback(() => setMoreOpen(false), []);
  const closeSubs = useCallback(() => setSubsOpen(false), []);

  useOutsideClick(moreOpen, closeMore, [moreRef]);
  useOutsideClick(subsOpen, closeSubs, [subsRef]);

  const subsActive =
    location.pathname.startsWith('/dashboard/subscribers')
    || location.pathname.startsWith('/dashboard/onboard');

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

      <div className={styles.popoverWrap} ref={subsRef}>
        <button
          type="button"
          className={`${styles.tab} ${subsActive ? styles.tabActive : ''}`}
          aria-haspopup="menu"
          aria-expanded={subsOpen}
          onClick={() => {
            setMoreOpen(false);
            setSubsOpen((v) => !v);
          }}
        >
          <span className={styles.tabIcon}>{SubscribersIcon}</span>
          <span className={styles.tabLabel}>Subscribers</span>
        </button>
        <AnimatePresence>
          {subsOpen && (
            <motion.div
              role="menu"
              className={styles.popoverMenu}
              data-anchor="left"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
            >
              {SUBSCRIBER_OPTIONS.map((opt) => (
                <NavLink
                  key={opt.to}
                  to={opt.to}
                  className={({ isActive }) =>
                    `${styles.popoverItem} ${isActive ? styles.popoverItemActive : ''}`
                  }
                  onClick={closeSubs}
                  role="menuitem"
                >
                  {opt.label}
                </NavLink>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <NavLink
        to="/dashboard/commissions"
        className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
      >
        <span className={styles.tabIcon}>{CommissionsIcon}</span>
        <span className={styles.tabLabel}>Commissions</span>
      </NavLink>

      <div className={styles.popoverWrap} ref={moreRef}>
        <button
          type="button"
          className={`${styles.tab} ${moreOpen ? styles.tabActive : ''}`}
          onClick={() => {
            setSubsOpen(false);
            setMoreOpen((v) => !v);
          }}
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
