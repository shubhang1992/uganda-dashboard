/**
 * agentNav.js — single source of truth for the agent dashboard navigation.
 *
 * Exports the shared inline-SVG icon nodes (as `size`-parameterised factories,
 * because the desktop rail renders icons at 20px while the mobile bottom bar
 * renders them at 22px — same paths, different box) plus the nav-item metadata
 * (`to` / `label` / `end` / `icon`) consumed by BOTH:
 *   - AgentSideNavDesktop.jsx (the 240px desktop rail)
 *   - BottomTabBar.jsx        (the shipped mobile bottom bar)
 *
 * This module intentionally exports NO React components — only plain data and
 * JSX-bearing values — so it never trips the react-refresh "only export
 * components" rule. It is a .js file (the JSX here is plain `React.createElement`
 * output produced by the JSX transform, not a component) and stays free of
 * default/component exports.
 *
 * Icon factories take a numeric `size` and return an identical SVG node, so each
 * caller reproduces its previous byte-for-byte markup by passing its own size.
 */

// ── Shared icon factories ─────────────────────────────────────────────
// Each returns the SAME path geometry the desktop rail and bottom bar already
// shipped; only width/height vary by caller (20 desktop, 22 mobile).

export const homeIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width={size} height={size}>
    <path d="M3 11l9-7 9 7v9a2 2 0 01-2 2h-4v-6h-6v6H5a2 2 0 01-2-2v-9z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
  </svg>
);

export const subscribersIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width={size} height={size}>
    <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.75"/>
    <path d="M3 19a6 6 0 0112 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    <circle cx="17" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.75"/>
    <path d="M16 14h1.5a4 4 0 014 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
  </svg>
);

// Onboard (person + plus) — the LABELLED-rail icon. The mobile bottom bar draws
// Onboard as a centre FAB with the plus-only glyph below, not this node.
export const onboardIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width={size} height={size}>
    <circle cx="9" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.75"/>
    <path d="M3 19a6 6 0 0112 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    <path d="M18 7v6M21 10h-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
  </svg>
);

export const analyticsIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width={size} height={size}>
    <path d="M4 19V5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    <path d="M4 19h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    <rect x="7.5" y="11" width="3" height="6" rx="0.6" stroke="currentColor" strokeWidth="1.75"/>
    <rect x="12.5" y="7" width="3" height="10" rx="0.6" stroke="currentColor" strokeWidth="1.75"/>
    <rect x="17.5" y="13" width="3" height="4" rx="0.6" stroke="currentColor" strokeWidth="1.75"/>
  </svg>
);

export const commissionsIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width={size} height={size}>
    <rect x="2.5" y="6" width="19" height="13" rx="2" stroke="currentColor" strokeWidth="1.75"/>
    <path d="M2.5 10h19" stroke="currentColor" strokeWidth="1.75"/>
    <circle cx="12" cy="14.5" r="1.6" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);

// Inbox (envelope) — new affordance for the desktop rail. The mobile bottom bar
// surfaces Inbox as a text-only row inside the "More" popover (no icon), so this
// node has no mobile caller.
export const inboxIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width={size} height={size}>
    <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.75"/>
    <path d="M4 7l8 5 8-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const settingsIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width={size} height={size}>
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75"/>
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
  </svg>
);

export const logoutIcon = (size = 20) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width={size} height={size}>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    <polyline points="16,17 21,12 16,7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
  </svg>
);

// ── Desktop rail metadata ─────────────────────────────────────────────
// Consumed by AgentSideNavDesktop. Icons are pre-sized at 20px (the rail size).
// `group` hints which visual cluster an item belongs to: the primary stack vs
// the secondary (settings/utility) stack below the divider. Inbox lives in the
// secondary group for parity with mobile's More>Inbox placement, and carries
// `badge: 'unreadTickets'` so the rail knows to render the unread count.

export const DESKTOP_PRIMARY_NAV = [
  { to: '/dashboard', end: true, label: 'Home', icon: homeIcon(20), group: 'primary' },
  { to: '/dashboard/subscribers', label: 'Subscribers', icon: subscribersIcon(20), group: 'primary' },
  { to: '/dashboard/onboard', label: 'Onboard', icon: onboardIcon(20), group: 'primary' },
  { to: '/dashboard/analytics', label: 'Analytics', icon: analyticsIcon(20), group: 'primary' },
  { to: '/dashboard/commissions', label: 'Commissions', icon: commissionsIcon(20), group: 'primary' },
];

export const DESKTOP_SECONDARY_NAV = [
  { to: '/dashboard/inbox', label: 'Inbox', icon: inboxIcon(20), group: 'secondary', badge: 'unreadTickets' },
  { to: '/dashboard/settings', label: 'Settings', icon: settingsIcon(20), group: 'secondary' },
];

// ── Mobile bottom-bar metadata ────────────────────────────────────────
// The bottom bar's structure (4 primary tabs + centre FAB + More popover) is
// shipped and bespoke, so it does NOT consume a single flat array. It consumes
// the icon factories above (at 22px) for its primary tabs, plus the More-popover
// item list below — the same Commissions/Inbox/Settings order it already shipped.

export const MOBILE_MORE_ITEMS = [
  { to: '/dashboard/commissions', label: 'Commissions' },
  { to: '/dashboard/inbox', label: 'Inbox' },
  { to: '/dashboard/settings', label: 'Settings' },
];
