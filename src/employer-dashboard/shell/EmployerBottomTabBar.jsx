import { NavLink } from 'react-router-dom';
import { MOBILE_TABS } from './employerMobileNav';
import styles from './EmployerBottomTabBar.module.css';

/**
 * EmployerBottomTabBar — the employer PHONE bottom navigation (<1024px). Five
 * equal slots, NO centre FAB: Home · Staff · Analytics · Runs · Company. Onboard,
 * Pending-KYC, Insurance, Support and Settings are reached from the Staff CTA, the
 * persistent app bar, and the Company hub. Mirrors the subscriber app's flat
 * 5-tab bar. Hidden by CSS at >=1024px (the desktop rail takes over).
 */
export default function EmployerBottomTabBar() {
  return (
    <nav className={styles.bar} aria-label="Quick navigation">
      {MOBILE_TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
        >
          <span className={styles.tabIcon}>{t.icon}</span>
          <span className={styles.tabLabel}>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
