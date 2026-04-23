# Universal Pensions — Uganda Platform Context

## Technical context

**Stack:** React 19 + Vite 6 + Framer Motion + CSS Modules + React Router + TanStack React Query + Leaflet + Recharts
**Deployment:** Vercel (auto-deploy on push to `main`)
**Live URL:** uganda-dashboard.vercel.app

### Key conventions
- All styling uses **CSS Modules** (`.module.css` per component) — no Tailwind
- Design tokens are **CSS custom properties** in `src/index.css` (colors, spacing, typography, shadows, radii)
- Animations use **Framer Motion** — `motion.div`, `useScroll`, `AnimatePresence`, staggered variants
- Financial formatting is centralised in `src/utils/finance.js` — `formatUGX()` (short e.g. "UGX 1.2M"), `formatUGXExact()` (full e.g. "UGX 50,000"), `fmtShort()` (no prefix), `calcFV()`, `EASE_OUT_EXPO`, `MONTHLY_RATE`, `ANNUAL_RATE`
- Mobile breakpoints: 600px (phone), 768px (tablet), 900px (large tablet), 1024px (desktop)
- The shared easing curve is `[0.16, 1, 0.3, 1]` (ease-out-expo), used across all animations
- Brand primary color: `--color-indigo` (#292867) — avoid red except for error states
- Logo: two PNGs with transparent backgrounds — `logo.png` (color, for light backgrounds) and `logo-white.png` (grey, brightened via CSS for dark backgrounds)
- **Data access rule:** Components and dashboard files must NEVER import from `src/data/mockData.js` directly. Use hooks from `src/hooks/useEntity.js` or `src/hooks/useCommission.js` which call services from `src/services/`. Only service files may import mockData.
- **Routing rule:** All top-level navigation uses `react-router-dom`. Use `useNavigate()` for programmatic navigation. Modal/panel UI state (slide-ins, drawers) is intentionally state-based in `DashboardPanelContext` — not routed.
- **Auth rule:** Use `useAuth()` from `AuthContext` for login/logout/role checks. Session persists in localStorage.
- **Environment rule:** API URLs and config go in `.env` and are accessed via `src/config/env.js`. No hardcoded API endpoints.
- **Signup state rule:** `SignupContext` persists to localStorage on every patch. File/Blob fields (`idFrontFile`, `idBackFile`, `selfieFile`) and their object URLs are dropped on serialise — user re-uploads on refresh, but OCR results, phone, beneficiaries, consent etc. survive.

### Accessibility conventions — MUST FOLLOW
- **Focus visibility:** Global `:focus-visible` baseline in `index.css` (2px `--color-indigo-soft` outline). Never use `outline: none` without a `:focus-visible` replacement (or a wrapping `:focus-within` rule that provides a visible indicator).
- **Transitions:** Never use `transition: all` — always list properties explicitly.
- **Reduced motion:** `<MotionConfig reducedMotion="user">` wraps the app in `main.jsx`. CSS `prefers-reduced-motion` media query in `index.css` handles CSS animations.
- **Modals & drawers:** Must have Escape key handler to close, `overscroll-behavior: contain` to prevent background scroll bleed.
- **Icon-only buttons:** Must have `aria-label`. Do not rely on `title` attribute alone.
- **Form inputs:** Must have `aria-label` or associated `<label>`. Use correct `type`, `inputMode`, `autoComplete`, and `spellCheck={false}` on codes/phones.
- **Touch targets:** `touch-action: manipulation` set globally on buttons and links in `index.css`. Minimum 44px touch targets on mobile.
- **Skip link:** `index.html` has a skip-to-content link targeting `#main` on the `<main>` element in `App.jsx`.
- **Typography:** Use `text-wrap: balance` on headings. Use `font-variant-numeric: tabular-nums` on number/stat displays. Use `…` (U+2026) not `...`. Remember JSX text does NOT resolve `\u` escapes — use the literal character.
- **Images:** All `<img>` tags must have explicit `width` and `height` attributes. Below-fold images use `loading="lazy"`.
- **Large lists:** Use `content-visibility: auto` with `contain-intrinsic-size` on list items for performance (applied in ViewBranches and ViewAgents).
- **Decorative icons:** SVGs that are purely decorative (next to a text label) must have `aria-hidden="true"`.

### Architecture

**Top-level routes (`App.jsx`):**
- `/` — Landing page (Navbar → Hero → HowItWorks → TimeJourney → ForYou → Trust → CTA → Footer + StickyMobileCTA). `SavingsCalculator` is embedded inside Hero.
- `/about`, `/faq`, `/contact` — marketing pages (`src/pages/`)
- `/signup/*` — Subscriber KYC onboarding (lazy-loaded `SignupPage`)
- `/dashboard/*` — Protected dashboard (lazy-loaded). Renders `BranchDashboardShell` for role `branch`, otherwise `DashboardShell`.
- `/coming-soon` — Role-based placeholder for roles without a dashboard yet.
- `SignInModal` is rendered outside `<Routes>` so it can overlay any page.

**Providers (in `main.jsx`):** `BrowserRouter` → `QueryClientProvider` → `AuthProvider` → `ToastProvider` → `MotionConfig` → `App` (plus `<ToastContainer />` beside App).

**Auth:** `AuthContext` manages session with localStorage persistence. Login stores `{ role, phone, name, branchId? }`. Page refresh preserves the session. Protected routes redirect unauthenticated users to `/`. `ProtectedDashboard` also routes users without a built dashboard to `/coming-soon` via `hasDashboard(role)` from `services/auth.js`.

**Dashboard context composition:** `DashboardContext.jsx` composes two narrower contexts:
- `DashboardNavContext` — URL-derived drill-down state (level, entityId, breadcrumb) + navigation actions (`drillDown`, `drillUp`, `goToLevel`, `reset`). Keys off `useLocation()`/`useNavigate()`.
- `DashboardPanelContext` — panel/modal UI state (viewAgentsOpen, createAgentOpen, commissionsOpen, viewReportsOpen, settingsOpen, drillTargetBranchId/AgentId, reportContext).

`useDashboard()` merges both for backward compatibility. New code should prefer the narrower `useDashboardNav()` / `useDashboardPanel()` when it only needs one slice.

**Branch scope:** `BranchScopeContext` provides a `branchId` to descendants when the tree is rendered for a Branch Admin. Distributor trees don't wrap with it, so `useBranchScope().branchId` is `null` and components fall back to network-wide queries.

**Data access:** Three-layer architecture — components → hooks → services → mockData. No component imports from `mockData.js` directly. When backend arrives, only the service files change.
- `src/services/` — data access layer (currently wraps mockData, future: API calls)
- `src/hooks/useEntity.js` — React Query hooks (`useEntity`, `useChildren`, `useAllEntities`, `useCurrentEntity`, etc.)
- `src/hooks/useCommission.js` — React Query hooks for commissions (incl. `useEntityCommissionSummary`)
- `src/data/mockData.js` — mock data source (only imported by services)

### Project file structure
```
src/
  config/
    env.js                        — Centralised environment variables
  constants/
    levels.js                     — Hierarchy level constants, URL segment maps
    signup.js                     — Signup-flow constants
  services/
    api.js                        — Base API client (ready for backend)
    entities.js                   — Entity CRUD (wraps mockData)
    commissions.js                — Commission CRUD, settlement, rate config, entity-level aggregation (memo-cached)
    auth.js                       — Auth service (mock OTP), `hasDashboard(role)` helper
    search.js                     — Search service (client-side mock)
    chat.js                       — AI chat responses (built from real data)
    kyc.js                        — KYC service (Smile ID-shaped, currently mocked): OCR, NIRA, OTP, liveness, AML
  hooks/
    useEntity.js                  — React Query hooks for entity data
    useCommission.js              — React Query hooks for commission data
    useIsMobile.js                — matchMedia-backed mobile breakpoint hook (≤768px) via useSyncExternalStore
  utils/
    finance.js                    — formatUGX, formatUGXExact, fmtShort, calcFV, EASE_OUT_EXPO, MONTHLY_RATE, ANNUAL_RATE
    dashboard.js                  — getInitials, getTrend, perfLevel
    csv.js                        — downloadCSV helper (RFC 4180 escaping, UTF-8 BOM for Excel)
  contexts/
    AuthContext.jsx               — Session persistence + login/logout
    SignInContext.jsx             — Sign-in modal open/close
    DashboardContext.jsx          — Composes Nav + Panel providers, exposes merged useDashboard
    DashboardNavContext.jsx       — URL-based drill-down navigation state
    DashboardPanelContext.jsx     — Modal/panel UI state (+ reportContext, drill-target state)
    BranchScopeContext.jsx        — Branch ID scope for Branch Admin trees
    ToastContext.jsx              — Global toast queue with auto-dismiss
  components/
    Navbar, Hero, SavingsCalculator, HowItWorks, TimeJourney, ForYou, Trust, CTA,
    Footer, StickyMobileCTA, SignInModal, ErrorBoundary, Toast
    signin/
      RoleSelect, DistributorSelect, PhoneEntry, OtpVerify
  pages/
    About, FAQ, Contact           — Marketing/support pages
  signup/
    SignupPage.jsx                — Route entry; provides SignupContext
    SignupShell.jsx               — Layout + progress ring + back/exit controls; exports STEPS array
    SignupContext.jsx             — useReducer state + localStorage persistence
    EducationalLoader.jsx         — Reusable "checking…" loader with rotating copy
    steps/
      IdUploadStep, ReviewStep, NiraStep, OtpStep, LivenessStep, AmlStep,
      BeneficiariesStep, ConsentStep, ActivatedStep,
      AgentFallbackStep, PendingReviewStep   (terminal states)
      Step.module.css             — Shared step-level styles
    contribution/
      ContributionRoute.jsx       — Routed at /signup/contribution
      ContributionSettings.jsx    — Frequency + amount + retirement/emergency split
      PaymentStep.jsx             — Initial funding step
  dashboard/
    DashboardShell.jsx            — Distributor Admin root (sidebar + map + overlays)
    shared/
      Stars.jsx                   — Star rating display (shared)
      Icons.jsx                   — Shared inline SVG icon set
      KpiCard.jsx                 — Shared KPI card (used by ViewBranches/Agents/Subscribers)
      Demographics.jsx            — Shared gender/age donut + bars
      MiniChart.jsx               — Tiny sparkline
      TrendArrow.jsx              — Up/down/flat arrow for trends
    map/UgandaMap.jsx             — Full-bleed Leaflet map with drill-down
    sidebar/Sidebar.jsx           — Dark indigo icon rail with tooltips
    overlay/OverlayPanel.jsx      — Top-left glassmorphism card (KPIs, commissions, TimePeriodCard, entity list)
    overlay/Breadcrumb.jsx        — Drill-down path navigation
    overlay/TopBar.jsx            — Filter + Download (CSV export wired) buttons (top-right)
    cards/MetricsRow.jsx          — Bottom card row (2 cards: AI chat + Demographics; flex, not grid)
    branch/ViewBranches.jsx       — Branch list + detail slide-in (commission data included)
    branch/CreateBranch.jsx       — Multi-step branch creation form (3 steps)
    agent/ViewAgents.jsx          — Agent list + detail slide-in (commission data + link to commission panel)
    subscriber/ViewSubscribers.jsx — Subscriber list + detail slide-in
    commissions/CommissionPanel.jsx — Commission settlement slide-in
    reports/
      ViewReports.jsx             — Reports slide-in root (accepts reportContext for auto-navigation)
      ReportsHub.jsx              — Report index (card grid + lazy-loaded report views)
      ReportTable.jsx             — Sortable/paginated data table
      ReportView.jsx              — Per-report shell (header, filters, table)
      FilterSelect.jsx            — Filter dropdown component
      views/
        DistributionSummary, AllBranches, AllAgents, AllSubscribers,
        ContributionsCollections, WithdrawalsPayouts,
        BranchPerformance, AgentPerformance,
        SubscriberGrowth, SubscriberDemographics, KycCompliance
    settings/Settings.jsx         — Profile + password settings slide-in
  branch-dashboard/
    BranchDashboardShell.jsx      — Branch Admin root (sidebar + overview + split-mode panels). Redirects to /dashboard if role !== 'branch'.
    sidebar/BranchSidebar.jsx     — Icon rail (desktop) + bottom tab bar (mobile) with "More" menu; Agents uses a popover (Create/View)
    overview/
      BranchOverview.jsx          — Main overview: health score + operations
      BranchHealthScore.jsx       — Hero card: score 0–100, metric breakdown, insights, contribution chart, embedded AI chat
      OperationsSection.jsx       — Agent leaderboard (sortable) + tabbed commissions/demographics view
    agent/CreateAgent.jsx         — 2-step agent creation form (details → review)
  data/
    mockData.js                   — Mock data (only imported by src/services/)
  test/setup.js                   — Vitest setup
```

### Shared utilities — MUST USE (do not re-define)
- `src/utils/dashboard.js` — `getInitials(name)` (defensive for empty input), `getTrend(today, weekAvg)`, `perfLevel(pct)`
- `src/utils/finance.js` — `formatUGX`, `formatUGXExact`, `fmtShort`, `calcFV`, `EASE_OUT_EXPO`
- `src/utils/csv.js` — `downloadCSV(filename, headers, rows)` (RFC 4180 escaping)
- `src/hooks/useIsMobile.js` — don't reimplement window-width checks
- `src/dashboard/shared/Stars.jsx` — Star rating display
- `src/dashboard/shared/KpiCard.jsx`, `Demographics.jsx`, `MiniChart.jsx`, `TrendArrow.jsx` — reuse in Distributor dashboard contexts

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
- `agent-fallback` — AgentFallbackStep: shown on NIRA or liveness failure. Surfaces failure reason and prompts user to visit an agent.
- `pending-review` — PendingReviewStep: shown on AML flag. "Under review" message.

Both terminals freeze the progress ring at `pausedAt` and hide the back button.

**Post-activation sub-flow (routed at `/signup/contribution`):**
- `ContributionSettings` — frequency (weekly/monthly/quarterly/half-yearly/annually), amount, and retirement/emergency split.
- `PaymentStep` — initial funding.
- On confirm: patches `contributionSchedule` into SignupContext, calls `auth.login()`, navigates to `/coming-soon` (subscriber dashboard placeholder).

**Persistence:** `SignupContext` uses `useReducer` with a lazy initialiser that reads from `localStorage` and a `useEffect` that writes on every state change. File/Blob fields and their object URLs (`idFrontFile`, `idBackFile`, `selfieFile`, `idFrontPreviewUrl`, `idBackPreviewUrl`) are dropped at serialise-time — user re-uploads on refresh, but all other fields (OCR result, phone, NIRA outcome, beneficiaries, consent) survive. `reset()` clears storage.

### Sign-in modal flow

- 4 steps: Role Select → (Distributor Sub-select if applicable) → Phone Entry → OTP Verify.
- Main roles: Subscriber, Employer, Distributor, Admin.
- Distributor sub-roles: Distributor Admin, Branch Admin, Agent.
- Any 6-digit OTP accepted (prototype) — calls `auth.login()`, then navigates to `/dashboard` if `hasDashboard(role)` else `/coming-soon`. Subscriber sign-in may jump into `/signup` if KYC is incomplete.

### Dashboard (Distributor Admin)
- `DashboardShell.jsx` is the root — fixed viewport, CSS grid: sidebar (64px) + main area.
- `DashboardNavContext` derives drill levels from the URL: country → region → district → branch → agent → subscriber.
- Navigation actions translate to URL changes.
- Panel UI state remains in `DashboardPanelContext`.
- **Report linking:** `reportContext` (string reportId or null) — when set + `viewReportsOpen=true`, ViewReports auto-navigates to that report. Triggered by clickable overlay metrics.
- **Drill-target state:** `drillTargetBranchId`/`drillTargetAgentId` track entities opened via map drill-down. `closeDrillPanel()` clears state + navigates back to district.

### Dashboard (Branch Admin)
- `BranchDashboardShell.jsx` — root. **Redirects to `/dashboard` if `role !== 'branch'`** (defensive guard, primary role routing is in `App.jsx`).
- Wraps children in `DashboardProvider` + `BranchScopeProvider(branchId)`.
- Single main view: `BranchOverview` (no drill-down). Side panels (`ViewAgents`, `CreateAgent`, `CommissionPanel`, `ViewReports`, `Settings`) open via `BranchSidebar` and are rendered `splitMode`.
- Sidebar popover for Agents: choose Create New / View Existing.
- Mobile: bottom tab bar (Overview, Agents, Commissions) + "More" menu (Reports, Settings, Logout).

**Overview composition:**
- `BranchHealthScore` — score gauge (0–100), metric breakdown (retention, avg per subscriber, agent activity, monthly growth), AI insights, contribution trend chart, embedded AI chat. Uses status/positive/amber/alert color tokens.
- `OperationsSection` — agent leaderboard (sortable by contributions/subscribers/active-rate) + tabbed commissions/demographics.

### Commission data in drill-down views
- `useEntityCommissionSummary(level, entityId)` returns `{ totalPaid, totalDue, totalDisputed, countPaid, countDue, countDisputed, total, countTotal, settlementRate }` for any hierarchy level.
- **OverlayPanel** shows a commission summary block (bar chart + stats) at country/region/district levels. Clicking opens CommissionPanel.
- **ViewBranches detail** shows commission section with settled/due/disputed rows.
- **ViewAgents detail** shows commission section with "View Details" link to CommissionPanel.
- Aggregation uses a service-level memo cache (`_summaryCache` Map in `commissions.js`), invalidated by every mutation (settle, approve, reject).

### Clickable overlay metrics → reports
- Period card metric rows (New Subscribers, Contributions, Withdrawals, Top Branch) are clickable buttons that set `reportContext` and open the reports panel.
- Count items (Subscribers, Agents, Branches) open the corresponding "All X" report.
- `reportContext` is a string (reportId) stored in `DashboardPanelContext`, consumed by ViewReports.

### Data architecture
- Mock data in `src/data/mockData.js` — flat lookup maps keyed by ID for O(1) access.
- Hierarchy: Country → Regions (4) → Districts (135, real Ugandan GADM names) → Branches (~314) → Agents (~2,000) → Subscribers (~30,000, lazy-generated via Proxy).
- Commissions: ~30,000 records tied to agents/subscribers. Statuses: paid, due, disputed, rejected. Pre-indexed by agent and branch for O(1) lookups. Rate in `COMMISSION_CONFIG`.
- Metrics aggregated bottom-up at module load (agent ← subscribers, branch ← agents, etc.).
- Map GeoJSON: `public/uganda-districts.geojson` and `public/uganda-regions.geojson`.
- React Query provides caching, deduplication, and stale-while-revalidate.

### KYC service (`src/services/kyc.js`)
- Shaped against **Smile ID** v2 (chosen for Uganda NIRA integration).
- Provides mocked: OCR extraction, NIRA lookup, OTP send/verify, face-match + liveness, AML/PEP screen.
- Each call returns a `tracking_id` the backend can use to correlate stages of one onboarding job.
- To swap in the real provider: replace the `// Future:` stubs with `api.post()` calls.

### Dashboard UI patterns

**Map:**
- Full-bleed background using `react-leaflet` with CartoDB Positron tiles.
- GeoJSON from GADM (135 districts), region color-coding (indigo palette).
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
- Mock responses from `services/chat.js`. Will be connected to LLM + DB in production.

**Commission Panel (slide-in):**
- Entry: wallet icon in sidebar, or mobile drawer "Commissions".
- **Replace-model** navigation: single panel swaps content with breadcrumb trail (not stacked).
- Views: home → agents (filter paid/due) → agent-detail → subscribers | disputed agents → dispute-detail | settlement requests → request-detail.
- Home: overview hero (total + progress bar + inline rate config), settled/pending cards, settle CTA, needs-attention (disputed + requests).
- Commission rate: flat fee per subscriber, configurable inline.
- Commission trigger: subscriber's first contribution.
- Maker-checker: `agentConfirmed` field tracks agent-side confirmation (agent UI not yet built).
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
- 11 report views under `reports/views/`: DistributionSummary, AllBranches, AllAgents, AllSubscribers, ContributionsCollections, WithdrawalsPayouts, BranchPerformance, AgentPerformance, SubscriberGrowth, SubscriberDemographics, KycCompliance.
- `ReportsHub` = index (card grid) + router. `ReportView` = per-report shell. `ReportTable` = reusable sortable/paginated table. `FilterSelect` = shared filter dropdown.
- Per-report filters (search, region/KYC/status dropdowns, sort).
- **CSV export is wired.** `TopBar.jsx` uses `downloadCSV(filename, headers, rows)` from `src/utils/csv.js` (RFC 4180 escaping, UTF-8 BOM for Excel). Filenames include a date stamp.

**Slide-in panel conventions:**
- Backdrop: `position: fixed; inset: 0; background: rgba(27,26,74,0.35); z-index: 200`
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

/* Status */
--color-status-good:     #2E8B57;
--color-status-warning:  #E6A817;
--color-status-poor:     #DC3545;

/* Health & trend accents (branch-dashboard) */
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
```

### Design consistency rules — MUST FOLLOW

The landing page establishes the design language for the entire platform. All new UI (signup, dashboards, panels) must maintain visual consistency with it.

**Icons:**
- Inline SVG line icons with `stroke="currentColor"` and `strokeWidth="1.75"`.
- Standard icon size: `24x24` viewBox, displayed at 24px (popover/sidebar use 18–22px).
- Never emojis, icon fonts, or icon libraries.
- Icon containers: `background: rgba(41,40,103,0.06)`, `border: 1px solid var(--color-lavender)`, `border-radius: var(--radius-md)`, `color: var(--color-indigo)`.
- Shared icons live in `src/dashboard/shared/Icons.jsx` — reuse when possible.

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
1. **Subscriber** — Individual saver (informal workers, gig workers, farmers, self-employed). KYC via `/signup/*` if incomplete.
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
- ✅ Sign-in modal (all roles)
- ✅ Subscriber signup / KYC flow (9 steps + 2 terminals + contribution sub-flow, localStorage-persisted)
- ✅ Frontend architecture (services, React Query, auth persistence, URL routing, env config, Toast system, Error boundary)
- ✅ Distributor Admin dashboard (map, overlays, analytics, AI chat, commission settlement, reports w/ CSV export, settings)
- ✅ Branch Admin dashboard (shell + sidebar + overview with health score + operations; shared ViewAgents / CommissionPanel / Reports / Settings in split-mode)
- ⬜ Subscriber dashboard (not started — signup currently routes to `/coming-soon` after activation)
- ⬜ Employer dashboard (not started)
- ⬜ Agent dashboard (not started — maker-checker hooks exist server-side)
- ⬜ Admin dashboard (not started)
- ⬜ Backend integration (service layer ready; KYC shaped for Smile ID)

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
