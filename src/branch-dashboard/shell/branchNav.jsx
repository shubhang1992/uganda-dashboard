/**
 * branchNav.jsx — single source of truth for the branch DESKTOP rail nav.
 *
 * Mirrors employer-dashboard/shell/employerNav.jsx: exports the nav-item metadata
 * (`to` / `label` / `end` / `icon` / `badge`) consumed by BranchSideNavDesktop,
 * re-using the shared icon factories from the employer desktop icon sprite
 * (role-agnostic inline SVGs). Exports only plain data + JSX-bearing values (no
 * React components), so it never trips the react-refresh "only export
 * components" rule.
 *
 * Routes are relative to /dashboard (BranchDesktopShell mounts its nested
 * <Routes> under the /dashboard/* splat — see BranchDashboardShell).
 */

import {
  overviewIcon,
  employeesIcon,
  walletIcon,
  analyticsIcon,
  supportIcon,
  settingsIcon,
} from '../../employer-dashboard/desktop/icons';

// Primary stack — the branch admin's day-to-day surfaces, top of the rail.
export const DESKTOP_PRIMARY_NAV = [
  { to: '/dashboard', end: true, label: 'Overview', icon: overviewIcon(20) },
  { to: '/dashboard/agents', label: 'Agents', icon: employeesIcon(20) },
  { to: '/dashboard/commissions', label: 'Commissions', icon: walletIcon(20) },
  { to: '/dashboard/reports', label: 'Reports', icon: analyticsIcon(20) },
  { to: '/dashboard/support', label: 'Support', icon: supportIcon(20), badge: 'openTickets' },
];

// Secondary stack — utility, below the divider.
export const DESKTOP_SECONDARY_NAV = [
  { to: '/dashboard/settings', label: 'Settings', icon: settingsIcon(20) },
];
