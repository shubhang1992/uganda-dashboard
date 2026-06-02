import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useAgentUnreadTicketCount } from '../../hooks/useTickets';
import NotificationBell from '../../components/notifications/NotificationBell';
import logoWhite from '../../assets/logo-white.png';
import {
  DESKTOP_PRIMARY_NAV,
  DESKTOP_SECONDARY_NAV,
  logoutIcon,
} from './agentNav';
import styles from './AgentSideNavDesktop.module.css';

// Cap the numeric unread badge so a busy inbox never blows out the rail item
// (mirrors BottomTabBar's badgeText so desktop + mobile read identically).
function badgeText(count) {
  return count > 9 ? '9+' : String(count);
}

/**
 * AgentSideNavDesktop — the 240px labelled sidebar rail for the desktop
 * (>=1024px) agent dashboard. Fills the left grid column of AgentDesktopShell.
 *
 * Nav arrays + icons come from the shared agentNav.js (same source the mobile
 * BottomTabBar consumes), so the two never drift. Always-on (no media-query
 * display gate) because it only ever mounts inside the already-desktop-gated
 * AgentDesktopShell. The Inbox item carries an unread-ticket badge for parity
 * with mobile's More>Inbox affordance (desktop-only surface; no mobile impact).
 */
export default function AgentSideNavDesktop() {
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
    <aside className={styles.nav} aria-label="Primary">
      <div className={styles.brand}>
        <img
          src={logoWhite}
          alt="Universal Pensions"
          width="160"
          height="56"
          className={styles.brandLogo}
        />
        {/* Exactly one NotificationBell for the agent desktop chrome. Self-hides
            when agentId is falsy. align="left" so the popover opens rightward off
            the left-edge rail (mirrors SideNav.jsx). */}
        {agentId && (
          <div className={styles.brandBell}>
            <NotificationBell role="agent" entityId={agentId} align="left" />
          </div>
        )}
      </div>

      <div className={styles.group}>
        {DESKTOP_PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `${styles.item} ${isActive ? styles.itemActive : ''}`}
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

      <button type="button" className={styles.logout} onClick={handleLogout}>
        <span className={styles.itemIcon}>{logoutIcon(20)}</span>
        <span className={styles.itemLabel}>Log out</span>
      </button>
    </aside>
  );
}
