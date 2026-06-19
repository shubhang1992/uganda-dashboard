/**
 * employerNav.jsx — single source of truth for the employer DESKTOP rail nav.
 *
 * Mirrors agent-dashboard/shell/agentNav.jsx: exports the nav-item metadata
 * (`to` / `label` / `end` / `icon` / `badge`) consumed by EmployerSideNavDesktop,
 * re-using the shared icon factories from ../desktop/icons. Exports only plain
 * data + JSX-bearing values (no React components), so it never trips the
 * react-refresh "only export components" rule.
 *
 * Routes are relative to /dashboard (EmployerDesktopShell mounts its nested
 * <Routes> under the /dashboard/* splat — see EmployerDashboardShell).
 */

import {
  overviewIcon,
  employeesIcon,
  runsIcon,
  shieldIcon,
  analyticsIcon,
  supportIcon,
  settingsIcon,
} from '../desktop/icons';

// Primary stack — the funder's day-to-day surfaces, top of the rail.
export const DESKTOP_PRIMARY_NAV = [
  { to: '/dashboard', end: true, label: 'Overview', icon: overviewIcon(20) },
  { to: '/dashboard/employees', label: 'Employees', icon: employeesIcon(20) },
  { to: '/dashboard/runs', label: 'Contribution Runs', icon: runsIcon(20) },
  { to: '/dashboard/insurance', label: 'Insurance', icon: shieldIcon(20) },
  { to: '/dashboard/analytics', label: 'Analytics', icon: analyticsIcon(20) },
  { to: '/dashboard/support', label: 'Support', icon: supportIcon(20), badge: 'openTickets' },
];

// Secondary stack — utility, below the divider.
export const DESKTOP_SECONDARY_NAV = [
  { to: '/dashboard/settings', label: 'Settings', icon: settingsIcon(20) },
];
