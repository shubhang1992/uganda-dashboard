/**
 * icons.jsx — inline-SVG icon factories for the employer DESKTOP dashboard.
 *
 * Translated 1:1 from the approved desktop mockups' icon sprite
 * (~/Desktop/Uganda Pensions/Mockups/employer-desktop-*-v1.html). Each export is
 * a `size`-parameterised factory returning an identical SVG node, so the rail,
 * tiles, cards and pages all reproduce the mockup geometry by passing their own
 * box size (20px rail, 18px tile chip, 24px hero chip, …).
 *
 * This module exports ONLY plain JSX-bearing values (icon factories) — no React
 * components — so it never trips the react-refresh "only export components" rule
 * (same convention as agent-dashboard/shell/agentNav.jsx).
 */

export const menuIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

export const overviewIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <rect x="13" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <rect x="13" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.75" />
  </svg>
);

export const employeesIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.75" />
    <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <circle cx="18" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.75" />
    <path d="M21 21v-1.5a3 3 0 00-3-3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

export const runsIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M2 10h20" stroke="currentColor" strokeWidth="1.75" />
    <path d="M6 15h4M14 15h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

export const shieldIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const analyticsIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M4 19V5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <path d="M4 19h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <rect x="7.5" y="11" width="3" height="6" rx="0.6" stroke="currentColor" strokeWidth="1.75" />
    <rect x="12.5" y="7" width="3" height="10" rx="0.6" stroke="currentColor" strokeWidth="1.75" />
    <rect x="17.5" y="13" width="3" height="4" rx="0.6" stroke="currentColor" strokeWidth="1.75" />
  </svg>
);

export const supportIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H9l-4 4v-4H4a1 1 0 01-1-1V6a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 10h8M8 13h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

export const settingsIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

export const logoutIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <polyline points="16,17 21,12 16,7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

export const bellIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13.7 21a2 2 0 01-3.4 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

export const buildingIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M4 20V7l7-3 7 3v13" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M3 20h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M8 11h.01M11 11h.01M14 11h.01M8 14h.01M11 14h.01M14 14h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const coinsIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 20 20" width={size} height={size} fill="none">
    <ellipse cx="10" cy="5.5" rx="6" ry="2.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M4 5.5v9c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-9" stroke="currentColor" strokeWidth="1.5" />
    <path d="M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const handAddIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M3 13h3l3 2h4a1.5 1.5 0 010 3H9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 13v7H3v-7" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M13 16h3l4-2.5c1-.6 2 .9 1.1 1.7L16 20H9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17 4v5M14.5 6.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const walletIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M3 7a2 2 0 012-2h12a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.75" />
    <path d="M16 13h2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

export const pendingIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 20 20" width={size} height={size} fill="none">
    <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10 6v4l2.5 1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const sparkIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M12 3l1.6 5.1L19 10l-5.4 1.9L12 17l-1.6-5.1L5 10l5.4-1.9L12 3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

export const searchIcon = (size = 18) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
    <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

export const checkIcon = (size = 16) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const lockIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <rect x="4.5" y="10" width="15" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
    <path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

export const downloadIcon = (size = 16) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M12 4v10m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 18h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

export const plusIcon = (size = 16) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const backIcon = (size = 18) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const closeIcon = (size = 18) => (
  <svg aria-hidden="true" viewBox="0 0 20 20" width={size} height={size} fill="none">
    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const sendIcon = (size = 14) => (
  <svg aria-hidden="true" viewBox="0 0 16 16" width={size} height={size} fill="none">
    <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const phoneIcon = (size = 16) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M5 4h3l1.5 4-2 1.5a11 11 0 005 5l1.5-2 4 1.5v3a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

export const mailIcon = (size = 16) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M4 7l8 5 8-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const pinIcon = (size = 16) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);
