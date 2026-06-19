import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useAgentUnreadTicketCount } from '../../hooks/useTickets';
import logo from '../../assets/logo.png';
import {
  DESKTOP_PRIMARY_NAV,
  DESKTOP_SECONDARY_NAV,
  logoutIcon,
} from './agentNav';
import styles from './AgentSideNavDesktop.module.css';

// Collapse (hamburger) glyph — sits AFTER the logo and folds the rail to an
// icon-only strip. Local to this rail (not a shared nav glyph).
const menuIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

// Cap the numeric unread badge so a busy inbox never blows out the rail item
// (mirrors BottomTabBar's badgeText so desktop + mobile read identically).
function badgeText(count) {
  return count > 9 ? '9+' : String(count);
}

/**
 * AgentSideNavDesktop — the labelled sidebar rail for the desktop (>=1024px)
 * agent dashboard. Fills the left grid column of AgentDesktopShell.
 *
 * Redesign: WHITE rail (was indigo), the real colour logo, and a collapse
 * control after the logo that folds the rail to an icon-only strip (driven by
 * `collapsed` / `onToggleCollapse` lifted to AgentDesktopShell so the shell grid
 * can reflow). The notification bell moved OUT of here to the shell's top-right
 * corner. Nav arrays + icons still come from the shared agentNav.js so desktop
 * and the mobile BottomTabBar never drift.
 */
export default function AgentSideNavDesktop({ collapsed = false, onToggleCollapse }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { agentId } = useAgentScope();

  // Unread support badge — shared hook dedupes into the same
  // ['tickets','agent',id,'all'] fetch/poll used by the Inbox page + mobile bar.
  const unreadCount = useAgentUnreadTicketCount(agentId);
  const hasUnread = unreadCount > 0;

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <aside
      className={`${styles.nav} ${collapsed ? styles.collapsed : ''}`}
      aria-label="Primary"
    >
      <div className={styles.brand}>
        <img src={logo} alt="Universal Pensions" className={styles.brandLogo} />
        <button
          type="button"
          className={styles.collapseBtn}
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {menuIcon}
        </button>
      </div>

      <div className={styles.group}>
        {DESKTOP_PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `${styles.item} ${isActive ? styles.itemActive : ''}`}
            title={collapsed ? item.label : undefined}
          >
            <span className={styles.itemIcon}>{item.icon}</span>
            <span className={styles.itemLabel}>{item.label}</span>
          </NavLink>
        ))}
      </div>

      <div className={styles.divider} aria-hidden="true" />

      <div className={styles.group}>
        {DESKTOP_SECONDARY_NAV.map((item) => {
          const showBadge = item.badge === 'unreadTickets' && hasUnread;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `${styles.item} ${styles.itemSecondary} ${isActive ? styles.itemActive : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className={styles.itemIcon}>{item.icon}</span>
              <span className={styles.itemLabel}>{item.label}</span>
              {showBadge && (
                <span className={styles.itemBadge}>{badgeText(unreadCount)}</span>
              )}
            </NavLink>
          );
        })}
      </div>

      <div className={styles.spacer} />

      <button
        type="button"
        className={styles.logout}
        onClick={handleLogout}
        title={collapsed ? 'Log out' : undefined}
      >
        <span className={styles.itemIcon}>{logoutIcon(20)}</span>
        <span className={styles.itemLabel}>Log out</span>
      </button>
    </aside>
  );
}
