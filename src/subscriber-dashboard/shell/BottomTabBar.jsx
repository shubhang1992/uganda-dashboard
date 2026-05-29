import { NavLink } from 'react-router-dom';
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
    to: '/dashboard/activity',
    label: 'Activity',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <path d="M3 12h4l3 7 4-14 3 7h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    to: '/dashboard/withdraw',
    label: 'Withdraw',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <path d="M12 4v11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    to: '/dashboard/projection',
    label: 'Goals',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <path d="M4 19V5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <path d="M4 8l5 4 4-5 7 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    to: '/dashboard/settings',
    label: 'Profile',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M5 20a7 7 0 0114 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
];

export default function BottomTabBar() {
  return (
    <nav className={styles.bar} aria-label="Quick navigation">
      <NavLink
        to="/dashboard"
        end
        className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
      >
        <span className={styles.tabIcon}>{TABS[0].icon}</span>
        <span className={styles.tabLabel}>{TABS[0].label}</span>
      </NavLink>
      <NavLink
        to={TABS[1].to}
        className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
      >
        <span className={styles.tabIcon}>{TABS[1].icon}</span>
        <span className={styles.tabLabel}>{TABS[1].label}</span>
      </NavLink>

      <NavLink
        to="/dashboard/save"
        className={({ isActive }) => `${styles.fab} ${isActive ? styles.fabActive : ''}`}
        aria-label="Save"
      >
        <span className={styles.fabIcon}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="26" height="26">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"/>
          </svg>
        </span>
        <span className={styles.fabLabel}>Save</span>
      </NavLink>

      <NavLink
        to={TABS[2].to}
        className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
      >
        <span className={styles.tabIcon}>{TABS[2].icon}</span>
        <span className={styles.tabLabel}>{TABS[2].label}</span>
      </NavLink>
      <NavLink
        to={TABS[3].to}
        className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
      >
        <span className={styles.tabIcon}>{TABS[3].icon}</span>
        <span className={styles.tabLabel}>{TABS[3].label}</span>
      </NavLink>
      <NavLink
        to={TABS[4].to}
        className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
      >
        <span className={styles.tabIcon}>{TABS[4].icon}</span>
        <span className={styles.tabLabel}>{TABS[4].label}</span>
      </NavLink>
    </nav>
  );
}
