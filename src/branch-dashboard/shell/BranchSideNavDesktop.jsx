import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useBranchTicketMetrics } from '../../hooks/useTickets';
import logo from '../../assets/logo.png';
import { menuIcon, logoutIcon } from '../../employer-dashboard/desktop/icons';
import { DESKTOP_PRIMARY_NAV, DESKTOP_SECONDARY_NAV } from './branchNav';
import styles from './BranchSideNavDesktop.module.css';

// Cap the numeric badge so a busy queue never blows out the rail item.
function badgeText(count) {
  return count > 9 ? '9+' : String(count);
}

/**
 * BranchSideNavDesktop — the labelled white rail for the branch DESKTOP shell
 * (>=1024px). Mirrors EmployerSideNavDesktop: white skin, real-colour logo, a
 * collapse control (driven by `collapsed`/`onToggleCollapse` lifted to
 * BranchDesktopShell so the grid column reflows), NavLink active states, and a
 * support badge (open-ticket count). Nav metadata comes from branchNav so the
 * rail never drifts from the route table.
 */
export default function BranchSideNavDesktop({ collapsed = false, onToggleCollapse }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { branchId } = useBranchScope();

  const { data: ticketMetrics } = useBranchTicketMetrics(branchId);
  const openTickets = ticketMetrics?.openCount ?? 0;

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
          {menuIcon(20)}
        </button>
      </div>

      <div className={styles.group}>
        {DESKTOP_PRIMARY_NAV.map((item) => {
          const showBadge = item.badge === 'openTickets' && openTickets > 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `${styles.item} ${isActive ? styles.itemActive : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className={styles.itemIcon}>{item.icon}</span>
              <span className={styles.itemLabel}>{item.label}</span>
              {showBadge && <span className={styles.itemBadge}>{badgeText(openTickets)}</span>}
            </NavLink>
          );
        })}
      </div>

      <div className={styles.divider} aria-hidden="true" />

      <div className={styles.group}>
        {DESKTOP_SECONDARY_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `${styles.item} ${styles.itemSecondary} ${isActive ? styles.itemActive : ''}`}
            title={collapsed ? item.label : undefined}
          >
            <span className={styles.itemIcon}>{item.icon}</span>
            <span className={styles.itemLabel}>{item.label}</span>
          </NavLink>
        ))}
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
