# FRONTEND.md — Universal Pensions Uganda

Deep frontend reference for the React 19 + Vite 6 + CSS Modules + Framer Motion + React Router 7 + TanStack Query 5 codebase. This is a **demo / sales-presentation tool**, not a production fintech — demo-scope behaviours (mocked OTP, mocked KYC, `VITE_USE_SUPABASE` fallback, per-session mutation stores, `MOCK_NOW`, hardcoded UGX 1,000 unit price, 24h JWT) are intentional.

See `CLAUDE.md` for the slim entry index, `BACKEND.md` for SQL/RPC/RLS detail, and `docs/*` for the role × capability matrix and field-level data model.

---

## 1. Stack, entry points & build

**Stack:** React 19.2 · Vite 6.3 · Framer Motion 12 · React Router 7 · TanStack Query 5 · TanStack Virtual 3 · Leaflet 1.9 / react-leaflet 5 · Recharts 3 · Vitest 4. Node 22 LTS pinned via `.node-version`. npm with `legacy-peer-deps=true`.

**npm scripts** (`package.json`):

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server (frontend only, mock fallback if backend off) |
| `npm run dev:api` | `vercel dev` — frontend + `api/*` routes locally |
| `npm run build` | Production Vite build |
| `npm run preview` | Serve the built bundle |
| `npm run lint` | ESLint 9 flat config |
| `npm test` | Vitest one-shot |
| `npm run test:watch` | Vitest watch |
| `npm run test:e2e` | Playwright suite (`:smoke`, `:flows`, `:headed`, `:ui`) — see `.claude/skills/qa.md` |
| `npm run seed` | Seed Supabase via `scripts/seed-supabase.mjs` (see BACKEND.md §14) |

**`vite.config.js` highlights:**

- Path aliases: `@` → `./src` is the only one used in source. The five additional aliases (`@components`, `@contexts`, `@dashboard`, `@data`, `@utils`) are declared but never imported — known low-priority cruft (§12b).
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

**No Tailwind.** All styling is CSS Modules (`.module.css` per component, ~114 files). Global design tokens live in `src/index.css`; no component-library imports.

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
  assets/                         Logo PNGs (transparent)
  config/env.js                   API_BASE_URL, IS_DEV/PROD, public URLs
  constants/                      levels.js, savings.js, signup.js
  data/                           mockData (1060 lines), mockBranchDefs, mockGeo
  services/                       11 files (api, supabaseClient, auth, entities,
                                  commissions, subscriber, agent, kyc, chat,
                                  search, contact) + __tests__/
  hooks/                          8 hooks (useEntity, useCommission, useSubscriber,
                                  useAgent, useIsMobile, useOutsideClick,
                                  useCountUp, useDebouncedValue)
  contexts/                       8 contexts; SignupContext lives in src/signup/
  utils/                          finance, currency, date, dashboard, csv,
                                  csvDownload, phone, settlementCycle + __tests__/
  components/                     Landing + shell-level (Navbar, Hero, Footer,
                                  SignInModal, Modal, Toast, ErrorBoundary,
                                  SkeletonRow, EmptyState, …) +
                                  contribution/, signin/, reports/, feedback/
  pages/                          About, FAQ, Contact (marketing pages)
  signup/                         Subscriber KYC flow: SignupPage, SignupShell,
                                  SignupContext, signupState, steps/, contribution/
  dashboard/                      DISTRIBUTOR ADMIN (DashboardShell)
  branch-dashboard/               BRANCH ADMIN (BranchDashboardShell)
  agent-dashboard/                AGENT (AgentDashboardShell, routed pages)
  subscriber-dashboard/           SUBSCRIBER (SubscriberDashboardShell, routed pages)
  test/                           setup.js, supabaseMock.js
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

**`ProtectedDashboard` dispatch:** unauthenticated → `Navigate to="/"`; `hasDashboard(role)` false → `/coming-soon`; otherwise pick a shell:

| Role | Shell file |
| --- | --- |
| `'distributor'` (default branch) | `src/dashboard/DashboardShell.jsx` |
| `'branch'` | `src/branch-dashboard/BranchDashboardShell.jsx` |
| `'agent'` | `src/agent-dashboard/AgentDashboardShell.jsx` |
| `'subscriber'` | `src/subscriber-dashboard/SubscriberDashboardShell.jsx` |

Each shell is `React.lazy()`-imported in `App.jsx`, wrapped in `ErrorBoundary` + `Suspense` with a spinner fallback.

### Panel-vs-route rule (CLAUDE.md §4 item 2)

> Top-level navigation uses `react-router-dom` (`useNavigate()`). Modal/panel UI state (slide-ins, drawers) is **state-based** in `DashboardPanelContext` and intentionally NOT routed.

- **Subscriber + Agent** dashboards have routed sub-pages — every destination is a URL.
- **Distributor + Branch** dashboards use panels — drill-down slide-ins are not URL destinations; URL state encodes only the drill level (`/dashboard/branches/:id` etc.) and the panel context (`DashboardPanelContext`) holds open/closed booleans.

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
| `/dashboard/projection` | `pages/ProjectionPage` (lazy) |
| `/dashboard/activity` | `Navigate to="/dashboard/reports/all-transactions"` |
| `/dashboard/reports` and `/dashboard/reports/:reportId` | `pages/ReportsPage` (lazy) |
| `/dashboard/help` | `pages/HelpPage` (lazy) |
| `/dashboard/agent` | `pages/AgentPage` (lazy) |
| `/dashboard/settings` | `pages/SettingsPage` (lazy) |
| `/dashboard/settings/profile` | `pages/ProfilePage` (lazy) |
| `/dashboard/settings/nominees` | `pages/NomineesPage` (lazy) |
| `/dashboard/settings/insurance` | `pages/InsurancePage` (lazy) |
| `/dashboard/settings/notifications` | `pages/StubPage title="Notifications"` (placeholder — see §12b) |
| `/dashboard/settings/security` | `pages/StubPage title="Security"` (placeholder — see §12b) |
| `*` | `Navigate to="/dashboard"` |

Shell file: `src/subscriber-dashboard/SubscriberDashboardShell.jsx`. Sub-areas: `shell/` (SubscriberShell + SideNav + BottomTabBar + PageHeader + navigation.js), `home/` (HomePage + 6 widgets/), `pages/`, `reports/views/`. Wraps in `DashboardProvider` (so the shared `Settings` panel can read `settingsOpen` off `useDashboard()` — same context as Distributor + Branch, no fork).

**Employer + Admin shells are deferred.** No routes, no shells, no RLS policies — see CLAUDE.md §1. Build order when resumed: **Employer first, then Admin** (central admin with global rights).

---

## 3. Hard rules (anti-patterns)

These rules are audit-verified — Phase 1E confirmed all four cleanly held across the codebase. **Don't break them.**

| # | Rule | Where it's enforced |
| --- | --- | --- |
| 1 | Components and dashboard files **never** import from `src/data/mockData.js`. Only files under `src/services/` may. | Audit grep: `grep -rn "from '@/data/mockData" src --include='*.jsx'` → 0 hits; `grep -rn "import .* mockData" src/{dashboard,subscriber-dashboard,agent-dashboard,branch-dashboard}` → 0 hits. |
| 2 | Don't hand-roll `fetch()` against `/api/*`. Always go through `services/api.js` (`api.get/post/put/delete`) so the 401 listener (`onAuthExpired`) fires. | Audit grep: `grep -rn "fetch('/api" src --include='*.jsx' --include='*.js'` ignoring `src/services/api.js` → 0 hits. |
| 3 | Never write `outline: none` without a `:focus-visible` replacement (or a wrapping `:focus-within` ring). The global `:focus-visible` baseline is in `src/index.css` (2px `var(--color-indigo-soft)` outline). | Audit grep: `grep -rn "outline: none" src --include='*.module.css' \| grep -v ":focus-visible"` → 0 hits. |
| 4 | Never write `transition: all`. Always enumerate properties. | Audit grep: `grep -rn "transition: all" src --include='*.module.css'` → 0 hits. |
| 5 | Always pass schedule frequencies through `normalizeFrequency(value)` from `src/utils/finance.js`. Defends against legacy aliases (`half-yearly`, `halfYearly`, `semi-annually`, `semiAnnually`). | Service + hook + UI write paths. |
| 6 | Signup persistence: `SignupContext` writes every patch to `localStorage['uganda-pensions-signup']`. **File/Blob fields + `password` are dropped on serialise** via `EPHEMERAL_KEYS` (§8). | `src/signup/SignupContext.jsx`. |
| 7 | No raw SQL from the frontend. Every write goes through a Supabase RPC (typically SECURITY DEFINER) — see BACKEND.md §10. | Service layer. |
| 8 | RLS policies read `auth.jwt() ->> 'app_role'`, **never** `'role'`. `auth.uid()` is `NULL` for our custom HS256 JWTs (BACKEND.md §9). | Audit confirmed: 65/65 policies correct. |

Phase 1E also confirmed **no `dangerouslySetInnerHTML` anywhere** (React's default escaping is preserved) and **no open-redirect vectors** — every `window.location` / `navigate` destination is a hardcoded path.

---

## 4. Three-layer data access

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

**Per-service overrides over frozen mockData.** Under `IS_SUPABASE_ENABLED=false`, both `entities.js` and `subscriber.js` keep an in-memory `Map` (`_entityOverrides` / `_sessionMutations`) so writes (status flips, contributions, schedule edits, withdrawals) layer on top of the frozen seed for the demo session. Lost on refresh — see §12a.

**Audit caveat (X11 / X17).** Every service that branches on `IS_SUPABASE_ENABLED` ships an offline mock branch (per CLAUDE.md §10a rollback safety), but **none of those mock branches are tested**. There are no assertions that the mock branch's output shape matches the live branch's. Output-shape drift is a latent risk — treat any mock-branch change as needing manual verification.

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

`VITE_API_BASE_URL` exists in `src/config/env.js` but `api.js` hardcodes `/api` and **never reads** the env var — known low-priority drift (audit X15, §12b).

### 5.2 `supabaseClient.js` — supabase-js singleton

`createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` with `auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }` — we manage our own JWTs. `global.headers` is a **function** that re-reads `localStorage` on every request so token rotation is picked up without recreating the client.

Audit X6 flags: if `VITE_SUPABASE_URL` is missing the file silently falls back to `'http://localhost:54321'`; if `VITE_SUPABASE_ANON_KEY` is missing it falls back to `'public-anon-key'`. A misconfigured preview/prod ships a broken app — known issue, listed in §12b.

### 5.3 `auth.js` — sign-in flow

```js
export class AuthError extends Error { code; retryAfterSeconds? }
export const DASHBOARD_ROLES = ['distributor', 'branch', 'subscriber', 'agent']
export async function sendOtp(phone, role)
export async function verifyOtp(phone, otp, role, password?)        // password optional — set on first sign-in
export async function signInWithPassword(phone, password, role)
export async function changePassword(currentPassword, newPassword)
export function hasDashboard(role): boolean
```

`AuthError.code` values that the UI maps to friendly messages via `messageForCode`: `rate_limited`, `locked`, `invalid_otp`, `password_too_short`, `password_too_weak`, `password_too_long`, `password_required`, `invalid_password`, `password_not_set`, `current_password_required`, `current_password_invalid`. Anything else falls back to "Could not verify the code. Please try again."

Dev-only QA force-overrides via `localStorage['upensions_otp_force']` (`invalid_otp` / `rate_limited` / `locked`). `verifyOtp` returns `{ token, user: { role, phone, name?, subscriberId?, agentId?, branchId?, distributorId?, hasPassword? } }`.

**Audit caveat:** `signInWithPassword`, `changePassword`, `AuthError`, and the extended `messageForCode` are zero-unit-test (T2). Any contract change in this file ripples to every login flow with no safety net.

### 5.4 `entities.js` — hierarchy CRUD (Distributor + Branch dashboards)

```js
export async function getCountry()
export async function getEntity(level, id)
export async function getChildren(parentLevel, parentId)
export async function getAllAtLevel(level)
export async function getEntityPage(level, opts)            // paginated variant
export async function getAllAtLevelMap(level)
export async function getParent(level, id)
export async function getTopPerformingBranch(level, parentId)
export async function getBreadcrumb(currentLevel, selectedIds)
export function   getEntitySync(level, id)                  // sync — used by DashboardNavContext
export async function getEntityMetricsRollup(level, entityIds)  // RPC get_entity_metrics_rollup
export async function createBranch(payload)
export async function createAgent(payload)
export async function updateBranch(id, patch)
export async function setBranchStatus(id, status)
export async function updateDistributor(id, patch)
export const _mockSources = { COUNTRY, REGIONS, DISTRICTS, BRANCHES, AGENTS, DISTRIBUTORS }
```

Returns camelCase shape; Supabase rows are mapped via internal `mapRegion / mapDistrict / mapBranch / mapAgent / mapDistributor` helpers. Mock fallback reads from `mockData.js` + the in-memory `_entityOverrides` Map.

**`getDistributorMetrics()` retired in PR-2** (remediation plan Phase 2). Every caller now uses `useEntityMetrics('country', 'ug')`, which routes through `getEntityMetricsRollup` → `get_entity_metrics_rollup` RPC. That RPC returns totalSubscribers/totalAgents/totalBranches/aum as part of its 8-field result, eliminating the 4-call fan-out the old function did.

`getEntitySync` uses an in-memory `_syncCache` for synchronous lookups during URL routing (`DashboardNavContext.parsePath`). First navigation can return `null` until the cache warms — known low-impact behaviour (audit F27).

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

```js
export async function getCurrentSubscriber(phone)
export async function getSubscriberTransactions(id, { type, range, status })
export async function getSubscriberClaims(id)
export async function getSubscriberWithdrawals(id)
export async function getSubscriberNominees(id)
export async function getSubscriberAgent(subscriberId)
export async function makeAdHocContribution(id, { amount, retirementPct, method })
export async function requestWithdrawal(id, ...)
export async function submitClaim(id, payload)
export async function updateContributionSchedule(id, schedule)
export async function updateNominees(id, { pension, insurance })
export async function updateInsuranceCover(id, { cover, premiumMonthly })
export async function updateProfile(id, updates)
export async function createFromSignup(payload)              // RPC create_subscriber_from_signup
export async function createFromAgentOnboard(payload, agentId)  // RPC create_subscriber_from_agent_onboard
export function invalidateSubscriber()
```

`_sessionMutations` Map keyed by subscriber ID — folds `{ extraTransactions, extraClaims, extraWithdrawals, scheduleOverride, nomineesOverride, insuranceOverride, profileOverride, balanceDelta }` into reads. `requestWithdrawal` writes BOTH a transaction (for activity feed) and a withdrawal record (for reports/claims).

### 5.7 `agent.js` — agent-scoped portfolio

```js
export async function getAgentSubscriberList(agentId)
```

Joins `subscribers` + `subscriber_balances` + `contribution_schedules` so the agent dashboard's list, detail, analytics, and home widgets ship from a single round-trip. RLS enforces "own portfolio only".

### 5.8 `kyc.js` — Smile ID v2-shaped pipeline (mocked)

```js
assessImageQuality(file) · extractIdFields({ front, back, sessionId })
verifyNira(payload) · sendOtp(payload) · verifyOtp(payload)
faceMatch(payload) · screenAml(payload) · referToAgent(payload)
```

Every call returns a `tracking_id` correlating stages of one onboarding job. **QA force-overrides** via `localStorage['upensions_<stage>_force']` (forwarded as the `X-QA-Force` header). Mock fallback honours the same flags. **Demo scope** — see §12a.

### 5.9 `chat.js` — keyword-matched chat (mocked)

```js
export async function getChatResponse(message)         // distributor/branch
export async function getAgentReply(message, agent)    // subscriber ↔ agent DM
export async function getSubscriberChatResponse(msg)   // subscriber co-pilot
```

POSTs to `/api/chat` (JWT-optional; the route flavours by role). All three return a plain string (the route also returns `suggestions[]` but callers render a single bubble).

### 5.10 `search.js`

```js
export async function searchEntities(query): Promise<Array<{ id, name, level, label, parentId }>>
```

Wraps the `search_entities` PG RPC (pg_trgm fuzzy). Hardcoded max 8 results. Mock fallback scans `REGIONS/DISTRICTS/BRANCHES/AGENTS`.

### 5.11 `contact.js`

```js
export async function submitContactForm({ name, email, message }): Promise<{ submitted: true, id?, demo? }>
```

POSTs to `/api/contact`. Returns `demo: false` on real persistence, `demo: true` under the rollback flag (or in dev when `/api/*` is unreachable). The frontend does **not** strictly validate the `{ submitted, id }` shape — known low-priority drift (audit X13, §12b).

---

## 6. Hooks inventory (`src/hooks/` — 8 files)

| Hook file | What it returns | Side-effects | Wraps |
| --- | --- | --- | --- |
| `useEntity.js` | 17 named exports (entity reads + metrics rollup + mutations) | Optimistic patches, cache invalidation cascades | `services/entities.js` |
| `useCommission.js` | 30+ named exports (reads + 16 mutations) | Coarse `invalidateAll(queryClient)` after every mutation | `services/commissions.js` |
| `useSubscriber.js` | 7 reads + 7 mutations | Mutations call `invalidateSubscriber()` (clears every `['subscriber*', ...]` key) | `services/subscriber.js` |
| `useAgent.js` | `useAgentSubscribers(agentId)` + `useUpdateSubscriberSchedule(subscriberId, agentId)` | Invalidates `['agentSubscribers', agentId]` | `services/agent.js` + `services/subscriber.js` |
| `useIsMobile.js` | `boolean` | `useSyncExternalStore` over `matchMedia('(max-width: 768px)')` | — |
| `useOutsideClick.js` | `void` (effect only) | `mousedown` + `Escape` listeners on `document` | — |
| `useCountUp.js` | `number` (animated target) | `requestAnimationFrame` ease-out-expo curve. Returns 0 when `run` is false (reduced motion) | — |
| `useDebouncedValue.js` | `T` (delayed) | Centralised debounce; `delayMs` defaults to 300; non-finite / negative coerced to 0 | — |

### 6.1 `useEntity.js` — query keys

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
| `useBreadcrumb(currentLevel, selectedIds)` | `['breadcrumb', currentLevel, selectedIds]` — see audit F13 |
| `useSearch(query)` | `['search', query]` (pair with `useDebouncedValue`, §6.8) |
| `useChildrenMetrics(parentLevel, parentId)` | `['childrenMetrics', parentLevel, parentId, ids]` |
| `useEntityMetrics(level, id)` | `['entityMetrics', level, id]` |
| `useAllEntitiesMetrics(level)` | `['allEntitiesMetrics', level, ids]` |
| `useCreateBranch / useCreateAgent / useUpdateBranch / useSetBranchStatus / useUpdateDistributor` | mutations — invalidate `['allEntities', level]` + ancestors |

Audit F13 flags `['breadcrumb', currentLevel, selectedIds]` — the `selectedIds` object identity is unstable across renders, so the cache thrashes. Known issue; see §12b.

The mutation pattern (optimistic patch → roll back on error) is correct and canonical, but the docstrings don't formally call it out as the template for new mutations — listed as an awareness item (audit F14).

### 6.2 `useCommission.js`

Read keys: `['commissionSummary', branchId]` · `['agentCommissions', focus]` · `['agentCommissionDetail', agentId]` · `['commissionSubscribers', agentId, filter]` · `['disputedAgents']` · `['entityCommissionSummary', level, entityId]` · `['currentRun']` · `['settlementRun', runId]` · `['settlementRunsList', { limit, branchId }]` · `['runForBranch', runId, branchId]` · `['runBranchBreakdown', runId]` · `['runBranchAgents', runId, branchId]` · `['networkCadence']` · `['commissionRate']`.

Mutations: `useApproveDispute` · `useRejectDispute` · `useBulkApproveDisputes` · `useBulkRejectDisputes` · `useWithdrawDispute` · `useBranchDisputeLine` · `useOpenRun` · `useCancelRun` · `useBranchApproveLine` · `useBranchHoldLine` · `useBranchApproveAll` · `useMarkBranchReviewed` · `useReleaseRun` · `useReleaseBranch` · `useConfirmCommission` · `useDisputeCommission` · `useSetCommissionRate` · `useSetNetworkCadence`.

**Invalidation rule:** every mutation calls `invalidateAll(queryClient)`, which invalidates the full set `ALL_RUN_KEYS + ALL_COMMISSION_KEYS`. Coarse but safe — commission state changes ripple through every summary.

### 6.3 `useSubscriber.js`

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

Audit X12 flags a cache-key inconsistency: `useSubscriber.useSubscriberTransactions` keys `[id, filters]` while `useAgent`'s agent-side equivalent variants drop `filters`. Cross-context cache key drift — see §12b.

### 6.4 `useAgent.js`

```js
useAgentSubscribers(agentId)       // ['agentSubscribers', agentId]
useUpdateSubscriberSchedule(subscriberId, agentId)
   // mutation invalidates ['agentSubscribers', agentId]
```

### 6.5 `useIsMobile.js`

```js
export function useIsMobile(): boolean
```

`useSyncExternalStore` over `matchMedia('(max-width: 768px)')`. Subscribes on mount; no polling.

### 6.6 `useOutsideClick.js`

```js
export function useOutsideClick(active, onOutside, refs): void
```

Listens on `mousedown` (fires before trigger button's `onClick` — prevents close-then-immediately-reopen race) and `Escape`. `refs` is the "inside" set; click outside all of them triggers the handler.

### 6.7 `useCountUp.js`

```js
export function useCountUp(target, duration = 1100, run = true): number
```

`requestAnimationFrame` ease-out-expo curve. Used by `PulseCard` (subscriber) and `PortfolioPulseCard` (agent). Returns 0 when `run` is false (reduced motion).

### 6.8 `useDebouncedValue.js`

```js
export function useDebouncedValue<T>(value: T, delayMs?: number = 300): T
```

Centralised debounce. Returns `value` `delayMs` after it stops changing; non-finite / negative `delayMs` is coerced to `0` (avoids the `NaN`-silently-treated-as-0 footgun). Use this for search inputs (pair with `useSearch`), filter strings, slider-driven previews — anywhere downstream effects should only fire after the user pauses. Tests at `src/hooks/useDebouncedValue.test.js`.

**Audit caveat:** `useEntity`, `useCommission`, `useSubscriber`, and `useAgent` have **zero unit tests** (T6) — only `useDebouncedValue` is covered.

---

## 7. Contexts inventory (8 in `src/contexts/`, 1 in `src/signup/`)

| Context | Provider scope | What it holds | Read by |
| --- | --- | --- | --- |
| `AuthContext` | `main.jsx` (whole app) | `{ user, role, isAuthenticated, login, logout, updateUser }` + localStorage persist (`upensions_auth`); subscribes to `onAuthExpired` from `api.js` | All shells, SignInModal, every page that needs identity |
| `SignInContext` | `App.jsx` (inside Routes) | `{ isOpen, open, close }` for SignInModal | Navbar, CTA, sign-in trigger buttons |
| `ToastContext` | `main.jsx` | `{ toasts, addToast, removeToast }` (max 3 visible, auto-dismiss) | Every form/mutation; rendered via `<ToastContainer />` |
| `DashboardContext` | `DashboardShell` / `BranchDashboardShell` / `AgentDashboardShell` / `SubscriberDashboardShell` | **Composes** `DashboardNavProvider` + `DashboardPanelProvider`; exposes merged `useDashboard()` for back-compat | All four dashboard shells (Agent + Subscriber wrap it to share the `Settings` panel) |
| `DashboardNavContext` | inside `DashboardContext` | URL-derived drill state `{ level, selectedIds, section, reportId }` + `drillDown / drillUp / goToLevel / reset` + `drillTargetBranchId/AgentId` + `onPanelActionRef` | Sidebar, Map, OverlayPanel, Breadcrumb |
| `DashboardPanelContext` | inside `DashboardContext` | Submenu toggles + panel open states (`createBranchOpen`, `viewBranchesOpen`, `createAgentOpen`, `viewAgentsOpen`, `viewSubscribersOpen`, `commissionsOpen`, `viewReportsOpen`, `settingsOpen`) + `reportContext` + `closeAllPanels()`. Registers setters into `DashboardNavContext.onPanelActionRef` on mount. | Distributor + Branch panels; Subscriber + Agent shells only touch `settingsOpen` |
| `BranchScopeContext` | `BranchDashboardShell` only | `{ branchId }` for descendants | ViewAgents, ViewReports, CommissionPanel when rendered inside Branch tree |
| `AgentScopeContext` | `AgentDashboardShell` only | `{ agentId }` for descendants | All agent pages + home widgets + CoPilot |
| `SignupContext` (`src/signup/SignupContext.jsx`) | `SignupPage` only | `useReducer` + localStorage persist (`uganda-pensions-signup`); File/Blob fields + raw `password` stripped on serialise. Single `patch(payload)` + `reset()`. Mints `onboardingSessionId` (crypto.randomUUID) | All 11 signup steps + contribution sub-flow + agent OnboardKycFlow |

**Cross-context handoff — `onPanelActionRef` pattern.** `DashboardNavProvider` exposes a ref; `DashboardPanelProvider` writes `{ setViewBranchesOpen, setViewAgentsOpen, setBranchMenuOpen, setAgentMenuOpen, setViewReportsOpen, … }` into it on mount. Map drill-down effects + overlay clicks invoke `onPanelActionRef.current?.setViewBranchesOpen(true)` so nav can drive panel state without a circular import or cyclic provider order.

### Role-leakage trap

`DashboardPanelContext` carries **subscriber-specific** menu state (`subscriberMenuOpen`, `viewSubscribersOpen`, `setSubscriberMenuOpen`, `setViewSubscribersOpen`) inside the same value bag that Branch and Distributor consume. Branch dashboards never open `viewSubscribersOpen`, but the state slots ride along. This is a recurring trap when adding role-specific UI to a shared panel context — **prefer local state** unless every consuming role actually toggles the field. Historical example: an earlier iteration of `DashboardNavContext` exposed a `reports → subscriber` selector that pinned subscriber-only fields visible to every dashboard. Don't repeat that — `BranchScopeContext` / `AgentScopeContext` are the canonical scope-narrowing wrappers.

### Memoization gaps (audit F2–F5)

The audit flagged four context providers as building a new `value` object every render, forcing every consumer to re-render unnecessarily:

| Context | Status | Severity |
| --- | --- | --- |
| `SignInContext` | `value={{ isOpen, open, close }}` rebuilt every render (`SignInContext.jsx:9`) | med (F2) |
| `ToastContext` | `value={{ toasts, addToast, removeToast }}` not memoized (`ToastContext.jsx:54`) | med (F3) |
| `BranchScopeContext` | `value={{ branchId: branchId \|\| null }}` not memoized (`BranchScopeContext.jsx:12`) | low (F4) |
| `AgentScopeContext` | `value={{ agentId: agentId \|\| null }}` not memoized (`AgentScopeContext.jsx:10`) | low (F4) |

`DashboardPanelContext` and `SignupContext` already use `useMemo` for `value` — those are the template. Listed in §12b for cleanup; not load-bearing today, but every consumer downstream is wasting renders.

Two other context-shaped issues from the audit:

- `DashboardNavContext.goToLevel` (`:171–183`) `useCallback` depends on `location.pathname` — changes every navigation, so the callback identity is rebuilt frequently (F6).
- `AuthContext.onAuthExpired` listener `useEffect` (`:94–97`) has `[]` deps — captures stale `logout` / `navigate` closures (F7).

Both medium-severity; see §12b.

---

## 8. Signup / KYC flow

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

**SignupContext persistence (`SignupContext.jsx`):**

- `useReducer` (`patch` / `reset`) + `useEffect` writing to `localStorage['uganda-pensions-signup']` on every state change.
- Lazy initialiser reads persisted state; ephemeral fields are re-nulled on rehydrate.
- **`EPHEMERAL_KEYS = ['idFrontFile', 'idBackFile', 'selfieFile', 'idFrontPreviewUrl', 'idBackPreviewUrl', 'password']`** dropped on serialise. User re-uploads images on refresh; OCR result + phone + beneficiaries + consent + KYC outcomes survive. **Raw passwords MUST NOT touch localStorage** — `password` lives in memory only and is re-entered on remount if the user navigates back to `ReviewStep`.
- `onboardingSessionId` minted via `crypto.randomUUID()` (fallback to time+random) — backend uses it to correlate every KYC stage.
- `isSignupComplete()` (in `src/signup/signupState.js`) returns `state.consent === true`. Used by `SignInModal.handleVerify` to send subscribers with incomplete KYC back to `/signup` instead of `/dashboard`.

Audit F15 flagged the persist effect as writing to `localStorage` on every state change (30+ writes during signup, no batching). Low severity; listed in §12b.

**Contribution sub-flow (`/signup/contribution`):**

- `ContributionRoute.jsx` — route entry. Renders inside `SignupFlow` when the pathname ends with `/contribution` so step-state is preserved.
- `ContributionSettings.jsx` (552 lines) — frequency (weekly/monthly/quarterly/half-yearly/annually via `FREQUENCY` constants), amount, retirement/emergency split.
- `PaymentStep.jsx` — initial funding step.
- On confirm: patches `contributionSchedule` into `SignupContext` → calls `createFromSignup(payload)` (RPC `create_subscriber_from_signup`, see BACKEND.md §10) which mints the real subscriber row + JWT → `auth.login({ token, user })` → `navigate('/dashboard')`.

---

## 9. Per-role dashboard variants — 4 built

### 9.1 Distributor Admin — `src/dashboard/`

| Field | Value |
| --- | --- |
| Shell | `DashboardShell.jsx` |
| Entry guard | `ProtectedDashboard` default branch (`hasDashboard(role)` true and role not in branch/agent/subscriber) |
| Scope context | none (`useBranchScope().branchId === null` → network-wide) |
| Sub-areas | `sidebar/`, `map/`, `overlay/`, `cards/`, `branch/`, `agent/`, `subscriber/`, `commissions/`, `reports/` (+ `views/`), `settings/`, `shared/` |
| Navigation | **Routes** drive drill level; **panels** drive overlays |

Routes are URL-driven drill levels (`/dashboard/regions/:id`, `/dashboard/districts/:id`, `/dashboard/branches/:id`, `/dashboard/agents/:id`, `/dashboard/subscribers/:id`, `/dashboard/reports[/:reportId]`) parsed by `DashboardNavContext.parsePath`. Slide-in panels (`ViewBranches`, `ViewAgents`, `ViewSubscribers`, `CommissionPanel`, `ViewReports`, `Settings`, `CreateBranch`, `CreateAgent`) are state-based via `DashboardPanelContext`. Map → panel handoff via `onPanelActionRef`. `CommissionPanel.jsx` (1682 lines) uses **replace-model** navigation — single panel swaps content with breadcrumb trail.

### 9.2 Branch Admin — `src/branch-dashboard/`

| Field | Value |
| --- | --- |
| Shell | `BranchDashboardShell.jsx` |
| Entry guard | `role === 'branch'` else `Navigate to="/coming-soon"`; `MissingBranchIdScreen` if `branchId` absent |
| Scope context | `BranchScopeProvider(branchId)` + `DashboardProvider` |
| Sub-areas | `sidebar/`, `overview/`, `agent/` |
| Navigation | Single main view; panels for everything else |

Single main view `BranchOverview` (no drill-down). Side panels reuse Distributor `ViewAgents`, `CommissionPanel`, `ViewReports`, `Settings` plus local `CreateAgent`, rendered with `splitMode` (backdrop suppressed; main reflows). `BranchHealthScore.jsx` (533 lines) — score gauge 0–100 from weighted formula (retention 30%, avg/subscriber 25%, agent activity 25%, growth 20%) + insights + contribution chart + embedded AI chat. `BranchSettlementBanner` surfaces open settlement runs.

**Mobile drawer (`BranchDashboardShell` + `BranchSidebar`).** On viewports ≤768px the sidebar is hidden and a `MobileHeader` + Framer slide-in `MobileDrawer` take over. The drawer slides in `x: '-100%' → 0` with `EASE_OUT_EXPO` over 320ms, locks body scroll, closes on Escape, and auto-closes on route change (a `useEffect` watching `location.pathname`). `BranchSidebar` accepts `mode='desktop'|'drawer'` + `onNavigate` — drawer mode renders a full-width vertical menu and invokes `onNavigate` after each item click so the drawer dismisses itself.

### 9.3 Agent — `src/agent-dashboard/`

| Field | Value |
| --- | --- |
| Shell | `AgentDashboardShell.jsx` (routed pages, mobile-first) |
| Entry guard | `role === 'agent'` else `Navigate to="/coming-soon"`; `MissingAgentIdScreen` if `agentId` absent |
| Scope context | `AgentScopeProvider(agentId)` + `DashboardProvider` (just for the shared `Settings` panel) |
| Sub-areas | `shell/` (SideNav + BottomTabBar + PageHeader + AgentShell), `home/` (HomePage + widgets/), `onboarding/`, `pages/` |
| Navigation | **All routed** — no Distributor-style drill panels |

Home: 2 widgets — `PortfolioPulseCard` (dark indigo hero, count-up, cadence-aware "Next payout" via `cycleWindow()`) + `CoPilotWidget`. CommissionsPage owns cadence editor (`upensions_agent_settlement_cadence` localStorage) and **automatic settlement on cadence** — bulk "Request settlement" CTA was retired. KYC rule: every subscriber is KYC-verified by definition (no reminders, no filters).

Agent-side dispute path is **live** — `useDisputeCommission` → `services/commissions.disputeCommission(_, _, by='agent')` → `agent_dispute_line` SECURITY DEFINER RPC (added in migration 0014). The earlier "not built" claim was stale; see §12b.

### 9.4 Subscriber — `src/subscriber-dashboard/`

| Field | Value |
| --- | --- |
| Shell | `SubscriberDashboardShell.jsx` (routed pages) |
| Entry guard | `role === 'subscriber'` else `Navigate to="/dashboard"` |
| Scope context | `DashboardProvider` (no scope context — phone-keyed reads) |
| Sub-areas | `shell/` (SideNav + BottomTabBar + PageHeader + navigation.js + SubscriberShell), `home/` (HomePage + 6 widgets/), `pages/`, `reports/views/` |
| Navigation | **All routed** |

6 home widgets: `PulseCard`, `TopUpWidget`, `ProjectionWidget`, `IfYouNeedItWidget` (desktop only), `ActivityWidget`, `CoPilotWidget`. Reports under `reports/views/`: `AllTransactions`, `ContributionsSummary`, `WithdrawalsHistory`, `InsuranceStatement`, `AnnualStatement`. All mutations are optimistic via the `_sessionMutations` log in `subscriber.js`.

`/settings/notifications` and `/settings/security` are `StubPage` placeholders — see §12b.

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

## 11. Design tokens, brand palette & animation

**CSS Modules architecture.** ~114 `.module.css` files (one per component). **No Tailwind anywhere.** Global tokens + base styles live in `src/index.css`; Vite resolves `*.module.css` imports as hashed scoped class objects (`import styles from './X.module.css'`).

### 11.1 Brand & palette

- **Primary colour:** Universal Indigo `#292867`. Anchors key headings, primary buttons, hero emphasis, important icons.
- **Reserve red** for error/destructive/critical only — never as a major brand colour.
- **Typography.** Display: Plus Jakarta Sans (`--font-display`) — headings, hero numbers, buttons. Body: Inter (`--font-body`). Headings `font-weight: 800; letter-spacing: -0.03em; color: var(--color-indigo)`.
- **Visual style.** Bold clean headings · large readable numbers · smooth card surfaces · restrained gradients · subtle depth · consistent iconography · motion tied to meaning. Avoid noisy visuals, decorative complexity, neobank flashiness.
- **Animation philosophy.** Animation is a meaning layer — communicates time passing, money growing steadily, milestones reached, confidence building. Smooth, editorial/studio-grade. Use `EASE_OUT_EXPO` for entrance; staggered children 0.05–0.1s; item reveal `{ opacity: 0, y: 12–24 } → { opacity: 1, y: 0 }`; `AnimatePresence mode="wait"` for step transitions.

### 11.2 Token excerpt (`src/index.css`)

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

/* Health & trend accents (branch + subscriber) */
--color-positive:        #4ADE80;
--color-positive-soft:   #818CF8;
--color-accent-mint:     #2DD4BF;
--color-amber:           #FBBF24;
--color-alert:           #F87171;

/* Leaderboard medals */
--color-medal-gold:      #FBBF24;
--color-medal-silver:   #94A3B8;
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

Plus full scales for `--text-xs`…`--text-7xl`, `--space-1`…`--space-32`, `--radius-sm/md/lg/xl/full`, `--shadow-sm/md/lg/xl`. The shared easing curve `EASE_OUT_EXPO = [0.16, 1, 0.3, 1]` is exported from `src/utils/finance.js` and mirrored as `--ease-out-expo`.

### 11.3 Slide-in panel conventions (Distributor + Branch)

- Backdrop: `position: fixed; inset: 0; background: rgba(27,26,74,0.35); z-index: 200`. Hidden in `splitMode`.
- Panel: `position: fixed; top/right/bottom: 16px; width: 460–680px; z-index: 210; border-radius: var(--radius-xl)`.
- Body background: `linear-gradient(180deg, #F8F9FC 0%, #F0F1F8 100%)` (solid; **not** glassmorphism for inner content).
- Framer Motion: `initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}` with `EASE_OUT_EXPO`.
- Mobile (≤768px): full-screen with safe-area insets, no border-radius.
- Escape closes; internal state resets after a 400ms delay.
- `splitMode` prop suppresses backdrop and lets the parent reflow main content beside the panel (used by `BranchOverview`).

### 11.4 Glassmorphism recipe (overlays / cards on the map)

Background `linear-gradient(145deg, rgba(255,255,255,0.78) 0%, rgba(246,247,251,0.72) 100%)`; border bright top/left for 3D light direction; `backdrop-filter: blur(24px)`; inset shadow `0 1px 0 rgba(255,255,255,0.5) inset`; hover `translateY(-3px)`.

### 11.5 Modal primitive (`src/components/Modal.jsx`)

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

Behaviour contract (the audit called this file **exemplary** — match this template if you ever build another modal):

- **Portal.** Renders into `document.body` so it escapes any transformed / overflow-clipped slide-in panel that hosts the trigger. `role="dialog"` + `aria-modal="true"` + auto-generated `aria-labelledby` (use the `title` prop) on the inner surface.
- **Focus.** On open, captures `document.activeElement` and moves focus to the first focusable element inside the dialog (falls back to the dialog container if none). On close, restores focus to the previously focused element. Tab / Shift+Tab cycle inside the dialog (focus trap).
- **Escape.** Calls `onClose` and fires `preventDefault + stopPropagation + nativeEvent.stopImmediatePropagation()` so outer slide-in panels do NOT also close.
- **Backdrop dismiss.** Requires `mousedown` AND `mouseup` both on the backdrop element (`e.target === e.currentTarget`). Prevents drag-out misfires.
- **Body scroll lock.** `document.body.style.overflow = 'hidden'` while open; restores the previous value on close.
- **Z-index.** Backdrop at `1000` — sits above slide-in panels (panel z-index `210`).
- **Animation.** AnimatePresence wraps in / out. Backdrop fades; surface scales `0.96 → 1` + slides `12 → 0`, easing `EASE_OUT_EXPO`, 250ms.
- **Mobile.** Surface goes full-screen with safe-area insets; border-radius collapsed.
- **SSR safety.** Returns `null` when `typeof document === 'undefined'`.

Tests live alongside the component (`Modal.test.jsx`).

### 11.6 Iconography, map

**Icon system.** Inline SVG line icons, `stroke="currentColor"`, `strokeWidth="1.75"`, 24×24 viewBox. Containers: `background: rgba(41,40,103,0.06); border: 1px solid var(--color-lavender); border-radius: var(--radius-md)`. Shared icon set in `src/dashboard/shared/Icons.jsx`. Some icons live in the SVG sprite at `public/icons.svg` and are referenced via `<use href="/icons.svg#name" />`. Never emojis, icon fonts, or icon libraries. Decorative SVGs next to text labels must have `aria-hidden="true"`.

**Map (Distributor).** Full-bleed `react-leaflet` + CartoDB Positron tiles. GeoJSON in `public/uganda-districts.geojson` (clipped to region polygons via `scripts/clip-districts.mjs` using `@turf/turf`) + `public/uganda-regions.geojson`. Region colours: Central `#5E63A8`, Eastern `#2F8F9D`, Northern `#3D3C80`, Western `#7B7FC4`. Soft bokeh glow halos at region centroids. `flyTo`/`fitBounds` on drill-down. See audit F10/F11 — the GeoJSON fetch is eager (not gated by drill level); §12b.

### 11.7 Known drift (audit findings F17–F21, F25)

The token system was implemented tactically — covering the highest-traffic surfaces — but only reached ~30% of the codebase. The audit catalogued the drift:

- **668 hardcoded indigo refs.** `#292867` / `rgba(41,40,103,*)` should reference `--color-indigo` / `--shadow-*` (F17). This is the largest single drift class.
- **109 hardcoded hex outside the indigo family.** Mostly KYC status colors (`#1f6e44`, `#8B5A00`, `#876300`, `#b22834`, `#B8860B`, `#c47c00`, `#FB7185`) in `ReviewStep.module.css`, `NiraStep.module.css`, `PendingReviewStep.module.css`, `AgentFallbackStep.module.css` — no tokens exist for these (F18).
- **9 ad-hoc easing curves.** `easeInOut` / `easeOut` strings in `LivenessStep`, `BranchDashboardShell`, `CreateAgent`, `IdUploadStep` instead of the shared `EASE_OUT_EXPO` constant (F21).
- **One representative cosmetic drift.** Hardcoded `#fff` in `CTA.module.css:144` should be `--color-white` (F25).

These are cleanups, not bugs. Surface drift, not behaviour drift. The fix path is incremental — promote KYC status colors to tokens first (high frequency), settle on a single `.input` primitive, and migrate the indigo references file-by-file. **Not a rewrite.**

---

## 12. Demo-scope & known issues

### 12a. Demo scope (by design — do NOT "fix")

These behaviours are intentional limits of a sales-rep demo platform. Do not propose real SMS / payment / KYC / audit / compliance integrations as TODOs — that is explicitly out of scope per CLAUDE.md §10a. The audit re-confirmed every item below.

- **`VITE_USE_SUPABASE` rollback flag.** Read once at module load (`src/services/api.js` → `IS_SUPABASE_ENABLED`). When the env var is the literal string `'false'`, every service falls back to a `mockData`-backed branch (entities, commissions, subscriber, agent, kyc, chat, search, contact). Lets demos run offline / without backend.
- **Per-session mutation stores.** `entities._entityOverrides` (branch status flips, branch/agent creates) and `subscriber._sessionMutations` (contributions, withdrawals, schedule edits, nominees, claims) layer over frozen `mockData.js` for the duration of the tab. Resets on refresh — intentional for the demo's "what-if" flows.
- **`MOCK_NOW = new Date(2026, 4, 22)`** in `src/data/mockData.js` (currently 2026-05-22; rolled forward in the last audit pass). Consumed by `commissions.js` and surfaced via `currentTime()`. Anchors every "due in N days" and settlement timestamp so demo data tells a coherent story. Slide it forward when relative dates start looking stale — today is 2026-05-26, well within tolerance. Note: audit D16 flags `mockData.js` lines 259–264 + 346 where `nextDueDate` math uses `Date.now()` (wall-clock) instead of `MOCK_NOW` — known inconsistency.
- **Mocked chat.** `getChatResponse`, `getAgentReply`, `getSubscriberChatResponse` POST to `/api/chat`; the route returns keyword-matched mock replies. The local fallback (under `VITE_USE_SUPABASE=false`) is identical.
- **Mocked KYC.** All 8 KYC services (`assessImageQuality`, `extractIdFields`, `verifyNira`, `sendOtp`, `verifyOtp`, `faceMatch`, `screenAml`, `referToAgent`) are Smile ID v2-shaped mocks with realistic latency. QA force-overrides via `localStorage['upensions_<stage>_force']` are intentional for demo failure-path walkthroughs.
- **Demo OTP.** `verifyOtp(phone, code, role)` accepts any 6-digit code — see BACKEND.md §15a for the route detail; the frontend service surfaces the response unchanged. No rate limiting, no lockout.
- **`demo_personas` fallback IDs.** Unknown phones resolve to `a-001` / `b-kam-015` / `d-001` so every demo login succeeds even if persona seed drifts.
- **Hardcoded UGX 1,000 unit price.** Lives in `trg_transactions_contribution` (BACKEND.md). No real fund NAV.
- **24h JWT, no refresh.** Fixed TTL is fine for short demo sessions (BACKEND.md §5).

### 12b. Real bugs / cleanups (audit findings — see report.md for line-level detail)

These are real issues from the synthesis report, listed here so anyone touching frontend code knows what already-known drift looks like. Severity follows the audit's scale (high = real bug or correctness risk; med = real cleanup; low = nice-to-have).

**StubPage placeholders.** `/dashboard/settings/notifications` and `/dashboard/settings/security` are `StubPage title="..."` shells. If a demo touches Settings these dead-ends are visible.

| ID | Severity | Where | What |
| --- | --- | --- | --- |
| F1 | med | `src/agent-dashboard/shell/PageHeader.jsx` | Imports `goBackOrFallback` from `../../subscriber-dashboard/shell/navigation` — the **only** cross-role import in the codebase. Promote to `src/utils/navigation.js` to break it. |
| F2 | med | `src/contexts/SignInContext.jsx:9` | Provider `value` object rebuilt every render. Wrap in `useMemo`. |
| F3 | med | `src/contexts/ToastContext.jsx:54` | Provider `value` not memoized — every consumer re-renders on every toast change. |
| F4 | low | `src/contexts/BranchScopeContext.jsx:12`, `AgentScopeContext.jsx:10` | Provider `value` not memoized. |
| F5 | low | `src/contexts/DashboardPanelContext.jsx` | Carries subscriber-specific menu fields (`subscriberMenuOpen`, `viewSubscribersOpen`) visible to branch/distributor dashboards. Scope or rename. |
| F6 | med | `src/contexts/DashboardNavContext.jsx:171–183` | `goToLevel` `useCallback` depends on `location.pathname` — rebuilt every navigation. |
| F7 | med | `src/contexts/AuthContext.jsx:94–97` | `onAuthExpired` listener `useEffect` has `[]` deps; captures stale `logout` / `navigate` closures. |
| F8 | med | `src/subscriber-dashboard/pages/HelpPage.jsx:91–98`, `AgentPage.jsx:72–87` | Render-time `setState` seeds initial messages, but the effect deps array omits `seeded` / `seedKey`. Duplicate-seed risk on subscriber swap. |
| F9 | med | `HelpPage.jsx:115–125`, `AgentPage.jsx:103–113` | Async chat responses (`setTimeout` ~900–1100ms) update state without an unmount guard. |
| F10 | med | `src/dashboard/map/UgandaMap.jsx:89–98` | 180KB `uganda-districts.geojson` fetched synchronously on every Distributor mount; not gated by drill level. Lazy / cache. |
| F11 | low | `src/dashboard/map/UgandaMap.jsx:135–177` | GeoJSON re-parsed / re-styled on every `selectedRegion` / `selectedDistrict` change; per-feature style callbacks not cached. |
| F12 | low | `src/components/Navbar.jsx:60, 106` | Inline arrow handlers on buttons — minor. |
| F13 | med | `src/hooks/useEntity.js:168` | `queryKey: ['breadcrumb', currentLevel, selectedIds]` — `selectedIds` object identity unstable; cache thrashes. |
| F14 | low | `src/hooks/useEntity.js` | `useUpdateBranch` / `useSetBranchStatus` optimistic-mutation pattern is correct but undocumented as the canonical template. |
| F15 | low | `src/signup/SignupContext.jsx:204` | Persist effect writes to localStorage on every state change (30+ writes during signup, no batching). |
| F16 | med | `src/components/signin/PasswordEntry.module.css` | `.input` height 56px + `font-display`; rest of repo uses 48px + `font-body` — drift. |
| F17 | med | repo-wide | **668 hardcoded `#292867` / `rgba(41,40,103,*)`** should reference `--color-indigo` / `--shadow-*`. |
| F18 | med | KYC step CSS | KYC status colors (`#1f6e44`, `#8B5A00`, `#876300`, `#b22834`, `#B8860B`, `#c47c00`, `#FB7185`) have no tokens. |
| F19 | med | repo-wide | **26 distinct `@media` breakpoints** (320/360/374/380/400/420/480/500/540/599/600/640/720/768/900/960/1024/1180px). No shared scale. |
| F20 | med | repo-wide | **12 `.input` definitions** drift across feature modules. Promote to a single primitive. |
| F21 | low | 9 sites | Framer Motion uses ad-hoc `easeInOut` / `easeOut` instead of shared `EASE_OUT_EXPO`. |
| F22 | med | `agent-dashboard/shell/PageHeader.jsx` vs `subscriber-dashboard/shell/PageHeader.jsx` | ~1-line diff. Either promote to `src/components/PageHeader.jsx` or fully duplicate. |
| F23 | med | `src/dashboard/DashboardShell.jsx:86–97` | Escape-listener `useEffect` captures unmemoised `onClose` prop in closure. |
| F24 | low | `src/dashboard/sidebar/Sidebar.jsx:263–281` | Three separate document-click listeners; each state change re-attaches. |
| F25 | low | `src/components/CTA.module.css:144` | Hardcoded `#fff` should be `--color-white`. Representative of many cosmetic drifts. |
| F26 | low | subscriber + agent `CoPilotWidget.jsx` | Two near-mirror co-pilot widgets; structurally similar with role-specific reply logic. Document as intentional or consolidate chrome. |
| F27 | low | `src/services/entities.js` `_syncCache` | In-memory sync cache used by `DashboardNavContext` for synchronous lookups during URL routing; first navigation can return `null`. |
| F28 | low | `src/dashboard/commissions/CommissionPanel.jsx:222–246` | Multiple `useMemo` filters on `agentList` / `disputedAgents`; if lists grow large (>1K), filter recomputes on scope change. |

**Cross-cutting bugs / awareness items** (audit X-prefix, manifested on the frontend):

- **X6 (high)** — `src/services/supabaseClient.js:67–74` silently falls back to `http://localhost:54321` if `VITE_SUPABASE_URL` is missing, and `'public-anon-key'` if `VITE_SUPABASE_ANON_KEY` is missing. A misconfigured Vercel preview/prod ships a broken app with no loud error.
- **X11 / X17 (med)** — every service has a `IS_SUPABASE_ENABLED=false` mock branch; **none are tested**. Output-shape compatibility with the real branch is unverified.
- **X12 (med)** — `useSubscriber.useSubscriberTransactions` keys `[id, filters]`; agent-side variants drop `filters`. Cross-context cache key drift.
- **X13 (low)** — `pages/Contact.jsx` doesn't validate `{ submitted, id }` response shape from `/api/contact`.
- **X15 (low)** — `src/services/api.js:22` hardcodes `'/api'`; `VITE_API_BASE_URL` is read by `src/config/env.js` but never consumed.

**Testing gaps (audit T2 / T5 / T6).** Most service files (`api`, `subscriber`, `agent`, `chat`, `kyc`, `search`, `contact`, `supabaseClient`) and all four stateful hooks (`useEntity`, `useCommission`, `useSubscriber`, `useAgent`) have **zero unit tests**. `signInWithPassword`, `changePassword`, `AuthError`, and the extended `messageForCode` (8 password-related codes) added in the password rollout are untested. The E2E suite (Playwright) catches happy-path regressions but not contract-shape regressions inside services / hooks.

**Stale doc claim** (audit X3) — earlier revisions of this section claimed agent-side `disputeCommission` returned a "not built" error. **That is stale.** The `agent_dispute_line` RPC was added in migration 0014, and `services/commissions.disputeCommission(_, _, by='agent')` calls it successfully. Removed from this list.

**Closed items log (2026-05-05 audit).** Stale JSDoc fixed in `ContributionRoute.jsx` + `auth.js`; `MOCK_NOW` extracted from `commissions.js` to `mockData.js`; KYC-incomplete gate wired in `SignInModal.handleVerify` via `isSignupComplete()`; decorative `↓`/`→` arrows in `TimeJourney` made `aria-hidden`; hardcoded `#f2f3f7` in `UgandaMap.module.css` replaced with `var(--color-cloud)`.

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

## 13. Accessibility baseline

The audit confirmed **0 anti-pattern hits** on the two highest-leverage rules — no `outline: none` without paired `:focus-visible`, and no `transition: all`. ARIA coverage is solid. This is a baseline worth preserving.

- **Focus visibility.** Global `:focus-visible` baseline in `index.css` (2px `var(--color-indigo-soft)` outline + 2px offset). Per-control overrides exist for `button:focus-visible` / `a:focus-visible`. Never `outline: none` without a `:focus-visible` replacement or a `:focus-within` ring on the parent.
- **Transitions.** Never `transition: all` — always list properties explicitly.
- **Reduced motion.** `<MotionConfig reducedMotion="user">` in `main.jsx`. CSS `prefers-reduced-motion` media query in `index.css` for non-Framer animations.
- **Modals & drawers.** `Modal.jsx` (§11.5) is the exemplar — portal + focus trap + Escape + body scroll lock + focus restore. Drawers use `overscroll-behavior: contain` to prevent background scroll bleed.
- **Icon-only buttons.** Must have `aria-label`. `title` alone is not sufficient.
- **Form inputs.** `aria-label` or associated `<label>`; correct `type` / `inputMode` / `autoComplete`; `spellCheck={false}` on OTP / phone.
- **Touch targets.** `touch-action: manipulation` set globally on buttons + links. Minimum 44px height on mobile.
- **Skip link.** `index.html` has a `<a href="#main" class="skip-link">` anchor. `<main id="main">` is on `App.LandingPage`, `BranchDashboardShell`, `SubscriberShell`, and agent `AgentShell`. The skip-link CSS in `index.css` uses `:focus-visible` to translate it on-screen.
- **Typography.** `text-wrap: balance` on headings. `font-variant-numeric: tabular-nums` on number / stat displays. Use the literal `…` character (U+2026), not three dots — JSX text does NOT resolve `\u` escapes.
- **Images.** All `<img>` need explicit `width` and `height`. Below-fold images use `loading="lazy"`.
- **Large lists.** `content-visibility: auto` with `contain-intrinsic-size` (applied in `ViewBranches` / `ViewAgents` / `ViewSubscribers`). Use `useVirtualizer` from `@tanstack/react-virtual` for lists over a few hundred items.
- **Decorative icons.** SVGs that are purely decorative (next to a text label) must have `aria-hidden="true"`.
- **Live regions.** Drill-level changes are announced via an `aria-live="polite"` `NavAnnouncer` in `DashboardShell`. Signup step transitions move focus into the new step container (`mainRef` in `SignupShell`).

---

## 14. Performance posture

- **Manual vendor chunks** (vendor-leaflet / -charts / -motion / -tanstack / -router / -react) keep the landing page bundle small — see §1. `chunkSizeWarningLimit: 700` is intentionally higher than Vite's 500 default for routes that legitimately carry recharts or leaflet.
- **Lazy-loaded dashboard shells.** All four shells (`DashboardShell`, `BranchDashboardShell`, `AgentDashboardShell`, `SubscriberDashboardShell`) are `React.lazy()`-imported from `App.jsx`. `SignupPage` is also lazy. Each sub-page inside the agent + subscriber shells is independently lazy (so e.g. `HomePage` paints without paying for `AnalyticsPage`).
- **Memoization conventions.** Every list page memoizes filters with `useMemo`; mutation hooks return memoized callbacks; map drill state derives from URL via `useMemo`. The four context-value gaps in §12b (F2–F5) are the only audit-flagged exceptions.
- **`useEntityMetrics` / `useChildrenMetrics` / `useAllEntitiesMetrics`** are the canonical paths for the 8-field metrics rollup. `getDistributorMetrics` was retired in PR-2 — every caller now uses `useEntityMetrics('country', 'ug')`, which routes through `getEntityMetricsRollup` → `get_entity_metrics_rollup` RPC. One round-trip replaces the old 4-call fan-out.
- **Loading + empty primitives.** `SkeletonRow` (variants: `avatar` / `compact` / `card`) + `EmptyState` (`kind: 'no-data' | 'no-match'`) form a triad with `useQuery` — every list-style view panel exposes loading → empty (zero data) → empty (filter mismatch). Phase 1 wired differentiated copy across all view panels.
- **Known performance issues** — see §12b for line-level detail.
  - **F10** — `UgandaMap.jsx` fetches the 180KB `uganda-districts.geojson` synchronously on every Distributor mount, not gated by drill level. Lazy / cache.
  - **F13** — `useBreadcrumb` cache-key thrashes because `selectedIds` object identity is unstable.
  - **F11** — GeoJSON re-parsed / re-styled on every region or district change.

---

## 15. Shared utilities, constants & component subdirs

### 15.1 `src/utils/` (8 files)

| File | Key exports |
| --- | --- |
| `finance.js` | `MONTHLY_RATE`, `ANNUAL_RATE`, `FREQUENCY` constants, `FREQUENCY_LABEL`, `normalizeFrequency`, `periodsPerYear`, `monthlyEquivalent`, `parseAmount`, `calcFV`, `formatUGX`, `formatUGXExact`, `fmtShort`, `sliderToAmt`, `amtToSlider`, `EASE_OUT_EXPO`. Legacy `formatUGX*` / `fmtShort` are re-exported here for back-compat; **new code should import `formatUGX` / `formatNumber` / `formatUGXShort` from `utils/currency.js` instead**. |
| `currency.js` | `formatUGX(value, { compact? = true })` (compact `'UGX 1.2M'` / exact `'UGX 50,000'` — non-positive → `'—'` in compact mode, `'UGX 0'` in exact), `formatNumber(value)` (locale-grouped count `'12,345'` — non-finite → `'0'`), `formatUGXShort(value)` (axis-label form `'1.2M'`, no UGX prefix). Single source of truth for money rendering. |
| `date.js` | `formatDate(value, { variant? = 'short' })`. Variants: `short` `'8 Apr 2026'` · `long` `'8 April 2026'` · `time` `'14:32'` · `month-year` `'April 2026'` · `short-month-year` `'Apr 2026'` · `day-month` `'8 Apr'`. Accepts `Date | ISO string | epoch ms`; returns `'—'` for unparseable / null input (UI never shows "Invalid Date"). |
| `dashboard.js` | `getInitials` (defensive), `getTrend`, `perfLevel` |
| `csv.js` | `toCsv(rows, columns)`, `toCsvStream(rows, columns)` (async-iterable), `MAX_ROWS`, `downloadCSV(filename, headers, rows)` legacy. RFC 4180 escape + OWASP formula-injection defence (`= + - @ \t \r` prefixed with `'` and quote-wrapped) + UTF-8 BOM. |
| `csvDownload.js` | `downloadCsv({ rows, columns, filename, isMobile?, onCapNotice? })`, `dateStampedFilename(slug)`, `MOBILE_ROW_CAP = 5000`, `STREAM_THRESHOLD = MAX_ROWS`. Composes `toCsv` / `toCsvStream` with the browser-side Blob + hidden `<a download>` trigger; caps mobile exports at 5,000 rows and fires `onCapNotice({ capped, total })` so callers can surface a toast without coupling the util to a toast context. Untested at unit layer (audit T7). |
| `phone.js` | `parseUGPhoneLocal`, `isValidUGPhone`, `formatUGPhone`, `toCanonicalUGPhone` (9-digit local, valid prefixes `70/71/74/75/76/77/78`, canonical storage `+256XXXXXXXXX`) |
| `settlementCycle.js` | `CADENCES`, `cadenceLabel`, `cadenceShortLabel`, `nextCycleEnd`, `cycleWindow`, `formatCycleLabel`, `formatPayoutDate`, `groupCommissionsByPaidCycle`. Untested at unit layer (audit T7). |

**Frequency normalisation rule:** ALWAYS pass schedules through `normalizeFrequency(value)` — defends against legacy aliases (`half-yearly`, `halfYearly`, `semi-annually`, `semiAnnually`).

### 15.2 `src/constants/` (3 files)

| File | Exports |
| --- | --- |
| `levels.js` | `LEVELS`, `LEVEL_ORDER`, `CHILD_LEVEL`, `PARENT_LEVEL`, `LEVEL_TO_SEGMENT`, `SEGMENT_TO_LEVEL` |
| `savings.js` | `RETIREMENT_AGE` (60), `START_AGE` (25), `MIN_CONTRIBUTION` (5000), `MIN_WITHDRAW` (5000), `INSURANCE_PREMIUM_MONTHLY` (2000), `INSURANCE_COVER` (1000000), `QUICK_CONTRIBUTION_AMOUNTS` |
| `signup.js` | `OCCUPATIONS`, `RELATIONSHIPS`, `GENDERS` (id/label pairs for onboarding selects) |

### 15.3 `src/config/env.js`

`API_BASE_URL`, `IS_DEV`, `IS_PROD`, plus public marketing URLs (`LEGAL_TERMS_URL`, `LEGAL_PRIVACY_URL`, `SUPPORT_WHATSAPP_URL`, `SUPPORT_WHATSAPP_DISPLAY`, `SUPPORT_EMAIL`) and `MAP_TILE_URL` (default CartoDB Positron). The audit (X5) flagged that `.env.local.example` is missing 6 of these `VITE_*` keys — listed in cross-cutting cleanup.

### 15.4 Shared component subdirs under `src/components/`

| Subdir | Files | Purpose |
| --- | --- | --- |
| `contribution/` | `ContributionSettingsForm.jsx` (339 lines) + module CSS | Reusable schedule form (frequency + amount + split + insurance + summary + sticky footer). Used by subscriber `SchedulePage`, agent `SubscriberSchedulePage`, and `OnboardScheduleStep`. Parent must guard render until `initial` is loaded. |
| `signin/` | `RoleSelect`, `DistributorSelect`, `PhoneEntry`, `OtpVerify`, `PasswordEntry` | Sign-in modal sub-steps. **`PasswordEntry.module.css` drifts from the rest of the repo's `.input` style** (56px vs 48px, `font-display` vs `font-body`) — audit F16, listed in §12b. |
| `reports/` | `ExportButton`, `FilterSelect`, `ReportTable`, `SearchFilter` | Distributor + Subscriber report views share these primitives. |
| `feedback/` | `ErrorCard` | Friendly error rendering used by KYC steps + agent shell. |

### 15.5 Loading + empty primitives (top-level `src/components/`)

- **`SkeletonRow.jsx`** — virtualised-row placeholder. Props: `count = 8`, `variant ∈ { 'avatar' | 'compact' | 'card' }` (default `'avatar'`), `label = 'Loading…'` (accessible busy label for `role="status"`), optional `className`. Each row mirrors a real list item (avatar + two text lines + small numeric block — or a card-shaped stat strip in `'card'` variant). Shimmer reuses the same lavender→white sweep + `EASE_OUT_EXPO` as MetricsRow's skeleton, so every loading state in the dashboard reads as one system; `prefers-reduced-motion` halts the sweep.
- **`EmptyState.jsx`** — list/grid empty-state. Props: `kind ∈ { 'no-data' | 'no-match' }` (mandatory; drives icon + default copy), `title?`, `body?`, `cta?: { label, onClick, icon? }`, `icon?` (override), `className?`. Distinguishes a genuinely empty source (`no-data`) from a non-empty source filtered to zero (`no-match` — "No matches — try adjusting your search or filters"). Pair with `SkeletonRow` so each panel exposes loading → empty (zero data) → empty (filter mismatch).

### 15.6 `src/dashboard/shared/` (Distributor + Branch reuse)

`Stars`, `KpiCard`, `Demographics`, `MiniChart`, `TrendArrow`, `Icons`.

### 15.7 Per-session mutation stores (mock fallback)

- `entities._entityOverrides` — `setBranchStatus`, `updateBranch`, `createBranch`, `createAgent` layer over frozen mockData.
- `subscriber._sessionMutations` — contributions, withdrawals, schedule edits, nominees, insurance, profile, claims layer over frozen mockData. Reset on page reload.

---

## 16. Testing layout

**Setup.** Vitest 4 + jsdom + Testing Library. Config inside `vite.config.js`. Global setup: `src/test/setup.js` imports `@testing-library/jest-dom`. Supabase mocked via the queue-backed `src/test/supabaseMock.js` (`makeSupabaseMock()` exposes `__queueFrom(table, result)` and `__queueRpc(name, result)` for FIFO seeding).

| Test file | Subject | Approx lines |
| --- | --- | --- |
| `src/services/__tests__/commissions.test.js` | Commission service: rate, summary, agent list/detail, run lifecycle, dispute flow | 577 |
| `src/services/__tests__/entities.test.js` | Entity reads + writes, branch/agent create, breadcrumb | 298 |
| `src/utils/__tests__/phone.test.js` | UG phone parse/format/validate/canonicalise | 81 |
| `src/utils/__tests__/dashboard.test.js` | `getInitials`, `getTrend`, `perfLevel` | 73 |
| `src/utils/__tests__/finance.test.js` | Frequency normalisation, `parseAmount`, `calcFV`, `formatUGX*`, slider helpers | 64 |
| `src/utils/__tests__/currency.test.js` | `formatUGX`, `formatNumber`, `formatUGXShort` edge cases | ~75 |
| `src/utils/__tests__/date.test.js` | All `formatDate` variants + `'—'` fallback | ~60 |
| `src/utils/__tests__/csv.test.js` | RFC 4180 + OWASP formula-injection defence | ~110 |
| `src/components/Modal.test.jsx` | Portal, focus trap, Escape, backdrop dismiss, scroll lock | ~140 |
| `src/hooks/useDebouncedValue.test.js` | Fake timers; `delayMs` normalization; cancellation | ~80 |

Plus `src/test/__tests__/jwt-claim-contract.test.js`, `password.test.js`. **12 unit-test files total, ~1,400 lines.** The modules covered are covered thoroughly. Modules **not** covered (audit T2 / T5 / T6): `src/services/auth.js` (full), `api.js`, `subscriber.js`, `agent.js`, `chat.js`, `kyc.js`, `search.js`, `contact.js`, `supabaseClient.js`, plus the four stateful hooks (`useEntity`, `useCommission`, `useSubscriber`, `useAgent`). The password rollout (`signInWithPassword`, `changePassword`, `AuthError`, 8 extended `messageForCode` codes) is entirely untested at unit level.

**Conventions for new tests.** Prefer service-level tests (we already mock supabase-js); component tests should mount with `<QueryClientProvider>` + `<MemoryRouter>` + any required scope provider. Use `vi.mock('../supabaseClient', () => ({ supabase: makeSupabaseMock(), ... }))` per file (the mock key must match the import string the source file uses).

**E2E suite.** 24 specs under `e2e/`, mobile + desktop projects, role-pre-minted JWTs in `e2e/.auth/`, GitHub Actions workflow. Invoke via `npm run test:e2e` or the `/qa` skill. See `.claude/skills/qa.md`.

---

## 17. CSV export

`src/utils/csv.js`:

```js
export function toCsv(rows, columns)
export function toCsvStream(rows, columns)        // async-iterable for >MAX_ROWS
export function downloadCSV(filename, headers, rows)  // legacy
export const MAX_ROWS
```

- RFC 4180 escaping (wraps cells in quotes when they contain commas / quotes / newlines; doubles embedded quotes).
- OWASP formula-injection defence: cells starting with `=`, `+`, `-`, `@`, `\t`, `\r` are prefixed with a single quote and quote-wrapped (Excel/Sheets/LibreOffice).
- UTF-8 BOM (`﻿`) prepended for Excel compatibility.

`src/utils/csvDownload.js` is the higher-level wrapper (Blob + hidden `<a download>` + mobile row cap + cap-notice callback). Filenames include a date stamp (e.g. `all-transactions_2026-05-26.csv`) via `dateStampedFilename(slug)`.

**Callers:**

| File | Purpose |
| --- | --- |
| `src/dashboard/overlay/TopBar.jsx` | Distributor top-right "Download" button — exports the currently visible drill level |
| `src/dashboard/reports/views/*.jsx` (11 reports) | Per-report CSV download with date-stamped filename |
| `src/subscriber-dashboard/reports/views/*.jsx` (5 reports) | Subscriber report CSVs |

---

## 18. Product & brand context

**Mission.** Universal Pensions is a digital long-term savings + pension platform for everyday Ugandans — informal workers, gig workers, farmers, self-employed. The goal is making formal retirement products feel approachable, building trust through clarity, and supporting multiple distribution + contribution models (subscriber direct, employer-managed, agent-led).

**Brand personality.** Dependable · intelligent · modern · stable · human · future-facing.

**Primary colour: `#292867` Universal Indigo.** Anchor for key headings, primary buttons, hero emphasis, important icons.

**Supporting palette.** Deep Night `#1B1A4A` · Soft Indigo `#5E63A8` · Mist Lavender `#D9DCF2` · Cloud `#F6F7FB` · Slate Text `#2F3550` · Cool Gray `#8A90A6` · Success Green `#2E8B57` · Accent Teal `#2F8F9D`.

**Colour rules.** Indigo carries the primary identity. Do not use red as a major brand colour — reserve for error/destructive/critical only. Neutrals + soft tints for spaciousness. Teal/green sparingly for positive states.

**Typography.** Display: Plus Jakarta Sans (headings, hero numbers, buttons). Body: Inter. Avoid stylised / artsy fonts. Headings `font-weight: 800; letter-spacing: -0.03em; color: var(--color-indigo)`.

**Visual style.** Bold clean headings · large readable numbers · smooth card surfaces · restrained gradients · subtle depth · consistent iconography · motion tied to meaning. Avoid noisy visuals, decorative complexity, neobank flashiness.

**Animation philosophy.** Animation is a meaning layer — communicates time passing, money growing steadily, milestones reached, confidence building. Smooth, editorial/studio-grade. Use `EASE_OUT_EXPO` for entrance; staggered children 0.05–0.1s; item reveal `{ opacity: 0, y: 12–24 } → { opacity: 1, y: 0 }`; `AnimatePresence mode="wait"` for step transitions.

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
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system architecture: layered patterns, role boundaries, auth model, write/realtime patterns
- [`docs/role-permissions.md`](./docs/role-permissions.md) — role × capability matrix
- [`docs/data-model.md`](./docs/data-model.md) — full entity hierarchy with field definitions
