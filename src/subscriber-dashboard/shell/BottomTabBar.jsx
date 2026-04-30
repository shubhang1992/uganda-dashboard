import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useAuth } from '../../contexts/AuthContext';
import styles from './BottomTabBar.module.css';

const TABS = [
  {
    to: '/dashboard',
    end: true,
    label: 'Home',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <path d="M3 11l9-7 9 7v9a2 2 0 01-2 2h-4v-6h-6v6H5a2 2 0 01-2-2v-9z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    to: '/dashboard/save',
    label: 'Save',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <rect x="2" y="6" width="20" height="13" rx="2" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M2 10h20" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M12 16v-4M10 14h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    to: '/dashboard/reports',
    label: 'Reports',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <path d="M3 3v18h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <path d="M7 14l4-4 4 4 5-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

const MORE_ITEMS = [
  { to: '/dashboard/withdraw', label: 'Withdrawals' },
  { to: '/dashboard/projection', label: 'Goal projection' },
  { to: '/dashboard/agent', label: 'Your agent' },
  { to: '/dashboard/help', label: 'Help' },
  { to: '/dashboard/settings', label: 'Settings' },
];

export default function BottomTabBar() {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);
  const { logout } = useAuth();
  const navigate = useNavigate();

  const closeMore = useCallback(() => setMoreOpen(false), []);

  useEffect(() => {
    if (!moreOpen) return;
    function handler(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) closeMore();
    }
    function onKey(e) {
      if (e.key === 'Escape') closeMore();
    }
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen, closeMore]);

  function handleLogout() {
    closeMore();
    logout();
    navigate('/');
  }

  return (
    <nav className={styles.bar} aria-label="Primary">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to || 'home'}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
        >
          <span className={styles.tabIcon}>{tab.icon}</span>
          <span className={styles.tabLabel}>{tab.label}</span>
        </NavLink>
      ))}
      <div className={styles.moreWrap} ref={moreRef}>
        <button
          type="button"
          className={`${styles.tab} ${moreOpen ? styles.tabActive : ''}`}
          onClick={() => setMoreOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          aria-label="More options"
        >
          <span className={styles.tabIcon}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
              <circle cx="5" cy="12" r="1.6" fill="currentColor"/>
              <circle cx="12" cy="12" r="1.6" fill="currentColor"/>
              <circle cx="19" cy="12" r="1.6" fill="currentColor"/>
            </svg>
          </span>
          <span className={styles.tabLabel}>More</span>
        </button>
        <AnimatePresence>
          {moreOpen && (
            <motion.div
              role="menu"
              className={styles.moreMenu}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
            >
              {MORE_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={styles.moreItem}
                  onClick={closeMore}
                  role="menuitem"
                >
                  {item.label}
                </NavLink>
              ))}
              <button
                type="button"
                className={`${styles.moreItem} ${styles.moreItemDanger}`}
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
