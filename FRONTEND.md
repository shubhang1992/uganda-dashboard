# FRONTEND.md — Universal Pensions Uganda

Deep frontend reference for the React 19 + Vite 6 + CSS Modules + Framer Motion + React Router 7 + TanStack Query 5 codebase. This is a **demo / sales-presentation tool**, not a production fintech — demo-scope behaviours (mocked OTP, mocked KYC, `VITE_USE_SUPABASE` fallback, per-session mutation stores, `MOCK_NOW`, hardcoded UGX 1,000 unit price, 24h JWT) are intentional.

See `CLAUDE.md` for the slim entry index, `BACKEND.md` for SQL/RPC/RLS detail, and `docs/*` for the role × capability matrix and field-level data model.

---

## Index

- [§1 — Stack, entry points & build](#1-stack-entry-points--build)
- [§2 — Routing rules](#2-routing-rules)
- [§3 — Hard rules (anti-patterns)](#3-hard-rules-anti-patterns)
- [§4 — Three-layer data access + hook → service boundary](#4-three-layer-data-access--hook--service-boundary)
- [§5 — Services inventory](#5-services-inventory-srcservices--11-files)
- [§6 — Contexts inventory](#6-contexts-inventory-8-in-srccontexts-1-in-srcsignup)
- [§7 — Hooks inventory](#7-hooks-inventory-srchooks--8-files)
- [§8 — Canonical optimistic-mutation pattern](#8-canonical-optimistic-mutation-pattern-useentity-template)
- [§9 — Per-role dashboard variants](#9-per-role-dashboard-variants--4-built)
- [§10 — Commission UI patterns](#10-commission-ui-patterns)
- [§11 — Signup / KYC flow](#11-signup--kyc-flow)
- [§12 — Modal & drawer primitives, accessibility](#12-modal--drawer-primitives-accessibility)
- [§13 — CoPilotWidget convention (intentional duplication)](#13-copilotwidget-convention-intentional-duplication)
- [§14 — Performance posture](#14-performance-posture)
- [§15 — Shared utilities, constants & component subdirs](#15-shared-utilities-constants--component-subdirs)
- [§16 — Design tokens, brand palette, animation](#16-design-tokens-brand-palette--animation)
- [§16a — Demo scope (by design — do NOT "fix")](#16a-demo-scope-by-design--do-not-fix)
- [§16b — Real bugs / cleanups (residual)](#16b-real-bugs--cleanups-residual)
- [§17 — Testing layout](#17-testing-layout)
- [§18 — CSV export](#18-csv-export)
- [§19 — Product & brand context](#19-product--brand-context)

---

## 1. Stack, entry points & build

**Stack:** React 19.2 · Vite 6.3 · Framer Motion 12 · React Router 7 · TanStack Query 5 · TanStack Virtual 3 · Leaflet 1.9 / react-leaflet 5 · Recharts 3 · Vitest 4. Node 22 LTS pinned via `.node-version`. npm with `legacy-peer-deps=true`.

**npm scripts** (`package.json`):

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server on `:5173` (frontend only, mock fallback if backend off) |
| `npm run dev:api` | Express backend on `:3001` (`tsx watch server/index.ts`). Pair with `npm run dev` in another terminal, or run `npm run dev:all` for both |
| `npm run dev:all` | Both servers in one terminal via `concurrently` |
| `npm run build:api` | `tsc -p server/tsconfig.json` — also runs in CI before Playwright |
| `npm run build` | Production Vite build |
| `npm run preview` | Serve the built bundle |
| `npm run lint` | ESLint 9 flat config |
| `npm test` | Vitest one-shot (~700 tests) |
| `npm run test:watch` | Vitest watch |
| `npm run test:coverage` | Vitest + v8 coverage — requires `npm i -D @vitest/coverage-v8` (currently NOT installed, see §17) |
| `npm run test:e2e` | Playwright suite (`:smoke`, `:flows`, `:headed`, `:ui`) — see [`docs/TESTING.md`](./docs/TESTING.md) and `.claude/skills/qa.md` |
| `npm run seed` | Seed Supabase via `scripts/seed-supabase.mjs` (see BACKEND.md §14) |

**`vite.config.js` highlights:**

- Path aliases: `@` → `./src` is the only one used in source. The five additional aliases (`@components`, `@contexts`, `@dashboard`, `@data`, `@utils`) are declared but never imported — known low-priority cruft (§16b).
- **Manual vendor chunks** (see `manualChunks` in `vite.config.js`):
  - `vendor-leaflet` — `/leaflet`, `react-leaflet`, `@react-leaflet/core`
  - `vendor-charts` — `/recharts`, `/d3-`
  - `vendor-motion` — `/framer-motion`, `/motion-utils`, `/motion-dom`
  - `vendor-tanstack` — `@tanstack/*`
  - `vendor-router` — `/react-router`, `/@remix-run`
  - `vendor-react` — `react`, `react-dom`, `scheduler`, `use-sync-external-store`, `object-assign`, `js-tokens`, `loose-envify` (kept together to prevent `forwardRef` undefined errors after hash shifts)
  - Fallthrough `vendor` for everything else
- `chunkSizeWarningLimit: 700` (kB) — headroom for recharts/leaflet routes.
- Vitest block embedded in the same config: `globals: true`, `environment: 'jsdom'`, `setupFiles: './src/test/setup.js'`, CSS modules use `classNameStrategy: 'non-scoped'`, `exclude: ['node_modules', 'dist', 'e2e/**']`.

**No Tailwind.** All styling is CSS Modules (`.module.css` per component, 118 files). Global design tokens live in `src/index.css`; no component-library imports.

**Boot path.** `src/main.jsx` mounts a React 19 root with this provider order:

| Wrapper | Purpose |
| --- | --- |
| `StrictMode` | Double-invokes effects in dev to surface bugs |
| `BrowserRouter` | URL routing (React Router 7) |
| `QueryClientProvider` | Single TanStack Query client (defaults below) |
| `AuthProvider` | Reads `upensions_auth` from localStorage; listens to `onAuthExpired` |
| `ToastProvider` | Toast queue (max 3 visible, auto-dismiss) |
| `MotionConfig reducedMotion="user"` | Respects `prefers-reduced-motion` |
| `<App />` + `<ToastContainer />` | App tree, toast portal renders as a peer |

`SignInProvider` wraps `<Routes>` **inside** `App` so `SignInModal` overlays any page.

**React Query defaults** (set in `main.jsx`):

| Option | Value |
| --- | --- |
| `staleTime` | 5 min |
| `gcTime` | 10 min |
| `refetchOnWindowFocus` | `false` |
| `retry` | 1 |

**File layout (one screen):**

```
src/
  App.jsx, main.jsx, index.css
  assets/                  Logo PNGs (transparent)
  config/env.js            API_BASE_URL, IS_DEV/PROD, public URLs
  constants/               levels.js, savings.js, signup.js
  data/                    mockData (1060 lines), mockBranchDefs, mockGeo
  services/                11 files (api, supabaseClient, auth, entities,
                           commissions, subscriber, agent, kyc, chat,
                           search, contact) + __tests__/
  hooks/                   8 hooks + __tests__/
  contexts/                8 contexts; SignupContext lives in src/signup/
  utils/                   finance, currency, date, dashboard, csv, csvDownload,
                           phone, settlementCycle, navigation, motion + __tests__/
  components/              Landing + shell-level (Navbar, Hero, Footer, Modal,
                           Toast, ErrorBoundary, SkeletonRow, EmptyState, …) +
                           contribution/, signin/, reports/, feedback/
  pages/                   About, FAQ, Contact (marketing pages)
  signup/                  Subscriber KYC flow: SignupPage, SignupShell,
                           SignupContext, signupState, steps/, contribution/
  dashboard/               Distributor admin (DashboardShell)
  branch-dashboard/        Branch admin (BranchDashboardShell)
  agent-dashboard/         Agent (AgentDashboardShell, routed pages)
  subscriber-dashboard/    Subscriber (SubscriberDashboardShell, routed pages)
  test/                    setup.js, supabaseMock.js, jwt-claim-contract.test.js
```

---

## 2. Routing rules

**Top-level routes (`src/App.jsx`):**

| Path | Element | Notes |
| --- | --- | --- |
| `/` | `LandingPage` | Navbar + Hero + HowItWorks + TimeJourney + ForYou + Trust + CTA + Footer + StickyMobileCTA |
| `/about` | `pages/About.jsx` | Marketing |
| `/faq` | `pages/FAQ.jsx` | Marketing |
| `/contact` | `pages/Contact.jsx` | Posts to `services/contact.js` → `/api/contact` |
| `/signup/*` | `signup/SignupPage` (lazy) | KYC flow + contribution sub-flow |
| `/dashboard/*` | `ProtectedDashboard` (lazy) | Dispatches by role |
| `/coming-soon` | `ComingSoon` | Role-based placeholder for employer/admin |

**`SignInModal`** renders outside `<Routes>` (inside `SignInProvider`) so it can overlay any page.

**`ProtectedDashboard` dispatch:** unauthenticated → `Navigate to="/"`; `hasDashboard(role)` false → `/coming-soon`; otherwise pick a shell by role — `distributor` → `src/dashboard/DashboardShell.jsx` (default branch), `branch` → `src/branch-dashboard/BranchDashboardShell.jsx`, `agent` → `src/agent-dashboard/AgentDashboardShell.jsx`, `subscriber` → `src/subscriber-dashboard/SubscriberDashboardShell.jsx`. Each shell is `React.lazy()`-imported in `App.jsx`, wrapped in `ErrorBoundary` + `Suspense` with a spinner fallback.

### Panel-vs-route rule (CLAUDE.md §4 item 2)

> Top-level navigation uses `react-router-dom` (`useNavigate()`). Modal/panel UI state (slide-ins, drawers) is **state-based** in `DashboardPanelContext` and intentionally NOT routed.

- **Subscriber + Agent** dashboards have routed sub-pages — every destination is a URL.
- **Distributor + Branch** dashboards use panels — drill-down slide-ins are not URL destinations; URL state encodes only the drill level (`/dashboard/branches/:id` etc.) and the panel context holds open/closed booleans.

### 2.1 Distributor routes (`src/dashboard/`)

The Distributor shell parses `location.pathname` via `DashboardNavContext.parsePath()` into `{ level, entityId, section, reportId }`. URL drill levels:

| Path | level | section |
| --- | --- | --- |
| `/dashboard` | `country` | `map` |
| `/dashboard/regions/:id` | `region` | `map` |
| `/dashboard/districts/:id` | `district` | `map` |
| `/dashboard/branches/:id` | `branch` | `map` (auto-opens `ViewBranches` panel) |
| `/dashboard/agents/:id` | `agent` | `map` (auto-opens `ViewAgents` panel) |
| `/dashboard/subscribers/:id` | from segment | `map` |
| `/dashboard/reports` and `/dashboard/reports/:reportId` | `country` | `reports` (auto-pops `ViewReports`, then redirects URL back to `/dashboard`) |

Slide-in panels (`ViewBranches`, `ViewAgents`, `ViewSubscribers`, `CommissionPanel`, `ViewReports`, `Settings`, `CreateBranch`, `CreateAgent`) are state-based via `DashboardPanelContext`. Map → panel handoff via `DashboardNavContext.onPanelActionRef`.

Shell file: `src/dashboard/DashboardShell.jsx`. Sub-areas: `sidebar/`, `map/`, `overlay/`, `cards/`, `branch/`, `agent/`, `subscriber/`, `commissions/`, `reports/` (+ `views/`), `settings/`, `shared/`.

### 2.2 Branch routes (`src/branch-dashboard/`)

Single main view `BranchOverview` (no drill-down). Side panels reuse Distributor `ViewAgents`, `CommissionPanel`, `ViewReports`, `Settings` plus local `CreateAgent`, rendered with `splitMode` (backdrop suppressed; main reflows). Mobile drawer (`MobileDrawer`) appears below 768px, slides `x: '-100%' → 0` with `EASE_OUT_EXPO` over 320ms, locks body scroll, closes on Escape and route change.

Shell file: `src/branch-dashboard/BranchDashboardShell.jsx`. Sub-areas: `sidebar/`, `overview/`, `agent/`. Wraps in `DashboardProvider` + `BranchScopeProvider(branchId)`.

### 2.3 Agent routes (`src/agent-dashboard/`)

Routed pages under `/dashboard/*`:

| Path | Page |
| --- | --- |
| `/dashboard` | `home/HomePage` |
| `/dashboard/onboard` | `pages/OnboardPage` (lazy) |
| `/dashboard/subscribers` | `pages/SubscribersPage` (lazy) |
| `/dashboard/subscribers/:id` | `pages/SubscriberDetailPage` (lazy) |
| `/dashboard/subscribers/:id/schedule` | `pages/SubscriberSchedulePage` (lazy) |
| `/dashboard/analytics` | `pages/AnalyticsPage` (lazy) |
| `/dashboard/commissions` and `/dashboard/commissions/:view` | `pages/CommissionsPage` (lazy) |
| `/dashboard/settings` | `pages/SettingsPage` (lazy) |
| `*` | `Navigate to="/dashboard"` |

Shell file: `src/agent-dashboard/AgentDashboardShell.jsx`. Sub-areas: `shell/` (AgentShell + SideNav + BottomTabBar + PageHeader), `home/` (HomePage + widgets/), `onboarding/`, `pages/`. Wraps in `DashboardProvider` + `AgentScopeProvider(agentId)`.

### 2.4 Subscriber routes (`src/subscriber-dashboard/`)

| Path | Page |
| --- | --- |
| `/dashboard` | `home/HomePage` |
| `/dashboard/save` | `pages/SavePage` (lazy) |
| `/dashboard/save/schedule` | `pages/SchedulePage` (lazy) |
| `/dashboard/withdraw` | `pages/WithdrawalsHubPage` (lazy) |
| `/dashboard/withdraw/savings` | `pages/WithdrawPage` (lazy) |
| `/dashboard/withdraw/claim` | `pages/ClaimPage` (lazy) |
| `/dashboard/claim` | `Navigate to="/dashboard/withdraw/claim"` |
| `/dashboard/activity` | `pages/ActivityPage` (lazy) — first-class Activity tab (Phase 6; no longer a redirect) |
| `/dashboard/reports` and `/dashboard/reports/:reportId` | `pages/ReportsPage` (lazy) |
| `/dashboard/help` | `pages/HelpPage` (lazy) |
| `/dashboard/agent` | `pages/AgentPage` (lazy) |
| `/dashboard/settings` | `pages/SettingsPage` (lazy) |
| `/dashboard/settings/profile` | `pages/ProfilePage` (lazy) |
| `/dashboard/settings/nominees` | `pages/NomineesPage` (lazy) |
| `/dashboard/settings/insurance` | `pages/InsurancePage` (lazy) |
| `/dashboard/settings/notifications` | `pages/StubPage title="Notifications"` (placeholder — see §16b) |
| `/dashboard/settings/security` | `pages/StubPage title="Security"` (placeholder — see §16b) |
| `*` | `Navigate to="/dashboard"` |

Shell file: `src/subscriber-dashboard/SubscriberDashboardShell.jsx`. Sub-areas: `shell/` (SubscriberShell + SideNav + BottomTabBar + PageHeader + `navigation.js` (legacy local helper kept for module-internal use)), `home/` (HomePage + 6 widgets/), `pages/`, `reports/views/`. Wraps `SubscriberPanelProvider` (which composes the generic `DashboardPanelProvider` — see §6) + `DashboardNavProvider`.

**Employer + Admin shells are deferred.** No routes, no shells, no RLS policies — see CLAUDE.md §1. Build order when resumed: **Employer first, then Admin** (central admin with global rights).

---

## 3. Hard rules (anti-patterns)

These rules are audit-verified and hold cleanly across the codebase. **Don't break them.**

| # | Rule | Where it's enforced |
| --- | --- | --- |
| 1 | Components and dashboard files **never** import from `src/data/mockData.js`. Only files under `src/services/` may. | Audit grep: `grep -rn "from '@/data/mockData" src --include='*.jsx'` → 0 hits; `grep -rn "import .* mockData" src/{dashboard,subscriber-dashboard,agent-dashboard,branch-dashboard}` → 0 hits. |
| 2 | Don't hand-roll `fetch()` against `/api/*`. Always go through `services/api.js` (`api.get/post/put/delete`) so the 401 listener (`onAuthExpired`) fires. | Audit grep: `grep -rn "fetch('/api" src --include='*.jsx' --include='*.js'` ignoring `src/services/api.js` → 0 hits. |
| 3 | Never disable focus visibility without a replacement. The global `:focus-visible` baseline is in `src/index.css` (2px `var(--color-indigo-soft)` outline + 2px offset). `outline: none` is permitted only inside `:focus` rules that also set a custom `border-color` / ring — the audit verified each occurrence pairs with an explicit replacement. | `src/index.css` baseline; per-control overrides. |
| 4 | Never write `transition: all`. Always enumerate properties. | Audit grep: `grep -rn "transition: all" src --include='*.module.css'` → 0 hits. |
| 5 | Always pass schedule frequencies through `normalizeFrequency(value)` from `src/utils/finance.js`. Defends against legacy aliases (`half-yearly`, `halfYearly`, `semi-annually`, `semiAnnually`). | Service + hook + UI write paths. |
| 6 | Signup persistence: `SignupContext` writes every patch to `localStorage['uganda-pensions-signup']` (debounced — see §11). **File/Blob fields + `password` are dropped on serialise** via `EPHEMERAL_KEYS`. | `src/signup/SignupContext.jsx`. |
| 7 | No raw SQL from the frontend. Every write goes through a Supabase RPC (typically SECURITY DEFINER) — see BACKEND.md §10. | Service layer. |
| 8 | RLS policies read `auth.jwt() ->> 'app_role'`, **never** `'role'`. `auth.uid()` is `NULL` for our custom HS256 JWTs (BACKEND.md §9). | Audit confirmed: 65/65 policies correct. |

Audit verification also confirmed **no `dangerouslySetInnerHTML` anywhere** (React's default escaping is preserved) and **no open-redirect vectors** — every `window.location` / `navigate` destination is a hardcoded path.

---

## 4. Three-layer data access + hook → service boundary

```
Components / pages
        │
        ▼
src/hooks/         (React Query useQuery / useMutation; cache + invalidation)
        │
        ▼
src/services/      (Supabase / api.js calls + per-service mock fallback)
        │
        ▼
src/data/mockData.js   (frozen demo seed; only services may import this)
or supabase.from() / .rpc()  (real backend; controlled by IS_SUPABASE_ENABLED)
```

**Rollback flag:** `IS_SUPABASE_ENABLED` (exported from `src/services/api.js`) reads `import.meta.env.VITE_USE_SUPABASE`. Default ON; set the env var to the literal string `'false'` to flip every service into its mock-backed branch.

```js
export async function getEntity(level, id) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getEntity(level, id);
  // ...supabase.from(...).select(...)
}
```

**Per-service overrides over frozen mockData.** Under `IS_SUPABASE_ENABLED=false`, both `entities.js` and `subscriber.js` keep an in-memory `Map` (`_entityOverrides` / `_sessionMutations`) so writes (status flips, contributions, schedule edits, withdrawals) layer on top of the frozen seed for the demo session. Lost on refresh — see §16a.

### 4.1 Cross-role utility extraction

The previous `agent-dashboard/shell/PageHeader.jsx` imported `goBackOrFallback` from `../../subscriber-dashboard/shell/navigation` — the **only** cross-role import in the codebase. The helper now lives at `src/utils/navigation.js` (`goBackOrFallback(navigate, fallback)`) and reads `window.history.state.idx` to detect a poppable in-app entry — index 0 means the user landed here directly (deep link, refresh, fresh tab), so fall back to the route. Both shell PageHeaders import from `@/utils/navigation`; the legacy `src/subscriber-dashboard/shell/navigation.js` survives for module-internal use only.

**Mock-branch parity caveat.** Every service that branches on `IS_SUPABASE_ENABLED` ships an offline mock branch (per CLAUDE.md §10a rollback safety) and has unit tests for real/mock parity (see §17). Output-shape drift remains a latent risk to manually verify on any new mock-branch change.

---

## 5. Services inventory (`src/services/` — 11 files)

All public exports below. Every service file follows the `IS_SUPABASE_ENABLED ? supabase : mock` dual-branch pattern.

| File | Owns | Public API (selected) | Consumed by |
| --- | --- | --- | --- |
| `api.js` | Same-origin `/api/*` fetch wrapper; 401 detection; rollback flag | `IS_SUPABASE_ENABLED`, `onAuthExpired(handler) → unsubscribe`, `apiFetch(path, options)`, `api.get/post/put/delete` | `auth.js`, `chat.js`, `kyc.js`, `contact.js`, `AuthContext` |
| `supabaseClient.js` | supabase-js singleton + token helpers | `supabase` (createClient), `getToken()`, `setToken(token)`, `clearToken()` (default export = `supabase`) | All Supabase-backed services |
| `auth.js` | Sign-in flow + AuthError + role gate | `AuthError`, `DASHBOARD_ROLES`, `sendOtp(phone, role)`, `verifyOtp(phone, otp, role, password?)`, `signInWithPassword(phone, password, role)`, `changePassword(currentPassword, newPassword)`, `hasDashboard(role)` | `SignInModal`, `AuthContext`, `App.ProtectedDashboard` |
| `entities.js` | Country/Region/District/Branch/Agent + Distributor CRUD | `getCountry`, `getEntity`, `getChildren`, `getAllAtLevel`, `getEntityPage`, `getAllAtLevelMap`, `getParent`, `getTopPerformingBranch`, `getBreadcrumb`, `getEntitySync`, `getEntityMetricsRollup`, `createBranch`, `createAgent`, `updateBranch`, `setBranchStatus`, `updateDistributor`, `_mockSources` | Distributor + Branch dashboards via `useEntity`-family hooks |
| `commissions.js` | Commission state machine (~30+ exports, 1490 lines) | See §5.5 below | `useCommission`-family hooks; CommissionPanel; Branch + Agent commission pages |
| `subscriber.js` | Per-subscriber reads/writes + per-session mutation store | See §5.6 below | `useSubscriber`-family hooks; subscriber dashboard pages |
| `agent.js` | Agent-scoped portfolio reads | `getAgentSubscriberList(agentId)` | `useAgentSubscribers` |
| `kyc.js` | Smile ID v2-shaped mock pipeline (8 stages) | `assessImageQuality`, `extractIdFields`, `verifyNira`, `sendOtp`, `verifyOtp`, `faceMatch`, `screenAml`, `referToAgent` | Signup steps + onboarding |
| `chat.js` | Keyword-matched chat (mocked) | `getChatResponse(message)`, `getAgentReply(message, agent)`, `getSubscriberChatResponse(message)` | Distributor / Branch / Subscriber co-pilot widgets; Agent DM (HelpPage, AgentPage) |
| `search.js` | `search_entities` PG RPC (pg_trgm fuzzy) | `searchEntities(query)` | `useSearch` |
| `contact.js` | Public `/api/contact` POST | `submitContactForm({ name, email, message })` | `pages/Contact.jsx` |

### 5.1 `api.js` — base HTTP client

Same-origin `/api/*` wrapper around `fetch`. Reads `Authorization: Bearer <upensions_token>` from localStorage on every request. On HTTP 401: clears auth keys and notifies all `onAuthExpired` listeners (consumed by `AuthContext`). Thrown errors carry `code`, `status`, and `body`.

`VITE_API_BASE_URL` is the live API base URL — points at `https://uganda-dashboard-api.onrender.com/api` in Vercel env (all three scopes) and `http://localhost:3001/api` in local dev. The URL is baked into the bundle at Vite build time; changing the value requires a Vercel redeploy, not just an env edit. See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for the env-var sync matrix.

### 5.2 `supabaseClient.js` — supabase-js singleton

`createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` with `auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }` — we manage our own JWTs. `global.headers` is a **function** that re-reads `localStorage` on every request so token rotation is picked up without recreating the client.

A hard-fail guard in production builds: if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing in `IS_PROD`, the module throws on load. Dev/preview still fall back to `http://localhost:54321` / `'public-anon-key'` so local-without-env still boots.

### 5.3 `auth.js` — sign-in flow

Public API: `AuthError` (with `code` and optional `retryAfterSeconds`); `DASHBOARD_ROLES = ['distributor', 'branch', 'subscriber', 'agent']`; `sendOtp(phone, role)`, `verifyOtp(phone, otp, role, password?)` (password optional — set on first sign-in), `signInWithPassword(phone, password, role)`, `changePassword(currentPassword, newPassword)`, `hasDashboard(role)`.

`AuthError.code` values mapped to friendly messages via `messageForCode`: `rate_limited`, `locked`, `invalid_otp`, `password_too_short`, `password_too_weak`, `password_too_long`, `password_required`, `invalid_password`, `password_not_set`, `current_password_required`, `current_password_invalid`. Anything else falls back to "Could not verify the code. Please try again."

Dev-only QA force-overrides via `localStorage['upensions_otp_force']` (`invalid_otp` / `rate_limited` / `locked`). `verifyOtp` returns `{ token, user: { role, phone, name?, subscriberId?, agentId?, branchId?, distributorId?, hasPassword? } }`. Unit tests cover every exported function at the service layer.

### 5.4 `entities.js` — hierarchy CRUD (Distributor + Branch dashboards)

Public API (see table in §5 for the full list): country/region/district/branch/agent reads (`getCountry`, `getEntity`, `getChildren`, `getAllAtLevel`, paginated `getEntityPage`, map variant `getAllAtLevelMap`, `getParent`, `getTopPerformingBranch`, `getBreadcrumb`); sync read `getEntitySync(level, id)` for URL routing; metrics rollup `getEntityMetricsRollup(level, entityIds)` (wraps the `get_entity_metrics_rollup` RPC); writes `createBranch`, `createAgent`, `updateBranch`, `setBranchStatus`, `updateDistributor`; `_mockSources` for tests.

Returns camelCase shape; Supabase rows are mapped via internal `mapRegion / mapDistrict / mapBranch / mapAgent / mapDistributor` helpers. Mock fallback reads from `mockData.js` + the in-memory `_entityOverrides` Map.

`getDistributorMetrics()` was retired — every caller now uses `useEntityMetrics('country', 'ug')`, which routes through `getEntityMetricsRollup` → `get_entity_metrics_rollup` RPC. That RPC returns totalSubscribers/totalAgents/totalBranches/aum as part of its 8-field result, eliminating the 4-call fan-out the old function did.

`getEntitySync` uses an in-memory `_syncCache` for synchronous lookups during URL routing (`DashboardNavContext.parsePath`). First navigation can return `null` until the cache warms — known low-impact behaviour (see §16b).

### 5.5 `commissions.js` — commission state machine (1490 lines)

**Reads:** `getNetworkCadence` · `setNetworkCadence(cadence)` · `getCommissionRate` · `setCommissionRate(amount)` · `getCommissionSummary(branchId)` · `getEntityCommissionSummary(level, entityId)` · `getAgentCommissionList(statusFocus)` · `getAgentCommissionDetail(agentId)` · `getCommissionSubscribers(agentId, filter)` · `getDisputedAgentList` · `getCurrentRun` · `getRunById(runId)` · `listRuns({ limit, branchId })` · `getRunForBranch(runId, branchId)` · `getRunBranchBreakdown(runId)` · `getRunBranchAgents(runId, branchId)`.

`getEntityCommissionSummary` returns: `{ totalPaid, totalDue, totalDisputed, countPaid, countDue, countDisputed, total, countTotal, settlementRate }`.

**Run lifecycle mutations (Distributor + Branch):**

```js
openRun() · cancelRun(runId)
releaseRun(runId, { txnRefByAgent }) · releaseBranch(runId, branchId, { txnRefByAgent })
branchApproveAll(runId, branchId) · markBranchReviewed(runId, branchId)
branchApproveLine(commissionId) · branchHoldLine(commissionId, reason)
branchDisputeLine(commissionId, reason)
```

**Dispute lifecycle:**

```js
disputeCommission(commissionId, reason, by = 'agent')
   // by='branch' → branchDisputeLine; by='agent' → calls `agent_dispute_line` RPC
   // (added in migration 0014 — mirrors the branch RPC, returns the same `pending_branch` state).
approveDispute(commissionId, { outcomeReason, resolvedBy })
rejectDispute(commissionId, { outcomeReason, resolvedBy })
bulkApproveDisputes(commissionIds, options)
bulkRejectDisputes(commissionIds, options)
withdrawDispute(commissionId)
confirmCommission(commissionId)   // agent-side maker-checker
```

Both paths (`branch` and `agent`) are live. The state-machine RPC transition table is in BACKEND.md §11.

`invalidateSummaryCache()` clears the legacy memo cache (now a no-op when Supabase is on; React Query is canonical).

### 5.6 `subscriber.js` — per-session mutation store + Supabase reads/writes

Public API: reads `getCurrentSubscriber(phone)`, `getSubscriberTransactions(id, { type, range, status })`, `getSubscriberClaims(id)`, `getSubscriberWithdrawals(id)`, `getSubscriberNominees(id)`, `getSubscriberAgent(id)`; writes `makeAdHocContribution`, `requestWithdrawal`, `submitClaim`, `updateContributionSchedule`, `updateNominees`, `updateInsuranceCover`, `updateProfile`; signup wrappers `createFromSignup(payload)` (RPC `create_subscriber_from_signup`) and `createFromAgentOnboard(payload, agentId)` (RPC `create_subscriber_from_agent_onboard`); cache helper `invalidateSubscriber()`.

`_sessionMutations` Map keyed by subscriber ID — folds `{ extraTransactions, extraClaims, extraWithdrawals, scheduleOverride, nomineesOverride, insuranceOverride, profileOverride, balanceDelta }` into reads. `requestWithdrawal` writes BOTH a transaction (for activity feed) and a withdrawal record (for reports/claims).

### 5.7 `agent.js` — agent-scoped portfolio

`getAgentSubscriberList(agentId)` joins `subscribers` + `subscriber_balances` + `contribution_schedules` so the agent dashboard's list, detail, analytics, and home widgets ship from a single round-trip. RLS enforces "own portfolio only".

### 5.8 `kyc.js` — Smile ID v2-shaped pipeline (mocked)

8 stages: `assessImageQuality(file)`, `extractIdFields({ front, back, sessionId })`, `verifyNira(payload)`, `sendOtp(payload)`, `verifyOtp(payload)`, `faceMatch(payload)`, `screenAml(payload)`, `referToAgent(payload)`. Every call returns a `tracking_id` correlating stages of one onboarding job. **QA force-overrides** via `localStorage['upensions_<stage>_force']` (forwarded as the `X-QA-Force` header). Mock fallback honours the same flags. **Demo scope** — see §16a.

### 5.9 `chat.js` — keyword-matched chat (mocked)

`getChatResponse(message)` (distributor / branch), `getAgentReply(message, agent)` (subscriber ↔ agent DM), `getSubscriberChatResponse(msg)` (subscriber co-pilot). All POST to `/api/chat` (JWT-optional; the route flavours by role) and return a plain string (the route also returns `suggestions[]` but callers render a single bubble). The route sets `Cache-Control: no-store` and type-checks `body.message`.

### 5.10 `search.js`

`searchEntities(query): Promise<Array<{ id, name, level, label, parentId }>>` wraps the `search_entities` PG RPC (pg_trgm fuzzy). Hardcoded max 8 results. Mock fallback scans `REGIONS/DISTRICTS/BRANCHES/AGENTS`.

### 5.11 `contact.js`

`submitContactForm({ name, email, message }): Promise<{ submitted: true, id?, demo? }>` POSTs to `/api/contact`. Returns `demo: false` on real persistence, `demo: true` under the rollback flag (or in dev when `/api/*` is unreachable). The frontend does **not** strictly validate the `{ submitted, id }` shape — known low-priority drift (see §16b).

---

## 6. Contexts inventory (8 in `src/contexts/`, 1 in `src/signup/`)

| Context | Provider scope | What it holds | Read by |
| --- | --- | --- | --- |
| `AuthContext` | `main.jsx` (whole app) | `{ user, role, isAuthenticated, login, logout, updateUser }` + localStorage persist (`upensions_auth`); subscribes to `onAuthExpired` from `api.js` (see §6.1) | All shells, SignInModal, every page that needs identity |
| `SignInContext` | `App.jsx` (inside Routes) | `{ isOpen, open, close }` for SignInModal — `value` is **memoized** | Navbar, CTA, sign-in trigger buttons |
| `ToastContext` | `main.jsx` | `{ toasts, addToast, removeToast }` (max 3 visible, auto-dismiss) — `value` is **memoized** | Every form/mutation; rendered via `<ToastContainer />` |
| `DashboardContext` | `DashboardShell` / `BranchDashboardShell` / `AgentDashboardShell` / `SubscriberDashboardShell` | **Composes** `DashboardNavProvider` + `DashboardPanelProvider`; exposes merged `useDashboard()` for back-compat | All four dashboard shells |
| `DashboardNavContext` | inside `DashboardContext` | URL-derived drill state `{ level, selectedIds, section, reportId }` + `drillDown / drillUp / goToLevel / reset` + `drillTargetBranchId/AgentId` + `onPanelActionRef`. `goToLevel` reads `pathnameRef.current` (ref-based to keep callback identity stable) | Sidebar, Map, OverlayPanel, Breadcrumb |
| `DashboardPanelContext` | inside `DashboardContext` | **Strictly generic**: submenu toggles + role-agnostic panel open states (`createBranchOpen`, `viewBranchesOpen`, `createAgentOpen`, `viewAgentsOpen`, `commissionsOpen`, `viewReportsOpen`, `settingsOpen`) + `reportContext` + `closeAllPanels()`. Subscriber-specific keys moved to `SubscriberPanelContext`. | Distributor + Branch panels |
| `SubscriberPanelContext` (`src/subscriber-dashboard/`) | `SubscriberDashboardShell` only | Subscriber-only panel extension that **wraps** `DashboardPanelProvider`. Extension surface (`subscriberMenuOpen`, `viewSubscribersOpen`, plus future subscriber-only state) lives here; `useSubscriberPanel()` returns the merged `{ ...generic, ...subscriberExtension }` object. | Subscriber pages + home widgets |
| `BranchScopeContext` | `BranchDashboardShell` only | `{ branchId }` for descendants — `value` is **memoized** | ViewAgents, ViewReports, CommissionPanel when rendered inside Branch tree |
| `AgentScopeContext` | `AgentDashboardShell` only | `{ agentId }` for descendants — `value` is **memoized** | All agent pages + home widgets + CoPilot |
| `SignupContext` (`src/signup/SignupContext.jsx`) | `SignupPage` only | `useReducer` + debounced localStorage persist (`uganda-pensions-signup`); File/Blob fields + raw `password` stripped on serialise. Single `patch(payload)` + `reset()`. Mints `onboardingSessionId` (crypto.randomUUID). See §11 for debounce + beforeunload-flush detail | All 11 signup steps + contribution sub-flow + agent OnboardKycFlow |

**Cross-context handoff — `onPanelActionRef` pattern.** `DashboardNavProvider` exposes a ref; `DashboardPanelProvider` writes `{ setViewBranchesOpen, setViewAgentsOpen, setBranchMenuOpen, setAgentMenuOpen, setViewReportsOpen, … }` into it on mount. Map drill-down effects + overlay clicks invoke `onPanelActionRef.current?.setViewBranchesOpen(true)` so nav can drive panel state without a circular import or cyclic provider order.

### 6.1 Ref-based listeners

Two long-lived listeners on these contexts used to capture stale callbacks because their `useEffect` deps were `[]`. Both are now ref-based so they read the current callback every fire while subscribing only once on mount:

- **`DashboardNavContext.goToLevel`** — `useCallback` no longer depends on `location.pathname`. Instead, a `pathnameRef` is kept in sync via a separate effect, and `goToLevel` reads `pathnameRef.current` inside `parsePath(...)`. The callback identity is now stable across navigations (was rebuilt on every route change → cascaded re-renders).
- **`AuthContext.onAuthExpired` listener** — `logoutRef` and `navigateRef` are written every render; the subscription effect uses `[]` deps but its handler reads `logoutRef.current()` and `navigateRef.current('/')`. The 401 listener is now subscribed once for the app's lifetime, and always runs the current `logout` + `navigate`.

### 6.2 Role-leakage seam

`DashboardPanelContext` previously carried subscriber-specific menu state (`subscriberMenuOpen`, `viewSubscribersOpen`) inside the same value bag that Branch and Distributor consumed. The context was split: the generic provider is now **strictly role-agnostic**, and subscriber-specific extensions land in `SubscriberPanelContext` (`src/subscriber-dashboard/SubscriberPanelContext.jsx`). The wrapper composes the generic provider so generic keys (`settingsOpen`, etc.) continue to flow through `useDashboardPanel()` / `useDashboard()` unchanged; subscriber-only consumers use `useSubscriberPanel()` which merges both layers.

The seam is the canonical pattern for any future role-specific panel state — keep `DashboardPanelContext` generic; build a `<Role>PanelContext` wrapper for role-specific keys.

### 6.3 Memoization status

All provider values across the app are memoized via `useMemo`. The previously-flagged providers (`SignInContext`, `ToastContext`, `BranchScopeContext`, `AgentScopeContext`) now wrap their `value` object in `useMemo` with the right dependency arrays; `DashboardPanelContext`, `SubscriberPanelContext`, `AuthContext`, and `SignupContext` were already memoized. Maintain this pattern for any new context provider.

---

## 7. Hooks inventory (`src/hooks/` — 8 files)

| Hook file | What it returns | Side-effects | Wraps |
| --- | --- | --- | --- |
| `useEntity.js` | 17 named exports (entity reads + metrics rollup + mutations) | Optimistic patches, cache invalidation cascades — see §8 | `services/entities.js` |
| `useCommission.js` | 30+ named exports (reads + 16 mutations) | Coarse `invalidateAll(queryClient)` after every mutation | `services/commissions.js` |
| `useSubscriber.js` | 7 reads + 7 mutations | Mutations call `invalidateSubscriber()` (clears every `['subscriber*', ...]` key) | `services/subscriber.js` |
| `useAgent.js` | `useAgentSubscribers(agentId)` + `useUpdateSubscriberSchedule(subscriberId, agentId)` | Invalidates `['agentSubscribers', agentId]` | `services/agent.js` + `services/subscriber.js` |
| `useIsMobile.js` | `boolean` | `useSyncExternalStore` over `matchMedia('(max-width: 768px)')` | — |
| `useOutsideClick.js` | `void` (effect only) | `mousedown` + `Escape` listeners on `document` | — |
| `useCountUp.js` | `number` (animated target) | `requestAnimationFrame` ease-out-expo curve. Returns 0 when `run` is false (reduced motion) | — |
| `useDebouncedValue.js` | `T` (delayed) | Centralised debounce; `delayMs` defaults to 300; non-finite / negative coerced to 0 | — |

### 7.1 `useEntity.js` — query keys

| Hook | Query key |
| --- | --- |
| `useCountry()` | `['country']` |
| `useEntity(level, id)` | `['entity', level, id]` |
| `useCurrentEntity(level, selectedIds)` | derived (walks `selectedIds`) |
| `useChildren(level, parentId)` | `['children', level, parentId]` |
| `useAllEntities(level)` | `['allEntities', level]` |
| `useInfiniteEntityList(level, opts)` | `['allEntities', level, opts]` (cursor) |
| `useAllEntitiesMap(level)` | `['allEntitiesMap', level]` |
| `useTopBranch(level, parentId)` | `['topBranch', level, parentId]` |
| `useBreadcrumb(currentLevel, selectedIds)` | `['breadcrumb', currentLevel, selectedIds]` — stable cache key in place; see §16b for the technique |
| `useSearch(query)` | `['search', query]` (pair with `useDebouncedValue`, §7.8) |
| `useChildrenMetrics(parentLevel, parentId)` | `['childrenMetrics', parentLevel, parentId, ids]` |
| `useEntityMetrics(level, id)` | `['entityMetrics', level, id]` |
| `useAllEntitiesMetrics(level)` | `['allEntitiesMetrics', level, ids]` |
| `useCreateBranch / useCreateAgent / useUpdateBranch / useSetBranchStatus / useUpdateDistributor` | mutations — invalidate `['allEntities', level]` + ancestors |

The `['breadcrumb', currentLevel, selectedIds]` key was originally flagged because `selectedIds` object identity is unstable across renders, causing the cache to thrash. A stable cache-key wrapper now serialises the ids before keying; see §16b for the pattern to propagate to any new object-identity keys.

### 7.2 `useCommission.js`

Read keys: `['commissionSummary', branchId]` · `['agentCommissions', focus]` · `['agentCommissionDetail', agentId]` · `['commissionSubscribers', agentId, filter]` · `['disputedAgents']` · `['entityCommissionSummary', level, entityId]` · `['currentRun']` · `['settlementRun', runId]` · `['settlementRunsList', { limit, branchId }]` · `['runForBranch', runId, branchId]` · `['runBranchBreakdown', runId]` · `['runBranchAgents', runId, branchId]` · `['networkCadence']` · `['commissionRate']`.

Mutations: `useApproveDispute` · `useRejectDispute` · `useBulkApproveDisputes` · `useBulkRejectDisputes` · `useWithdrawDispute` · `useBranchDisputeLine` · `useOpenRun` · `useCancelRun` · `useBranchApproveLine` · `useBranchHoldLine` · `useBranchApproveAll` · `useMarkBranchReviewed` · `useReleaseRun` · `useReleaseBranch` · `useConfirmCommission` · `useDisputeCommission` · `useSetCommissionRate` · `useSetNetworkCadence`.

**Invalidation rule:** every mutation calls `invalidateAll(queryClient)`, which invalidates the full set `ALL_RUN_KEYS + ALL_COMMISSION_KEYS`. Coarse but safe — commission state changes ripple through every summary. A memoization layer on commission filter pipelines (`CommissionPanel.jsx` `agentList` / `disputedAgents`) keeps re-renders bounded under the coarse invalidation.

### 7.3 `useSubscriber.js`

| Hook | Query key |
| --- | --- |
| `useCurrentSubscriber()` | `['subscriber', phone]` |
| `useSubscriberTransactions(id, filters)` | `['subscriberTransactions', id, filters]` |
| `useSubscriberClaims(id)` | `['subscriberClaims', id]` |
| `useSubscriberWithdrawals(id)` | `['subscriberWithdrawals', id]` |
| `useSubscriberNominees(id)` | `['subscriberNominees', id]` |
| `useSubscriberAgent(id)` | `['subscriberAgent', id]` |
| `useMakeContribution(id)` · `useRequestWithdrawal(id)` · `useUpdateSchedule(id)` · `useUpdateNominees(id)` · `useSubmitClaim(id)` · `useUpdateInsuranceCover(id)` · `useUpdateProfile(id)` | mutations |

All mutations call `invalidateSubscriber()` (from `services/subscriber.js`) which clears every `['subscriber*', ...]` key.

Known cache-key inconsistency: `useSubscriber.useSubscriberTransactions` keys `[id, filters]` while `useAgent`'s agent-side equivalent variants drop `filters`. Cross-context cache-key drift — see §16b.

### 7.4 `useAgent.js`

`useAgentSubscribers(agentId)` → `['agentSubscribers', agentId]`. `useUpdateSubscriberSchedule(subscriberId, agentId)` mutation invalidates `['agentSubscribers', agentId]`.

### 7.5 `useIsMobile.js`

`useIsMobile(): boolean` — `useSyncExternalStore` over `matchMedia('(max-width: 768px)')`. Subscribes on mount; no polling.

### 7.6 `useOutsideClick.js`

`useOutsideClick(active, onOutside, refs): void` — listens on `mousedown` (fires before trigger button's `onClick` — prevents close-then-immediately-reopen race) and `Escape`. `refs` is the "inside" set; click outside all of them triggers the handler.

### 7.7 `useCountUp.js`

`useCountUp(target, duration = 1100, run = true): number` — `requestAnimationFrame` ease-out-expo curve. Used by `PulseCard` (subscriber) and `PortfolioPulseCard` (agent). Returns 0 when `run` is false (reduced motion).

### 7.8 `useDebouncedValue.js`

`useDebouncedValue<T>(value: T, delayMs?: number = 300): T` — centralised debounce. Returns `value` `delayMs` after it stops changing; non-finite / negative `delayMs` is coerced to `0` (avoids the `NaN`-silently-treated-as-0 footgun). Use this for search inputs (pair with `useSearch`), filter strings, slider-driven previews — anywhere downstream effects should only fire after the user pauses.

**Hook test coverage:** all four stateful hooks (`useEntity`, `useCommission`, `useSubscriber`, `useAgent`) have unit tests at `src/hooks/__tests__/` — see §17.

---

## 8. Canonical optimistic-mutation pattern (`useEntity` template)

`useEntity`'s `useUpdateBranch` / `useSetBranchStatus` are the **canonical template** for future role-specific React Query mutations. The pattern is:

```js
useMutation({
  mutationFn: (vars) => entitiesService.updateBranch(vars.id, vars.updates),
  onMutate: async ({ id, updates }) => {
    await queryClient.cancelQueries({ queryKey: ['entity', 'branch', id] });
    const prev = queryClient.getQueryData(['entity', 'branch', id]);
    queryClient.setQueryData(['entity', 'branch', id], (old) => ({ ...old, ...updates }));
    return { prev };                                     // snapshot returned to onError
  },
  onError: (_err, { id }, ctx) => {
    if (ctx?.prev) queryClient.setQueryData(['entity', 'branch', id], ctx.prev);
  },
  onSettled: (_data, _err, { id }) => {
    queryClient.invalidateQueries({ queryKey: ['entity', 'branch', id] });
    queryClient.invalidateQueries({ queryKey: ['allEntities', 'branch'] });
    queryClient.invalidateQueries({ queryKey: ['allEntitiesMap', 'branch'] });
  },
});
```

Four invariants:

1. **`onMutate` returns a snapshot.** `await cancelQueries` first so an in-flight refetch can't race the optimistic patch; then snapshot the relevant query data and apply the patch. The snapshot is the only payload `onError` can use to roll back.
2. **`onError` restores.** Never swallow the snapshot. Restoring before showing the error toast is the contract.
3. **`onSettled` invalidates the affected keys.** The cache is intentionally over-invalidated to cover ancestor lists (`allEntities`, `allEntitiesMap`) — coarse invalidation is safer than per-key reasoning.
4. **Mutation functions receive a single argument.** Pack vars into one object (`{ id, updates }`) so `mutate(...)` / `mutateAsync(...)` calls type cleanly and the args object is what `onMutate` / `onError` / `onSettled` receive.

The test file at `src/hooks/__tests__/useEntity.test.js` exercises every step of the dance — `cancelQueries` was called, the patch is applied synchronously after `mutate`, an error rolls the cache back to the pre-mutation snapshot, and `onSettled` invalidates the expected keys. Use it as the test scaffold for any new role-specific mutation hook.

---

## 9. Per-role dashboard variants — 4 built

### 9.1 Distributor Admin — `src/dashboard/`

Shell `DashboardShell.jsx`. Entry guard: `ProtectedDashboard` default branch (`hasDashboard(role)` true and role not in branch/agent/subscriber). Scope context: none (`useBranchScope().branchId === null` → network-wide). Sub-areas: `sidebar/`, `map/`, `overlay/`, `cards/`, `branch/`, `agent/`, `subscriber/`, `commissions/`, `reports/` (+ `views/`), `settings/`, `shared/`. Navigation: **routes** drive drill level; **panels** drive overlays.

Routes are URL-driven drill levels (`/dashboard/regions/:id`, `/dashboard/districts/:id`, `/dashboard/branches/:id`, `/dashboard/agents/:id`, `/dashboard/subscribers/:id`, `/dashboard/reports[/:reportId]`) parsed by `DashboardNavContext.parsePath`. Slide-in panels (`ViewBranches`, `ViewAgents`, `ViewSubscribers`, `CommissionPanel`, `ViewReports`, `Settings`, `CreateBranch`, `CreateAgent`) are state-based via `DashboardPanelContext`. Map → panel handoff via `onPanelActionRef`. `CommissionPanel.jsx` (1682 lines) uses **replace-model** navigation — single panel swaps content with breadcrumb trail.

### 9.2 Branch Admin — `src/branch-dashboard/`

Shell `BranchDashboardShell.jsx`. Entry guard: `role === 'branch'` else `Navigate to="/coming-soon"`; `MissingBranchIdScreen` if `branchId` absent. Scope context: `BranchScopeProvider(branchId)` + `DashboardProvider`. Sub-areas: `sidebar/`, `overview/`, `agent/`. Navigation: single main view; panels for everything else.

Single main view `BranchOverview` (no drill-down). Side panels reuse Distributor `ViewAgents`, `CommissionPanel`, `ViewReports`, `Settings` plus local `CreateAgent`, rendered with `splitMode` (backdrop suppressed; main reflows). `BranchHealthScore.jsx` (533 lines) — score gauge 0–100 from weighted formula (retention 30%, avg/subscriber 25%, agent activity 25%, growth 20%) + insights + contribution chart + embedded AI chat. `BranchSettlementBanner` surfaces open settlement runs.

**Mobile drawer.** On viewports ≤768px the sidebar is hidden and a `MobileHeader` + Framer slide-in `MobileDrawer` take over. The drawer slides `x: '-100%' → 0` with `EASE_OUT_EXPO` over 320ms, locks body scroll, closes on Escape, auto-closes on route change. `BranchSidebar` accepts `mode='desktop'|'drawer'` + `onNavigate` — drawer mode renders a full-width vertical menu and invokes `onNavigate` after each item click so the drawer dismisses itself.

### 9.3 Agent — `src/agent-dashboard/`

Shell `AgentDashboardShell.jsx` (routed pages, mobile-first). Entry guard: `role === 'agent'` else `Navigate to="/coming-soon"`; `MissingAgentIdScreen` if `agentId` absent. Scope context: `AgentScopeProvider(agentId)` + `DashboardProvider` (just for the shared `Settings` panel). Sub-areas: `shell/` (SideNav + BottomTabBar + PageHeader + AgentShell), `home/` (HomePage + widgets/), `onboarding/`, `pages/`. Navigation: **all routed** — no Distributor-style drill panels.

Home: 2 widgets — `PortfolioPulseCard` (dark indigo hero, count-up, cadence-aware "Next payout" via `cycleWindow()`) + `CoPilotWidget` (see §13). CommissionsPage owns cadence editor (`upensions_agent_settlement_cadence` localStorage) and **automatic settlement on cadence** — bulk "Request settlement" CTA was retired. KYC rule: every subscriber is KYC-verified by definition (no reminders, no filters).

Agent-side dispute path is **live** — `useDisputeCommission` → `services/commissions.disputeCommission(_, _, by='agent')` → `agent_dispute_line` SECURITY DEFINER RPC (added in migration 0014).

### 9.4 Subscriber — `src/subscriber-dashboard/`

Shell `SubscriberDashboardShell.jsx` (routed pages). Entry guard: `role === 'subscriber'` else `Navigate to="/dashboard"`. Scope context: `SubscriberPanelProvider` (wraps `DashboardPanelProvider`) + `DashboardNavProvider`. Sub-areas: `shell/` (SideNav + BottomTabBar + PageHeader + navigation helpers + SubscriberShell), `home/` (HomePage + 6 widgets/), `pages/`, `reports/views/`. Navigation: **all routed**.

5 home widgets: `PulseCard`, `TopUpWidget`, `IfYouNeedItWidget` (desktop only), `ActivityWidget`, `CoPilotWidget` (see §13). Reports under `reports/views/`: `AllTransactions`, `ContributionsSummary`, `WithdrawalsHistory`, `InsuranceStatement`, `AnnualStatement`. All mutations are optimistic via the `_sessionMutations` log in `subscriber.js`.

`/settings/notifications` and `/settings/security` are `StubPage` placeholders — see §16b.

---

## 10. Commission UI patterns

| Surface | File | Pattern |
| --- | --- | --- |
| Distributor `CommissionPanel` | `src/dashboard/commissions/CommissionPanel.jsx` (1682 lines) | Slide-in. **Replace-model nav**: home → agents (filter paid/due) → agent-detail → subscribers \| disputed-agents → dispute-detail \| settlement-requests → request-detail. Single panel swaps content with breadcrumb trail. Accepts `splitMode` prop |
| Branch reuse | imported into `BranchDashboardShell` with `splitMode` | Backdrop suppressed; reflows main beside |
| Agent `CommissionsPage` | `src/agent-dashboard/pages/CommissionsPage.jsx` | Routed page. Home view: Payout-schedule card (cadence + next payout + total) with inline edit (Weekly Friday / Bi-weekly Friday / Monthly 1st), summary strip, Earned/Owed cards, Needs Attention (Confirm receipts + Disputes), Past cycles history grouped by paid month/week. Sub-routes `:view ∈ {earned, owed, confirm, disputes}` |

**Cadence persistence (agent):** `upensions_agent_settlement_cadence` in localStorage via helpers in `src/utils/settlementCycle.js`. `cycleWindow(cadence, ref)` → `{ start, end }`; `nextCycleEnd`, `formatCycleLabel`, `formatPayoutDate`, `groupCommissionsByPaidCycle` exported alongside `CADENCES` (`WEEKLY_FRIDAY`, `BIWEEKLY_FRIDAY`, `MONTHLY_FIRST`).

**Maker-checker:** Admin `settleCommissions` flips status `due → released`; agent confirms via `confirmCommission` (idempotent). Agent-side automatic settlement on cadence means the bulk "Request settlement" CTA has been retired; the service-layer `requestCommissionSettlement` is still exported for future server-driven cycle jobs.

**State machine RPCs:** see BACKEND.md §11 for the full transition table (`due → in_run → [held|disputed] → released → confirmed/paid → rejected`).

---

## 11. Signup / KYC flow

**Route:** `/signup/*`, lazy-loaded from `App.jsx`. State container: `SignupContext` in `src/signup/` (lives outside `src/contexts/` because it's flow-scoped).

**Steps (`SignupShell.STEPS`, in order):**

| # | id | Step | KYC service call |
| --- | --- | --- | --- |
| 1 | `id-upload` | `IdUploadStep` — front + back capture, inline quality check | `assessImageQuality`, `extractIdFields` |
| 2 | `review` | `ReviewStep` — OCR auto-fill + manual override; password chosen here | — |
| 3 | `nira` | `NiraStep` — silent NIRA match | `verifyNira` |
| 4 | `otp` | `OtpStep` — SMS OTP (any 6-digit code in demo) | `kyc.sendOtp` / `kyc.verifyOtp` |
| 5 | `liveness` | `LivenessStep` — selfie + face match, one retry | `faceMatch` |
| 6 | `aml` | `AmlStep` — silent sanctions / compliance | `screenAml` |
| 7 | `beneficiaries` | `BeneficiariesStep` — pension + optional insurance beneficiaries | — |
| 8 | `consent` | `ConsentStep` — plain-English summary + timestamp | — |
| 9 | `done` | `ActivatedStep` — success screen, member ID card | — |

**Terminal states** (outside the numbered sequence; freeze progress ring at `pausedAt`, hide back button):

| id | Trigger | Component |
| --- | --- | --- |
| `agent` (`AGENT_STEP`) | NIRA or liveness failure | `AgentFallbackStep` |
| `pending-review` (`PENDING_REVIEW_STEP`) | AML flag | `PendingReviewStep` |

### 11.1 SignupContext persistence (`SignupContext.jsx`)

- `useReducer` (`patch` / `reset`) + a **debounced** `useEffect` that writes to `localStorage['uganda-pensions-signup']` 300ms after the last state change. Replaces the old "30+ writes per signup" pattern. A second `useEffect` registers a `beforeunload` listener that **flushes the pending debounce on tab close / refresh** so the final keystroke is never dropped. Lazy initialiser reads persisted state; ephemeral fields are re-nulled on rehydrate.
- **`EPHEMERAL_KEYS = ['idFrontFile', 'idBackFile', 'selfieFile', 'idFrontPreviewUrl', 'idBackPreviewUrl', 'password']`** dropped on serialise. User re-uploads images on refresh; OCR result + phone + beneficiaries + consent + KYC outcomes survive. **Raw passwords MUST NOT touch localStorage** — `password` lives in memory only and is re-entered on remount if the user navigates back to `ReviewStep`.
- `onboardingSessionId` minted via `crypto.randomUUID()` (fallback to time+random); backend uses it to correlate every KYC stage. `isSignupComplete()` (in `src/signup/signupState.js`) returns `state.consent === true`; `SignInModal.handleVerify` uses it to send subscribers with incomplete KYC back to `/signup` instead of `/dashboard`.

### 11.2 Contribution sub-flow (`/signup/contribution`)

`ContributionRoute.jsx` is the route entry; renders inside `SignupFlow` when the pathname ends with `/contribution` so step-state is preserved. `ContributionSettings.jsx` (552 lines) handles frequency / amount / retirement-emergency split. `PaymentStep.jsx` is the initial funding step.

On confirm: patches `contributionSchedule` into `SignupContext` → calls `createFromSignup(payload)` (RPC `create_subscriber_from_signup`, see BACKEND.md §10) which mints the real subscriber row + JWT → `auth.login({ token, user })` → `navigate('/dashboard')`.

---

## 12. Modal & drawer primitives, accessibility

### 12.1 Modal primitive (`src/components/Modal.jsx`)

Single shared dialog used by every confirm / destructive-action surface — `CommissionsPage` dispute modal, `CommissionPanel` dispute-resolution + line-action + run-release modals, `ViewBranches` confirm-status. Always prefer this over a bespoke fixed-position div.

```jsx
<Modal
  open={open}
  onClose={onClose}
  title="Confirm release"            // visible-to-AT (sr-only); render your own heading inside children
  size="md"                          // 'sm' 380px | 'md' 480px (default) | 'lg' 640px
  dismissOnBackdrop                  // default true
  labelledBy="my-heading-id"         // optional override; skips the sr-only h2
  describedBy="my-body-id"           // optional aria-describedby
>
  {/* your content */}
</Modal>
```

Behaviour contract — match this template if you ever build another modal:

- **Portal.** Renders into `document.body` so it escapes any transformed / overflow-clipped slide-in panel that hosts the trigger. `role="dialog"` + `aria-modal="true"` + auto-generated `aria-labelledby` on the inner surface.
- **Focus.** On open, captures `document.activeElement` and moves focus to the first focusable element inside the dialog (falls back to the dialog container). On close, restores focus. Tab / Shift+Tab cycle inside the dialog (focus trap).
- **Escape.** Calls `onClose` and fires `preventDefault + stopPropagation + nativeEvent.stopImmediatePropagation()` so outer slide-in panels do NOT also close. Verified by E2E spec `e2e/specs/regression/modal-escape.spec.ts`.
- **Backdrop dismiss.** Requires `mousedown` AND `mouseup` both on the backdrop element (`e.target === e.currentTarget`). Prevents drag-out misfires.
- **Body scroll lock + z-index.** `document.body.style.overflow = 'hidden'` while open; restored on close. Backdrop z-index `1000` — sits above slide-in panels (panel z-index `210`).
- **Animation.** AnimatePresence wraps in / out. Backdrop fades; surface scales `0.96 → 1` + slides `12 → 0`, easing `EASE_OUT_EXPO`, 250ms.
- **Mobile + SSR.** Mobile: full-screen with safe-area insets, no border-radius. SSR: returns `null` when `typeof document === 'undefined'`.

Tests live alongside the component (`Modal.test.jsx`).

### 12.2 Slide-in panels (Distributor + Branch)

Backdrop `position: fixed; inset: 0; background: rgba(27,26,74,0.35); z-index: 200` (hidden in `splitMode`). Panel `position: fixed; top/right/bottom: 16px; width: 460–680px; z-index: 210; border-radius: var(--radius-xl)`; body background `linear-gradient(180deg, #F8F9FC 0%, #F0F1F8 100%)` (solid — **not** glassmorphism for inner content). Framer Motion `initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}` with `EASE_OUT_EXPO`. Mobile (≤768px): full-screen with safe-area insets, no border-radius. Escape closes; internal state resets after a 400ms delay. `splitMode` prop suppresses backdrop and lets the parent reflow main content beside the panel (used by `BranchOverview`).

### 12.3 Accessibility baseline

Audit-verified: 0 anti-pattern hits on the two highest-leverage rules (no unpaired `outline: none`; no `transition: all`); ARIA coverage is solid.

- **Focus visibility.** Global `:focus-visible` baseline in `index.css` (2px `var(--color-indigo-soft)` outline + 2px offset). Per-control overrides for `button` / `a`. `outline: none` only appears inside `:focus` rules that also set a custom border-color ring — never unpaired.
- **Transitions + motion.** Never `transition: all` — always list properties explicitly. `<MotionConfig reducedMotion="user">` in `main.jsx`; CSS `prefers-reduced-motion` media query in `index.css` for non-Framer animations.
- **Icon-only buttons.** Must have `aria-label`. `title` alone is not sufficient. Decorative SVGs next to a text label must have `aria-hidden="true"`.
- **Form inputs.** `aria-label` or associated `<label>`; correct `type` / `inputMode` / `autoComplete`; `spellCheck={false}` on OTP / phone.
- **Touch targets.** `touch-action: manipulation` set globally on buttons + links. Minimum 44px height on mobile.
- **Skip link.** `index.html` has `<a href="#main" class="skip-link">`. `<main id="main">` is on `App.LandingPage`, `BranchDashboardShell`, `SubscriberShell`, and `AgentShell`.
- **Typography.** `text-wrap: balance` on headings. `font-variant-numeric: tabular-nums` on number / stat displays. Use the literal `…` character (U+2026), not three dots — JSX text does NOT resolve `\u` escapes.
- **Images + large lists.** All `<img>` need explicit `width` and `height`; below-fold images use `loading="lazy"`. `content-visibility: auto` with `contain-intrinsic-size` (applied in `ViewBranches` / `ViewAgents` / `ViewSubscribers`); use `useVirtualizer` for lists over a few hundred items.
- **Live regions.** Drill-level changes are announced via an `aria-live="polite"` `NavAnnouncer` in `DashboardShell`. Signup step transitions move focus into the new step container (`mainRef` in `SignupShell`).

---

## 13. CoPilotWidget convention (intentional duplication)

The subscriber and agent dashboards each ship their own `CoPilotWidget.jsx` (`src/subscriber-dashboard/home/widgets/` and `src/agent-dashboard/home/widgets/`). An audit pass reviewed extracting a shared `CopilotShell` and explicitly **kept both files separate**, with a JSDoc on each calling out the intentional duplication. Divergences are larger than the shared chrome:

- **CSS modules diverge.** Subscriber uses `.avatar`, `.avatarRing`, `.glowA/B`, `.composerIcon`, `.headText`, `.eyebrowDot`, `.pills/.pill`, `.suggestionsLabel`. Agent uses `.eyebrowSpark`, `.suggestionBtn`, `.suggestionDot`, `.suggestionItem`. Role-appropriate aesthetics, not stylistic accidents.
- **DOM differs.** Subscriber header has avatar + glow + `.headText` wrapper; agent has inline eyebrow + simpler structure. Subscriber composer has a sparkle icon prefix; agent doesn't. Subscriber suggestions render as a pills-grid; agent as `ul/li` with dot separators.
- **Reply logic differs in shape.** Subscriber makes an async service call + try/catch + toast errors. Agent runs a sync keyword matcher with no error path.

A shared shell would have to standardise the CSS contract (visual change) or pass classNames / slot content through, adding more glue than it removes. **Keep the two files in lockstep visually only where it makes design sense.** Any change to one must check whether the other should mirror.

---

## 14. Performance posture

- **Manual vendor chunks** (vendor-leaflet / -charts / -motion / -tanstack / -router / -react) keep the landing page bundle small — see §1. `chunkSizeWarningLimit: 700` is intentionally higher than Vite's 500 default for routes that legitimately carry recharts or leaflet.
- **Lazy-loaded dashboard shells.** All four shells (`DashboardShell`, `BranchDashboardShell`, `AgentDashboardShell`, `SubscriberDashboardShell`) are `React.lazy()`-imported from `App.jsx`. `SignupPage` is also lazy. Each sub-page inside the agent + subscriber shells is independently lazy (so e.g. `HomePage` paints without paying for `AnalyticsPage`).
- **Memoization conventions.** Every list page memoizes filters with `useMemo`; mutation hooks return memoized callbacks; map drill state derives from URL via `useMemo`. All four context-value gaps flagged by the audit are now memoized (§6.3).
- **`useEntityMetrics` / `useChildrenMetrics` / `useAllEntitiesMetrics`** are the canonical paths for the 8-field metrics rollup. `getDistributorMetrics` was retired — every caller now uses `useEntityMetrics('country', 'ug')`, which routes through `getEntityMetricsRollup` → `get_entity_metrics_rollup` RPC. One round-trip replaces the old 4-call fan-out.
- **Loading + empty primitives.** `SkeletonRow` (variants: `avatar` / `compact` / `card`) + `EmptyState` (`kind: 'no-data' | 'no-match'`) form a triad with `useQuery` — every list-style view panel exposes loading → empty (zero data) → empty (filter mismatch).
- **Lazy GeoJSON.** `UgandaMap.jsx` lazy-loads the 180KB `uganda-districts.geojson` (was eager every mount). Per-feature style callbacks use a `WeakMap` cache to avoid re-styling on every drill change.
- **Stable refs.** `goToLevel` and `onAuthExpired` listeners are ref-based — identity stable across renders (§6.1).
- **Signup persist debounce.** 300ms debounce + beforeunload-flush replaces the per-keystroke localStorage write (§11).

---

## 15. Shared utilities, constants & component subdirs

### 15.1 `src/utils/` (10 files)

| File | Key exports |
| --- | --- |
| `finance.js` | `MONTHLY_RATE`, `ANNUAL_RATE`, `FREQUENCY` constants, `FREQUENCY_LABEL`, `normalizeFrequency`, `periodsPerYear`, `monthlyEquivalent`, `parseAmount`, `calcFV`, `formatUGX`, `formatUGXExact`, `fmtShort`, `sliderToAmt`, `amtToSlider`. **Re-exports `EASE_OUT_EXPO` from `./motion` for backwards compat**. |
| `motion.js` | `EASE_OUT_EXPO = [0.16, 1, 0.3, 1]` — canonical Framer Motion easing curve. Mirrors `--ease-out-expo` CSS token in `src/index.css`. |
| `navigation.js` | `goBackOrFallback(navigate, fallback)` — reads `window.history.state.idx` to detect a poppable in-app entry. See §4.1. |
| `currency.js` | `formatUGX(value, { compact? = true })` (compact `'UGX 1.2M'` / exact `'UGX 50,000'`), `formatNumber(value)` (locale-grouped `'12,345'`), `formatUGXShort(value)` (axis-label `'1.2M'`, no UGX prefix). Non-positive → `'—'` (compact) / `'UGX 0'` (exact); non-finite → `'0'`. Single source of truth for money rendering. |
| `date.js` | `formatDate(value, { variant? = 'short' })`. Variants: `short` / `long` / `time` / `month-year` / `short-month-year` / `day-month`. Accepts `Date | ISO string | epoch ms`; returns `'—'` for unparseable / null input (UI never shows "Invalid Date"). |
| `dashboard.js` | `getInitials` (defensive), `getTrend`, `perfLevel` |
| `csv.js` | `toCsv`, `toCsvStream` (async-iterable), `MAX_ROWS`, `downloadCSV` (legacy). RFC 4180 escape + OWASP formula-injection defence + UTF-8 BOM. See §18. |
| `csvDownload.js` | `downloadCsv({ rows, columns, filename, isMobile?, onCapNotice? })`, `dateStampedFilename(slug)`, `MOBILE_ROW_CAP = 5000`, `STREAM_THRESHOLD = MAX_ROWS`. Composes `toCsv` / `toCsvStream` with Blob + hidden `<a download>` trigger; caps mobile exports and fires `onCapNotice({ capped, total })` so callers can surface a toast without coupling the util to toast context. |
| `phone.js` | `parseUGPhoneLocal`, `isValidUGPhone`, `formatUGPhone`, `toCanonicalUGPhone` (9-digit local, valid prefixes `70/71/74/75/76/77/78`, canonical storage `+256XXXXXXXXX`) |
| `settlementCycle.js` | `CADENCES`, `cadenceLabel`, `cadenceShortLabel`, `nextCycleEnd`, `cycleWindow`, `formatCycleLabel`, `formatPayoutDate`, `groupCommissionsByPaidCycle`. |

**Frequency normalisation rule:** ALWAYS pass schedules through `normalizeFrequency(value)` — defends against legacy aliases (`half-yearly`, `halfYearly`, `semi-annually`, `semiAnnually`).

### 15.2 `src/constants/` (3 files)

| File | Exports |
| --- | --- |
| `levels.js` | `LEVELS`, `LEVEL_ORDER`, `CHILD_LEVEL`, `PARENT_LEVEL`, `LEVEL_TO_SEGMENT`, `SEGMENT_TO_LEVEL` |
| `savings.js` | `RETIREMENT_AGE` (60), `START_AGE` (25), `MIN_CONTRIBUTION` (5000), `MIN_WITHDRAW` (5000), `INSURANCE_PREMIUM_MONTHLY` (2000), `INSURANCE_COVER` (1000000), `QUICK_CONTRIBUTION_AMOUNTS` |
| `signup.js` | `OCCUPATIONS`, `RELATIONSHIPS`, `GENDERS` (id/label pairs for onboarding selects) |

### 15.3 `src/config/env.js`

`API_BASE_URL`, `IS_DEV`, `IS_PROD`, plus public marketing URLs (`LEGAL_TERMS_URL`, `LEGAL_PRIVACY_URL`, `SUPPORT_WHATSAPP_URL`, `SUPPORT_WHATSAPP_DISPLAY`, `SUPPORT_EMAIL`) and `MAP_TILE_URL` (default CartoDB Positron). `.env.local.example` lists every consumed `VITE_*` key. Env-var quick-start: [`CLAUDE.md §3`](./CLAUDE.md). Full table including server-only keys: [`BACKEND.md §2`](./BACKEND.md). Vercel/Render/GHA sync: [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

### 15.4 Shared component subdirs under `src/components/`

| Subdir | Files | Purpose |
| --- | --- | --- |
| `contribution/` | `ContributionSettingsForm.jsx` (339 lines) + module CSS | Reusable schedule form (frequency + amount + split + insurance + summary + sticky footer). Used by subscriber `SchedulePage`, agent `SubscriberSchedulePage`, and `OnboardScheduleStep`. Parent must guard render until `initial` is loaded. |
| `signin/` | `RoleSelect`, `DistributorSelect`, `PhoneEntry`, `OtpVerify`, `PasswordEntry` | Sign-in modal sub-steps. `PasswordEntry` uses the global `.input` primitive via the composes-from-global pattern (see §16.4). |
| `reports/` | `ExportButton`, `FilterSelect`, `ReportTable`, `SearchFilter` | Distributor + Subscriber report views share these primitives. |
| `feedback/` | `ErrorCard` | Friendly error rendering used by KYC steps + agent shell. |

### 15.5 Loading + empty primitives (top-level `src/components/`)

- **`SkeletonRow.jsx`** — virtualised-row placeholder. Props: `count = 8`, `variant ∈ { 'avatar' | 'compact' | 'card' }`, `label = 'Loading…'` (accessible busy label for `role="status"`), optional `className`. Each row mirrors a real list item; the lavender→white shimmer + `EASE_OUT_EXPO` matches MetricsRow so every loading state reads as one system. `prefers-reduced-motion` halts the sweep.
- **`EmptyState.jsx`** — list/grid empty-state. Props: `kind ∈ { 'no-data' | 'no-match' }` (mandatory), `title?`, `body?`, `cta?: { label, onClick, icon? }`, `icon?`, `className?`. Distinguishes a genuinely empty source (`no-data`) from a non-empty source filtered to zero (`no-match`). Pair with `SkeletonRow` so each panel exposes loading → empty (zero data) → empty (filter mismatch).

### 15.6 `src/dashboard/shared/` (Distributor + Branch reuse)

`Stars`, `KpiCard`, `Demographics`, `MiniChart`, `TrendArrow`, `Icons`.

### 15.7 Per-session mutation stores (mock fallback)

`entities._entityOverrides` (branch status flips + creates) and `subscriber._sessionMutations` (contributions, withdrawals, schedule edits, nominees, insurance, profile, claims) layer over frozen `mockData.js`. Reset on page reload. See §4 + §16a for the demo-mode rollback flag they coexist with.

---

## 16. Design tokens, brand palette & animation

**CSS Modules architecture.** 118 `.module.css` files (one per component). **No Tailwind anywhere.** Global tokens + base styles live in `src/index.css`; Vite resolves `*.module.css` imports as hashed scoped class objects (`import styles from './X.module.css'`).

### 16.1 Brand & palette

- **Primary colour:** Universal Indigo `#292867`. Anchors key headings, primary buttons, hero emphasis, important icons. Reserve red for error/destructive/critical only.
- **Typography.** Display: Plus Jakarta Sans (`--font-display`) — headings, hero numbers, buttons. Body: Inter (`--font-body`). Headings `font-weight: 800; letter-spacing: -0.03em; color: var(--color-indigo)`.
- **Visual style.** Bold clean headings · large readable numbers · smooth card surfaces · restrained gradients · subtle depth · consistent iconography · motion tied to meaning. Avoid noisy visuals, decorative complexity, neobank flashiness.
- **Animation philosophy.** Animation is a meaning layer — communicates time passing, money growing steadily, milestones reached, confidence building. Smooth, editorial/studio-grade. Use `EASE_OUT_EXPO` for entrance; staggered children 0.05–0.1s; item reveal `{ opacity: 0, y: 12–24 } → { opacity: 1, y: 0 }`; `AnimatePresence mode="wait"` for step transitions.

### 16.2 Token excerpt (`src/index.css`)

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
--color-on-indigo-muted: rgba(255,255,255,0.78);  /* Phase 6 — muted caption/eyebrow over the indigo hero dome (≥4.5:1 AA) */

/* Status */
--color-status-good:     #2E8B57;
--color-status-warning:  #E6A817;
--color-status-poor:     #DC3545;

/* KYC status */
--color-kyc-success:      #1f6e44;
--color-kyc-warning:      #8B5A00;
--color-kyc-warning-dark: #876300;
--color-kyc-warning-amber:#c47c00;
--color-kyc-pending:      #B8860B;
--color-kyc-error:        #b22834;
--color-kyc-error-soft:   #FB7185;

/* Health & trend accents (branch + subscriber) */
--color-positive:        #4ADE80;
--color-positive-soft:   #818CF8;
--color-accent-mint:     #2DD4BF;
--color-amber:           #FBBF24;
--color-alert:           #F87171;

/* Leaderboard medals */
--color-medal-gold:      #FBBF24;
--color-medal-silver:    #94A3B8;
--color-medal-bronze:    #CD7F32;

/* Breakpoints (documentation tokens — see §16.3) */
--bp-sm: 480px;       /* small mobile */
--bp-md: 768px;       /* large mobile / portrait tablet */
--bp-lg: 1024px;      /* landscape tablet / small desktop */
--bp-xl: 1280px;      /* desktop / wide layouts */

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

/* Subscriber-mobile redesign (Phase 6) — see also --color-on-indigo-muted in the Brand block */
--radius-capsule:        3rem;                                                        /* elliptical bottom-curve depth of the hero dome */
--gradient-hero:         linear-gradient(180deg, var(--color-indigo-deep), var(--color-indigo));  /* paints the HeroCapsule dome — indigo-deep → brand indigo */
```

Plus full scales for `--text-xs`…`--text-7xl`, `--space-1`…`--space-32`, `--radius-sm/md/lg/xl/full/capsule`, `--shadow-sm/md/lg/xl`. The shared easing curve `EASE_OUT_EXPO = [0.16, 1, 0.3, 1]` is exported from `src/utils/motion.js` (re-exported from `src/utils/finance.js` for backwards compat) and mirrored as `--ease-out-expo`. The three subscriber-mobile tokens (`--color-on-indigo-muted`, `--radius-capsule`, `--gradient-hero`) are documented in §16.9.

### 16.3 Breakpoint scale

CSS custom properties cannot be referenced inside `@media (max-width: …)` queries, so `--bp-sm/md/lg/xl` act as **documentation** for the canonical 4-breakpoint scale. Module `@media` blocks use the literal pixel value that matches the token (e.g. `@media (max-width: 768px)` corresponds to `--bp-md`). The audit catalogued 26 distinct breakpoints across the codebase; the top-30 highest-traffic modules have been migrated to the 4-breakpoint scale. Residual breakpoints (unmigrated modules) are tracked in `scripts/.followup/breakpoints-residual.txt`. When a future preprocessor or `@custom-media` lands, these tokens become the single source of truth.

### 16.4 `.input` primitive

The canonical 48px frosted form input lives in `src/index.css` as a `.input` class (48px height, font-body, radius-md, bg + border tokens; `:focus-visible` adds a 2px `var(--color-indigo-soft)` outline; `:focus` changes border to `var(--color-indigo)`; `::placeholder` uses `var(--color-gray)`).

Component modules adopt it via the **composes-from-global pattern**:

```css
.field {
  composes: input from global;
  /* layer module-specific size / spacing / accent without forking the shared shape */
}
```

Used in `CreateAgent`, `ViewBranches`, `ViewAgents`, `Settings`, `CreateBranch`, `PasswordEntry`. 12 drifting `.input` definitions have been collapsed to this single primitive. Future input variants (chat composer, sign-in 56px, signup OTP) stay local but should still source colors and radii from the global tokens.

### 16.5 `EASE_OUT_EXPO` constant

The shared Framer Motion easing curve `EASE_OUT_EXPO = [0.16, 1, 0.3, 1]` lives in `src/utils/motion.js`; `src/utils/finance.js` re-exports it for backwards compat (old import paths still resolve). 9 ad-hoc `easeInOut` / `easeOut` strings in `LivenessStep`, `BranchDashboardShell`, `CreateAgent`, `IdUploadStep` have been migrated to import the shared constant.

### 16.6 Indigo migration

The audit catalogued **658 hardcoded indigo refs** (`#292867`, `rgba(41,40,103,*)`) that should reference `--color-indigo` / `--shadow-*`. A `--color-white` (`#FFFFFF`) token was introduced and all modules with ≥10 indigo refs were migrated. Net result: **658 → 223 indigo refs across 16 modules** (~66% reduction). Residual files (modules with <10 indigo refs) are tracked in `scripts/.followup/indigo-residual.txt` — 71 files at last sync, ordered by ref count for opportunistic future migration when those modules are next touched.

### 16.7 Glassmorphism recipe

For overlays / cards on the map: background `linear-gradient(145deg, rgba(255,255,255,0.78) 0%, rgba(246,247,251,0.72) 100%)`; bright top/left border for 3D light direction; `backdrop-filter: blur(24px)`; inset shadow `0 1px 0 rgba(255,255,255,0.5) inset`; hover `translateY(-3px)`. Slide-in panel conventions live in §12.2.

### 16.8 Iconography, map

**Icon system.** Inline SVG line icons, `stroke="currentColor"`, `strokeWidth="1.75"`, 24×24 viewBox. Containers: `background: rgba(41,40,103,0.06); border: 1px solid var(--color-lavender); border-radius: var(--radius-md)`. Shared icon set in `src/dashboard/shared/Icons.jsx`. Some icons live in the SVG sprite at `public/icons.svg` and are referenced via `<use href="/icons.svg#name" />`. Never emojis, icon fonts, or icon libraries. Decorative SVGs next to text labels must have `aria-hidden="true"`.

**Map (Distributor).** Full-bleed `react-leaflet` + CartoDB Positron tiles. GeoJSON in `public/uganda-districts.geojson` (clipped to region polygons via `scripts/clip-districts.mjs` using `@turf/turf`) + `public/uganda-regions.geojson`. Region colours: Central `#5E63A8`, Eastern `#2F8F9D`, Northern `#3D3C80`, Western `#7B7FC4`. Soft bokeh glow halos at region centroids. `flyTo`/`fitBounds` on drill-down. Lazy-load + WeakMap style cache reduce per-render styling cost (see §14).

---

### 16.9 Subscriber-mobile redesign (Phase 6 — shared primitives + tokens + nav)

The subscriber dashboard below 1024px was redesigned around a curved indigo "dome" header, capsule selection chips, and a 5-tab bottom bar with a centre Save FAB. Three shared primitives and three tokens back it; all are **role-agnostic** and live in `src/components/` / `src/index.css` so the agent shell (or future roles) can adopt them.

**New tokens (`src/index.css`).** Excerpted in §16.2.

| Token | Value | Role |
| --- | --- | --- |
| `--gradient-hero` | `linear-gradient(180deg, var(--color-indigo-deep), var(--color-indigo))` | Background fill of the `HeroCapsule` dome. CTAs/FAB reuse `--shadow-lg` (indigo-tinted) — **no** mint-glow. |
| `--radius-capsule` | `3rem` | Elliptical bottom-curve depth of the dome. |
| `--color-on-indigo-muted` | `rgba(255,255,255,0.78)` | Muted caption / eyebrow / subtitle text over the dome (resolves ~8.5:1 over `--color-indigo`, ~10:1 over `--color-indigo-deep` — clears AA). The big hero amount stays solid `--color-white`. |

**`HeroCapsule` (`src/components/HeroCapsule.jsx` + `.module.css`).** Presentational curved indigo dome header — no router knowledge (pass a resolved `onBack`/`onMenu`). Props:

| Prop | Effect |
| --- | --- |
| `title` | Optically-centred `<h1>` in the 3-column top bar (a spacer reserves width where a button is absent, keeping the title centred). |
| `eyebrow` | Small uppercase caption above the amount (`--color-on-indigo-muted`). |
| `prefix` + `amount` | `prefix` (e.g. `"UGX"`) + the big white display number. The amount line reserves its height so the Plus Jakarta Sans swap doesn't shift layout (no CLS). |
| `subtitle` | Muted supporting line. |
| `statRow` | Arbitrary node (units · invested · growth). |
| `onBack` | Renders a back chevron (≥44px icon button, `aria-label="Back"`). **Omit on tab-root pages** so no chevron renders. |
| `onMenu` | Renders the ⋮ button (`aria-label="More options"`). Omit to hide. |
| `variant` | `'default'` renders the full big-number block; `'compact'` drops it (renders just the top bar + an optional muted subtitle) for dense pages like Reports, so tables keep their vertical budget. |

The dome is painted with `--gradient-hero` + `--radius-capsule`; decorative SVGs carry `aria-hidden="true"`. The entrance is pure CSS (neutralised by the global `prefers-reduced-motion` reset).

**`PillChip` / `PillChipGroup` (`src/components/PillChip.jsx` + `.module.css`).** Capsule selection chips (amount presets, cadence, type/status filters). **Selected** = filled indigo + white; **idle** = lavender-outline + indigo text — brand-only, never mint. Each chip is ≥44pt tall.

- `PillChip` is a `<button role="radio" aria-checked={selected}>` taking `selected`, `onClick`, `children` (+ passthrough props).
- `PillChipGroup` (`label`, `layout='row'|'grid'`, `columns=3`) wraps chips in a single `role="radiogroup"` with `aria-label={label}` — **the label is required** for the group. It manages a **roving tabindex** (exactly one tab stop — the checked chip, or the first when none is checked) via a `useEffect` that runs each render, and `handleKeyDown` moves focus with Arrow keys (Right/Down forward, Left/Up back, wrapping) and activates the chip under focus, matching the native radio pattern. Grid layout passes `--pill-cols` for the column count.

**`PageHeader` `variant="hero"` (`src/components/PageHeader.jsx`).** The shared back-aware header (22 files across subscriber + agent) gained a `variant="hero"` that renders a `HeroCapsule` instead of the flat bar, so any page opts into the dome cheaply. Default variant is unchanged. New passthrough props (`eyebrow`, `prefix`, `amount`, `statRow`, `onMenu`) are forwarded to the capsule and ignored by the default variant; `showBack={false}` suppresses the back chevron on tab-root pages. Back resolution is unchanged (`onBack` → `backTo` → `goBackOrFallback(navigate, fallback)`).

**Subscriber mobile nav / route changes (`<1024px`).**

- **5-tab `BottomTabBar`** (`src/subscriber-dashboard/shell/BottomTabBar.jsx`) — Home · Activity · **[centre Save FAB]** · Withdraw · Goals · Profile, as `NavLink`s with `aria-current` active styling under `<nav aria-label="Quick navigation">`. Tabs are 52px tall; the centre FAB is the indigo Save action (`aria-label="Save"`, ≥44px, indigo — never mint, no mint-glow) with reduced-motion handling on its `transform`/`box-shadow` transitions. The bar is hidden at `min-width: 1024px` (mobile-only; desktop keeps the SideNav).
- **The mobile "More" menu was removed** — there are no `MoreMenu` / `moreOpen` references left in `shell/`. Destinations that used to live there are re-homed (below).
- **`/dashboard/activity` now renders `ActivityPage`** (lazy) instead of redirecting. It is no longer `Navigate to="/dashboard/reports/all-transactions"`; the Activity tab is a first-class page. (Update §2.4: the row now reads `pages/ActivityPage (lazy)`.)
- **Reports / Agent / Help / Security re-homed as `SettingsPage` rows** (`src/subscriber-dashboard/pages/SettingsPage.jsx`). The Profile tab's settings list now also carries: *Reports & statements* → `/dashboard/reports`, *Your agent* → `/dashboard/agent`, *Help* → `/dashboard/help`, and *Password & security* — which opens the shared `<Settings />` slide-in panel via `setSettingsOpen(true)` from `useDashboard()` rather than routing (it's the only surface exposing the password card on this page). *Notifications* is present but `disabled` with a "Soon" badge (the `/settings/notifications` + `/settings/security` `StubPage`s still exist — §16b).

---

## 16a. Demo scope (by design — do NOT "fix")

These behaviours are intentional limits of a sales-rep demo platform. Do not propose real SMS / payment / KYC / audit / compliance integrations as TODOs — that is explicitly out of scope per CLAUDE.md §10a. The audit re-confirmed every item below.

- **`VITE_USE_SUPABASE` rollback flag.** Read once at module load (`src/services/api.js` → `IS_SUPABASE_ENABLED`). When the env var is the literal string `'false'`, every service falls back to a `mockData`-backed branch (entities, commissions, subscriber, agent, kyc, chat, search, contact). Lets demos run offline / without backend.
- **Per-session mutation stores.** `entities._entityOverrides` (branch status flips, branch/agent creates) and `subscriber._sessionMutations` (contributions, withdrawals, schedule edits, nominees, claims) layer over frozen `mockData.js` for the duration of the tab. Resets on refresh — intentional for the demo's "what-if" flows.
- **`MOCK_NOW = new Date(2026, 4, 26)`** in `src/data/mockData.js` (currently 2026-05-26 — synced with today). Consumed by `commissions.js` and surfaced via `currentTime()`. Anchors every "due in N days" and settlement timestamp so demo data tells a coherent story. Slide it forward when relative dates start looking stale.
- **Mocked chat.** `getChatResponse`, `getAgentReply`, `getSubscriberChatResponse` POST to `/api/chat`; the route returns keyword-matched mock replies. The local fallback (under `VITE_USE_SUPABASE=false`) is identical.
- **Mocked KYC.** All 8 KYC services (`assessImageQuality`, `extractIdFields`, `verifyNira`, `sendOtp`, `verifyOtp`, `faceMatch`, `screenAml`, `referToAgent`) are Smile ID v2-shaped mocks with realistic latency. QA force-overrides via `localStorage['upensions_<stage>_force']` are intentional for demo failure-path walkthroughs.
- **Demo OTP.** `verifyOtp(phone, code, role)` accepts any 6-digit code — see BACKEND.md §15a for the route detail; the frontend service surfaces the response unchanged. No rate limiting, no lockout.
- **`demo_personas` fallback IDs.** Unknown phones resolve to `a-001` / `b-kam-015` / `d-001` so every demo login succeeds even if persona seed drifts.
- **Hardcoded UGX 1,000 unit price.** Lives in `trg_transactions_contribution` (BACKEND.md). No real fund NAV.
- **24h JWT, no refresh.** Fixed TTL is fine for short demo sessions (BACKEND.md §5).

---

## 16b. Real bugs / cleanups (residual)

Residual issues that survived the audit-driven cleanup pass. Listed so anyone touching frontend code knows what already-known drift looks like.

**StubPage placeholders.** `/dashboard/settings/notifications` and `/dashboard/settings/security` are `StubPage title="..."` shells. If a demo touches Settings these dead-ends are visible.

**Cache-key drift.** `useSubscriber.useSubscriberTransactions` keys `[id, filters]` while `useAgent`'s agent-side equivalent variants drop `filters`. Cross-context inconsistency that means an agent viewing a subscriber's filtered transactions may serve a stale unfiltered cache entry. Low-priority; the agent-side surface doesn't currently expose a filtered transaction view.

**Contact response shape.** `pages/Contact.jsx` doesn't strictly validate `{ submitted, id }` response shape from `/api/contact`. Surfaces no visible bug today (the route always returns the expected shape), but a server-side regression would surface as a silent "submitted: undefined" success toast.

**Residual indigo + breakpoint drift.** 223 hardcoded indigo refs (down from 658) and a handful of `@media` queries outside the 4-breakpoint scale remain — both tracked in `scripts/.followup/indigo-residual.txt` and `scripts/.followup/breakpoints-residual.txt`. Migrate file-by-file when touching those modules.

**Sync-cache first-paint nuance.** `src/services/entities.js` `_syncCache` (used by `DashboardNavContext` for synchronous lookups during URL routing) can return `null` on the first navigation until the cache warms. JSDoc comment explains the contract; replace with async resolution if you ever need correctness at first-paint.

**Object-identity cache keys.** When a new React Query key includes an object (e.g. `selectedIds`), serialise it stably before using it as part of the key — or wrap the object in `useMemo` so referential identity holds across renders. The `useBreadcrumb` stable key in `useEntity.js` is the reference implementation.

**Largest files** (lines only — candidates for extraction when next touched):

| File | Lines |
| --- | --- |
| `src/dashboard/commissions/CommissionPanel.jsx` | 1682 |
| `src/data/mockData.js` | 1060 |
| `src/dashboard/branch/ViewBranches.jsx` | 979 |
| `src/dashboard/sidebar/Sidebar.jsx` | 618 |
| `src/dashboard/overlay/OverlayPanel.jsx` | 569 |
| `src/signup/contribution/ContributionSettings.jsx` | 552 |
| `src/branch-dashboard/overview/BranchHealthScore.jsx` | 533 |
| `src/dashboard/settings/Settings.jsx` | 521 |

---

## 17. Testing layout

For the complete testing pipeline (Vitest + Playwright + CI matrix + KYC force-overrides + the `/qa` skill), see [`docs/TESTING.md`](./docs/TESTING.md). The summary below covers what's distinctive about the frontend test layout.

### 17.1 Setup + mocks

Vitest 4 + jsdom + Testing Library. Config inside `vite.config.js`. Global setup: `src/test/setup.js` imports `@testing-library/jest-dom`. Supabase mocked via the queue-backed `src/test/supabaseMock.js` (`makeSupabaseMock()` exposes `__queueFrom(table, result)` and `__queueRpc(name, result)` for FIFO seeding).

### 17.2 Test inventory

~700 passing tests across ~40 vitest files under `src/{services,hooks,utils,components,test}/__tests__/`. Coverage spans:

- **Services** — `auth` (incl. `signInWithPassword`, `changePassword`, OTP flow, `AuthError`, every `messageForCode`), `api` (apiFetch + `onAuthExpired` + 401), `subscriber` (reads + writes + `_sessionMutations` overlay parity), `agent` (RLS-scoped joins), `chat` (all three role variants), `kyc` (8 stages incl. phone canonicalization), `contact` (real + demo), `search` (real + mock), `supabaseClient` (singleton + token rotation), `commissions` (rate, summary, run lifecycle, dispute flow), `entities` (reads + writes + breadcrumb).
- **Hooks** — `useEntity` (React Query + optimistic-rollback semantics; canonical scaffold for §8), `useCommission` (read keys + 18 mutations + `invalidateAll`), `useSubscriber` (7 reads + 7 mutations + `invalidateSubscriber`), `useAgent` (subscribers + schedule invalidation), `useDebouncedValue` (fake timers, normalization, cancellation).
- **Utilities** — `csvDownload` (mobile cap + cap-notice + Blob shape), `settlementCycle` (cadences + window + grouping), `phone`, `dashboard`, `finance` (frequency normalisation, `calcFV`, `formatUGX*`, slider helpers), `currency`, `date`, `csv` (RFC 4180 + OWASP formula-injection defence).
- **Components + contracts** — `Modal` (portal, focus trap, Escape, backdrop dismiss, scroll lock), `jwt-claim-contract` (JWT claim shape contract).

The E2E suite (Playwright) owns happy-path regression coverage and is documented in full at [`docs/TESTING.md`](./docs/TESTING.md).

### 17.3 Coverage + conventions

**Coverage script.** `npm run test:coverage` is wired in `package.json` and reads the coverage config from the embedded Vitest block in `vite.config.js`. **`@vitest/coverage-v8` is currently NOT installed** — run `npm i -D @vitest/coverage-v8` to enable coverage reports. The script will fail with a clear "missing dependency" message until then.

**Conventions for new tests.** Prefer service-level tests (we already mock supabase-js); component tests should mount with `<QueryClientProvider>` + `<MemoryRouter>` + any required scope provider. Use `vi.mock('../supabaseClient', () => ({ supabase: makeSupabaseMock(), ... }))` per file (the mock key must match the import string the source file uses).

**E2E suite.** Specs under `e2e/`, mobile + desktop projects, role-pre-minted JWTs in `e2e/.auth/`, GitHub Actions workflow. Invoke via `npm run test:e2e` or the `/qa` skill. Modal escape-key behaviour is verified by `e2e/specs/regression/modal-escape.spec.ts`. See `.claude/skills/qa.md` and [`docs/TESTING.md`](./docs/TESTING.md).

---

## 18. CSV export

`src/utils/csv.js` exports `toCsv(rows, columns)`, `toCsvStream(rows, columns)` (async-iterable for `>MAX_ROWS`), `downloadCSV(filename, headers, rows)` (legacy), `MAX_ROWS`. Guarantees: RFC 4180 escaping (cells with commas / quotes / newlines wrapped in quotes; embedded quotes doubled); OWASP formula-injection defence (cells starting with `=`, `+`, `-`, `@`, `\t`, `\r` prefixed with a single quote and quote-wrapped — defends Excel/Sheets/LibreOffice); UTF-8 BOM prepended for Excel compatibility.

`src/utils/csvDownload.js` is the higher-level wrapper (Blob + hidden `<a download>` + mobile row cap + cap-notice callback). Filenames include a date stamp via `dateStampedFilename(slug)`.

**Callers:** `src/dashboard/overlay/TopBar.jsx` (Distributor top-right "Download" button — exports the currently visible drill level); `src/dashboard/reports/views/*.jsx` (11 per-report Distributor CSVs with date-stamped filename); `src/subscriber-dashboard/reports/views/*.jsx` (5 subscriber report CSVs).

---

## 19. Product & brand context

For palette / typography / animation values, see §16. This section captures the product-level intent those choices serve.

**Mission.** Universal Pensions is a digital long-term savings + pension platform for everyday Ugandans — informal workers, gig workers, farmers, self-employed. The goal is making formal retirement products feel approachable, building trust through clarity, and supporting multiple distribution + contribution models (subscriber direct, employer-managed, agent-led).

**Brand personality.** Dependable · intelligent · modern · stable · human · future-facing.

**Supporting palette.** Deep Night `#1B1A4A` · Soft Indigo `#5E63A8` · Mist Lavender `#D9DCF2` · Cloud `#F6F7FB` · Slate Text `#2F3550` · Cool Gray `#8A90A6` · Success Green `#2E8B57` · Accent Teal `#2F8F9D`. Indigo carries the primary identity; neutrals + soft tints for spaciousness; teal/green sparingly for positive states.

**Landing-page scroll storytelling.** Scroll = time. As the user scrolls, the page communicates the journey from today toward long-term financial security: time passing → gradual accumulation → improving confidence → uncertainty to stability. Intentional and cinematic, not gimmicky.

**Copy tone.** Clear, respectful, confidence-building, plain English. Short support text. Benefit-led messaging. Avoid heavy pension jargon, long institutional paragraphs, intimidating language.

**Dashboard direction by role.**

- **Subscriber.** Balance, recent contributions, goal progress, future impact, simple reminders.
- **Employer (deferred).** Participation, contribution management, uploads, reporting.
- **Agent.** Assisted actions, pending tasks, subscriber status, fast mobile completion.
- **Branch.** Local performance, agent oversight, subscriber activity, exceptions, progress snapshots.
- **Distributor.** Network-wide growth, branch/agent performance, trends, operational visibility, strategic reporting.
- **Admin (deferred).** Full platform control + all data access.

**Optimisation priorities** for any new product work: trust → clarity → inclusivity → multi-role usability → long-term savings behaviour → elegant scrollytelling → meaningful motion → strong alignment + readability → indigo-led brand consistency.

---

## See also

- [`CLAUDE.md`](./CLAUDE.md) — slim entry index, hard rules, demo personas, glossary
- [`BACKEND.md`](./BACKEND.md) — API routes, RLS, RPCs, migrations, commission state machine
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system architecture: layered patterns, role boundaries, auth model
- [`docs/TESTING.md`](./docs/TESTING.md) — full testing pipeline (Vitest + Playwright + CI matrix)
- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) — deploy topology + env-var sync matrix
- [`docs/role-permissions.md`](./docs/role-permissions.md) — role × capability matrix
- [`docs/data-model.md`](./docs/data-model.md) — full entity hierarchy with field definitions
- [`docs/api-contracts.md`](./docs/api-contracts.md) — HTTP shapes + cache keys + invalidation

---

*Codebase size: ~87k LOC across `src/**/*.{js,jsx,css}` (118 CSS modules + JS / JSX). Run `find src -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.css' \) -exec wc -l {} + | tail -1` to recompute.*
