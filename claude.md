# Universal Pensions — Uganda Platform Context

## Technical context

**Stack:** React 19.2 + Vite 6.3 + Framer Motion 12 + CSS Modules + React Router 7 + TanStack React Query 5 + TanStack React Virtual 3 + Leaflet 1.9 / react-leaflet 5 + Recharts 3
**Node:** 22 LTS (pinned via `.node-version`)
**Package manager:** npm (with `legacy-peer-deps=true` in `.npmrc`)
**Testing:** Vitest 4 + jsdom + Testing Library (54 tests across 4 files: services/commissions, services/entities, utils/finance, utils/dashboard)
**Linting:** ESLint 9 flat config (`@eslint/js` + react-hooks + react-refresh). 0 errors expected; 3 informational warnings from `@tanstack/react-virtual` are normal.
**Deployment:** Vercel (auto-deploy on push to `main`). `vercel.json` has a single SPA rewrite: `/((?!assets/).*) → /index.html`.
**Live URL:** uganda-dashboard.vercel.app
**Path aliases (vite.config.js):** `@` → `./src`, plus `@components`, `@contexts`, `@dashboard`, `@data`, `@utils`.
**Vendor chunking:** Manual chunks split heavy deps (`vendor-leaflet`, `vendor-charts`, `vendor-motion`, `vendor-tanstack`, `vendor-router`, `vendor-react`) so the marketing landing page doesn't pull recharts/leaflet.

### Key conventions
- All styling uses **CSS Modules** (`.module.css` per component) — no Tailwind, no component library.
- Design tokens are **CSS custom properties** in `src/index.css` (colors, spacing, typography, shadows, radii, easing).
- Animations use **Framer Motion** — `motion.div`, `useScroll`, `AnimatePresence`, staggered variants.
- The shared easing curve is `EASE_OUT_EXPO` = `[0.16, 1, 0.3, 1]`, exported from `src/utils/finance.js` and mirrored in `--ease-out-expo` for CSS.
- Mobile breakpoints: 600px (phone), 768px (tablet — `useIsMobile` cutoff), 900px (large tablet), 1024px (desktop).
- Brand primary color: `--color-indigo` (#292867) — avoid red except for error states.
- Logo: two PNGs with transparent backgrounds — `logo.png` (color, for light backgrounds) and `logo-white.png` (grey, brightened via CSS for dark backgrounds).
- Financial formatting is centralised in `src/utils/finance.js` — see "Shared utilities" below.

### Hard rules — MUST FOLLOW
- **Data access rule:** Components and dashboard files must NEVER import from `src/data/mockData.js` directly. Use hooks from `src/hooks/useEntity.js`, `src/hooks/useCommission.js`, or `src/hooks/useSubscriber.js`, which call services from `src/services/`. **Only service files may import mockData.** Verified zero violations across all dashboards.
- **Routing rule:** All top-level navigation uses `react-router-dom`. Use `useNavigate()` for programmatic navigation. Modal/panel UI state (slide-ins, drawers) is intentionally state-based in `DashboardPanelContext` — not routed. Subscriber dashboard sub-routes (`/dashboard/save`, `/dashboard/withdraw/*`, `/dashboard/settings/*` etc.) ARE routed because they represent distinct destinations rather than overlay state.
- **Auth rule:** Use `useAuth()` from `AuthContext` for login/logout/role checks. Session persists in localStorage under `upensions_auth`. `api.js` raises a 401 event via `onAuthExpired()` listener pattern — `AuthContext` consumes this to logout + redirect.
- **Environment rule:** API URLs and config go in `.env` and are accessed via `src/config/env.js`. No hardcoded API endpoints. `env.js` exports `API_BASE_URL`, `IS_DEV`, `IS_PROD`, plus public URLs (`URL_TERMS`, `URL_PRIVACY`, `URL_SUPPORT_WHATSAPP`, `URL_SUPPORT_EMAIL`).
- **Signup state rule:** `SignupContext` persists to localStorage on every patch. File/Blob fields (`idFrontFile`, `idBackFile`, `selfieFile`) and their object URLs are dropped on serialise — user re-uploads on refresh, but OCR results, phone, beneficiaries, consent etc. survive.
- **Frequency normalisation rule:** Contribution-schedule frequency strings drift across legacy formats (`half-yearly`, `halfYearly`, `semi-annually`, `semiAnnually`). ALWAYS pass schedules through `normalizeFrequency(value)` before reading or writing. Use the canonical `FREQUENCY` constants from `src/utils/finance.js` for new code.

### Accessibility conventions — MUST FOLLOW
- **Focus visibility:** Global `:focus-visible` baseline in `index.css` (2px `--color-indigo-soft` outline). Never use `outline: none` without a `:focus-visible` replacement (or a wrapping `:focus-within` rule that provides a visible indicator).
- **Transitions:** Never use `transition: all` — always list properties explicitly.
- **Reduced motion:** `<MotionConfig reducedMotion="user">` wraps the app in `main.jsx`. CSS `prefers-reduced-motion` media query in `index.css` handles CSS animations.
- **Modals & drawers:** Must have Escape key handler to close, `overscroll-behavior: contain` to prevent background scroll bleed.
- **Icon-only buttons:** Must have `aria-label`. Do not rely on `title` attribute alone.
- **Form inputs:** Must have `aria-label` or associated `<label>`. Use correct `type`, `inputMode`, `autoComplete`, and `spellCheck={false}` on codes/phones.
- **Touch targets:** `touch-action: manipulation` set globally on buttons and links in `index.css`. Minimum 44px touch targets on mobile.
- **Skip link:** `index.html` has a skip-to-content link targeting `#main` on the `<main>` element in `App.jsx` (and on `BranchDashboardShell` / `SubscriberShell`).
- **Typography:** Use `text-wrap: balance` on headings. Use `font-variant-numeric: tabular-nums` on number/stat displays. Use `…` (U+2026) not `...`. Remember JSX text does NOT resolve `\u` escapes — use the literal character.
- **Images:** All `<img>` tags must have explicit `width` and `height` attributes. Below-fold images use `loading="lazy"`.
- **Large lists:** Use `content-visibility: auto` with `contain-intrinsic-size` on list items for performance (applied in ViewBranches/ViewAgents/ViewSubscribers). Lists over a few hundred items should use `useVirtualizer` from `@tanstack/react-virtual`.
- **Decorative icons:** SVGs that are purely decorative (next to a text label) must have `aria-hidden="true"`.
- **Live regions:** Drill-level changes are announced via a `aria-live="polite"` `NavAnnouncer` in `DashboardShell`.

### Architecture

**Top-level routes (`App.jsx`):**
- `/` — Landing page (Navbar → Hero → HowItWorks → TimeJourney → ForYou → Trust → CTA → Footer + StickyMobileCTA). `SavingsCalculator` is embedded inside `Hero`.
- `/about`, `/faq`, `/contact` — marketing pages (`src/pages/`)
- `/signup/*` — Subscriber KYC onboarding (lazy-loaded `SignupPage`)
- `/dashboard/*` — `ProtectedDashboard` (lazy-loaded). Dispatches by role:
  - `'branch'` → `BranchDashboardShell`
  - `'subscriber'` → `SubscriberDashboardShell`
  - `'agent'` → `AgentDashboardShell`
  - everything else with a dashboard → `DashboardShell` (Distributor Admin)
- `/coming-soon` — Role-based placeholder for roles without a dashboard yet (employer / admin).
- `SignInModal` is rendered outside `<Routes>` (inside `SignInProvider`) so it can overlay any page.

**Providers (in `main.jsx`):** `StrictMode` → `BrowserRouter` → `QueryClientProvider` (staleTime 5min, gcTime 10min, `refetchOnWindowFocus: false`, `retry: 1`) → `AuthProvider` → `ToastProvider` → `MotionConfig reducedMotion="user"` → `App` + `<ToastContainer />` (peer of `App`). `SignInProvider` wraps the `<Routes>` tree inside `App` (intentional — lets the modal overlay any page).

**Auth:** `AuthContext` manages session with localStorage persistence. Login stores `{ role, phone, name, branchId?, agentId? }`. Page refresh preserves the session. Protected routes redirect unauthenticated users to `/`. `ProtectedDashboard` also routes users without a built dashboard to `/coming-soon` via `hasDashboard(role)` from `services/auth.js`. `DASHBOARD_ROLES = ['distributor', 'branch', 'subscriber', 'agent']`.

**Dashboard context composition:** `DashboardContext.jsx` composes two narrower contexts:
- `DashboardNavContext` — URL-derived drill-down state (level, entityId, breadcrumb, section, reportId) + navigation actions (`drillDown`, `drillUp`, `goToLevel`, `reset`). Keys off `useLocation()`/`useNavigate()`. Holds drill-target state (`drillTargetBranchId`/`drillTargetAgentId`) + a cross-context ref `onPanelActionRef` so nav effects can trigger panel setters without a circular dependency.
- `DashboardPanelContext` — panel/modal UI state for the Distributor + Branch dashboards. Sidebar submenu toggles (`branchMenuOpen`, `agentMenuOpen`, `subscriberMenuOpen`) + panel open states (`createBranchOpen`, `viewBranchesOpen`, `createAgentOpen`, `viewAgentsOpen`, `viewSubscribersOpen`, `commissionsOpen`, `viewReportsOpen`, `settingsOpen`) + `reportContext` (string reportId or null) + `closeAllPanels()`. The provider registers panel setters into `DashboardNavContext.onPanelActionRef` so nav effects can drive them. NOTE: the Agent dashboard is fully routed and does NOT consume this context.

`useDashboard()` merges both for backward compatibility. New code should prefer the narrower `useDashboardNav()` / `useDashboardPanel()` when it only needs one slice.

**Branch scope:** `BranchScopeContext` provides a `branchId` to descendants when the tree is rendered for a Branch Admin. Distributor trees don't wrap with it, so `useBranchScope().branchId` is `null` and components fall back to network-wide queries. `BranchDashboardShell` shows a `MissingBranchIdScreen` if `branchId` is missing from the auth payload.

**Agent scope:** `AgentScopeContext` is the agent-side equivalent — provides `agentId` to descendants when the tree is rendered for a field Agent. `AgentDashboardShell` shows a `MissingAgentIdScreen` if the auth payload has no `agentId`. Components outside the agent tree see `useAgentScope().agentId === null`.

**Data access:** Three-layer architecture — components → hooks → services → mockData. No component imports from `mockData.js` directly. When backend arrives, only the service files change.
- `src/services/` — data access layer (currently wraps mockData; future: `api.post()` calls)
- `src/hooks/useEntity.js` — React Query hooks for entity data
- `src/hooks/useCommission.js` — React Query hooks for commissions (incl. `useEntityCommissionSummary`); also exposes the agent-side mutations `useAgentConfirmCommission`, `useRequestCommissionSettlement`, `useDisputeCommission`
- `src/hooks/useSubscriber.js` — React Query hooks + mutations for the logged-in subscriber
- `src/hooks/useAgent.js` — React Query hooks scoped to the logged-in agent (`useAgentSubscribers`, `useAgentActivity`, `useUpdateSubscriberSchedule`)
- `src/data/mockData.js` — mock data source (only imported by services)

### Project file structure
```
src/
  App.jsx                         — Routes, ProtectedDashboard guard, ComingSoon, LandingPage
  main.jsx                        — Provider stack + React 19 root
  index.css                       — Design tokens + global styles
  config/
    env.js                        — API_BASE_URL, IS_DEV/PROD, public URLs (terms/privacy/support)
  constants/
    levels.js                     — LEVELS, LEVEL_ORDER, CHILD_LEVEL/PARENT_LEVEL maps, URL segment maps
    signup.js                     — OCCUPATIONS, RELATIONSHIPS, GENDERS
    savings.js                    — RETIREMENT_AGE, START_AGE, MIN_CONTRIBUTION/MIN_WITHDRAW,
                                    INSURANCE_PREMIUM_MONTHLY, INSURANCE_COVER, QUICK_CONTRIBUTION_AMOUNTS
  services/
    api.js                        — Base API client (apiFetch + api.get/post/put/delete);
                                    onAuthExpired(handler) listener pattern for 401s
    entities.js                   — Entity CRUD (per-session overrides over frozen mockData);
                                    getEntity/Children/AllAtLevel/AllAtLevelMap, getEntitySync,
                                    createBranch, createAgent, updateBranch, setBranchStatus,
                                    getTopPerformingBranch, getBreadcrumb
    commissions.js                — Commission CRUD, settlement, rate config; getEntityCommissionSummary
                                    (memo-cached); admin actions: approve/reject (single + bulk),
                                    settleCommissions / settleAgentCommissions / settleAllCommissions;
                                    agent actions (maker-checker counterparts): agentConfirmCommission,
                                    requestCommissionSettlement, disputeCommission
    auth.js                       — sendOtp / verifyOtp (mock); hasDashboard(role) helper.
                                    DASHBOARD_ROLES = ['distributor','branch','subscriber','agent']
    search.js                     — searchEntities(query) — client-side mock, max 8 results
    chat.js                       — getChatResponse() (admin/distributor/branch),
                                    getAgentReply() (subscriber ↔ agent DM),
                                    getSubscriberChatResponse() (subscriber co-pilot)
    kyc.js                        — Smile ID v2-shaped pipeline (mocked):
                                    image quality, ID OCR (front+back), NIRA verification,
                                    OTP send/verify, face-match + liveness, AML/PEP screen,
                                    agent referral. tracking_id correlates stages.
                                    Force-override QA via localStorage `upensions_*_force` keys.
    subscriber.js                 — Subscriber CRUD with per-session mutation store (in-memory):
                                    getCurrentSubscriber(phone), transactions, claims, nominees,
                                    agent lookup, makeAdHocContribution, requestWithdrawal,
                                    updateContributionSchedule, updateNominees, submitClaim,
                                    updateInsuranceCover, updateProfile
    agent.js                      — Agent-scoped reads: getAgentSubscriberList(agentId) (rich
                                    subscriber portfolio)
    __tests__/                    — commissions.test.js, entities.test.js
  hooks/
    useEntity.js                  — useCountry, useEntity, useCurrentEntity, useChildren,
                                    useAllEntities, useAllEntitiesMap, useTopBranch, useBreadcrumb,
                                    useSearch + create/update mutations
    useCommission.js              — useCommissionRate/Summary, useAgentCommissionList/Detail,
                                    useCommissionSubscribers, useDisputedAgentList,
                                    useSettlementRequestList, useEntityCommissionSummary +
                                    admin mutations (approve/reject/settle, single + bulk) +
                                    agent mutations (useAgentConfirmCommission,
                                    useRequestCommissionSettlement, useDisputeCommission)
    useSubscriber.js              — useCurrentSubscriber, useSubscriberTransactions/Claims/Nominees/Agent
                                    + makeContribution, requestWithdrawal, updateSchedule, updateNominees,
                                      submitClaim, updateInsuranceCover, updateProfile mutations.
                                    All mutations call invalidateSubscriber() helper.
    useAgent.js                   — useAgentSubscribers(agentId),
                                    useUpdateSubscriberSchedule(subscriberId, agentId). The schedule
                                    mutation invalidates ['agentSubscribers', agentId] so the
                                    detail page reflects the change without a refresh.
    useIsMobile.js                — matchMedia(max-width: 768px) via useSyncExternalStore
    useOutsideClick.js            — useOutsideClick(active, onOutside, refs) — listens on mousedown
                                    (fires before trigger button's own onClick) + Escape
  utils/
    finance.js                    — MONTHLY_RATE/ANNUAL_RATE; FREQUENCY constants;
                                    normalizeFrequency, periodsPerYear, monthlyEquivalent;
                                    parseAmount, calcFV; formatUGX, formatUGXExact, fmtShort;
                                    sliderToAmt, amtToSlider (log scale); EASE_OUT_EXPO
    dashboard.js                  — getInitials (defensive), getTrend, perfLevel
    csv.js                        — downloadCSV(filename, headers, rows) — RFC 4180 escaping +
                                    CSV-formula-injection defence (OWASP) + UTF-8 BOM for Excel
    __tests__/                    — finance.test.js, dashboard.test.js
  contexts/
    AuthContext.jsx               — Session persistence; listens to api.js 401 events to logout + nav
    SignInContext.jsx             — Sign-in modal open/close
    DashboardContext.jsx          — Composes Nav + Panel; exposes merged useDashboard()
    DashboardNavContext.jsx       — URL-based drill-down state; section ('map'|'reports'); reportId;
                                    drillTargetBranchId/AgentId; onPanelActionRef
    DashboardPanelContext.jsx     — Submenu toggles + panel open states +
                                    reportContext + closeAllPanels(); registers setters into
                                    onPanelActionRef. Used by Distributor + Branch dashboards;
                                    Agent dashboard is fully routed and does not consume this.
    BranchScopeContext.jsx        — branchId for Branch-Admin trees
    AgentScopeContext.jsx         — agentId for Agent trees (parallel to BranchScopeContext)
    ToastContext.jsx              — Toast queue (max 3 visible) + auto-dismiss timers
  components/
    Navbar, Hero, SavingsCalculator, HowItWorks, TimeJourney, ForYou, Trust, CTA,
    Footer, StickyMobileCTA, SignInModal, ErrorBoundary, Toast
    signin/
      RoleSelect, DistributorSelect, PhoneEntry, OtpVerify
  pages/
    About, FAQ, Contact           — Marketing/support pages
  signup/
    SignupPage.jsx                — Route entry; provides SignupContext
    SignupShell.jsx               — Layout + progress ring + back/exit; exports STEPS, AGENT_STEP,
                                    PENDING_REVIEW_STEP, getStepIndex
    SignupContext.jsx             — useReducer + localStorage persistence ('uganda-pensions-signup');
                                    File/Blob fields stripped at serialise time
    EducationalLoader.jsx         — Reusable "checking…" loader with rotating copy
    steps/
      IdUploadStep, ReviewStep, NiraStep, OtpStep, LivenessStep, AmlStep,
      BeneficiariesStep, ConsentStep, ActivatedStep
      AgentFallbackStep, PendingReviewStep   (terminal states)
      Step.module.css             — Shared step-level styles
    contribution/
      ContributionRoute.jsx       — Routed at /signup/contribution. On confirm: patches schedule,
                                    auth.login({ role: 'subscriber' }), navigates to /dashboard
                                    (NOTE: JSDoc still says '/coming-soon' — stale, see Known issues)
      ContributionSettings.jsx    — Frequency + amount + retirement/emergency split (552 lines)
      PaymentStep.jsx             — Initial funding step
  dashboard/                      — DISTRIBUTOR ADMIN
    DashboardShell.jsx            — Root: sidebar + map + overlays + all slide-in panels
    shared/
      Stars.jsx                   — Star rating display
      Icons.jsx                   — Shared inline SVG icon set (use first; only add new ones here)
      KpiCard.jsx                 — Shared KPI card (used by ViewBranches/Agents/Subscribers)
      Demographics.jsx            — Shared gender/age donut + bars
      MiniChart.jsx               — Tiny sparkline
      TrendArrow.jsx              — Up/down/flat arrow for trends
    map/UgandaMap.jsx             — Full-bleed Leaflet map with drill-down
    sidebar/Sidebar.jsx           — Dark indigo icon rail with tooltips (618 lines)
    overlay/OverlayPanel.jsx      — Top-left glassmorphism card (KPIs, commissions, time period,
                                    entity list) (566 lines)
    overlay/Breadcrumb.jsx        — Drill-down path navigation
    overlay/TopBar.jsx            — Filter + Download (CSV export wired) buttons (top-right)
    cards/MetricsRow.jsx          — Bottom card row (2 cards: AI chat + Demographics; flex)
    branch/ViewBranches.jsx       — Branch list + detail slide-in (985 lines; commission section)
    branch/CreateBranch.jsx       — Multi-step branch creation form
    agent/ViewAgents.jsx          — Agent list + detail slide-in (commission data + link to commissions)
    subscriber/ViewSubscribers.jsx— Subscriber list + detail slide-in
    commissions/CommissionPanel.jsx
                                  — Commission settlement slide-in (1195 lines; replace-model nav)
    reports/
      ViewReports.jsx             — Reports slide-in root (accepts reportContext for auto-nav)
      ReportsHub.jsx              — Report index (card grid + lazy-loaded report views)
      ReportTable.jsx             — Sortable/paginated data table
      ReportView.jsx              — Per-report shell (header, filters, table)
      FilterSelect.jsx            — Filter dropdown component
      views/                      — 11 report views — see "Reports panel" below
    settings/Settings.jsx         — Profile + password + (subscriber-only) nominee management (520 lines)
  branch-dashboard/               — BRANCH ADMIN
    BranchDashboardShell.jsx      — Root. Redirects to /coming-soon if role !== 'branch'.
                                    Wraps in DashboardProvider + BranchScopeProvider(branchId).
    sidebar/BranchSidebar.jsx     — Icon rail (desktop) + bottom tab bar (mobile) with "More" menu;
                                    Agents uses a popover (Create / View)
    overview/
      BranchOverview.jsx          — Health score + operations (passes splitMode to side panels;
                                    PANEL_PADDING widths: agents 560, commissions 600, reports 680,
                                    settings/createAgent 460)
      BranchHealthScore.jsx       — Score gauge 0–100, metric breakdown, insights, contribution chart,
                                    embedded AI chat (534 lines)
      OperationsSection.jsx       — Sortable agent leaderboard + tabbed commissions/demographics
    agent/CreateAgent.jsx         — 2-step agent creation form
  agent-dashboard/                — AGENT (field agent — routed pages, mobile-first; modeled on
                                    the Subscriber dashboard, NOT the Branch Admin slide-in pattern)
    AgentDashboardShell.jsx       — Root. Redirects to /coming-soon if role !== 'agent'.
                                    Wraps in AgentScopeProvider(agentId) + nested <Routes>.
                                    Shows MissingAgentIdScreen if agentId missing. NOTE: no
                                    DashboardProvider — agent has no panel state.
    shell/
      AgentShell.jsx              — SideNav + viewport (AnimatePresence) + BottomTabBar
      SideNav.jsx                 — Desktop icon rail (Home / Subscribers / Commissions) +
                                    featured "Onboard subscriber" indigo button + Settings + Logout
      BottomTabBar.jsx            — Mobile: Home / Subscribers / [Onboard FAB centered raised] /
                                    Commissions / More popover (Settings + Log out)
      PageHeader.jsx              — Shared page header with back button
    home/
      HomePage.jsx                — Staggered stack of 2 widgets, max-width 880px on desktop:
                                    Hero → CoPilot.
      widgets/
        PortfolioPulseCard.jsx    — Hero: hour-aware greeting + count-up monthly-contribution
                                    volume + always-visible metrics panel (Totals: Total
                                    subscribers · Total contributions · Total commissions;
                                    Upcoming: Next payout · Pending contributions; Active vs
                                    Dormant split bar — green/red). The "Next payout" stat reads
                                    from the agent's chosen cadence via `cycleWindow()` in
                                    `src/utils/settlementCycle.js`. Footer CTA: "Onboard a new
                                    subscriber" → /dashboard/onboard.
        CoPilotWidget.jsx         — Local keyword-matched chat over portfolio data
    pages/
      OnboardPage.jsx             — 4-stage flow: awareness → KYC → schedule → done.
                                    Wraps SignupProvider; hands off to OnboardingComplete.
      SubscribersPage.jsx         — List view (search + sort + active/dormant filter + KPI rows).
                                    No KYC filters. No reminder UI.
      SubscriberDetailPage.jsx    — Profile (with KYC-verified pill + active/dormant pill) + KPIs
                                    + contribution schedule (View/Edit) + sparkline + products held.
                                    No KYC section. No reminder UI.
      SubscriberSchedulePage.jsx  — Schedule editor at /dashboard/subscribers/:id/schedule.
                                    Uses ContributionSettingsForm + useUpdateSubscriberSchedule.
      AnalyticsPage.jsx           — Recharts insights from the agent's own subscribers: gender
                                    donut, age bars, frequency mix, contribution-amount bands,
                                    active/dormant ratio, last-6-months onboarding velocity.
                                    Skeleton + empty states; respects prefers-reduced-motion.
      CommissionsPage.jsx         — Home view (Payout schedule card with inline cadence editor +
                                    next-payout card + summary strip + Earned/Owed cards + Needs
                                    Attention + Past cycles history) + 4 sub-routes via :view
                                    (earned / owed / confirm / disputes). Dispute modal. Settlement
                                    is automatic on cadence; per-row "Request settlement" CTA was
                                    retired.
      SettingsPage.jsx            — Profile + password forms (agent-specific, not the shared
                                    panel-style Settings).
    onboarding/
      AwarenessCheck.jsx          — 5 must-know points + quiz (used by OnboardPage stage 1)
      OnboardKycFlow.jsx          — Reuses signup STEPS (id-upload → consent); exits via onComplete
                                    when consent is captured; ManualReviewCard for terminal states
      OnboardScheduleStep.jsx     — Wraps ContributionSettingsForm; patches signup.contributionSchedule
      OnboardingComplete.jsx      — Success card with subscriber summary + captured schedule row
                                    + Onboard another / Close actions
    shared/
      (none — ContributionSettingsForm lives at src/components/contribution/)
  components/contribution/
    ContributionSettingsForm.jsx  — Reusable schedule form (frequency + amount + split + insurance
                                    + summary section). Used by subscriber SchedulePage,
                                    agent SubscriberSchedulePage, and OnboardScheduleStep. Owns
                                    its sticky footer with primary (and optional secondary) buttons.
                                    Initial state set on mount; if `initial` arrives async, parent
                                    must guard the render so the form mounts after data loads.
  subscriber-dashboard/           — SUBSCRIBER (~70% built — see "Subscriber dashboard" below)
    SubscriberDashboardShell.jsx  — Root. Redirects to /dashboard if role !== 'subscriber'.
                                    Routes nested URLs to pages.
    shell/
      SubscriberShell.jsx         — SideNav + viewport (with AnimatePresence) + BottomTabBar
      SideNav.jsx                 — Desktop icon rail with primary/secondary nav + logout
      BottomTabBar.jsx            — Mobile: 3 core tabs + "More" popover
      PageHeader.jsx              — Shared page header with back button
      navigation.js               — Shared nav item config (icons, labels, routes)
    home/
      HomePage.jsx                — Staggered grid of 6 widgets
      widgets/
        PulseCard.jsx             — Hero balance + count-up + life progress + projection CTA
        TopUpWidget.jsx           — "Pay now" or "Set a schedule" + quick-add chips
        ProjectionWidget.jsx      — Future-value calculator with age slider
        IfYouNeedItWidget.jsx     — Withdraw + claim CTAs (desktop only — phoneHide)
        ActivityWidget.jsx        — Last 3 transactions + "View all"
        CoPilotWidget.jsx         — AI chat with suggestion pills
    pages/
      SavePage, SchedulePage, WithdrawalsHubPage, WithdrawPage, ClaimPage,
      ProjectionPage, ActivityPage, ReportsPage, AgentPage, HelpPage,
      SettingsPage, ProfilePage, NomineesPage, InsurancePage,
      StubPage                    — Shared stub for /settings/notifications and /settings/security
    reports/views/                — 5 report views — see "Subscriber dashboard" below
  data/
    mockData.js                   — Mock data (1319 lines; only imported by src/services/)
  test/setup.js                   — Vitest setup (imports @testing-library/jest-dom)
```

### Shared utilities — MUST USE (do not re-define)
- `src/utils/finance.js`
  - `formatUGX(n)` — short e.g. `UGX 1.2M`
  - `formatUGXExact(n)` — full e.g. `UGX 50,000`
  - `fmtShort(n)` — no prefix
  - `parseAmount(str)` — strips non-digits → int or null
  - `calcFV(pmt, years)` — future value, monthly compounding
  - `FREQUENCY` (`WEEKLY`, `MONTHLY`, `QUARTERLY`, `HALF_YEARLY`, `ANNUALLY`)
  - `normalizeFrequency(value)` — defends against legacy aliases (always wrap incoming schedules)
  - `periodsPerYear(freq)`, `monthlyEquivalent(schedule)`
  - `sliderToAmt(v, min, max)` / `amtToSlider(a, min, max)` — log scale
  - `MONTHLY_RATE`, `ANNUAL_RATE`, `EASE_OUT_EXPO`
- `src/utils/dashboard.js`
  - `getInitials(name)` (defensive for empty input)
  - `getTrend(today, weekAvg)` → `'up' | 'down' | 'flat'`
  - `perfLevel(pct)` → `'high' | 'mid' | 'low'`
- `src/utils/csv.js`
  - `downloadCSV(filename, headers, rows)` (RFC 4180 + formula-injection defence)
- `src/hooks/useIsMobile.js` — don't reimplement window-width checks
- `src/hooks/useOutsideClick.js` — for popovers/dropdowns; fires on `mousedown` (before trigger's onClick) + Escape
- `src/dashboard/shared/Stars.jsx` — Star rating display
- `src/dashboard/shared/KpiCard.jsx`, `Demographics.jsx`, `MiniChart.jsx`, `TrendArrow.jsx` — reuse in Distributor dashboard contexts
- `src/dashboard/shared/Icons.jsx` — single source for inline SVG line icons; add new ones here
- `src/constants/savings.js` — `RETIREMENT_AGE`, `START_AGE`, `MIN_CONTRIBUTION`, `INSURANCE_*`, `QUICK_CONTRIBUTION_AMOUNTS`

### Signup (subscriber KYC) flow

**Route:** `/signup/*` (lazy-loaded from `App.jsx`).

**Step order (`SignupShell.STEPS`):**
1. `id-upload` — IdUploadStep: camera-capture front + back of national ID with inline quality check.
2. `review` — ReviewStep: OCR auto-fill with manual override (phone, NIN, DOB, occupation, district, gender).
3. `nira` — NiraStep: silent NIRA match (routes to agent fallback on mismatch).
4. `otp` — OtpStep: SMS OTP verification (any 6-digit code in prototype).
5. `liveness` — LivenessStep: selfie + face-match, one retry allowed (routes to agent on failure).
6. `aml` — AmlStep: silent sanctions/compliance screening (routes to pending review if flagged).
7. `beneficiaries` — BeneficiariesStep: pension beneficiaries (+ optional separate insurance beneficiaries).
8. `consent` — ConsentStep: plain-English summary + timestamped acceptance.
9. `done` — ActivatedStep: success screen with member ID card; CTA goes to `/signup/contribution`.

**Terminal states (break out of numbered sequence):**
- `agent-fallback` (`AGENT_STEP = 'agent'`) — AgentFallbackStep: shown on NIRA or liveness failure. Surfaces failure reason and prompts user to visit an agent.
- `pending-review` (`PENDING_REVIEW_STEP = 'pending-review'`) — PendingReviewStep: shown on AML flag. "Under review" message.

Both terminals freeze the progress ring at `pausedAt` and hide the back button.

**Post-activation sub-flow (routed at `/signup/contribution`):**
- `ContributionSettings` — frequency (weekly/monthly/quarterly/half-yearly/annually), amount, and retirement/emergency split.
- `PaymentStep` — initial funding.
- On confirm: patches `contributionSchedule` into SignupContext, calls `auth.login({ role: 'subscriber' })`, navigates to `/dashboard` (the live subscriber dashboard).

**Persistence:** `SignupContext` uses `useReducer` with a lazy initialiser that reads from `localStorage` (`uganda-pensions-signup`) and a `useEffect` that writes on every state change. File/Blob fields and their object URLs (`idFrontFile`, `idBackFile`, `selfieFile`, `idFrontPreviewUrl`, `idBackPreviewUrl`) are dropped at serialise-time — user re-uploads on refresh, but all other fields (OCR result, phone, NIRA outcome, beneficiaries, consent) survive. `reset()` clears storage.

### Sign-in modal flow

- 4 steps: Role Select → (Distributor Sub-select if applicable) → Phone Entry → OTP Verify.
- Main roles: Subscriber, Employer, Distributor, Admin.
- Distributor sub-roles: Distributor Admin, Branch Admin, Agent.
- Any 6-digit OTP accepted (prototype) — calls `auth.login()`, then navigates to `/dashboard` if `hasDashboard(role)` else `/coming-soon`.
- **Subscriber KYC gate:** After login, subscribers are routed to `/signup` (instead of `/dashboard`) if `isSignupComplete()` from `src/signup/signupState.js` returns false. Completion is signalled by `consent === true` in the persisted signup state (i.e., the user reached and accepted the Consent step).

### Dashboard (Distributor Admin)
- `DashboardShell.jsx` is the root — fixed viewport, CSS grid: sidebar (64px) + main area.
- `DashboardNavContext` derives drill levels from the URL: country → region → district → branch → agent → subscriber.
- Navigation actions translate to URL changes.
- Panel UI state remains in `DashboardPanelContext`.
- **Cross-context handoff:** `DashboardPanelContext` registers panel setters into `DashboardNavContext.onPanelActionRef`. Map drill-down effects in `UgandaMap` call those setters via the ref to auto-open `ViewBranches` / `ViewAgents` with the entity pre-selected. Closing returns to the previous level.
- **Report linking:** `reportContext` (string reportId or null) — when set + `viewReportsOpen=true`, ViewReports auto-navigates to that report. Triggered by clickable overlay metrics.
- **Drill-target state:** `drillTargetBranchId`/`drillTargetAgentId` track entities opened via map drill-down. `closeDrillPanel()` clears state + navigates back to district.

### Dashboard (Branch Admin)
- `BranchDashboardShell.jsx` — root. **Redirects to `/coming-soon` if `role !== 'branch'`** (defensive guard; primary role routing is in `App.jsx`).
- Wraps children in `DashboardProvider` + `BranchScopeProvider(branchId)`. Shows `MissingBranchIdScreen` if `branchId` is missing.
- Single main view: `BranchOverview` (no drill-down). Side panels (`ViewAgents`, `CreateAgent`, `CommissionPanel`, `ViewReports`, `Settings`) open via `BranchSidebar` and are rendered with `splitMode` (no backdrop; reflows main).
- Sidebar popover for Agents: choose Create New / View Existing.
- Mobile: bottom tab bar (Overview, Agents, Commissions) + "More" menu (Reports, Settings, Logout).

**Overview composition:**
- `BranchHealthScore` — score gauge (0–100), weighted formula (retention 30%, avg per subscriber 25%, agent activity 25%, growth 20%), insights, contribution trend chart, embedded AI chat. Uses `--color-positive` / `--color-positive-soft` / `--color-accent-mint` / `--color-amber` / `--color-alert`.
- `OperationsSection` — agent leaderboard (sortable by contributions/subscribers/active-rate) + tabbed commissions/demographics; medal colors for top 3.

### Dashboard (Agent)
- `AgentDashboardShell.jsx` — root. **Redirects to `/coming-soon` if `role !== 'agent'`**. Wraps children in `AgentScopeProvider(agentId)` + nested `<Routes>`. No `DashboardProvider` — the agent dashboard has no panel state. Shows `MissingAgentIdScreen` if `agentId` is missing.
- Architecture: routed pages, mobile-first, modeled on the Subscriber dashboard. Each top-level destination is its own route under `/dashboard/*`. No slide-in panels.
- **Routes (all under `/dashboard` for `role === 'agent'`):**
  - `/` → `HomePage` (6 widgets)
  - `/onboard` → `OnboardPage` (4-stage flow)
  - `/subscribers` → `SubscribersPage` (list)
  - `/subscribers/:id` → `SubscriberDetailPage`
  - `/subscribers/:id/schedule` → `SubscriberSchedulePage`
  - `/analytics` → `AnalyticsPage` (recharts demographics + saving habits + onboarding velocity)
  - `/commissions` and `/commissions/:view` → `CommissionsPage`
  - `/settings` → `SettingsPage`
- Shell: `AgentShell` (SideNav + viewport with `AnimatePresence` + BottomTabBar). On desktop ≥1024px, SideNav is visible and BottomTabBar hidden. On phone, BottomTabBar is shown with a centered raised "Onboard" FAB tab.
- **Demo wiring:** `SignInModal` injects `agentId: 'a-001'` into the login payload when role is `'agent'`. Backend will return the real ID from `verifyOtp`.

**Home widgets** (in `home/widgets/`, all consume agent-scoped hooks):
- `PortfolioPulseCard` — dark-indigo hero: hour-aware greeting, eyebrow ("Monthly contribution volume"), and a count-up hero value (the agent's monthly run-rate). The metrics panel below is always visible (no toggle) on every viewport. Two stat blocks: "Totals" (Total subscribers · Total contributions · Total commissions) and "Upcoming" (Next payout · Pending contributions), plus an Active vs Dormant split bar in green/red. The "Next payout" stat is cadence-aware — it sums all due commissions whose `dueDate` falls within the agent's upcoming cycle (`cycleWindow()` in `settlementCycle.js`) and refreshes when the agent navigates back from `/dashboard/commissions` after editing cadence. The footer is a primary CTA — "Grow your book · Onboard a new subscriber" → `/dashboard/onboard`. NO health-score gauge.
- `CoPilotWidget` — local keyword-matched chat over `useAgentSubscribers` + `useEntityCommissionSummary` data (no backend call).

The standalone `NeedsAttentionWidget`, `OnboardWidget`, `CommissionsWidget`, and `RecentSubscribersWidget` have all been removed from the home grid. The hero card's footer CTA owns onboarding; recent-subscriber browsing lives on `/dashboard/subscribers`; Commissions/payout details and the Needs-attention follow-ups live on `/dashboard/commissions`; the indigo hero's expanded panel surfaces the next-payout amount inline. If real-time tasks, a recent-subscribers list, or a payout summary card need to surface on the home grid again later, scaffold a new widget rather than reviving the deleted ones.

**KYC business rule:** Every Universal Pensions subscriber is KYC-verified by definition — KYC is captured during signup or agent-led onboarding before the subscriber record is created. There are no KYC reminders, no "Resume KYC" CTAs, and no KYC filters in the agent dashboard. Mock data sets every subscriber's `kycStatus` to `'complete'`. The Distributor `KycCompliance` report carries a banner explaining the rule and is retained only for audit/historical edge cases.

**Onboarding flow** (`OnboardPage` orchestrator at `/dashboard/onboard`):
1. Awareness check — 5 must-know points + quiz (`AwarenessCheck`).
2. KYC — `OnboardKycFlow` reuses signup STEPS (id-upload → consent); exits via `onComplete` when consent is captured.
3. Schedule — `OnboardScheduleStep` wraps `ContributionSettingsForm`; patches `signup.contributionSchedule`. **Required**, no skip.
4. Done — `OnboardingComplete` displays subscriber summary + captured schedule row + "Onboard another" reset / Close.

**Schedule editing for existing subscribers** (`SubscriberSchedulePage` at `/dashboard/subscribers/:id/schedule`):
- Reuses `ContributionSettingsForm` with `initial = subscriber.contributionSchedule`.
- Calls `useUpdateSubscriberSchedule(subscriberId, agentId)` (in `useAgent.js`) which wraps `subscriberService.updateContributionSchedule` and invalidates `['agentSubscribers', agentId]` so the detail page reflects the change without a refresh.

**Commissions page** (`CommissionsPage` at `/dashboard/commissions` and `/dashboard/commissions/:view`):
- `useAgentCommissionDetail(agentId)` provides the data. Home view leads with a **Payout schedule** card (cadence + next payout date + total + auto-included count) with an inline edit panel that lets the agent pick Weekly Friday / Bi-weekly Friday / Monthly 1st. Cadence is persisted in `localStorage` under `upensions_agent_settlement_cadence` via `src/utils/settlementCycle.js`. Below the schedule sit a smaller summary strip (Total + settlement progress bar), Earned/Owed primary cards, Needs Attention rows (Confirm receipts + Disputes), and a **Past cycles** history grouped by paid month/week — collapsible rows expand to the contained commissions.
- Sub-routes for `:view ∈ {earned, owed, confirm, disputes}` show filtered lists with per-row actions:
  - **Confirm receipt** (`useAgentConfirmCommission`) — for paid commissions where `agentConfirmed` is false. Maker-checker counterpart to admin `settleCommissions`.
  - **Dispute** (`useDisputeCommission`) — modal with preset reasons + custom text.
- **Settlement is automatic on the agent's chosen cadence.** The bulk "Request settlement" CTA and per-row "Request settlement" buttons were retired so agents never miss a payout. The service-layer `requestCommissionSettlement` and `useRequestCommissionSettlement` hook are still exported for future server-driven cycle jobs but are no longer used in the agent UI. The legacy `/commissions/requests` URL redirects home.

### Dashboard (Subscriber) — ~70% built

`SubscriberDashboardShell.jsx` is the root. Redirects to `/dashboard` if `role !== 'subscriber'` (defensive). Wraps children in `SubscriberShell` (SideNav + viewport + BottomTabBar). Page transitions use `AnimatePresence` (opacity + 12px y, EASE_OUT_EXPO).

**Routes (all under `/dashboard`):**
- `/` → `HomePage` (6 widgets)
- `/save` → `SavePage` — multi-step contribution: amount + retirement split + method → confirm → success
- `/save/schedule` → `SchedulePage` — frequency + amount + retirement split (uses `normalizeFrequency`)
- `/withdraw` → `WithdrawalsHubPage` — choose savings withdrawal vs insurance claim
- `/withdraw/savings` → `WithdrawPage` — bucket selection + amount + reason
- `/withdraw/claim` → `ClaimPage` — type + date + amount + description + file upload
- `/projection` → `ProjectionPage` — 5 preset goals (emergency, car, education, house, retirement)
- `/activity` → `ActivityPage` — full transaction history with filters + monthly grouping
- `/reports` → `ReportsPage` — hub + nested route per report
- `/reports/:reportId` → lazy-loaded report view
- `/agent` → `AgentPage` — chat with assigned agent (persists conversation in localStorage)
- `/help` → `HelpPage` — FAQ + contact info + agent lookup. (NOTE: copy for live chat is currently misleading — see Known issues.)
- `/settings` → `SettingsPage` — profile + password + verification toggle
- `/settings/profile` → `ProfilePage` — uses `useUpdateProfile` mutation
- `/settings/nominees` → `NomineesPage` — pension + insurance beneficiaries
- `/settings/insurance` → `InsurancePage` — product details + cover selection + beneficiaries
- `/settings/notifications` → `StubPage` (intentional placeholder)
- `/settings/security` → `StubPage` (intentional placeholder)
- `*` → redirect to `/dashboard`

**Home widgets** (in `home/widgets/`, all consume `useCurrentSubscriber()`):
- `PulseCard` — balance count-up, hour-aware greeting, expandable metrics, life-progress bar (`START_AGE`→`RETIREMENT_AGE`), projection CTA.
- `TopUpWidget` — "Pay now" / "Set a schedule" + quick-add chips (`QUICK_CONTRIBUTION_AMOUNTS` from `constants/savings.js`).
- `ProjectionWidget` — future-value calculator with age slider; pulls real DOB from signup localStorage if present.
- `IfYouNeedItWidget` — withdraw + claim CTAs; hidden on phones via `phoneHide`.
- `ActivityWidget` — last 3 transactions across all types; "View all" → `/dashboard/activity`.
- `CoPilotWidget` — AI chat using `getSubscriberChatResponse()`; suggestion pills.

**Reports** (in `reports/views/`):
- `AllTransactions`, `ContributionsSummary`, `WithdrawalsHistory`, `InsuranceStatement`, `AnnualStatement` — all functional, all support CSV export via `downloadCSV`.

**Data flow:** Components call `useCurrentSubscriber` / `useSubscriberTransactions` / `useSubscriberClaims` / `useSubscriberNominees` / `useSubscriberAgent` from `useSubscriber.js`. Mutations (`useMakeContribution`, `useRequestWithdrawal`, `useUpdateSchedule`, `useUpdateNominees`, `useSubmitClaim`, `useUpdateInsuranceCover`, `useUpdateProfile`) call into `subscriber.js`, which keeps a per-session in-memory mutation log (`_sessionMutations`) and merges it on read so balances/transactions reflect changes optimistically without mutating frozen mockData. All mutations call `invalidateSubscriber()` to clear React Query caches.

### Commission data in drill-down views
- `useEntityCommissionSummary(level, entityId)` returns `{ totalPaid, totalDue, totalDisputed, countPaid, countDue, countDisputed, total, countTotal, settlementRate }` for any hierarchy level.
- **OverlayPanel** shows a commission summary block (bar chart + stats) at country/region/district levels. Clicking opens CommissionPanel.
- **ViewBranches detail** shows commission section with settled/due/disputed rows.
- **ViewAgents detail** shows commission section with "View Details" link to CommissionPanel.
- Aggregation uses a service-level memo cache (`_summaryCache` Map in `commissions.js`), invalidated by every mutation (settle, approve, reject) and exposed via `invalidateSummaryCache()` for tests.

### Clickable overlay metrics → reports
- Period card metric rows (New Subscribers, Contributions, Withdrawals, Top Branch) are clickable buttons that set `reportContext` and open the reports panel.
- Count items (Subscribers, Agents, Branches) open the corresponding "All X" report.
- `reportContext` is a string (reportId) stored in `DashboardPanelContext`, consumed by ViewReports.

### Data architecture
- Mock data in `src/data/mockData.js` — flat lookup maps keyed by ID for O(1) access.
- Hierarchy: Country → Regions (4) → Districts (135, real Ugandan GADM names) → Branches (~314) → Agents (~2,000) → Subscribers (~30,000, lazy-generated via Proxy).
- Commissions: ~30,000 records tied to agents/subscribers. Statuses: paid, due, disputed, rejected. Pre-indexed by agent and branch for O(1) lookups. Rate in `COMMISSION_CONFIG`.
- Metrics aggregated bottom-up at module load (agent ← subscribers, branch ← agents, etc.).
- **Per-session entity overrides:** `entities.js` keeps a small in-memory `Map` keyed by `${level}:${id}` so updates (e.g. `setBranchStatus`) layer on top of frozen mockData without mutating it. Lost on refresh.
- **Per-session subscriber mutations:** `subscriber.js` uses the same pattern (`_sessionMutations`) to fold contributions/withdrawals/schedule edits/etc. into reads.
- Map GeoJSON: `public/uganda-districts.geojson` (177 kB, 135 districts, clipped to region polygons) and `public/uganda-regions.geojson` (29 kB, 4 regions). Original pre-clip backup at `public/uganda-districts-original.geojson`. Re-run via `node scripts/clip-districts.mjs` (uses `@turf/turf`).
- React Query (`staleTime: 5min`, `gcTime: 10min`, `refetchOnWindowFocus: false`, `retry: 1`) provides caching, deduplication, and stale-while-revalidate.

### KYC service (`src/services/kyc.js`)
- Shaped against **Smile ID v2** (chosen for Uganda NIRA integration).
- Provides mocked: image quality assessment, ID OCR (front + back), NIRA verification, OTP send/verify, face-match + liveness, AML/PEP screening, agent referral.
- Each call returns a `tracking_id` the backend can use to correlate stages of one onboarding job.
- **QA force-overrides** via localStorage keys (`upensions_*_force`) let testers force-fail any stage without changing code. Useful for QA scripts.
- To swap in the real provider: replace the `// Future:` stubs with `api.post()` calls.

### Dashboard UI patterns

**Map:**
- Full-bleed background using `react-leaflet` with CartoDB Positron tiles.
- GeoJSON from GADM (135 districts), region color-coding (indigo palette: Central #5E63A8, Eastern #2F8F9D, Northern #3D3C80, Western #7B7FC4).
- Soft bokeh glow halos at region centroids.
- Hover tooltips showing district + region.
- Map zooms via `flyTo` / `fitBounds` on drill-down.
- **Map → panel handoff:** Drilling to branch/agent level auto-opens ViewBranches/ViewAgents with the entity pre-selected. Closing returns to district.

**Glassmorphism cards (dashboard-specific):**
- Background: `linear-gradient(145deg, rgba(255,255,255,0.78) 0%, rgba(246,247,251,0.72) 100%)`
- Border: bright top/left (0.8/0.7 opacity white) for 3D light direction
- Backdrop blur: 24px
- Inset shadows: `0 1px 0 rgba(255,255,255,0.5) inset`
- Hover: `translateY(-3px)` + deeper shadow
- Tokens: `--glass-bg`, `--glass-blur`, `--glass-border`

**Collapsible sections:** `CollapsibleSection` in OverlayPanel — animated height + chevron rotation via `AnimatePresence`.

**Bottom cards (`MetricsRow`):**
- 2-card flex row (ChatCard + Demographics). Cards expand/collapse independently; grow upward.
- Chat body always mounted (CSS `grid-template-rows` collapse) to avoid white-flash on open.
- Card 1: AI Data Assistant (inline chat with suggestion pills).
- Card 2: Demographics (gender donut + age bars; expands to show counts).

**AI Chat (Data Assistant):**
- Embedded in bottom card row (not floating).
- Mock responses from `services/chat.js` (`getChatResponse` for distributor/branch; `getSubscriberChatResponse` for subscriber co-pilot; `getAgentReply` for subscriber ↔ agent DM). Will be connected to LLM + DB in production.

**Commission Panel (slide-in):**
- Entry: wallet icon in sidebar, or mobile drawer "Commissions".
- **Replace-model** navigation: single panel swaps content with breadcrumb trail (not stacked).
- Views: home → agents (filter paid/due) → agent-detail → subscribers | disputed agents → dispute-detail | settlement requests → request-detail.
- Home: overview hero (total + progress bar + inline rate config), settled/pending cards, settle CTA, needs-attention (disputed + requests).
- Commission rate: flat fee per subscriber, configurable inline.
- Commission trigger: subscriber's first contribution.
- Maker-checker: `agentConfirmed` field tracks agent-side confirmation. The agent half is built — see `MyCommissions` in the Agent dashboard. Admin `settleCommissions` flips status `due → paid` and clears `agentConfirmed`; the agent then calls `agentConfirmCommission` to acknowledge receipt.
- Bulk actions: multi-select checkboxes on disputed/requests with floating action bar.
- Settlement modal: amount + transaction count confirmation before processing.

**Settings panel (slide-in):**
- Entry: gear icon in sidebar, or mobile drawer "Settings".
- Profile card: initials avatar (via `getInitials`), name, phone, role badge.
- Personal Information: editable name, email, phone (+256 prefix).
- Change Password: current / new (strength meter) / confirm with show/hide toggles.
- Validation: name + phone required; password fields only validated if any filled; min 8 chars; match check.
- Dirty check: save disabled until change.
- Success toast via `useToast()`.
- `<form>` must have `display: flex; flex-direction: column; flex: 1; min-height: 0` to propagate flex from the panel.

**Reports panel (slide-in, 680px wide):**
- 11 distributor-side report views under `dashboard/reports/views/`: DistributionSummary, AllBranches, AllAgents, AllSubscribers, ContributionsCollections, WithdrawalsPayouts, BranchPerformance, AgentPerformance, SubscriberGrowth, SubscriberDemographics, KycCompliance.
- 5 subscriber-side report views under `subscriber-dashboard/reports/views/`: AllTransactions, ContributionsSummary, WithdrawalsHistory, InsuranceStatement, AnnualStatement.
- `ReportsHub` = index (card grid) + router. `ReportView` = per-report shell. `ReportTable` = reusable sortable/paginated table. `FilterSelect` = shared filter dropdown.
- Per-report filters (search, region/KYC/status dropdowns, sort).
- **CSV export is wired.** `TopBar.jsx` (distributor) and report views (subscriber) use `downloadCSV(filename, headers, rows)` from `src/utils/csv.js` (RFC 4180 escaping, formula-injection defence, UTF-8 BOM for Excel). Filenames include a date stamp.

**Slide-in panel conventions:**
- Backdrop: `position: fixed; inset: 0; background: rgba(27,26,74,0.35); z-index: 200`. Hidden in `splitMode`.
- Panel: `position: fixed; top: 16px; right: 16px; bottom: 16px; width: [460–680px]; z-index: 210; border-radius: var(--radius-xl)`
- Background: `linear-gradient(180deg, #F8F9FC 0%, #F0F1F8 100%)` (solid gradient, not glassmorphism)
- Shadow: `0 24px 80px rgba(41,40,103,0.18), 0 8px 24px rgba(41,40,103,0.08)`
- Header: close button (44x44, top-left), title (font-display, xl, 800), subtitle (font-body, sm, gray)
- Body: `flex: 1; overflow-y: auto; overflow-x: hidden`
- Footer: `border-top: 1px solid rgba(41,40,103,0.06)` with backdrop blur
- Framer Motion: `initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}` with `EASE_OUT_EXPO`
- Mobile (≤768px): `width: 100%; top: 0; right: 0; bottom: 0; border-radius: 0; border: none` with safe-area insets
- Escape key must close
- Reset internal state after 400ms delay on close
- Shared panels (`ViewAgents`, `CommissionPanel`, `ViewReports`, `Settings`, `CreateAgent`) accept a `splitMode` prop — when true, the backdrop is suppressed and the parent reflows main content beside the panel (used by `BranchOverview`).
- Agent dashboard does NOT use slide-in panels; every destination is a routed page under `/dashboard/*`.

### Dashboard design tokens (in `index.css`)
```css
/* Brand */
--color-indigo:        #292867;
--color-indigo-deep:   #1B1A4A;
--color-indigo-soft:   #5E63A8;
--color-lavender:      #D9DCF2;
--color-cloud:         #F6F7FB;
--color-slate:         #2F3550;
--color-gray:          #8A90A6;
--color-green:         #2E8B57;
--color-teal:          #2F8F9D;
--color-white:         #FFFFFF;

/* Status */
--color-status-good:     #2E8B57;
--color-status-warning:  #E6A817;
--color-status-poor:     #DC3545;

/* Health & trend accents (branch + subscriber dashboards) */
--color-positive:        #4ADE80;
--color-positive-soft:   #818CF8;
--color-accent-mint:     #2DD4BF;
--color-amber:           #FBBF24;
--color-alert:           #F87171;

/* Leaderboard medal tokens */
--color-medal-gold:      #FBBF24;
--color-medal-silver:    #94A3B8;
--color-medal-bronze:    #CD7F32;

/* Glass / layout */
--glass-bg:              rgba(255, 255, 255, 0.82);
--glass-bg-dark:         rgba(27, 26, 74, 0.85);
--glass-border:          rgba(217, 220, 242, 0.5);
--glass-blur:            16px;
--sidebar-width:         64px;
--map-bg:                #E8EAF0;

/* Easing */
--ease-out-expo:         cubic-bezier(0.16, 1, 0.3, 1);
--ease-in-out:           cubic-bezier(0.4, 0, 0.2, 1);
```

Plus full scales for `--text-xs`…`--text-7xl`, `--space-1`…`--space-32`, `--radius-sm/md/lg/xl/full`, `--shadow-sm/md/lg/xl`, and `--font-display` (Plus Jakarta Sans) / `--font-body` (Inter).

### Design consistency rules — MUST FOLLOW

The landing page establishes the design language for the entire platform. All new UI (signup, dashboards, panels) must maintain visual consistency with it.

**Icons:**
- Inline SVG line icons with `stroke="currentColor"` and `strokeWidth="1.75"`.
- Standard icon size: `24x24` viewBox, displayed at 24px (popover/sidebar use 18–22px).
- Never emojis, icon fonts, or icon libraries.
- Icon containers: `background: rgba(41,40,103,0.06)`, `border: 1px solid var(--color-lavender)`, `border-radius: var(--radius-md)`, `color: var(--color-indigo)`.
- Shared icons live in `src/dashboard/shared/Icons.jsx` — reuse when possible.
- Some inline-SVG icons use the sprite at `public/icons.svg` via `<use href="/icons.svg#name" />`.

**Cards and surfaces:**
- Card background: `var(--color-cloud)` or `var(--color-white)`
- Card border: `1px solid var(--color-lavender)`
- Card radius: `var(--radius-md)` small, `var(--radius-xl)` large panels
- Hover: `box-shadow: var(--shadow-md)` + subtle `translateY(-2px)`

**Buttons:**
- Primary: `background: var(--color-indigo)`, `color: white`, `border-radius: var(--radius-full)`, `font-family: var(--font-display)`, `font-weight: 700`
- Secondary: `border: 1px solid var(--color-lavender)`, `color: var(--color-indigo-soft)`, `border-radius: var(--radius-full)`
- Touch targets: minimum 44px height on mobile

**Typography:**
- Headings: `var(--font-display)` (Plus Jakarta Sans), `font-weight: 800`, `color: var(--color-indigo)`, `letter-spacing: -0.03em`
- Body: `var(--font-body)` (Inter), `color: var(--color-slate)`
- Secondary: `color: var(--color-gray)`
- Labels/tags: `var(--text-xs)`, `uppercase`, `letter-spacing: 0.06-0.1em`, `color: var(--color-indigo-soft)`

**Animations:**
- All entrance animations use `EASE_OUT_EXPO` (`[0.16, 1, 0.3, 1]`).
- Staggered children: `staggerChildren: 0.05–0.1`.
- Item reveal: `{ opacity: 0, y: 12-24 } → { opacity: 1, y: 0 }`.
- `AnimatePresence mode="wait"` for step transitions.

**Spacing:**
- Use `var(--space-*)` tokens.
- Section padding: `var(--space-16) 0 var(--space-20)` desktop, `var(--space-8) 0 var(--space-12)` mobile.
- Container: `max-width: 1200px`, `padding: 0 var(--space-8)` desktop, `0 var(--space-6)` mobile.

**Dark sections:**
- Background: `var(--color-indigo)` or `var(--color-indigo-deep)`
- Text: `var(--color-white)` for headings, `rgba(217,220,242,0.65)` for body
- Borders: `rgba(255,255,255,0.08-0.12)`

**Form inputs:**
- Border: `1.5px solid var(--color-lavender)`, `border-radius: var(--radius-md)`
- Focus: `border-color: var(--color-indigo)`, `box-shadow: 0 0 0 3px rgba(41,40,103,0.08)`
- Error: `border-color: #dc3545`
- Height: 48px standard (52px for landing-page inputs)

### docs/ — specs the code is built against
- `docs/role-permissions.md` — role × capability matrix (which CRUD ops + reports each role gets, branch-scoped vs network-wide).
- `docs/data-model.md` — full entity hierarchy with field definitions; metric-aggregation rules; commission state machine; branch-health-score formula (marked MOCK APPROXIMATION); KYC/withdrawal/AUM open questions.
- `docs/api-contracts.md` — 40+ endpoints mapped to service functions; request/response shapes; React Query cache keys and invalidation rules; pagination/sorting/filtering requirements.
- `docs/SPEC.md` — product spec for backend devs: personas, workflows (enrollment, contributions, commissions, withdrawals, KYC, reporting), business rules, technical constraints, open questions.
- `docs/DASHBOARD_AUDIT.md` — comprehensive dashboard audit (2026-04-30) with P0/P1/P2 findings.
- `docs/DASHBOARD_AUDIT_FIXES.md` — fix log with verification steps; deferred refactors listed at the end.

### Known issues / drift to fix (audit 2026-05-05)
The drift items found in the 2026-05-05 audit have all been fixed. Remaining standing items:

- **TanStack Virtual lint warnings** (`ViewAgents.jsx`, `ViewBranches.jsx`, `ViewSubscribers.jsx` calling `useVirtualizer`) — informational only; expected per the plugin docs. Safe to ignore.
- **`MOCK_NOW` will need replacing.** `src/data/mockData.js` exports `MOCK_NOW = new Date(2026, 3, 8)` and `commissions.js` imports it for "due in N days" / settlement timestamps. Once real data arrives from the backend, swap to `new Date()` (or pass through clock-injection if testability matters).
- **Largest files** (size only — no known bug, but candidates for extraction when next touched):
  `mockData.js` (1326), `CommissionPanel.jsx` (~1195), `ViewBranches.jsx` (~985), `Sidebar.jsx` (618), `OverlayPanel.jsx` (566), `ContributionSettings.jsx` (552), `BranchHealthScore.jsx` (534), `Settings.jsx` (520).

Audit fixes log (2026-05-05):
- Stale JSDoc in `ContributionRoute.jsx` and `auth.js` corrected.
- `MOCK_NOW` extracted from `commissions.js` to `mockData.js` as a documented exported constant.
- Subscriber KYC-incomplete jump to `/signup` wired in `SignInModal.handleVerify` via new `isSignupComplete()` helper in `src/signup/signupState.js`. `SignupContext` now imports the storage key from the same module.
- `aria-hidden="true"` added to decorative `↓` / `→` arrows in `TimeJourney`.
- Hardcoded `#f2f3f7` in `UgandaMap.module.css` replaced with `var(--color-cloud)`.
- Audit re-checked all `outline: none` declarations across signup CSS and confirmed every one either targets programmatic-only focus, has a visible replacement on the same selector (border + box-shadow), or relies on a `:focus-within` ring on the parent wrapper. No real violations.
- Re-confirmed: Footer logo already had `width={140} height={40}`; HelpPage copy already says "Live support chat · responds instantly" with no fake reply-time promise.

---

## Project summary
Universal Pensions is a digital long-term savings and pension platform being designed to make retirement saving more accessible, understandable, and usable for everyday people.

For Uganda, the platform should feel inclusive, trustworthy, modern, and scalable. The goal is not to build a cold pension back office or a generic fintech dashboard. The goal is to build a digital savings experience that helps people understand long-term security, contribute consistently, and feel progress over time.

At its core, Universal Pensions is about:
- making long-term savings simple
- making formal retirement products feel approachable
- creating trust through clarity and strong product design
- supporting multiple distribution and contribution models
- building a platform that can scale across employers, field distribution, and direct individual usage

## Core users & sign-in structure
**Sign-in modal shows 4 top-level options:**
1. **Subscriber** — Individual saver (informal workers, gig workers, farmers, self-employed). KYC via `/signup/*`; `SignInModal` re-routes to `/signup` if `isSignupComplete()` is false.
2. **Employer** — Organisation managing employee contributions.
3. **Distributor** — Shows 3 sub-options: Distributor Admin, Branch Admin, Agent.
4. **Admin** — Platform admin (head office).

**Distributor network hierarchy:** Country (Uganda) → Regions → Districts → Branches → Agents → Subscribers

### What matters per role:
- **Subscribers:** balance visibility, contribution journeys, progress tracking, trust
- **Employers:** employee management, contribution uploads, clean reporting
- **Agents:** guided workflows, fast mobile actions, task completion
- **Branches:** agent oversight, local performance, subscriber activity
- **Distributors:** network-wide visibility, branch/agent performance, strategic reporting
- **Admin:** full platform control, all data access

### Current build status:
- ✅ Landing page (complete, incl. About/FAQ/Contact)
- ✅ Sign-in modal (all roles; subscriber KYC-incomplete jump wired via `isSignupComplete()`)
- ✅ Subscriber signup / KYC flow (9 steps + 2 terminals + contribution sub-flow, localStorage-persisted)
- ✅ Frontend architecture (services, React Query, auth persistence, URL routing, env config, Toast system, Error boundary, per-session mutation stores in entities + subscriber)
- ✅ Distributor Admin dashboard (map, overlays, analytics, AI chat, commission settlement, 11 reports w/ CSV export, settings)
- ✅ Branch Admin dashboard (shell + sidebar + overview with health score + operations; shared ViewAgents / CommissionPanel / Reports / Settings in split-mode)
- 🟡 Subscriber dashboard (~70%): shell + 6 home widgets + 14 full pages + 2 stubs (notifications, security) + 5 reports. Routes via `/dashboard/*` when role is `'subscriber'`. Data via `useSubscriber` hooks → `subscriber.js` service (per-session mutation log). Needs: real payment provider, real insurance integration, notifications + security pages.
- ✅ Agent dashboard (routed pages under `/dashboard/*`, mobile-first; shell with SideNav + BottomTabBar; Home widgets, Subscribers list + detail + schedule edit, Analytics page with recharts demographics, Onboard 4-stage flow with contribution-schedule capture, Commissions page with cadence-based auto-settlement, Settings). Maker-checker actions wired: agent confirms receipt, raises disputes. KYC reminders feature removed — every subscriber is KYC-verified by signup time, so the agent dashboard never surfaces KYC state.
- ⬜ Employer dashboard (not started)
- ⬜ Admin dashboard (not started)
- ⬜ Backend integration (service layer ready; KYC shaped for Smile ID; api.js + env.js wired)

## Product thinking
This is not just a portal. It is a product-led platform that must balance:
- financial trust
- user education
- operational scalability
- structured multi-role workflows
- strong visual clarity

Retirement saving should feel visible, progressive, and achievable — not abstract.

## Overall UI / UX direction
The UI should feel: modern, calm, premium but accessible, trustworthy, guided (not overwhelming), clean and structured, serious enough for financial services but never stiff or bureaucratic.

Avoid: generic fintech dashboard patterns, cluttered enterprise admin styling, flashy neobank aesthetics, random decorative animations, artsy typography that harms clarity.

Prefer: strong hierarchy, high readability, spacious layouts, consistent CTA placement, clean grid alignment, polished studio-level motion, continuity throughout.

## Landing page storytelling direction
Scrollytelling: **scroll = time**. As the user scrolls, time passes — the page communicates the journey from today toward long-term financial security.

Depict: time passing, gradual savings accumulation, improving financial confidence, movement from uncertainty to stability, a future-oriented sense of dignity and security.

Intentional and cinematic, not gimmicky.

## Animation philosophy
Animation is a meaning layer, not decoration. It should communicate: time passing, money growing steadily, milestones being reached, confidence building, different life stages.

Feel: smooth, refined, premium, editorial/studio-grade, subtle but memorable. Avoid random, overly playful, flashy, or disconnected motion.

## How scroll should work on the landing page
Scrolling is a narrative device. Each section is a chapter. States evolve gradually. CTAs appear at the right narrative moments. The page should feel like moving through years, not moving down a long website.

## Motion ideas to preserve
- Layered transitions over simple fade-ins.
- Scroll-linked transformations with meaning.
- Scenes evolve as the narrative progresses.
- Charts, balances, states build gradually over scroll.
- Elegant, controlled movement. Strong alignment and rhythm.

## Information design principles
Layer information: summary first, detail second, operational depth only when needed.
- Show contribution status before transaction complexity.
- Show progress before technical detail.
- Show clear next steps before dense reporting.
- Dashboards understandable within seconds.

## Dashboard direction by role
**Subscriber:** balance, recent contributions, goal progress, future impact, simple reminders.
**Employer:** participation, contribution management, uploads, reporting, operational confidence.
**Agent:** assisted actions, pending tasks, subscriber status, quick completion, mobile-friendly.
**Branch:** local performance, agent oversight, subscriber activity, exceptions, progress snapshots.
**Distributor:** network-wide growth, branch/agent performance, trends, operational visibility, strategic reporting.

## Copy tone
Clear, respectful, confidence-building, simple, action-oriented but not aggressive. Plain English. Short support text. Benefit-led messaging. Direct labels.

Avoid heavy pension jargon, long institutional paragraphs, intimidating language.

## Brand kit

### Brand personality
Dependable, intelligent, modern, stable, human, future-facing.

### Primary color
**Universal Indigo — `#292867`** — core anchor for key headings, primary buttons, hero emphasis, important icons.

### Supporting palette
- Universal Indigo — `#292867`
- Deep Night — `#1B1A4A`
- Soft Indigo — `#5E63A8`
- Mist Lavender — `#D9DCF2`
- Cloud — `#F6F7FB`
- Slate Text — `#2F3550`
- Cool Gray — `#8A90A6`
- Success Green — `#2E8B57`
- Accent Teal — `#2F8F9D`

### Color rules
- Do not use red as a major brand color. Reserve for error/destructive/critical only.
- Indigo carries the primary identity.
- Neutrals and soft tints for spaciousness and readability.
- Teal/green sparingly for positive states, progress, growth.

### Background direction
Soft off-white, cloud gray, pale indigo tint, occasional deep-indigo contrast. Light and open — avoid black-heavy or dark-heavy.

### Typography direction
Modern, clean, confident, highly legible, not decorative. Plus Jakarta Sans (display) + Inter (body). Avoid artsy/stylised fonts.

### Visual style
Bold clean headings, large readable numbers, smooth card surfaces, restrained gradients, subtle depth, consistent iconography, motion tied to meaning. Avoid noisy visuals, overly playful illustration, random 3D, decorative complexity.

## Final instruction for Claude
When generating product strategy, UX ideas, wireframes, copy, or feature work for Universal Pensions Uganda, always optimise for:
1. trust
2. clarity
3. inclusivity
4. multi-role usability
5. long-term savings behavior
6. elegant scrollytelling
7. meaningful motion design
8. strong alignment and readability
9. indigo-led brand consistency

This platform should feel like a serious, modern, inclusive financial product with studio-quality storytelling and a clear sense of future progress.
