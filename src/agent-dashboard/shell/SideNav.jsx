import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useAuth } from '../../contexts/AuthContext';
import { useOutsideClick } from '../../hooks/useOutsideClick';
import logoWhite from '../../assets/logo-white.png';
import styles from './SideNav.module.css';

const SUBSCRIBER_OPTIONS = [
  { to: '/dashboard/subscribers', label: 'View subscribers' },
  { to: '/dashboard/onboard', label: 'Onboard a new subscriber' },
];

const HomeIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
    <path d="M3 11l9-7 9 7v9a2 2 0 01-2 2h-4v-6h-6v6H5a2 2 0 01-2-2v-9z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
  </svg>
);

const SubscribersIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
    <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.75"/>
    <path d="M3 19a6 6 0 0112 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    <circle cx="17" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.75"/>
    <path d="M16 14h1.5a4 4 0 014 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
  </svg>
);

const AnalyticsIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
    <path d="M4 19V5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    <path d="M4 19h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    <rect x="7.5" y="11" width="3" height="6" rx="0.6" stroke="currentColor" strokeWidth="1.75"/>
    <rect x="12.5" y="7" width="3" height="10" rx="0.6" stroke="currentColor" strokeWidth="1.75"/>
    <rect x="17.5" y="13" width="3" height="4" rx="0.6" stroke="currentColor" strokeWidth="1.75"/>
  </svg>
);

const CommissionsIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
    <rect x="2.5" y="6" width="19" height="13" rx="2" stroke="currentColor" strokeWidth="1.75"/>
    <path d="M2.5 10h19" stroke="currentColor" strokeWidth="1.75"/>
    <circle cx="12" cy="14.5" r="1.6" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);

const SettingsIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75"/>
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
  </svg>
);

const LogoutIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    <polyline points="16,17 21,12 16,7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
  </svg>
);

const ChevronRight = (
  <svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12" fill="none">
    <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function SideNav() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [subsOpen, setSubsOpen] = useState(false);
  const subsRef = useRef(null);

  const closeSubs = useCallback(() => setSubsOpen(false), []);
  useOutsideClick(subsOpen, closeSubs, [subsRef]);

  const subsActive =
    location.pathname.startsWith('/dashboard/subscribers')
    || location.pathname.startsWith('/dashboard/onboard');

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <aside className={styles.nav} aria-label="Primary">
      <div className={styles.brand}>
        <img
          src={logoWhite}
          alt="Universal Pensions"
          width="160"
          height="56"
          className={styles.brandLogo}
        />
      </div>

      <div className={styles.group}>
        <NavLink
          to="/dashboard"
          end
          className={({ isActive }) => `${styles.item} ${isActive ? styles.itemActive : ''}`}
        >
          <span className={styles.itemIcon}>{HomeIcon}</span>
          <span className={styles.itemLabel}>Home</span>
        </NavLink>

        <div className={styles.subsWrap} ref={subsRef}>
          <button
            type="button"
            className={`${styles.item} ${subsActive ? styles.itemActive : ''}`}
            aria-haspopup="menu"
            aria-expanded={subsOpen}
            onClick={() => setSubsOpen((v) => !v)}
          >
            <span className={styles.itemIcon}>{SubscribersIcon}</span>
            <span className={styles.itemLabel}>Subscribers</span>
            <span
              className={styles.itemChevron}
              data-open={subsOpen || undefined}
              aria-hidden="true"
            >
              {ChevronRight}
            </span>
          </button>

          <AnimatePresence>
            {subsOpen && (
              <motion.div
                role="menu"
                className={styles.subsMenu}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
              >
                {SUBSCRIBER_OPTIONS.map((opt) => (
                  <NavLink
                    key={opt.to}
                    to={opt.to}
                    role="menuitem"
                    onClick={closeSubs}
                    className={({ isActive }) =>
                      `${styles.subsMenuItem} ${isActive ? styles.subsMenuItemActive : ''}`
                    }
                  >
                    {opt.label}
                  </NavLink>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <NavLink
          to="/dashboard/analytics"
          className={({ isActive }) => `${styles.item} ${isActive ? styles.itemActive : ''}`}
        >
          <span className={styles.itemIcon}>{AnalyticsIcon}</span>
          <span className={styles.itemLabel}>Analytics</span>
        </NavLink>

        <NavLink
          to="/dashboard/commissions"
          className={({ isActive }) => `${styles.item} ${isActive ? styles.itemActive : ''}`}
        >
          <span className={styles.itemIcon}>{CommissionsIcon}</span>
          <span className={styles.itemLabel}>Commissions</span>
        </NavLink>
      </div>

      <div className={styles.spacer} />

      <div className={styles.group}>
        <NavLink
          to="/dashboard/settings"
          className={({ isActive }) =>
            `${styles.item} ${styles.itemSecondary} ${isActive ? styles.itemActive : ''}`
          }
        >
          <span className={styles.itemIcon}>{SettingsIcon}</span>
          <span className={styles.itemLabel}>Settings</span>
        </NavLink>
      </div>

      <button type="button" className={styles.logout} onClick={handleLogout}>
        <span className={styles.itemIcon}>{LogoutIcon}</span>
        <span className={styles.itemLabel}>Log out</span>
      </button>
    </aside>
  );
}
