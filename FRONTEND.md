# FRONTEND.md — Universal Pensions Uganda

Deep frontend reference for the React 19 + Vite 6 + CSS Modules + Framer Motion + React Router 7 + TanStack Query 5 codebase. This is a **demo / sales-presentation tool**, not a production fintech — demo-scope behaviours (mocked OTP, mocked KYC, `VITE_USE_SUPABASE` fallback, per-session mutation stores, `MOCK_NOW`) are intentional.

See `CLAUDE.md` for the slim entry index, `BACKEND.md` for SQL/RPC/RLS detail, and `docs/*` for the role × capability matrix and field-level data model.

---

## 1. Build & dev

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
| `npm run seed` | Seed Supabase via `scripts/seed-supabase.mjs` (see BACKEND.md §12) |

**`vite.config.js` highlights:**

- Path aliases: `@` → `./src`, plus `@components`, `@contexts`, `@dashboard`, `@data`, `@utils`.
- Manual vendor chunks: `vendor-leaflet` · `vendor-charts` (recharts+d3) · `vendor-motion` (framer-motion) · `vendor-tanstack` · `vendor-router` · `vendor-react` (react + scheduler + tightly-coupled runtime). React is chunked separately to prevent `forwardRef` undefined errors after hash shifts.
- `chunkSizeWarningLimit: 700` (kB) — headroom for recharts/leaflet routes.
- Vitest block lives in the same config: `globals: true`, `environment: 'jsdom'`, `setupFiles: './src/test/setup.js'`, CSS modules use `classNameStrategy: 'non-scoped'`.

**No Tailwind.** All styling is CSS Modules (`.module.css` per component, ~114 files). Global design tokens live in `src/index.css`; no component-library imports.

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
  hooks/                          7 hooks (useEntity, useCommission, useSubscriber,
                                  useAgent, useIsMobile, useOutsideClick, useCountUp)
  contexts/                       8 contexts; SignupContext lives in src/signup/
  utils/                          finance, dashboard, csv, phone, settlementCycle
                                  + __tests__/
  components/                     Landing + shell-level (Navbar, Hero, Footer,
                                  SignInModal, Toast, ErrorBoundary, etc.) +
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

## 2. App entry & provider stack

`src/main.jsx` mounts a React 19 root with this provider order:

| Wrapper | Purpose |
| --- | --- |
| `StrictMode` | Double-invokes effects in dev to surface bugs |
| `BrowserRouter` | URL routing (React Router 7) |
| `QueryClientProvider` | Single TanStack Query client (defaults below) |
| `AuthProvider` | Reads `upensions_auth` from localStorage; listens to `onAuthExpired` |
| `ToastProvider` | Toast queue (max 3 visible, auto-dismiss) |
| `MotionConfig reducedMotion="user"` | Respects `prefers-reduced-motion` |
| `<App />` + `<ToastContainer />` | App tree, toast portal renders as a peer |

`SignInProvider` wraps the `<Routes>` tree **inside** `App` so `SignInModal` overlays any page.

**React Query defaults** (set in `main.jsx`):

| Option | Value |
| --- | --- |
| `staleTime` | 5 min |
| `gcTime` | 10 min |
| `refetchOnWindowFocus` | `false` |
| `retry` | 1 |

---

## 3. Routing model

**Top-level routes (`src/App.jsx`):**

| Path | Element | Notes |
| --- | --- | --- |
| `/` | `LandingPage` | Navbar + Hero + HowItWorks + TimeJourney + ForYou + Trust + CTA + Footer + StickyMobileCTA |
| `/about` | `pages/About.jsx` | Marketing page |
| `/faq` | `pages/FAQ.jsx` | Marketing page |
| `/contact` | `pages/Contact.jsx` | Posts to `services/contact.js` |
| `/signup/*` | `signup/SignupPage` (lazy) | KYC flow + contribution sub-flow |
| `/dashboard/*` | `ProtectedDashboard` (lazy) | Dispatches by role |
| `/coming-soon` | `ComingSoon` | Role-based placeholder for employer/admin |

**Sign-in modal:** rendered outside `<Routes>` (inside `SignInProvider`) so it can overlay any page.

**`ProtectedDashboard` dispatch:** unauthenticated → `Navigate to="/"`; no built dashboard → `/coming-soon`; otherwise pick a shell by `role`:

| Role | Shell |
| --- | --- |
| `'distributor'` (default) | `src/dashboard/DashboardShell.jsx` |
| `'branch'` | `src/branch-dashboard/BranchDashboardShell.jsx` |
| `'agent'` | `src/agent-dashboard/AgentDashboardShell.jsx` |
| `'subscriber'` | `src/subscriber-dashboard/SubscriberDashboardShell.jsx` |

**Routed vs panel UI:** Subscriber and Agent dashboards use **routed sub-pages** (each destination is a URL under `/dashboard/*`). Distributor and Branch dashboards use **state-based slide-in panels** managed by `DashboardPanelContext` (intentional — drill-down overlays are not destinations).

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

**Hard rule:** components and dashboard files must NEVER import `src/data/mockData.js` directly. Only files in `src/services/` may.

**Rollback flag:** `IS_SUPABASE_ENABLED` (exported from `src/services/api.js`) reads `import.meta.env.VITE_USE_SUPABASE`. Default ON; set the env var to the literal string `false` to flip every service into its mock-backed branch. Pattern across services:

```js
export async function getEntity(level, id) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getEntity(level, id);
  // ...supabase.from(...).select(...)
}
```

**Per-service overrides over frozen mockData:** under `IS_SUPABASE_ENABLED=false`, both `entities.js` and `subscriber.js` keep an in-memory `Map` (`_entityOverrides` / `_sessionMutations`) so writes (status flips, contributions, schedule edits, withdrawals) layer on top of the frozen seed for the demo session. Lost on refresh — see §16a.

---

## 5. Service layer reference (`src/services/` — 11 files)

### 5.1 `api.js` — base HTTP client

```js
export const IS_SUPABASE_ENABLED  // boolean (VITE_USE_SUPABASE !== 'false')
export function onAuthExpired(handler): () => void
export async function apiFetch(path, options): Promise<any>
export const api = { get, post, put, delete }
```

Same-origin `/api/*` wrapper around `fetch`. Injects `Authorization: Bearer <upensions_token>` from localStorage. On HTTP 401 clears auth keys and notifies all `onAuthExpired` listeners (consumed by `AuthContext`). Thrown errors carry `code`, `status`, and `body`.

### 5.2 `supabaseClient.js` — supabase-js singleton

```js
export const supabase    // createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
export function getToken(): string | null
export function setToken(token): void   // writes upensions_token
export function clearToken(): void
```

`auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }` — we manage our own JWTs. `global.headers` is a **function** that re-reads `localStorage` on every request so token rotation is picked up without recreating the client.

### 5.3 `auth.js` — sign-in flow

```js
export class AuthError extends Error { code; retryAfterSeconds? }
export const DASHBOARD_ROLES = ['distributor', 'branch', 'subscriber', 'agent']
export async function sendOtp(phone, role)
export async function verifyOtp(phone, otp, role): Promise<{ token, user }>
export function hasDashboard(role): boolean
```

Dev-only QA force-overrides via `localStorage['upensions_otp_force']` (`invalid_otp` / `rate_limited` / `locked`). `verifyOtp` returns `{ token, user: { role, phone, name?, subscriberId?, agentId?, branchId?, distributorId? } }`.

### 5.4 `entities.js` — hierarchy CRUD (Distributor + Branch dashboards)

```js
export async function getCountry()
export async function getEntity(level, id)
export async function getChildren(parentLevel, parentId)
export async function getAllAtLevel(level)
export async function getAllAtLevelMap(level)
export async function getParent(level, id)
export async function getTopPerformingBranch(level, parentId)
export async function getBreadcrumb(currentLevel, selectedIds)
export function getEntitySync(level, id)   // sync — used by DashboardNavContext
export async function getDistributorMetrics()
export async function createBranch(payload)
export async function createAgent(payload)
export async function updateBranch(id, patch)
export async function setBranchStatus(id, status)
```

Returns camelCase shape; Supabase rows are mapped via internal `mapRegion / mapDistrict / mapBranch / mapAgent / mapDistributor` helpers. `LEVEL_TABLES.distributor = 'distributors'` and `LEVEL_MAPPERS.distributor = mapDistributor` wire the new level into the generic `getEntity` / `getAllAtLevel` path. Mock fallback reads `COUNTRY/REGIONS/DISTRICTS/BRANCHES/AGENTS/DISTRIBUTORS` from `mockData.js` (`LEVELS.DISTRIBUTOR = 'distributor'` constant added; `getParentEntity` short-circuits `distributor → COUNTRY`) plus the in-memory `_entityOverrides` Map.

`getDistributorMetrics()` returns the national-singleton rollup — `Promise.all` of `getAllAtLevel('subscriber' | 'agent' | 'branch')` plus a `subscriber_balances` aggregate for AUM. Mock-fallback path returns `aum: 0` with an `aumNote` string so the UI can render a "AUM unavailable in mock" pill. Exposed as `useDistributorMetrics()` hook (§6.1); cached under `['distributor-metrics']` with a 5-minute staleTime.

### 5.5 `commissions.js` — commission state machine (~30+ exports, 1490 lines)

**Reads:**

```js
getNetworkCadence() · setNetworkCadence(cadence)
getCommissionRate() · setCommissionRate(amount)
getCommissionSummary(branchId = null)
getEntityCommissionSummary(level, entityId)   // returns
   // { totalPaid, totalDue, totalDisputed, countPaid, countDue, countDisputed,
   //   total, countTotal, settlementRate }
getAgentCommissionList(statusFocus)
getAgentCommissionDetail(agentId)
getCommissionSubscribers(agentId, filter)
getDisputedAgentList()
getCurrentRun() · getRunById(runId) · listRuns({ limit, branchId })
getRunForBranch(runId, branchId)
getRunBranchBreakdown(runId) · getRunBranchAgents(runId, branchId)
```

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
   // by='branch' → branchDisputeLine; by='agent' → currently throws "agent
   //   dispute path not yet built (no agent_dispute_line RPC)" — see §16b.
approveDispute(commissionId, { outcomeReason, resolvedBy })
rejectDispute(commissionId, { outcomeReason, resolvedBy })
bulkApproveDisputes(commissionIds, options)
bulkRejectDisputes(commissionIds, options)
withdrawDispute(commissionId)
confirmCommission(commissionId)   // agent-side maker-checker
```

`invalidateSummaryCache()` clears the legacy memo cache (now a no-op when Supabase is on; React Query is canonical).

### 5.6 `subscriber.js` — per-session mutation store + Supabase reads/writes

```js
export async function getCurrentSubscriber(phone)
export async function getSubscriberTransactions(id, { type, range, status })
export async function getSubscriberClaims(id)
export async function getSubscriberNominees(id)
export async function getSubscriberAgent(subscriberId)
export async function makeAdHocContribution(id, { amount, retirementPct, method })
export async function requestWithdrawal(id, ...)
export async function submitClaim(id, payload)
export async function updateContributionSchedule(id, schedule)
export async function updateNominees(id, { pension, insurance })
export async function updateInsuranceCover(id, { cover, premiumMonthly })
export async function updateProfile(id, updates)
export async function createFromSignup(payload)             // RPC create_subscriber_from_signup
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

Every call returns a `tracking_id` correlating stages of one onboarding job. **QA force-overrides** via `localStorage['upensions_<stage>_force']` (forwarded as the `X-QA-Force` header). Mock fallback honours the same flags.

### 5.9 `chat.js` — keyword-matched chat (mocked)

```js
export async function getChatResponse(message)         // distributor/branch
export async function getAgentReply(message, agent)    // subscriber ↔ agent DM
export async function getSubscriberChatResponse(msg)   // subscriber co-pilot
```

POSTs to `/api/chat` (JWT-optional; the route flavours by role). All three return a plain string (route also returns `suggestions[]` but callers render a single bubble).

### 5.10 `search.js`

```js
export async function searchEntities(query): Promise<Array<{ id, name, level, label, parentId }>>
```

Wraps the `search_entities` PG RPC (pg_trgm fuzzy). Hardcoded max 8 results. Mock fallback scans `REGIONS/DISTRICTS/BRANCHES/AGENTS`.

### 5.11 `contact.js`

```js
export async function submitContactForm({ name, email, message }): Promise<{ ok, demo, id? }>
```

POSTs to `/api/contact`. Returns `demo: false` on real persistence, `demo: true` under the rollback flag (or in dev when `/api/*` is unreachable).

---

## 6. Hooks reference (`src/hooks/` — 7 files)

### 6.1 `useEntity.js`

| Hook | Query key | Notes |
| --- | --- | --- |
| `useCountry()` | `['country']` | Top-level metrics |
| `useEntity(level, id)` | `['entity', level, id]` | Single entity |
| `useCurrentEntity(level, selectedIds)` | derived | Walks `selectedIds` to current level |
| `useChildren(level, parentId)` | `['children', level, parentId]` | |
| `useAllEntities(level)` | `['allEntities', level]` | |
| `useAllEntitiesMap(level)` | `['allEntitiesMap', level]` | Lookup by id |
| `useTopBranch(level, parentId)` | `['topBranch', level, parentId]` | |
| `useBreadcrumb(currentLevel, selectedIds)` | derived | |
| `useSearch(query)` | `['search', query]` | Debounced in caller (pair with `useDebouncedValue`, §6.8) |
| `useDistributorMetrics()` | `['distributor-metrics']` | National-singleton rollup. `Promise.all` of `getAllAtLevel('subscriber' \| 'agent' \| 'branch')` + a `subscriber_balances` AUM aggregate. `staleTime: 5min`. Mock-fallback path returns `aum: 0` plus an `aumNote` so the UI can render a "AUM unavailable in mock" pill without breaking the layout. Consumed by the Distributor home shell + Settings header. |
| `useCreateBranch()` · `useCreateAgent()` · `useUpdateBranch()` · `useSetBranchStatus()` | mutations | Invalidate `['allEntities', level]` + ancestors |

### 6.2 `useCommission.js` — 30+ exports

Reads use `['commissionSummary', branchId]`, `['agentCommissions', focus]`, `['agentCommissionDetail', agentId]`, `['commissionSubscribers', agentId, filter]`, `['disputedAgents']`, `['entityCommissionSummary', level, entityId]`, `['currentRun']`, `['settlementRun', runId]`, `['settlementRunsList', { limit, branchId }]`, `['runForBranch', runId, branchId]`, `['runBranchBreakdown', runId]`, `['runBranchAgents', runId, branchId]`, `['networkCadence']`, `['commissionRate']`.

Mutations: `useApproveDispute`, `useRejectDispute`, `useBulkApproveDisputes`, `useBulkRejectDisputes`, `useWithdrawDispute`, `useBranchDisputeLine`, `useOpenRun`, `useCancelRun`, `useBranchApproveLine`, `useBranchHoldLine`, `useBranchApproveAll`, `useMarkBranchReviewed`, `useReleaseRun`, `useReleaseBranch`, `useConfirmCommission`, `useDisputeCommission`, `useSetCommissionRate`, `useSetNetworkCadence`.

**Invalidation rule:** every mutation calls `invalidateAll(queryClient)`, which invalidates the full set `ALL_RUN_KEYS + ALL_COMMISSION_KEYS`. Coarse but safe — commission state changes ripple through every summary.

### 6.3 `useSubscriber.js`

| Hook | Query key |
| --- | --- |
| `useCurrentSubscriber()` | `['subscriber', phone]` |
| `useSubscriberTransactions(id, filters)` | `['subscriberTransactions', id, filters]` |
| `useSubscriberClaims(id)` | `['subscriberClaims', id]` |
| `useSubscriberNominees(id)` | `['subscriberNominees', id]` |
| `useSubscriberAgent(id)` | `['subscriberAgent', id]` |
| `useMakeContribution(id)` · `useRequestWithdrawal(id)` · `useUpdateSchedule(id)` · `useUpdateNominees(id)` · `useSubmitClaim(id)` · `useUpdateInsuranceCover(id)` · `useUpdateProfile(id)` | mutations |

All mutations call `invalidateSubscriber()` (from `services/subscriber.js`) which clears every `['subscriber*', ...]` key.

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

---

## 7. Contexts reference (9 — 8 in `src/contexts/`, 1 in `src/signup/`)

| Context | Provider scope | What it holds | Read by |
| --- | --- | --- | --- |
| `AuthContext` | `main.jsx` (whole app) | `{ user, role, isAuthenticated, login, logout, updateUser }` + localStorage persist (`upensions_auth`); subscribes to `onAuthExpired` from `api.js` | All shells, SignInModal, every page that needs identity |
| `SignInContext` | `App.jsx` (inside Routes) | `{ isOpen, open, close }` for SignInModal | Navbar, CTA, sign-in trigger buttons |
| `ToastContext` | `main.jsx` | `{ toasts, addToast, removeToast }` (max 3 visible, auto-dismiss) | Every form/mutation; rendered via `<ToastContainer />` |
| `DashboardContext` | `DashboardShell` / `BranchDashboardShell` | **Composes** `DashboardNavProvider` + `DashboardPanelProvider`; exposes merged `useDashboard()` for back-compat | Distributor + Branch dashboards |
| `DashboardNavContext` | inside `DashboardContext` | URL-derived drill state `{ level, selectedIds, section, reportId }` + `drillDown / drillUp / goToLevel / reset` + `drillTargetBranchId/AgentId` + `onPanelActionRef` | Sidebar, Map, OverlayPanel, Breadcrumb |
| `DashboardPanelContext` | inside `DashboardContext` | Submenu toggles + panel open states (`createBranchOpen`, `viewBranchesOpen`, `createAgentOpen`, `viewAgentsOpen`, `viewSubscribersOpen`, `commissionsOpen`, `viewReportsOpen`, `settingsOpen`) + `reportContext` + `closeAllPanels()`. Registers setters into `DashboardNavContext.onPanelActionRef` on mount. | Distributor + Branch panels. **Agent dashboard does NOT consume this** (fully routed). |
| `BranchScopeContext` | `BranchDashboardShell` only | `{ branchId }` for descendants | ViewAgents, ViewReports, CommissionPanel when rendered inside Branch tree |
| `AgentScopeContext` | `AgentDashboardShell` only | `{ agentId }` for descendants | All agent pages + home widgets + CoPilot |
| `SignupContext` (`src/signup/SignupContext.jsx`) | `SignupPage` only | `useReducer` + localStorage persist (`uganda-pensions-signup`); File/Blob fields stripped on serialise. Single `patch(payload)` + `reset()`. Mints `onboardingSessionId` (crypto.randomUUID) | All 11 signup steps + contribution sub-flow + agent OnboardKycFlow |

**Cross-context handoff — `onPanelActionRef` pattern:** `DashboardNavProvider` exposes a ref; `DashboardPanelProvider` writes `{ setViewBranchesOpen, setViewAgentsOpen, … }` into it on mount. Map drill-down effects + overlay clicks invoke `onPanelActionRef.current?.setViewBranchesOpen(true)` so nav can drive panel state without a circular import or cyclic provider order.

---

## 8. Dashboard variants — 4 built (employer/admin shell dirs not yet created)

### 8.1 Distributor Admin — `src/dashboard/`

| Field | Value |
| --- | --- |
| Shell | `DashboardShell.jsx` |
| Entry guard | `ProtectedDashboard` default branch (`hasDashboard(role)` true and role not in branch/agent/subscriber) |
| Scope context | none (`useBranchScope().branchId === null` → network-wide) |
| Sub-areas | sidebar/, map/, overlay/, cards/, branch/, agent/, subscriber/, commissions/, reports/ (+ views/), settings/, shared/ |

Routes are URL-driven drill levels (`/dashboard/regions/:id`, `/dashboard/districts/:id`, `/dashboard/branches/:id`, `/dashboard/agents/:id`, `/dashboard/subscribers/:id`, `/dashboard/reports[/:reportId]`) parsed by `DashboardNavContext.parsePath`. Slide-in panels (`ViewBranches`, `ViewAgents`, `ViewSubscribers`, `CommissionPanel`, `ViewReports`, `Settings`, `CreateBranch`, `CreateAgent`) are state-based via `DashboardPanelContext`. Map → panel handoff via `onPanelActionRef`. `CommissionPanel.jsx` (1682 lines) uses **replace-model** navigation — single panel swaps content with breadcrumb trail.

### 8.2 Branch Admin — `src/branch-dashboard/`

| Field | Value |
| --- | --- |
| Shell | `BranchDashboardShell.jsx` |
| Entry guard | `role === 'branch'` else `Navigate to="/coming-soon"`; `MissingBranchIdScreen` if `branchId` absent |
| Scope context | `BranchScopeProvider(branchId)` + `DashboardProvider` |
| Sub-areas | sidebar/, overview/, agent/ |

Single main view `BranchOverview` (no drill-down). Side panels reuse Distributor `ViewAgents`, `CommissionPanel`, `ViewReports`, `Settings` plus local `CreateAgent`, rendered with `splitMode` (backdrop suppressed; main reflows). `BranchHealthScore.jsx` (533 lines) — score gauge 0–100 from weighted formula (retention 30%, avg/subscriber 25%, agent activity 25%, growth 20%) + insights + contribution chart + embedded AI chat. `BranchSettlementBanner` surfaces open settlement runs.

**Mobile drawer (`BranchDashboardShell` + `BranchSidebar`).** On viewports ≤768px the sidebar is hidden and a `MobileHeader` + Framer slide-in `MobileDrawer` take over. The drawer slides in `x: '-100%' → 0` with `EASE_OUT_EXPO` over 320ms, locks body scroll, closes on Escape, and auto-closes on route change (a `useEffect` watching `location.pathname`). `BranchSidebar` now accepts `mode='desktop'|'drawer'` + `onNavigate` — drawer mode renders a full-width vertical menu and invokes `onNavigate` after each item click so the drawer dismisses itself.

### 8.3 Agent — `src/agent-dashboard/`

| Field | Value |
| --- | --- |
| Shell | `AgentDashboardShell.jsx` (routed pages, mobile-first) |
| Entry guard | `role === 'agent'` else `Navigate to="/coming-soon"`; `MissingAgentIdScreen` if `agentId` absent |
| Scope context | `AgentScopeProvider(agentId)`; **no `DashboardProvider`** (no panel state) |
| Sub-areas | shell/ (SideNav + BottomTabBar + PageHeader), home/ (HomePage + widgets/), onboarding/, pages/ |

Routes under `/dashboard/*`: `/` (HomePage) · `/onboard` · `/subscribers` · `/subscribers/:id` · `/subscribers/:id/schedule` · `/analytics` · `/commissions[/:view]` · `/settings`. Home: 2 widgets — `PortfolioPulseCard` (dark indigo hero, count-up, cadence-aware "Next payout" via `cycleWindow()`) + `CoPilotWidget`. CommissionsPage owns cadence editor (`upensions_agent_settlement_cadence` localStorage) and **automatic settlement on cadence** — bulk "Request settlement" CTA was retired. KYC rule: every subscriber is KYC-verified by definition (no reminders, no filters).

### 8.4 Subscriber — `src/subscriber-dashboard/` (~70%)

| Field | Value |
| --- | --- |
| Shell | `SubscriberDashboardShell.jsx` (routed pages) |
| Entry guard | `role === 'subscriber'` else `Navigate to="/dashboard"` |
| Sub-areas | shell/ (SideNav + BottomTabBar + PageHeader + navigation.js), home/ (HomePage + 6 widgets/), pages/, reports/views/ |

Routes: `/` · `/save` · `/save/schedule` · `/withdraw` · `/withdraw/savings` · `/withdraw/claim` · `/projection` · `/activity` (redirects to `/reports/all-transactions`) · `/reports[/:reportId]` · `/agent` · `/help` · `/settings[/profile|/nominees|/insurance|/notifications|/security]`. 6 home widgets: `PulseCard`, `TopUpWidget`, `ProjectionWidget`, `IfYouNeedItWidget` (desktop only), `ActivityWidget`, `CoPilotWidget`. **`/settings/notifications` + `/settings/security` are `StubPage` placeholders** (see §16b). Reports under `reports/views/`: AllTransactions, ContributionsSummary, WithdrawalsHistory, InsuranceStatement, AnnualStatement. All mutations are optimistic via the `_sessionMutations` log in `subscriber.js`.

---

## 9. Signup / KYC flow

**Route:** `/signup/*`, lazy-loaded from `App.jsx`. State container: `SignupContext` in `src/signup/` (lives outside `src/contexts/` because it's flow-scoped).

**Steps (`SignupShell.STEPS`, in order):**

| # | id | Step | KYC service call |
| --- | --- | --- | --- |
| 1 | `id-upload` | IdUploadStep — front + back capture, inline quality check | `assessImageQuality`, `extractIdFields` |
| 2 | `review` | ReviewStep — OCR auto-fill + manual override | — |
| 3 | `nira` | NiraStep — silent NIRA match | `verifyNira` |
| 4 | `otp` | OtpStep — SMS OTP (any 6-digit code in demo) | `kyc.sendOtp` / `kyc.verifyOtp` |
| 5 | `liveness` | LivenessStep — selfie + face match, one retry | `faceMatch` |
| 6 | `aml` | AmlStep — silent sanctions / compliance | `screenAml` |
| 7 | `beneficiaries` | BeneficiariesStep — pension + optional insurance beneficiaries | — |
| 8 | `consent` | ConsentStep — plain-English summary + timestamp | — |
| 9 | `done` | ActivatedStep — success screen, member ID card | — |

**Terminal states (outside the numbered sequence; freeze progress ring at `pausedAt`, hide back button):**

| id | Trigger | Component |
| --- | --- | --- |
| `agent` (`AGENT_STEP`) | NIRA or liveness failure | AgentFallbackStep |
| `pending-review` (`PENDING_REVIEW_STEP`) | AML flag | PendingReviewStep |

**SignupContext persistence (`SignupContext.jsx`):**

- `useReducer` (`patch` / `reset`) + `useEffect` writing to `localStorage['uganda-pensions-signup']` on every state change.
- Lazy initialiser reads persisted state; ephemeral fields are re-nulled on rehydrate.
- **EPHEMERAL_KEYS** dropped on serialise: `idFrontFile`, `idBackFile`, `selfieFile`, `idFrontPreviewUrl`, `idBackPreviewUrl`. User re-uploads on refresh; OCR result + phone + beneficiaries + consent + KYC outcomes survive.
- `onboardingSessionId` minted via `crypto.randomUUID()` (fallback to time+random) — backend uses it to correlate every KYC stage.
- `isSignupComplete()` (in `src/signup/signupState.js`) returns `state.consent === true`. Used by `SignInModal.handleVerify` to send subscribers with incomplete KYC back to `/signup` instead of `/dashboard`.

**Contribution sub-flow (`/signup/contribution`):**

- `ContributionRoute.jsx` — route entry. Renders inside `SignupFlow` when the pathname ends with `/contribution` so step-state is preserved.
- `ContributionSettings.jsx` (552 lines) — frequency (weekly/monthly/quarterly/half-yearly/annually via `FREQUENCY` constants), amount, retirement/emergency split.
- `PaymentStep.jsx` — initial funding step.
- On confirm: patches `contributionSchedule` into `SignupContext` → calls `createFromSignup(payload)` (RPC `create_subscriber_from_signup`, see BACKEND.md §9) which mints the real subscriber row + JWT → `auth.login({ token, user })` → `navigate('/dashboard')`.

---

## 10. Commission UI patterns

| Surface | File | Pattern |
| --- | --- | --- |
| Distributor `CommissionPanel` | `src/dashboard/commissions/CommissionPanel.jsx` (1682 lines) | Slide-in. **Replace-model nav**: home → agents (filter paid/due) → agent-detail → subscribers \| disputed-agents → dispute-detail \| settlement-requests → request-detail. Single panel swaps content with breadcrumb trail. Accepts `splitMode` prop |
| Branch reuse | imported into `BranchDashboardShell` with `splitMode` | Backdrop suppressed; reflows main beside |
| Agent `CommissionsPage` | `src/agent-dashboard/pages/CommissionsPage.jsx` | Routed page. Home view: Payout-schedule card (cadence + next payout + total) with inline edit (Weekly Friday / Bi-weekly Friday / Monthly 1st), summary strip, Earned/Owed cards, Needs Attention (Confirm receipts + Disputes), Past cycles history grouped by paid month/week. Sub-routes `:view ∈ {earned, owed, confirm, disputes}` |

**Cadence persistence (agent):** `upensions_agent_settlement_cadence` in localStorage via helpers in `src/utils/settlementCycle.js`. `cycleWindow(cadence, ref)` → `{ start, end }`; `nextCycleEnd`, `formatCycleLabel`, `formatPayoutDate`, `groupCommissionsByPaidCycle` exported alongside `CADENCES` (`WEEKLY_FRIDAY`, `BIWEEKLY_FRIDAY`, `MONTHLY_FIRST`).

**Maker-checker:** Admin `settleCommissions` flips status `due → released`; agent confirms via `confirmCommission` (idempotent). Agent-side automatic settlement on cadence means the bulk "Request settlement" CTA has been retired; the service-layer `requestCommissionSettlement` is still exported for future server-driven cycle jobs.

**State machine RPCs:** see BACKEND.md §10 for the full transition table (`due → in_run → [held|disputed] → released → confirmed/paid → rejected`).

---

## 11. Design tokens & UI conventions

**CSS Modules architecture.** ~114 `.module.css` files (one per component). **No Tailwind anywhere.** Global tokens + base styles live in `src/index.css`; Vite resolves `*.module.css` imports as hashed scoped class objects (`import styles from './X.module.css'`).

**Token excerpt (`src/index.css`):**

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

Plus full scales for `--text-xs`…`--text-7xl`, `--space-1`…`--space-32`, `--radius-sm/md/lg/xl/full`, `--shadow-sm/md/lg/xl`. Fonts: `--font-display` (Plus Jakarta Sans), `--font-body` (Inter). Shared easing curve `EASE_OUT_EXPO = [0.16, 1, 0.3, 1]` is exported from `src/utils/finance.js` and mirrored as `--ease-out-expo`.

**Slide-in panel conventions (Distributor + Branch):**

- Backdrop: `position: fixed; inset: 0; background: rgba(27,26,74,0.35); z-index: 200`. Hidden in `splitMode`.
- Panel: `position: fixed; top/right/bottom: 16px; width: 460–680px; z-index: 210; border-radius: var(--radius-xl)`.
- Body background: `linear-gradient(180deg, #F8F9FC 0%, #F0F1F8 100%)` (solid; **not** glassmorphism for inner content).
- Framer Motion: `initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}` with `EASE_OUT_EXPO`.
- Mobile (≤768px): full-screen with safe-area insets, no border-radius.
- Escape closes; internal state resets after a 400ms delay.
- `splitMode` prop suppresses backdrop and lets the parent reflow main content beside the panel (used by `BranchOverview`).

**Glassmorphism recipe (overlays/cards on the map):** background `linear-gradient(145deg, rgba(255,255,255,0.78) 0%, rgba(246,247,251,0.72) 100%)`; border bright top/left for 3D light direction; `backdrop-filter: blur(24px)`; inset shadow `0 1px 0 rgba(255,255,255,0.5) inset`; hover `translateY(-3px)`.

**Modal primitive (`src/components/Modal.jsx`).** Single shared dialog used by every confirm / destructive-action surface — `CommissionsPage` dispute modal, `CommissionPanel` dispute-resolution + line-action + run-release modals, `ViewBranches` confirm-status. Always prefer this over a bespoke fixed-position div.

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

Behaviour contract:

- **Portal.** Renders into `document.body` so it escapes any transformed / overflow-clipped slide-in panel that hosts the trigger. `role="dialog"` + `aria-modal="true"` + auto-generated `aria-labelledby` (use the `title` prop) on the inner surface.
- **Focus.** On open, captures `document.activeElement` and moves focus to the first focusable element inside the dialog (falls back to the dialog container if none). On close, restores focus to the previously focused element. Tab / Shift+Tab cycle inside the dialog (focus trap).
- **Escape.** Calls `onClose` and fires `preventDefault + stopPropagation + nativeEvent.stopImmediatePropagation()` so outer slide-in panels do NOT also close.
- **Backdrop dismiss.** Requires `mousedown` AND `mouseup` both on the backdrop element (`e.target === e.currentTarget`). Prevents drag-out misfires — selecting text in a textarea that releases over the backdrop will not dismiss.
- **Body scroll lock.** `document.body.style.overflow = 'hidden'` while open; restores the previous value on close.
- **Z-index.** Backdrop at `1000` — sits above slide-in panels (panel z-index `210`), so a modal opened from inside a panel covers the panel correctly.
- **Animation.** AnimatePresence wraps in / out. Backdrop fades; surface scales `0.96 → 1` + slides `12 → 0`, easing `EASE_OUT_EXPO`, 250ms. Consumers do NOT wire their own enter/exit transitions — just toggle `open`.
- **Mobile.** Surface goes full-screen with safe-area insets; border-radius collapsed. Backdrop padding adjusts via CSS module breakpoint.
- **SSR safety.** Returns `null` when `typeof document === 'undefined'`.

Use this primitive **always** for confirm-style flows. Slide-in panels (drill-down detail, edit-in-place forms) still use the panel pattern — Modal is reserved for short-lived decisions where the trigger surface should remain visually beneath the dialog. Tests live alongside the component (`Modal.test.jsx`).

**Icon system:** inline SVG line icons, `stroke="currentColor"`, `strokeWidth="1.75"`, 24×24 viewBox. Containers: `background: rgba(41,40,103,0.06); border: 1px solid var(--color-lavender); border-radius: var(--radius-md)`. Shared icon set in `src/dashboard/shared/Icons.jsx`. Some icons live in the SVG sprite at `public/icons.svg` and are referenced via `<use href="/icons.svg#name" />`. Never emojis, icon fonts, or icon libraries.

**Map (Distributor):** full-bleed `react-leaflet` + CartoDB Positron tiles. GeoJSON in `public/uganda-districts.geojson` (clipped to region polygons via `scripts/clip-districts.mjs` using `@turf/turf`) + `public/uganda-regions.geojson`. Region colours: Central `#5E63A8`, Eastern `#2F8F9D`, Northern `#3D3C80`, Western `#7B7FC4`. Soft bokeh glow halos at region centroids. `flyTo`/`fitBounds` on drill-down.

---

## 12. Shared utilities, constants & component subdirs

**`src/utils/` (8 files):**

| File | Key exports |
| --- | --- |
| `finance.js` | `MONTHLY_RATE`, `ANNUAL_RATE`, `FREQUENCY` constants, `FREQUENCY_LABEL`, `normalizeFrequency`, `periodsPerYear`, `monthlyEquivalent`, `parseAmount`, `calcFV`, `formatUGX`, `formatUGXExact`, `fmtShort`, `sliderToAmt`, `amtToSlider`, `EASE_OUT_EXPO`. **Note:** legacy `formatUGX*` / `fmtShort` are re-exported here for back-compat; **new code should import `formatUGX` / `formatNumber` / `formatUGXShort` from `utils/currency.js` instead** (see below). |
| `currency.js` | `formatUGX(value, { compact? = true })` (compact `'UGX 1.2M'` / exact `'UGX 50,000'` — non-positive → `'—'` in compact mode, `'UGX 0'` in exact), `formatNumber(value)` (locale-grouped count `'12,345'` — non-finite → `'0'`), `formatUGXShort(value)` (axis-label form `'1.2M'`, no UGX prefix). Single source of truth for money rendering. The ~117 codemod hits during Phase 1 replaced ad-hoc `Math.round(n).toLocaleString('en-UG')` snippets with these helpers. |
| `date.js` | `formatDate(value, { variant? = 'short' })`. Variants: `short` `'8 Apr 2026'` · `long` `'8 April 2026'` · `time` `'14:32'` · `month-year` `'April 2026'` · `short-month-year` `'Apr 2026'` · `day-month` `'8 Apr'`. Accepts `Date \| ISO string \| epoch ms`; returns `'—'` for unparseable / null input (UI never shows "Invalid Date"). |
| `dashboard.js` | `getInitials` (defensive), `getTrend`, `perfLevel` |
| `csv.js` | `toCsv(rows, columns)`, `toCsvStream(rows, columns)` (async-iterable), `MAX_ROWS`, `downloadCSV(filename, headers, rows)` legacy. RFC 4180 escape + OWASP formula-injection defence (`= + - @ \t \r` prefixed with `'` and quote-wrapped) + UTF-8 BOM. |
| `csvDownload.js` | `downloadCsv({ rows, columns, filename, isMobile?, onCapNotice? })`, `dateStampedFilename(slug)`, `MOBILE_ROW_CAP = 5000`, `STREAM_THRESHOLD = MAX_ROWS`. Composes `toCsv` / `toCsvStream` with the browser-side Blob + hidden `<a download>` trigger; caps mobile exports at 5,000 rows and fires `onCapNotice({ capped, total })` so callers can surface a toast without coupling the util to a toast context. Used by Distributor `ReportView`, `CommissionPanel` agent-detail download, and the wired-up Phase 1 Export CSV buttons. |
| `phone.js` | `parseUGPhoneLocal`, `isValidUGPhone`, `formatUGPhone`, `toCanonicalUGPhone` (9-digit local, valid prefixes `70/71/74/75/76/77/78`, canonical storage `+256XXXXXXXXX`) |
| `settlementCycle.js` | `CADENCES`, `cadenceLabel`, `cadenceShortLabel`, `nextCycleEnd`, `cycleWindow`, `formatCycleLabel`, `formatPayoutDate`, `groupCommissionsByPaidCycle` |

**Frequency normalisation rule:** ALWAYS pass schedules through `normalizeFrequency(value)` — defends against legacy aliases (`half-yearly`, `halfYearly`, `semi-annually`, `semiAnnually`).

**`src/constants/` (3 files):**

| File | Exports |
| --- | --- |
| `levels.js` | `LEVELS`, `LEVEL_ORDER`, `CHILD_LEVEL`, `PARENT_LEVEL`, `LEVEL_TO_SEGMENT`, `SEGMENT_TO_LEVEL` |
| `savings.js` | `RETIREMENT_AGE` (60), `START_AGE` (25), `MIN_CONTRIBUTION` (5000), `MIN_WITHDRAW` (5000), `INSURANCE_PREMIUM_MONTHLY` (2000), `INSURANCE_COVER` (1000000), `QUICK_CONTRIBUTION_AMOUNTS` |
| `signup.js` | `OCCUPATIONS`, `RELATIONSHIPS`, `GENDERS` (id/label pairs for onboarding selects) |

**`src/config/env.js`:** `API_BASE_URL`, `IS_DEV`, `IS_PROD`, plus public marketing URLs (`LEGAL_TERMS_URL`, `LEGAL_PRIVACY_URL`, `SUPPORT_WHATSAPP_URL`, `SUPPORT_WHATSAPP_DISPLAY`, `SUPPORT_EMAIL`) and `MAP_TILE_URL` (default CartoDB Positron).

**Shared component subdirs under `src/components/`:**

| Subdir | Files | Purpose |
| --- | --- | --- |
| `contribution/` | `ContributionSettingsForm.jsx` (339 lines) + module CSS | Reusable schedule form (frequency + amount + split + insurance + summary + sticky footer). Used by subscriber `SchedulePage`, agent `SubscriberSchedulePage`, and `OnboardScheduleStep`. Parent must guard render until `initial` is loaded |
| `signin/` | `RoleSelect`, `DistributorSelect`, `PhoneEntry`, `OtpVerify` | Sign-in modal sub-steps |
| `reports/` | `ExportButton`, `FilterSelect`, `ReportTable`, `SearchFilter` | Distributor + Subscriber report views share these primitives |
| `feedback/` | `ErrorCard` | Friendly error rendering used by KYC steps + agent shell |

**Loading + empty primitives (top-level `src/components/`):**

- **`SkeletonRow.jsx`** — virtualised-row placeholder. Props: `count = 8`, `variant ∈ { 'avatar' \| 'compact' \| 'card' }` (default `'avatar'`), `label = 'Loading…'` (accessible busy label for `role="status"`), optional `className`. Each row mirrors a real list item (avatar + two text lines + small numeric block — or a card-shaped stat strip in `'card'` variant). Shimmer reuses the same lavender→white sweep + `EASE_OUT_EXPO` as MetricsRow's skeleton, so every loading state in the dashboard reads as one system; `prefers-reduced-motion` halts the sweep. Use as the `isLoading` branch on every list-style view panel so first paint is a "loading" frame rather than a misleading "0 of 0" flash.

- **`EmptyState.jsx`** — list/grid empty-state. Props: `kind ∈ { 'no-data' \| 'no-match' }` (mandatory; drives icon + default copy), `title?`, `body?`, `cta?: { label, onClick, icon? }`, `icon?` (override), `className?`. Distinguishes a genuinely empty source (`no-data` → seed icon, "Nothing here yet") from a non-empty source filtered to zero (`no-match` → search-with-slash icon, "No matches — try adjusting your search or filters"). Pair with `SkeletonRow` so each panel exposes the full triad: loading → empty (zero data) → empty (filter mismatch). Phase 1 wired differentiated copy across all view panels so demos don't confuse "no rows seeded" with "filter typo".

**`src/dashboard/shared/`** (Distributor + Branch reuse): `Stars`, `KpiCard`, `Demographics`, `MiniChart`, `TrendArrow`, `Icons`.

**Per-session mutation stores** (mock fallback):

- `entities._entityOverrides` — `setBranchStatus`, `updateBranch`, `createBranch`, `createAgent` layer over frozen mockData.
- `subscriber._sessionMutations` — contributions, withdrawals, schedule edits, nominees, insurance, profile, claims layer over frozen mockData. Reset on page reload.

---

## 13. Accessibility rules

- **Focus visibility.** Global `:focus-visible` baseline in `index.css` (2px `--color-indigo-soft` outline). Never `outline: none` without a `:focus-visible` replacement or a `:focus-within` ring on the parent.
- **Transitions.** Never `transition: all` — always list properties explicitly.
- **Reduced motion.** `<MotionConfig reducedMotion="user">` in `main.jsx`. CSS `prefers-reduced-motion` media query in `index.css` for non-Framer animations.
- **Modals & drawers.** Escape closes; `overscroll-behavior: contain` prevents background scroll bleed.
- **Icon-only buttons.** Must have `aria-label`. `title` alone is not sufficient.
- **Form inputs.** `aria-label` or associated `<label>`; correct `type` / `inputMode` / `autoComplete`; `spellCheck={false}` on OTP/phone.
- **Touch targets.** `touch-action: manipulation` set globally on buttons + links. Minimum 44px height on mobile.
- **Skip link.** `index.html` has a skip-to-content anchor targeting `#main`. `<main id="main">` is on `App.LandingPage`, `BranchDashboardShell`, `SubscriberShell`, agent `AgentShell`.
- **Typography.** `text-wrap: balance` on headings. `font-variant-numeric: tabular-nums` on number/stat displays. Use the literal `…` character (U+2026), not three dots — JSX text does NOT resolve `\u` escapes.
- **Images.** All `<img>` need explicit `width` and `height`. Below-fold images use `loading="lazy"`.
- **Large lists.** `content-visibility: auto` with `contain-intrinsic-size` (applied in `ViewBranches/ViewAgents/ViewSubscribers`). Use `useVirtualizer` from `@tanstack/react-virtual` for lists over a few hundred items.
- **Decorative icons.** SVGs that are purely decorative (next to a text label) must have `aria-hidden="true"`.
- **Live regions.** Drill-level changes are announced via an `aria-live="polite"` `NavAnnouncer` in `DashboardShell`. Signup step transitions move focus into the new step container (`mainRef` in `SignupShell`).

---

## 14. Testing layout

**Setup:** Vitest 4 + jsdom + Testing Library. Config inside `vite.config.js`. Global setup: `src/test/setup.js` imports `@testing-library/jest-dom`. Supabase mocked via the queue-backed `src/test/supabaseMock.js` (`makeSupabaseMock()` exposes `__queueFrom(table, result)` and `__queueRpc(name, result)` for FIFO seeding).

| Test file | Subject | Approx lines |
| --- | --- | --- |
| `src/services/__tests__/commissions.test.js` | Commission service: rate, summary, agent list/detail, run lifecycle, dispute flow | 577 |
| `src/services/__tests__/entities.test.js` | Entity reads + writes, branch/agent create, breadcrumb | 298 |
| `src/utils/__tests__/phone.test.js` | UG phone parse/format/validate/canonicalise | 81 |
| `src/utils/__tests__/dashboard.test.js` | `getInitials`, `getTrend`, `perfLevel` | 73 |
| `src/utils/__tests__/finance.test.js` | Frequency normalisation, `parseAmount`, `calcFV`, `formatUGX*`, slider helpers | 64 |

**Conventions for new tests:** prefer service-level tests (we already mock supabase-js); component tests should mount with `<QueryClientProvider>` + `<MemoryRouter>` + any required scope provider. Use `vi.mock('../supabaseClient', () => ({ supabase: makeSupabaseMock(), ... }))` per file (the mock key must match the import string the source file uses).

---

## 15. CSV export

`src/utils/csv.js`:

```js
export function downloadCSV(filename, headers, rows): void
```

- RFC 4180 escaping (wraps cells in quotes when they contain commas / quotes / newlines; doubles embedded quotes).
- OWASP formula-injection defence: cells starting with `=`, `+`, `-`, `@`, `\t`, `\r` are prefixed with a single quote and quote-wrapped (Excel/Sheets/LibreOffice).
- UTF-8 BOM (`﻿`) prepended for Excel compatibility.
- Returns nothing — triggers a hidden `<a download>` click; revokes the object URL after 100ms.

**Callers:**

| File | Purpose |
| --- | --- |
| `src/dashboard/overlay/TopBar.jsx` | Distributor top-right "Download" button — exports the currently visible drill level |
| `src/dashboard/reports/views/*.jsx` (11 reports) | Per-report CSV download with date-stamped filename |
| `src/subscriber-dashboard/reports/views/*.jsx` (5 reports) | Subscriber report CSVs |

Filenames include a date stamp (e.g. `all-transactions_2026-04-08.csv`).

---

## 16. Frontend findings

### 16a. Demo scope (by design — do not "fix")

- **`VITE_USE_SUPABASE` rollback flag.** Read once at module load (`src/services/api.js` → `IS_SUPABASE_ENABLED`). When the env var is the literal string `'false'`, every service falls back to a `mockData`-backed branch (entities, commissions, subscriber, agent, kyc, chat, search, contact). Lets demos run offline / without backend.
- **Per-session mutation stores.** `entities._entityOverrides` (branch status flips, branch/agent creates) and `subscriber._sessionMutations` (contributions, withdrawals, schedule edits, nominees, claims) layer over frozen `mockData.js` for the duration of the tab. Resets on refresh — intentional for the demo's "what-if" flows.
- **`MOCK_NOW = new Date(2026, 3, 8)`** in `src/data/mockData.js`, consumed by `commissions.js` and surfaced via `currentTime()`. Anchors every "due in N days" and settlement timestamp so demo data tells a coherent story. Will need to slide forward eventually but is not a TODO.
- **Mocked chat.** `getChatResponse`, `getAgentReply`, `getSubscriberChatResponse` POST to `/api/chat`; the route returns keyword-matched mock replies. The local fallback (under `VITE_USE_SUPABASE=false`) is identical.
- **Mocked KYC.** All 8 KYC services (`assessImageQuality`, `extractIdFields`, `verifyNira`, `sendOtp`, `verifyOtp`, `faceMatch`, `screenAml`, `referToAgent`) are Smile ID v2-shaped mocks with realistic latency. QA force-overrides via `localStorage['upensions_<stage>_force']` are intentional for demo failure-path walkthroughs.
- **Demo OTP.** `verifyOtp(phone, code, role)` accepts any 6-digit code — see BACKEND.md §14a for the route detail; the frontend service surfaces the response unchanged.
- **`/signup/notifications` & `/signup/security` are `StubPage` placeholders.** Re-categorised below in 16b only because they can surface in a Settings-tour demo.

### 16b. Real bugs / awareness items

- **Agent-side `disputeCommission` is not implemented.** `services/commissions.js#disputeCommission(_, _, by='agent')` returns `Promise.reject(new Error('agent dispute path not yet built (no agent_dispute_line RPC); ask the distributor to raise the dispute on your behalf'))`. The Agent dashboard's dispute modal routes through `useDisputeCommission` → this code path → user-visible error mid-demo. Needs `agent_dispute_line` SECURITY DEFINER RPC on the backend (BACKEND.md §14b).
- **Subscriber `/settings/notifications` and `/settings/security` are `StubPage` placeholders.** If a demo touches Settings, these dead-ends are visible.
- **`useDashboard()` (merged) still callable for back-compat.** New code should prefer the narrower `useDashboardNav()` / `useDashboardPanel()` when only one slice is needed.
- **TanStack Virtual lint warnings** on `ViewAgents.jsx`, `ViewBranches.jsx`, `ViewSubscribers.jsx` calling `useVirtualizer` — informational, expected per plugin docs. Safe to ignore.
- **Largest files (size only — candidates for extraction when next touched):**

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

- **Closed items log (2026-05-05 audit):** stale JSDoc fixed in `ContributionRoute.jsx` + `auth.js`; `MOCK_NOW` extracted from `commissions.js` to `mockData.js`; KYC-incomplete gate wired in `SignInModal.handleVerify` via `isSignupComplete()`; decorative `↓`/`→` arrows in `TimeJourney` made `aria-hidden`; hardcoded `#f2f3f7` in `UgandaMap.module.css` replaced with `var(--color-cloud)`. No outstanding cleanups from that pass.

---

## 17. Product & brand context

(Migrated from the bottom of the previous CLAUDE.md — kept here because new product work still needs it.)

**Mission.** Universal Pensions is a digital long-term savings + pension platform for everyday Ugandans — informal workers, gig workers, farmers, self-employed. The goal is making formal retirement products feel approachable, building trust through clarity, and supporting multiple distribution + contribution models (subscriber direct, employer-managed, agent-led).

**Brand personality.** Dependable · intelligent · modern · stable · human · future-facing.

**Primary colour: `#292867` Universal Indigo.** Anchor for key headings, primary buttons, hero emphasis, important icons.

**Supporting palette.** Deep Night `#1B1A4A` · Soft Indigo `#5E63A8` · Mist Lavender `#D9DCF2` · Cloud `#F6F7FB` · Slate Text `#2F3550` · Cool Gray `#8A90A6` · Success Green `#2E8B57` · Accent Teal `#2F8F9D`.

**Colour rules.** Indigo carries the primary identity. Do not use red as a major brand colour — reserve for error/destructive/critical only. Neutrals + soft tints for spaciousness. Teal/green sparingly for positive states.

**Typography.** Display: Plus Jakarta Sans (headings, hero numbers, buttons). Body: Inter. Avoid stylised/artsy fonts. Headings `font-weight: 800; letter-spacing: -0.03em; color: var(--color-indigo)`.

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
- [`docs/role-permissions.md`](./docs/role-permissions.md) — role × capability matrix
- [`docs/data-model.md`](./docs/data-model.md) — full entity hierarchy with field definitions
