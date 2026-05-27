// Shared Playwright locator factories — names selectors by *purpose* so a
// label change in the React app is a one-line fix here rather than a sweep
// across 30+ spec sites. Each factory takes a `Page` and returns a `Locator`;
// scoping (`.first()`, `.filter(...)`) stays in the calling spec where the
// context lives.
//
// CONVENTION — when to add a new selector
// =======================================
// Promote a selector into this file the moment the SAME `getByRole/Label/Text`
// signature appears in 3 or more spec files. Below that bar, keep it inline
// in the spec — premature abstraction costs more than the brittleness saves.
// Sibling helpers that own their own surface (signup wizard, db cleanup) keep
// their selectors local; this library is for *shared* dashboard / auth chrome
// only.
//
// LAYOUT — groups mirror the rendered surface
// ============================================
// • errorBoundary — the post-ErrorBoundary fallback that nearly every spec
//   asserts NOT to be visible after navigation.
// • dashboardShell — sidebar tabs in DashboardShell / BranchDashboardShell
//   (Overview, Branches, Agents, Subscribers, Commissions, Reports, Settings).
// • viewListPanel — the second-level "View Existing X" buttons that open
//   ViewBranches / ViewAgents / ViewSubscribers panels.
// • agentDetail — CTAs inside AgentDetail (currently just the
//   View-subscribers contract assertion used by the drill-down flow specs).
// • signInModal — the SignInModal step CTAs (Continue / role select etc.).
//
// Migrated as part of Cleanup Phase 3, T14. See
// `scripts/.followup/e2e-selectors-residual.txt` for the lower-traffic
// selectors that didn't clear the 3-spec bar but are worth promoting if
// another spec adopts them.

import type { Page, Locator } from '@playwright/test';

export const selectors = {
  /**
   * ErrorBoundary fallback copy. Every smoke / flow spec asserts this stays
   * `toHaveCount(0)` after `page.goto(...)` settles so the route mounted
   * without crashing into the global fallback ("Something went wrong").
   *
   * Source: src/components/ErrorBoundary.jsx.
   */
  errorBoundary: {
    fallback: (page: Page): Locator => page.getByText(/something went wrong/i),
  },

  /**
   * Sidebar tab buttons rendered by DashboardShell (distributor) and
   * BranchDashboardShell. Both shells expose the same aria-labelled buttons
   * — see src/dashboard/sidebar/Sidebar.jsx and
   * src/branch-dashboard/sidebar/BranchSidebar.jsx. The exact-match regex
   * (`/^name$/i`) is intentional: distributor + branch sidebars contain a
   * "Subscribers" button AND a "view existing subscribers" sub-button, and
   * the slide-in panel headers reuse "Subscribers" too — so anchored regex
   * is the cheapest disambiguation.
   *
   * Branch shell renders the same labels twice in some popovers (popover
   * toggle + active row), so callers in the branch suite usually chain
   * `.first()` after the locator.
   */
  dashboardShell: {
    overviewTab: (page: Page): Locator =>
      page.getByRole('button', { name: /^overview$/i }),
    branchesTab: (page: Page): Locator =>
      page.getByRole('button', { name: /^branches$/i }),
    agentsTab: (page: Page): Locator =>
      page.getByRole('button', { name: /^agents$/i }),
    subscribersTab: (page: Page): Locator =>
      page.getByRole('button', { name: /^subscribers$/i }),
    commissionsTab: (page: Page): Locator =>
      page.getByRole('button', { name: /^commissions$/i }),
    settingsTab: (page: Page): Locator =>
      page.getByRole('button', { name: /^settings$/i }),
  },

  /**
   * Second-level CTAs inside the popovers that the sidebar tabs above open.
   * These are the buttons that actually open the slide-in ViewBranches /
   * ViewAgents / ViewSubscribers panels — the sidebar tab toggles a popover,
   * the popover surfaces "Create New X" + "View Existing X" entries.
   *
   * Source: src/dashboard/sidebar/Sidebar.jsx + src/branch-dashboard/sidebar/BranchSidebar.jsx.
   */
  viewListPanel: {
    viewExistingSubscribers: (page: Page): Locator =>
      page.getByRole('button', { name: /view existing subscribers/i }),
  },

  /**
   * AgentDetail "View subscribers" CTA — the contract assertion the drill
   * flow specs share (agent / branch / distributor all expect the same CTA).
   * See e2e/specs/flows/{agent,branch,distributor}-*-drill-to-subscriber.spec.ts
   * for the regression these pin.
   *
   * Source surface: src/dashboard/agent/ViewAgents.jsx → AgentDetail.
   */
  agentDetail: {
    viewSubscribersCta: (page: Page): Locator =>
      page.getByRole('button', { name: /view subscribers/i }),
  },

  /**
   * SignInModal step affordances. The flow specs that drive a real sign-in
   * (settings-change-password + subscriber-signin-with-password) share the
   * `Continue` CTA across PhoneEntry → PasswordEntry / OtpEntry transitions.
   *
   * Source: src/auth/SignInModal/*.jsx.
   */
  signInModal: {
    continueButton: (page: Page): Locator =>
      page.getByRole('button', { name: /^continue$/i }),
  },
} as const;
