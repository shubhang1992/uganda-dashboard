/**
 * employerMobileNav.jsx — metadata + inline-SVG icons for the employer PHONE
 * bottom navigation (5 equal tabs, NO centre FAB). Kept separate from the desktop
 * employerNav.jsx because the mobile destinations differ (Analytics + Company are
 * tabs here; onboarding/insurance/support are reached from the app bar + Company
 * hub). Exports only plain data + JSX-bearing values (no React components) so it
 * never trips the react-refresh "only export components" rule.
 */

export const homeIcon = (size = 22) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width={size} height={size}>
    <path d="M3 10l9-7 9 7v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M9 21v-7h6v7" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

export const staffIcon = (size = 22) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width={size} height={size}>
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8" />
    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const analyticsIcon = (size = 22) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width={size} height={size}>
    <path d="M3 3v18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 17v-4M13 17V8M18 17v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const runsIcon = (size = 22) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width={size} height={size}>
    <path d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M7 10h6M7 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const companyIcon = (size = 22) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width={size} height={size}>
    <path d="M3 21V7a2 2 0 012-2h6v16M11 21h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 9h2M6 13h2M15 13h2M15 17h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const MOBILE_TABS = [
  { to: '/dashboard', end: true, label: 'Home', icon: homeIcon(22) },
  { to: '/dashboard/employees', label: 'Staff', icon: staffIcon(22) },
  { to: '/dashboard/analytics', label: 'Analytics', icon: analyticsIcon(22) },
  { to: '/dashboard/runs', label: 'Runs', icon: runsIcon(22) },
  { to: '/dashboard/profile', label: 'Company', icon: companyIcon(22) },
];
