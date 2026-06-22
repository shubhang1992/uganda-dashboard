import { NavLink } from 'react-router-dom';
import { homeIcon, subscribersIcon, commissionsIcon } from './agentNav';
import styles from './BottomTabBar.module.css';

// Primary-tab icons come from the shared agentNav.js (same source the desktop
// rail uses) at the mobile 22px size. The centre Onboard FAB glyph + the Profile
// glyph stay inline: the FAB is a plus-only icon (not the rail's person+plus
// Onboard icon), and the Profile tab is a single-person icon unique to the bar.
const HomeIcon = homeIcon(22);
const SubscribersIcon = subscribersIcon(22);
const CommissionsIcon = commissionsIcon(22);

const ProfileIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.75" />
    <path d="M4 21a8 8 0 0116 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

/**
 * BottomTabBar — the agent PHONE bottom navigation (<1024px). Five slots:
 * Home · Subscribers · [centre Onboard FAB] · Commissions · Profile. Inbox,
 * Settings, Analytics and the assistant are reached from the persistent app bar
 * and the Profile hub, so the bar stays to five thumb-sized destinations with no
 * "More" popover. Hidden by CSS at >=1024px (the desktop rail takes over).
 */
export default function BottomTabBar() {
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
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
          </svg>
        </span>
        <span className={styles.fabLabel}>Onboard</span>
      </NavLink>

      <NavLink
        to="/dashboard/commissions"
        className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
      >
        <span className={styles.tabIcon}>{CommissionsIcon}</span>
        <span className={styles.tabLabel}>Commissions</span>
      </NavLink>

      <NavLink
        to="/dashboard/profile"
        className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
      >
        <span className={styles.tabIcon}>{ProfileIcon}</span>
        <span className={styles.tabLabel}>Profile</span>
      </NavLink>
    </nav>
  );
}
