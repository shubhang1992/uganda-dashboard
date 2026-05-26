# ARCHITECTURE.md — Universal Pensions Uganda

System architecture for the Uganda Pensions demo platform: the patterns and boundaries that hold across the React app, the Vercel serverless API, and the Supabase database. This doc is **about how the pieces fit together** — not file-level detail. For file-level inventories, see [`FRONTEND.md`](./FRONTEND.md) and [`BACKEND.md`](./BACKEND.md); for the slim orientation index, see [`CLAUDE.md`](./CLAUDE.md).

> **Scope note.** Uganda Pensions is a **sales-rep demo**, not a production fintech. Many decisions captured below (custom HS256 JWT with no refresh, demo-persona fallback IDs, hardcoded UGX 1,000 unit price, mocked KYC/SMS/chat, per-session mutation stores) are intentional demo affordances. This doc documents them honestly and pairs each with a hypothetical production-evolution successor (§10) — it does **not** treat them as roadmap items.

---

## 1. One-page system diagram

The platform is a thin, three-tier stack with a deliberately narrow contract between every pair of layers. Read top-to-bottom:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser tab                                    │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  React 19 SPA (Vite 6, CSS Modules)                                   │  │
│  │  ─────────────────────────────────────────────────────────────────    │  │
│  │  4 role-scoped dashboard shells:                                      │  │
│  │     src/dashboard/             distributor                            │  │
│  │     src/branch-dashboard/      branch                                 │  │
│  │     src/agent-dashboard/       agent      (routed pages)              │  │
│  │     src/subscriber-dashboard/  subscriber (routed pages)              │  │
│  │  Shared shell: src/components/ + src/contexts/ + design tokens        │  │
│  │  Signup flow:  src/signup/  (KYC steps + contribution sub-flow)       │  │
│  │                                                                       │  │
│  │  Data layer:                                                          │  │
│  │     components → hooks (src/hooks/, TanStack Query)                   │  │
│  │                   ↓                                                   │  │
│  │                 services (src/services/, 11 files)                    │  │
│  │                   ↓                                                   │  │
│  │     ┌─── api.js (fetch wrapper, JWT injection, 401 → onAuthExpired)   │  │
│  │     └─── supabaseClient.js (PostgREST + Realtime + RPC)               │  │
│  └───────────────┬───────────────────────────────┬───────────────────────┘  │
│       Authorization: Bearer <jwt>     Authorization: Bearer <jwt>           │
│                   │                       + apikey: <anon_key>              │
└───────────────────┼───────────────────────────────┼─────────────────────────┘
                    │                               │
                    ▼                               ▼
       ┌─────────────────────────────┐  ┌──────────────────────────────────┐
       │ Vercel serverless functions │  │   Supabase PostgREST + Realtime  │
       │ api/ (TypeScript, Node 22)  │  │   (rest/v1 + realtime channels)  │
       │ • api/auth/*       — 4      │  │                                  │
       │ • api/kyc/*        — 8      │  │   Reads: anon client via SDK     │
       │ • api/chat.ts               │  │   Writes: never direct — every   │
       │ • api/contact.ts            │  │     write goes through a         │
       │ • api/_lib/                 │  │     SECURITY DEFINER RPC         │
       │   (jwt, supabase-admin,     │  │                                  │
       │    withAuth, withOptionalAuth)│ └──────────────┬───────────────────┘
       └──────────┬──────────────────┘                  │
                  │ supabase-admin                       │ enforces RLS via
                  │ (service-role key —                 │ auth.jwt() claims
                  │  bypasses RLS,                       │
                  │  used to mint JWT,                   │
                  │  insert contact + referrals)         │
                  ▼                                      ▼
         ┌─────────────────────────────────────────────────────────────────┐
         │                Supabase Postgres (single project)               │
         │  21 tables · 4 ENUMs · pg_trgm · 5 triggers                    │
         │  29 functions (22 public RPCs)                                  │
         │  65 RLS policies (zero auth.uid() calls — all read app_role)   │
         │  supabase_realtime publication: 3 tables ON                     │
         └─────────────────────────────────────────────────────────────────┘
```

**The three crossings, in one line each:**

- **Browser → API.** Same-origin `/api/*` fetch from `src/services/api.js`, carrying a custom HS256 JWT in the `Authorization: Bearer` header.
- **Browser → PostgREST.** `supabase-js` over the anon key + the same custom JWT; reads only (every write would be blocked by RLS without a server-side helper).
- **API → DB.** Vercel functions use the singleton `supabase-admin` (service-role key) which **bypasses RLS**. Used for JWT-mint lookups, contact-form writes, and KYC-referral writes.

Everything else is a refinement of those three boundaries.

---

## 2. Layered architecture

Inside each tier, the work splits into layers with a single responsibility each. The full read/write path for "a subscriber sees their balance" is:

```
React component
   │  (renders <Balance amount={...} />)
   ▼
Custom hook in src/hooks/                      ── TanStack Query: queryKey, cache, invalidation
   │  useCurrentSubscriber() → useQuery(['subscriber', phone], …)
   ▼
Service in src/services/                       ── mock/real branch via IS_SUPABASE_ENABLED
   │  subscriber.getCurrentSubscriber(phone)
   ▼
   ┌────────────────────────────┬─────────────────────────────────┐
   │                            │                                 │
   ▼                            ▼                                 ▼
supabaseClient.js          api.js (fetch)                   src/data/mockData.js
(PostgREST + RPC)          (only used by auth, chat,         (only services may import;
                            contact, KYC, change-password)    components must not)
   │                            │                                 │
   ▼                            ▼                                 │
Supabase PostgREST          Vercel function in api/               │
   │ (RLS enforced)         (api/_lib/jwt verifies bearer)        │
   ▼                            │                                 │
SQL: SELECT through RLS      supabaseAdmin (service-role)         │
or SECURITY DEFINER RPC         │                                 │
                                ▼                                 │
                              SQL ←──────────────────────────────┘
                                                              (mock branch
                                                               stops here;
                                                               never reaches DB)
```

**Why each layer exists:**

| Layer | Purpose | What crosses it | What does NOT cross it |
|---|---|---|---|
| Component / page | Compose UI; bind to hooks | Render data, dispatch user intent | Cache state, fetch primitives, mock data |
| Hook (`src/hooks/`) | Cache shape + invalidation rules; mutation orchestration | TanStack Query keys; `onSuccess` invalidations | `fetch()`, Supabase client, mock data imports |
| Service (`src/services/`) | Backend-shape translation + rollback flag (mock branch) | Backend rows ↔ camelCase UI shapes; `IS_SUPABASE_ENABLED` branch | Component refs, hook state, React context |
| `api.js` / `supabaseClient.js` | Transport primitives | HTTP / PostgREST / RPC calls; auth header injection; 401 propagation | Domain knowledge, optimistic updates |
| Vercel function (`api/`) | Server-side enforcement (signing, RLS bypass) | Validated body → `supabaseAdmin` → response envelope | Frontend state, React imports |
| RPC (SECURITY DEFINER) | Atomic multi-table writes; business invariants | Multiple table mutations in one transaction; role check via `auth.jwt() ->> 'app_role'` | Untrusted input without `_validate_signup_payload` |
| Table | Storage + RLS check | Row data | Direct client writes (RLS blocks everything that isn't an RPC) |

The layering is **not** decorative — each boundary blocks a class of mistake. Components can't accidentally hit `fetch`. Hooks can't accidentally hit `mockData`. The API can't accidentally write through the anon path. RLS can't accidentally trust the wrong JWT claim (see §6).

---

## 3. Hook ↔ service boundary

This is the one frontend rule that has the most bite, and it's the rule the audit most thoroughly verified (Phase 1E in [`report.md`](../report.md) §2.1 "Frontend wins worth preserving" + Theme E §4).

**The rule, three parts:**

1. **Components never call services directly.** They consume hooks. The hook owns the React Query key + the invalidation rules.
2. **Hooks never call `fetch` (or `supabase.*`) directly.** They call a service function. The service owns the shape translation + the mock/real branch.
3. **Services never reach back into hooks or React context.** Services are pure functions of `(args, IS_SUPABASE_ENABLED, localStorage)` → `Promise<data>`.

**Canonical example — subscriber balance lookup:**

```js
// 1. Component
function BalanceCard() {
  const { data } = useCurrentSubscriber();  // hook
  return <div>{formatUGX(data?.balance)}</div>;
}

// 2. Hook (src/hooks/useSubscriber.js)
export function useCurrentSubscriber() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['subscriber', user?.phone],
    queryFn: () => subscriberService.getCurrentSubscriber(user.phone),
    enabled: !!user?.phone,
  });
}

// 3. Service (src/services/subscriber.js)
export async function getCurrentSubscriber(phone) {
  if (!IS_SUPABASE_ENABLED) return _legacy_mock_getCurrentSubscriber(phone);
  const { data, error } = await supabase
    .from('subscribers')
    .select('id, phone, name, … subscriber_balances(*)')
    .eq('phone', phone)
    .maybeSingle();
  if (error) throw error;
  return mapSubscriber(data);
}
```

**Verification probes** (from [`report.md`](../report.md) §8, regression-safe):

```sh
# Components MUST NOT import from services directly
grep -rn "from '@/services" src --include='*.jsx'         # → 0 results

# Hooks/components MUST NOT call /api/* directly (must route via services/api.js)
grep -rn "fetch('/api" src --include='*.jsx' --include='*.js' \
  | grep -v "src/services/api.js"                          # → 0 results

# Components MUST NOT import from mockData (services only)
grep -rn "from '@/data/mockData" src --include='*.jsx'    # → 0 results
```

The audit confirms all three hold today. The hook→service→`api.js`/`supabase` chain is the canonical shape; new code follows it.

**Why this boundary exists.** It's the place where the rollback flag (`IS_SUPABASE_ENABLED`) lives. If components called Supabase directly, the mock branch would have to live in dozens of components. By concentrating the mock/real fork in services, the rest of the codebase ignores it — `useCurrentSubscriber()` works identically whether the data came from Postgres or `mockData.js`.

See also: [`FRONTEND.md §4`](./FRONTEND.md) (three-layer data access), [`FRONTEND.md §5`](./FRONTEND.md) (service inventory), [`FRONTEND.md §6`](./FRONTEND.md) (hooks inventory).

---

## 4. Feature modules vs shared code

The frontend folder tree has two kinds of folders:

| Kind | Location | Examples | Visibility |
|---|---|---|---|
| **Feature module** | `src/signup/`, `src/dashboard/`, `src/branch-dashboard/`, `src/agent-dashboard/`, `src/subscriber-dashboard/`, `src/pages/` | Onboarding shell, distributor map, branch overview, agent home widgets, subscriber settings | Internal-only; not imported across modules |
| **Shared** | `src/components/`, `src/hooks/`, `src/services/`, `src/contexts/`, `src/utils/`, `src/constants/`, `src/config/` | `Modal`, `SkeletonRow`, `useAuth`, `formatUGX`, `EASE_OUT_EXPO` | Any feature module may import |

**The promotion rule.** A piece of UI starts inside its first feature module. When a second module needs it, you choose: (a) **promote** it to `src/components/` (and align both call sites on the shared version), or (b) **fully duplicate** it (and accept future drift). What you don't do is import across feature modules.

**The audit's one cross-role import incident (F1, F22).** `src/agent-dashboard/shell/PageHeader.jsx` imports `goBackOrFallback` from `../../subscriber-dashboard/shell/navigation` — the only cross-role import in the repo. The PageHeader files are also a near-mirror copy (~1-line diff) between the two role dashboards. The clean fix is to promote `goBackOrFallback` to `src/utils/navigation.js` and either share `PageHeader` from `src/components/PageHeader.jsx` or accept the duplication. Either way, the cross-role import goes. This is the **single architectural leak** the audit found — and it's documented here precisely because it's the canonical "don't do this" example.

**Why feature modules?** The four role dashboards have different navigation models (routed vs panel-state), different visual densities (subscriber: mobile-first widget grid; distributor: map + drill-down), and different mutation patterns. Co-locating each role's code under its own folder lets the cognitive context shrink when you're working in one. The cost: the temptation to reach across folders. Hence the promotion rule and the verification probes (see [`report.md`](../report.md) §8 "Cross-role imports").

See also: [`FRONTEND.md §8`](./FRONTEND.md) (per-shell breakdown), [`FRONTEND.md §12`](./FRONTEND.md) (shared utilities & components).

---

## 5. Role boundaries (quasi micro-frontend posture)

The four role dashboards are **logically independent surfaces** that happen to ship in one Vite bundle (with React.lazy + manual vendor chunks splitting their code). They are not formally separated — there is no per-role build, no per-role deploy, no per-role route, no cross-tab origin sandbox. But the **discipline is micro-frontend-shaped**, and the audit confirms the posture is healthy (Theme E in [`report.md`](../report.md) §4).

**What the four dashboards share (legitimately):**

- `AuthContext` (`src/contexts/AuthContext.jsx`) — identity, token, logout
- `ToastContext` — global notification queue
- `SignInContext` — sign-in modal open/close
- Common components in `src/components/` (Modal, SkeletonRow, EmptyState, signin/, reports/, contribution/, feedback/)
- Design tokens (`src/index.css`)
- Services + hooks (where they're truly cross-cutting — auth, chat, contact, search)
- Utils (`finance`, `date`, `currency`, `csv`, `phone`, `settlementCycle`)
- `EASE_OUT_EXPO` + the Framer Motion easing convention

**What the four dashboards do NOT share:**

- Shell components — each role has its own `*DashboardShell.jsx`
- Layout choices — distributor uses sidebar + map + state-based panels; agent + subscriber use routed pages + bottom tab bar
- Navigation contexts — `DashboardNavContext` + `DashboardPanelContext` only mount inside the distributor + branch dashboards
- Scope contexts — `BranchScopeContext` only wraps the branch tree; `AgentScopeContext` only wraps the agent tree
- Page content — `HomePage`, `AgentPage`, etc. live under each role's folder

**The role-leakage rule.** Anything in a role folder (`subscriber-dashboard/`, `agent-dashboard/`, `branch-dashboard/`, `dashboard/`) is **invisible to the other three**. The historical leak example: `DashboardNavContext` used to carry a subscriber-specific `reports` field that was technically visible to branch + distributor consumers. That was a context-design slip, not a code-import slip — context-shaped leaks are subtler than import-shaped leaks.

The audit also flagged `DashboardPanelContext` (F5) for carrying subscriber-specific menu state (`subscriberMenuOpen`, `viewSubscribersOpen`) to non-subscriber dashboards that don't actually use panels. It's a low-severity slip; the audit recommends scoping panel state per-role rather than collapsing it onto the shared `DashboardPanelContext`.

**NOT a recommendation to extract real micro-frontends.** The current bundle, single deploy, and shared design system are **right for a demo**. The micro-frontend posture documented here is a healthy starting point if the platform ever needs per-role independent deploys — but that decision is out of scope (see §17).

See also: [`FRONTEND.md §3`](./FRONTEND.md) (routing model), [`FRONTEND.md §7`](./FRONTEND.md) (context inventory), [`FRONTEND.md §8`](./FRONTEND.md) (dashboard variants).

---

## 6. Auth & session model

```
User enters phone + (OTP or password)
   │
   ▼
src/services/auth.js
   │  sendOtp / verifyOtp / signInWithPassword / changePassword
   ▼
POST /api/auth/{send-otp | verify-otp | verify-password | change-password}
   │
   ▼
api/auth/* (Vercel function)
   │  ┌─ validate body
   │  ├─ subscriber? look up subscribers.phone (RLS-bypassed via supabaseAdmin)
   │  ├─ other role? look up demo_personas.(phone, role); fallback ROLE_DEFAULTS
   │  ├─ password path? compare bcrypt(password, users.password_hash)
   │  ├─ upsert users(phone, role, last_login_at)
   │  └─ signJwt(claims, 24h)  ← HS256 via jose, SUPABASE_JWT_SECRET
   ▼
Response: { token, user: { role, phone, name?, *Id? } }
   │
   ▼
AuthContext.login(token, user)
   │  writes localStorage:
   │     upensions_token   = <jwt>
   │     upensions_auth    = { role, phone, name?, *Id? }
   ▼
Every subsequent request:
   • api.js              → Authorization: Bearer <token>
   • supabaseClient.js   → Authorization: Bearer <token> + apikey: <anon>
   │
   ▼
PostgREST verifies JWT (same SUPABASE_JWT_SECRET) → SET ROLE 'authenticated'
RLS policies read: auth.jwt() ->> 'app_role'
                   auth.jwt() ->> 'subscriberId' / 'agentId' / 'branchId' / 'distributorId'
   │
   ▼
401 from any service call?
   │  api.js notifies onAuthExpired listeners (subscribers: AuthContext)
   ▼
AuthContext.logout + navigate('/')  (no hard reload — preserves Query state)
```

**Why custom HS256, not Supabase Auth?** Supabase Auth ships `sub = auth.users.id` plus email/password / magic-link / OAuth. The platform needs role-scoped entity IDs (`subscriberId`, `agentId`, `branchId`, `distributorId`) directly on the JWT so RLS predicates resolve in a single column read (e.g. `WHERE agent_id = auth.jwt() ->> 'agentId'`). The custom JWT mints exactly those claims, signed with the same `SUPABASE_JWT_SECRET` PostgREST uses to verify — so PostgREST, RLS, and the Realtime channel all accept it natively. The audit (B8, [`report.md`](../report.md) §2.2) flags some duplication in the JWT-mint code between `verify-otp.ts` and `verify-password.ts` but confirms the JWT shape itself is **identical** across the two routes.

**The `auth.uid()` consequence.** Because the JWT is custom and not minted by Supabase Auth, there is no `auth.users` row — so `auth.uid()` returns `NULL` inside every Postgres expression. Every RLS policy and every RPC must read JWT claims via `auth.jwt() ->> '<key>'`. The audit (D2) confirms **zero `auth.uid()` usage across all 29 RPCs and all 65 RLS policies** — the discipline holds.

**The `'role'` vs `'app_role'` trap.** This is the highest-stakes correctness check in the platform, and the audit verifies it on every single policy (D1, [`report.md`](../report.md) §2.3).

| Claim | Value | What reads it |
|---|---|---|
| `auth.jwt() ->> 'role'` | `'authenticated'` (always) | **PostgREST `SET ROLE` mechanism** — has nothing to do with the application role |
| `auth.jwt() ->> 'app_role'` | `'subscriber' \| 'agent' \| 'branch' \| 'distributor' \| 'admin'` | The application role — what RLS and RPCs MUST gate on |

If a policy reads `'role'` and compares it to `'distributor'`, it silently fails for every request (because `'authenticated' !== 'distributor'`). This exact mistake produced two historical bugs that 0020 + 0021 fixed: the entity-metrics rollup returned zeros for every drill-down (0018 → 0020 superseded), and several commission RPCs in 0004 silently failed (0021 swept them).

**The audit confirms: all 65 RLS policies and all 29 RPCs in live state read `'app_role'`, not `'role'`.** ([`CLAUDE.md §5.7`](./CLAUDE.md), [`BACKEND.md §8`](./BACKEND.md), [`report.md`](../report.md) §2.3 D1.)

**JWT TTL.** Fixed 24 hours, no refresh path. On 401, the frontend dispatches `onAuthExpired` → graceful logout. This is intentional demo scope (§10) — a sales rep's session lasts a day or a demo, and a refresh-rotation path would only complicate the code. See [`BACKEND.md §5`](./BACKEND.md) for the route-by-route auth flow.

---

## 7. Data write model

**Every write goes through a SECURITY DEFINER RPC.** No direct table writes from the frontend (RLS would block most of them), and no direct table writes from the API (the RPCs enforce business invariants atomically).

**Why this rule:**

- **Atomicity.** Signup creates a `subscribers` row + `subscriber_balances` + `contribution_schedules` + `insurance_policies` + `nominees` + first `transactions` + first `commissions` row. If any insert fails, the whole signup must roll back. A single `create_subscriber_from_signup(payload jsonb)` RPC wraps all of that in one transaction.
- **Business invariants.** `release_run`, `branch_dispute_line`, `agent_confirm_commission` etc. validate `auth.jwt() ->> 'app_role'`, the entity-ownership claim (`agent_id = auth.jwt() ->> 'agentId'`), AND the source state of the row before transitioning. None of that can be expressed as a plain RLS policy.
- **Defense in depth.** The frontend can't forge writes by going around the React Query mutation layer; the API can't forge writes by going around the role check; even a Supabase service-role caller has to invoke the RPC to maintain invariants (it just has to satisfy the role check, not the policy).

**The atomic-write pattern** (`supabase/migrations/0002_rpc_functions.sql` + later):

```sql
CREATE OR REPLACE FUNCTION public.create_subscriber_from_signup(payload jsonb)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM _validate_signup_payload(payload);
  -- single transaction: subscriber + balances + schedule + insurance + nominees + first tx
  RETURN _insert_subscriber_chain(payload);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_subscriber_from_signup(jsonb) TO anon, authenticated;
```

**Tables with NO direct INSERT/UPDATE/DELETE policy** (writes flow ONLY through RPCs):

- `commissions`
- `settlement_runs`
- `settlement_run_branch_reviews`

**Tables WITH direct policies** (subscriber-self writes through PostgREST):

- `subscribers` (UPDATE — editable columns only, enforced by trigger)
- `nominees` (INSERT/UPDATE/DELETE — subscriber-self)
- `transactions` (INSERT — subscriber-self, triggers handle balance updates)
- `claims`, `withdrawals` (INSERT — subscriber-self)

The pattern: state-machine tables (commission lifecycle) go through RPCs; self-owned tables (subscriber data) go through direct INSERT with RLS. See [`BACKEND.md §8`](./BACKEND.md) for the full per-role permission matrix and [`BACKEND.md §9`](./BACKEND.md) for the RPC catalog.

---

## 8. State management

Four state systems, each with a single responsibility:

| System | When to use | Lifespan | Examples |
|---|---|---|---|
| **TanStack Query** | Server data — anything that lives in Postgres or behind `/api/*` | Cache (5min staleTime, 10min gcTime); refetch on invalidate | `useCurrentSubscriber`, `useEntity`, `useCommissionSummary`, every mutation |
| **React Context** | Cross-tree shared UI state, identity, role-scope, modal opens | Provider mount lifetime | `AuthContext`, `ToastContext`, `SignInContext`, `DashboardNavContext`, `DashboardPanelContext`, `BranchScopeContext`, `AgentScopeContext`, `SignupContext` |
| **`useState` / `useReducer`** | Local UI state; form values; transient toggles | Component lifetime | Form field values, expanded/collapsed flags, modal open booleans not promoted to context |
| **`localStorage`** | Session persistence (token, user payload), signup persistence, per-session demo flags | Until browser-clear or app-clear | `upensions_token`, `upensions_auth`, `uganda-pensions-signup`, `upensions_agent_settlement_cadence`, `upensions_<stage>_force` (KYC QA force flags) |

**When to pick which:**

- **If the data lives in Postgres** → TanStack Query (with a hook in `src/hooks/` that wraps a service in `src/services/`). Never put server data in Context.
- **If it's identity / role / token** → Context (`AuthContext`). Never put auth in `useState` at the page level.
- **If it's a flag two siblings need to read** → lift to local state in the parent; promote to Context only when 3+ levels of prop drilling appear.
- **If it survives a refresh and isn't security-sensitive** → `localStorage` (signup state, settlement cadence). For security tokens → `localStorage` too (no refresh tokens; demo scope), but the value is treated as a bearer secret.

**Known untested ground** (audit T5, T6 — [`report.md`](../report.md) §2.4): the four stateful hooks (`useEntity`, `useCommission`, `useSubscriber`, `useAgent`) and most service files have **zero unit tests**. The E2E suite covers happy-path flows but the unit layer is thin. This is a real coverage gap (not an architectural defect) — see [`report.md`](../report.md) §3 "high" T2–T6.

**Cross-context handoff — the `onPanelActionRef` pattern.** The distributor + branch dashboards have a chicken-and-egg: the URL-derived nav state (in `DashboardNavContext`) needs to drive the slide-in panel state (in `DashboardPanelContext`), but they cannot directly depend on each other. `DashboardNavProvider` exposes a `ref`; `DashboardPanelProvider` writes panel setters into it on mount. Map drill-down effects then call `onPanelActionRef.current?.setViewBranchesOpen(true)` — no circular imports, no cyclic provider order. This is a deliberate pattern documented in [`FRONTEND.md §7`](./FRONTEND.md).

---

## 9. Environment posture

**Three environments**, each with the same code path and a different rollback flag posture:

| Environment | Command | Origin | Backend | Notes |
|---|---|---|---|---|
| **Local frontend-only** | `npm run dev` | `localhost:5173` | Supabase project (via Vite env vars) | `VITE_USE_SUPABASE=false` to use mock fallback; `/api/*` proxied to remote or unavailable |
| **Local fullstack** | `npm run dev:api` (`vercel dev`) | `localhost:3000` | Supabase project + local `api/*` routes | The only way to exercise `/api/auth/*` + `/api/kyc/*` end-to-end locally |
| **Preview deploy** | Push to a branch → Vercel preview URL | `<branch>-<repo>-<org>.vercel.app` | Same Supabase project as prod (shared) | Vercel env: Preview |
| **Production deploy** | Push to `main` | `uganda-dashboard.vercel.app` | Same Supabase project | Vercel env: Production. Auto-deploy |

**Env-var matrix** ([`BACKEND.md §2`](./BACKEND.md)):

| Variable | Frontend (public) | Server (Vercel function) | Local seed script |
|---|---|---|---|
| `VITE_SUPABASE_URL` | ✓ | ✓ (via `api/_lib/supabase-admin.ts`) | — |
| `VITE_SUPABASE_ANON_KEY` | ✓ | — | — |
| `VITE_USE_SUPABASE` | ✓ (rollback flag) | — | — |
| `SUPABASE_SERVICE_ROLE_KEY` | **NEVER** | ✓ | — |
| `SUPABASE_JWT_SECRET` | **NEVER** | ✓ | — |
| `SUPABASE_DB_URL` | — | — | ✓ (port 6543 pooler) |

The `VITE_*` keys are inlined into the client bundle at build time — putting a service-role key behind a `VITE_` prefix would leak it to every browser session. The discipline holds today (no `VITE_*` prefix on server-only keys).

**The `VITE_USE_SUPABASE=false` rollback path.** Every service (`commissions`, `subscriber`, `entities`, `kyc`, `chat`, `agent`, `search`, `contact`) has a mock-fallback branch that reads from `src/data/mockData.js` (or returns canned strings, for `chat`). Both `entities.js` and `subscriber.js` keep an in-memory `_entityOverrides` / `_sessionMutations` Map so demo writes (status flips, contributions, schedule edits) layer on top of the frozen seed for the session. This is the "degraded-but-functional" path: a Vercel preview with no Supabase keys still runs the marketing site, the sign-in modal, and any role's dashboard from mock data.

**The audit's two environment-posture findings:**

- **X6 (high — silent fallback to `localhost:54321`).** `src/services/supabaseClient.js:67-74` falls back to `http://localhost:54321` and `'public-anon-key'` if the env vars are missing. A misconfigured Vercel preview/prod that forgets `VITE_SUPABASE_URL` ships a broken app with no loud error. The audit recommends a preflight assertion. This is an environment-hardening item, not a demo-scope issue.
- **X11 (med — mock branches untested).** The `IS_SUPABASE_ENABLED=false` branches across 8 services contain ~600+ lines of legacy fallback code that **no test exercises**. Output-shape compatibility with the real branch is unverified. The branches exist for rollback safety; whether they should be retired or kept untested as cold-storage is an open question (see §17).

---

## 10. Demo-scope architectural decisions

Every demo behavior is paired with the hypothetical production-evolution successor it would become. **This is documentation, not a roadmap.** Per [`CLAUDE.md §10a`](./CLAUDE.md), these are by-design limits of a sales-rep tool — proposing real SMS/payment/KYC/compliance integrations is explicitly out of scope.

| Demo decision | Why it exists | Hypothetical successor (not planned) |
|---|---|---|
| **OTP wildcard** — any 6-digit code passes `/api/auth/verify-otp` | Sales reps demo without phones in hand. No SMS provider, no lockout, no rate limit | Real SMS provider (Twilio/Africa's Talking); per-phone rate limit; account lockout after N fails |
| **Mocked KYC** — all 8 `/api/kyc/*` routes return Smile ID v2-shaped fakes with realistic latency | Sales reps walk prospects through a realistic onboarding flow without burning real IDV calls | Real Smile ID integration; retry/poll for long-running verifications; NIRA federated lookup |
| **`demo_personas` fallback** — unknown phones for agent/branch/distributor resolve to `a-001` / `b-kam-015` / `d-001` | Every demo login succeeds even if the persona seed drifted | "Enrollment required or bounce" — unknown phones rejected at `/api/auth/verify-otp` |
| **Hardcoded UGX 1,000 unit price** in `trg_transactions_contribution` | No real fund NAV; demo balances stay readable | Fund NAV table keyed by period; unit price derived per-contribution from the period's NAV snapshot |
| **24h JWT, no refresh** | Sales sessions don't outlast a day; refresh paths add code without demo value | 15-min access token + refresh token rotation; secure-cookie refresh flow |
| **Mocked chat** — `/api/chat` returns keyword-matched canned strings flavored by role | Demo conversation works offline; no LLM cost; no provider integration | LLM-backed assistant (provider-agnostic); per-role system prompt; conversation history |
| **Per-session mutation stores** — `entities._entityOverrides`, `subscriber._sessionMutations` | Mock-fallback writes layer over frozen `mockData.js`, reset on refresh — drives "what-if" demos | Persisted DB writes via the same RPCs the real path uses (already wired when `VITE_USE_SUPABASE=true`) |
| **Hardcoded `ROLE_DEFAULTS` in `verify-otp.ts` + `verify-password.ts`** | Fallback IDs for non-subscriber roles when persona seed is missing | Persona seed is canonical; routes raise `403 no_persona` if phone has no row |
| **No `Cache-Control: no-store`** on auth/contact/referral responses | Demo origin is single-tenant; no shared-proxy risk | Explicit `no-store` headers on every auth-tier response |
| **Hardcoded UI copy in 30+ E2E `getByRole` assertions** | Copy stability is a demo guarantee; tests catch a copy drift fast | Test-ids on every load-bearing element; copy can drift without breaking the suite |

The audit (Phase 5D, X16) notes that demo silences pile up — a sales rep mid-demo cannot always tell whether they are on real or mock data, whether their identity is real or fallback, whether their writes survived or evaporated. The plan correctly forbids adding a `DEMO_MODE` flag. See §17 for the open question.

---

## 11. Frontend → backend contract

**Every `/api/*` call from the frontend goes through `src/services/api.js`.** The wrapper:

1. Reads `localStorage['upensions_token']` and injects `Authorization: Bearer <token>` if present.
2. Sets `Content-Type: application/json` and serializes the body when present.
3. Hits `/api${path}` (same-origin — Vercel rewrites `/api/*` to functions; everything else to `index.html`).
4. On HTTP 401: clears `upensions_token` + `upensions_auth`, notifies all `onAuthExpired` listeners (consumed by `AuthContext` → graceful logout), and throws.
5. On other non-OK: throws an `Error` carrying `code` (from response body's `error` or `code` field), `status`, and `body`.

**`VITE_API_BASE_URL` is read but unused** (audit X15) — `api.js` hardcodes `/api` as the prefix. The env var is harmless but documents legacy intent.

**Response envelope drift (audit B1, B2 — [`report.md`](../report.md) §2.2).** The current contract is **not** uniform across the 14 routes:

| Drift dimension | Auth routes | KYC routes | Contact / chat routes |
|---|---|---|---|
| Error code field | `{ code: 'invalid_otp' }` (sometimes `{ error: 'invalid_otp' }` — `verify-otp.ts:174` vs `:199`) | `{ verified: false }` on failure with HTTP 200 | `{ error: '...' }` (prose) |
| 405 message | `'method_not_allowed'` (snake_case) | `'Method not allowed'` (PascalCase) | `'Method not allowed'` |
| Success shape | `{ token, user }` | `{ tracking_id, ... }` | `{ submitted: true, id }` / `{ reply, suggestions? }` |

This drift is **documented honestly** — it's a real cleanup item (B1 + B2 in [`report.md`](../report.md) §3 "high"), not an intentional pattern. The cleanup roadmap pitch (C1 in [`report.md`](../report.md) §7) calls for unifying the error envelope + 405 vocabulary across all routes. The architectural ideal: a single `{ code: <snake_case>, message?: <human>, details?: <object> }` shape; KYC routes that today return HTTP 200 with `{verified:false}` should switch to 422 with `{ code: 'face_match_failed' }` (audit B16).

See also: [`BACKEND.md §3`](./BACKEND.md) (route inventory), [`FRONTEND.md §5.1`](./FRONTEND.md) (`api.js` shape).

---

## 12. Realtime architecture

Supabase Realtime is **selectively enabled** for exactly three tables:

| Table | Realtime | Why |
|---|---|---|
| `commissions` | **ON** | Cross-laptop demo: branch approves a line on laptop A → distributor sees the state change on laptop B in real time |
| `settlement_runs` | **ON** | Run-lifecycle states (`draft → branch_review → released`) drive the distributor + branch + agent settlement UX; multi-actor demo loops |
| `settlement_run_branch_reviews` | **ON** | Per-branch review state inside a run; same cross-laptop demo flow |
| `transactions` | OFF | High write volume (~30k seeded rows) would burn free-tier realtime connections |
| `subscribers` | OFF | High write volume; React Query's 5-min staleTime + manual invalidation is sufficient |
| `subscriber_balances` | OFF | Same — manual invalidation on contribution / withdrawal is fine |

Set in `0003_rls_policies.sql` (the realtime publication tuning block) and verified by audit D19. The architectural rule: **realtime is opt-in per-table; default is off**. Reasons to flip a table on are concrete (commission UX demands liveness because multi-actor flow is the demo headline); reasons to keep it off are cost + consistency (React Query's invalidation paths are well-tested).

A regression-safe SQL probe ([`report.md`](../report.md) §8):

```sql
SELECT tablename
  FROM pg_publication_tables
 WHERE pubname = 'supabase_realtime'
 ORDER BY 1;
-- expected: commissions, settlement_runs, settlement_run_branch_reviews
```

See also: [`BACKEND.md §8`](./BACKEND.md) "Realtime publication tuning".

---

## 13. Migration & schema-evolution discipline

**Forward-only migrations** under `supabase/migrations/`. Sequential 4-digit prefix; never edit a shipped migration. The full list today runs `0001` → `0026` with one intentional gap.

**Discipline rules:**

| Rule | Enforced by |
|---|---|
| 4-digit zero-padded prefix | Filename convention; Supabase migration table records hashes |
| `.down.sql` partner for every new migration (0016 onward) | Convention; `0016_distributors_table.down.sql`, `0022_audit_perf.down.sql`, etc. |
| `IF EXISTS` / `IF NOT EXISTS` on schema-touching statements | Audit D12 flags 4 migrations (0003, 0006, 0010, 0025) that drop or create without guards — would fail on replay. Cleanup item |
| `SET search_path = public` (or `public, pg_temp`) on every SECURITY DEFINER function | Audit D2 confirms: all 29 RPCs comply, all 5 trigger functions comply |
| `REVOKE ALL FROM PUBLIC` then `GRANT EXECUTE TO <role>` on every RPC | Audit D3 flags one miss (`upsert_nominees` in 0024); every other RPC has the preamble |
| Apply via Supabase MCP `apply_migration` (or `supabase db push`) | Workflow convention |

**The 0018 → 0020 supersession (audit D4, D5).** `0018_entity_metrics_rollup.sql` originally read `auth.jwt() ->> 'role'` (the PostgREST `SET ROLE` mechanism, always `'authenticated'`) and silently returned zeros for every drill-down. The fix was applied as a remote-only hotfix (`fix_metrics_rollup_app_role`, timestamp `20260519165115`) — **not in the local git tree** — to unblock the demo. The proper fix landed as `0020_entity_metrics_rollup_v3.sql` (which supersedes 0018 + the hotfix in one shot). Migration `0019` is **intentionally skipped** (an abandoned raw-psql hotfix attempt).

Both 0018 and 0020 are replay-safe (running 0018 then 0020 in order produces correct state). The 0018 file is now operationally stale but tree-resident; the audit recommends either annotating it with a header comment or archiving it.

**The remote-only hotfix is documented here as the architectural footnote** (D5): the live database has a function definition that exists nowhere in `supabase/migrations/`. Future contributors running `supabase db pull` to reconcile state must be aware. The 0020 migration is the canonical truth; the remote hotfix is functionally identical and superseded.

See also: [`BACKEND.md §7`](./BACKEND.md) (migration history), [`BACKEND.md §15`](./BACKEND.md) "Migration discipline".

---

## 14. Testing architecture

Two test layers, each catching a different class of regression:

| Layer | Tooling | Where | What it catches |
|---|---|---|---|
| **Unit** | Vitest 4 + jsdom + `src/test/supabaseMock.js` | `src/**/__tests__/`, `src/**/*.test.{js,jsx}` | Service shape contracts, util correctness, hook caching behavior, component primitives (`Modal`) |
| **E2E** | Playwright; service-role fixtures in `e2e/fixtures/db.ts`; auth fixtures in `e2e/.auth/` | `e2e/specs/{smoke,flows,regression,db}/` | Real-browser flows: signup → contribute → withdraw; commission state machine end-to-end; cross-laptop demo loops |

**Vitest setup** (`src/test/setup.js`, `src/test/supabaseMock.js`):

- `globals: true`, `environment: 'jsdom'`, CSS modules use `classNameStrategy: 'non-scoped'` so tests can assert on class names.
- `supabaseMock.js` is a fluent-builder mock matching the real client's API (`from().select().eq().maybeSingle()` etc.). Audit T18 confirms no drift.

**Playwright setup** (`playwright.config.ts`):

- Projects: `chromium`, `webkit`, `mobile-chromium` (iPhone 13).
- Service-role fixtures mint JWTs via `SUPABASE_JWT_SECRET` and write directly to the shared `zengmiugieqjqzaccbqe` Supabase project.
- `e2e/fixtures/db.ts` provides `cleanupSubscriberByPhone` (called in `afterEach` on signup flows).
- CI runs `--workers=1` because the suite shares one Supabase project.
- `forbidOnly: !!process.env.CI` guards against accidental `.only`.

**Why both layers.** Unit tests catch shape regressions cheaply: change a service return shape, the hook test fails before you ship. E2E catches integration regressions: an RLS policy regression, a JWT-claim drift, a state-machine transition typo — none of which a unit test would notice. They're complements.

**Known gaps** ([`report.md`](../report.md) §2.4, §3 high — T1 through T16):

| Gap | Impact |
|---|---|
| **T1** — `cleanupSubscriberByPhone` misses `claims`, `withdrawals`, `insurance_policies` | Long-running CI accumulates orphan rows; eventual flake |
| **T2** — `signInWithPassword`, `changePassword`, `AuthError`, extended `messageForCode` — **zero unit tests** | Any contract change in `auth.js` ripples to every login flow with no safety net |
| **T3** — all 4 password-touching auth routes have **zero unit tests** | Same; the freshly-shipped password rollout is the **least tested** surface |
| **T4** — all 8 KYC routes have **zero unit tests** | Acceptable while KYC is mocked, but mocks-of-mocks rot fast |
| **T5** — 7+ services entirely untested (`api`, `subscriber`, `agent`, `chat`, `kyc`, `contact`, `search`, `supabaseClient`) | Public APIs, optimistic update rollbacks, 401 handling — all untested at unit level |
| **T6** — 4 stateful hooks entirely untested (`useEntity`, `useCommission`, `useSubscriber`, `useAgent`) | Caching + optimistic mutations + error boundaries untested |
| **T11** — `distributor-create-branch.spec.ts` permanently `test.fail()` (UI panel never wired up) | Real bug masked as expected-fail |
| **T16** — Missing E2E coverage: password reset, OTP retry/lockout, KYC failure paths, settlement-run full lifecycle, agent confirm receipt | High-value flows untested at the integration layer |

These gaps are real cleanup, not architectural defects. The architecture is sound; the test coverage is uneven.

See also: [`FRONTEND.md §14`](./FRONTEND.md) (testing layout), [`.claude/skills/qa.md`](./.claude/skills/qa.md) (E2E suite + Playwright config).

---

## 15. Build & deploy

**Build:**

- **Vite 6.3.5** with `@vitejs/plugin-react` (React 19 fast refresh).
- **Manual vendor chunks** (`vite.config.js`): `vendor-leaflet`, `vendor-charts` (recharts + d3-*), `vendor-motion` (framer-motion + motion-utils + motion-dom), `vendor-tanstack`, `vendor-router`, `vendor-react` (react + scheduler + tightly-coupled runtime). React is chunked separately to prevent `forwardRef` undefined errors after hash shifts (real bug — pinned in code comment).
- `chunkSizeWarningLimit: 700` kB — headroom for recharts/leaflet routes.
- Lazy-loaded dashboard shells under `React.lazy` so the marketing landing page doesn't carry dashboard code.
- Path aliases: `@` → `./src` is used; `@components`, `@contexts`, `@dashboard`, `@data`, `@utils` are defined but unused (audit X7) — safe to remove.
- CSS Modules only — no Tailwind, no component library, no preprocessor. Tokens live in `src/index.css`.

**Deploy:**

- **Vercel framework preset** = `vite` (per `vercel.json`).
- **Function runtime** = `@vercel/node@4.0.0` for every `api/**/*.ts`.
- **Auto-deploy on push to `main`** → production at `uganda-dashboard.vercel.app`.
- **Preview deploys** on every branch push → `<branch>-<repo>-<org>.vercel.app`.
- **CI gating** (`.github/workflows/test.yml`):
  - On every PR + push to `main`: lint + Vitest (~30s).
  - E2E gated on lint+unit success: smoke + flows on chromium + mobile-chromium for PRs; full matrix (chromium + webkit, smoke + flows + regression + db) on push to `main`. `--workers=1` because the suite shares one Supabase project.
  - Concurrency block cancels in-flight runs on the same ref.
  - No deploy gate today — CI is informational.

**No security headers in `vercel.json`** (audit X8) — no CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy. Logged as low-severity awareness only; full CSP migration is **out of scope** ([`report.md`](../report.md) §5).

See also: [`FRONTEND.md §1`](./FRONTEND.md) (build & dev), [`BACKEND.md §15`](./BACKEND.md) (operational runbook).

---

## 16. Where the docs live

```
CLAUDE.md          ← orientation (slim index, hard rules, glossary, demo credentials)
ARCHITECTURE.md    ← THIS DOC — system patterns, boundaries, contracts, demo decisions
FRONTEND.md        ← specialist: services, hooks, contexts, dashboards, signup, tokens
BACKEND.md         ← specialist: env vars, routes, _lib, auth, schema, RLS, RPCs, runbook
docs/
  role-permissions.md  ← role × capability matrix
  data-model.md        ← field-level entity model + aggregation rules
  api-contracts.md     ← HTTP shapes + cache keys (audit X1: currently stale; archive or rewrite)
  SPEC.md              ← product spec, personas, workflows
  DASHBOARD_AUDIT*.md  ← QA audit findings & fix log
  design/              ← Figma exports & design artifacts
```

**Pointer summary:**

| If you're asking… | Open this |
|---|---|
| "How is the system architected?" | **ARCHITECTURE.md** (this doc) |
| "What does the codebase look like at a glance?" | `CLAUDE.md` |
| "Where does service X live?" | `FRONTEND.md §5` |
| "What's the RLS policy on table Y?" | `BACKEND.md §8` |
| "How does the commission state machine work?" | `BACKEND.md §10` |
| "What's the cache key for entity drill-down?" | `FRONTEND.md §6` |
| "Which roles can see which data?" | `docs/role-permissions.md` |
| "What HTTP shape does route Z return?" | `BACKEND.md §3` (route inventory) + `docs/api-contracts.md` (caveat: stale per audit X1) |

The discipline (per [`CLAUDE.md §11`](./CLAUDE.md)): when you add a service, hook, table, RPC, migration, route, or context, update `FRONTEND.md` or `BACKEND.md` in the same commit. When you change **a pattern** (a boundary rule, a contract envelope, a write model), update **this doc** in the same commit.

---

## 17. Open architectural questions

These are real decisions the audit surfaced that are **not cleanup** — they're design questions worth flagging for future planning. Not commitments. Not roadmap items. Just the questions.

### 17.1 Should role dashboards become real micro-frontends with independent deploys?

**Today:** quasi micro-frontend posture (§5). Single Vite bundle, lazy-loaded shells, code colocated per-role, design tokens shared.

**Audit signal:** Phase 1E confirmed the posture is healthy — one cross-role import (F1) and one cross-role context leak (F5), both small. No structural barriers to per-role extraction.

**The question:** if the platform ever needs per-role independent deploys (e.g. agent dashboard ships on a faster cadence than distributor), the foundations are there. But independent deploys add CI complexity, version-skew risk (one role's deploy expects a schema migration the other role doesn't have yet), and shared-context coordination (where does `AuthContext` live?). **Answer for now: not now.** The question exists so future planning can revisit it without re-deriving the analysis.

### 17.2 Should mock-branch services be retired or kept as rollback safety?

**Today:** every service has an `IS_SUPABASE_ENABLED=false` branch that reads from `mockData.js`. ~600+ lines of mock fallback code. **Zero tests exercise the mock branch** (audit X11, X17).

**Audit signal:** the mock branch is documented as "rollback safety" — if the real backend breaks, the demo still runs. But "rollback safety" with no tests is brittle: the mock branch may not even compile after a real-branch refactor.

**The question:** keep + test (write Vitest cases that pin the mock branch's output shape), keep + accept the rot (cheaper but unstable), or retire (delete the mock branches; rely entirely on the real backend). The answer probably depends on whether sales reps actually demo offline — if not, retire. The question exists; the answer is open.

### 17.3 Should the demo signal a "Demo mode" indicator to sales reps?

**Today:** silent demo paths (audit X16, Theme B). A sales rep cannot tell whether they are on a fallback persona (`a-001`), whether their writes survived (`_sessionMutations`), or whether the backend is reachable (`VITE_USE_SUPABASE=false`).

**Audit signal:** silences pile up. The plan correctly **forbids adding a `DEMO_MODE` flag** as a global gating mechanism — that would be production-grade infrastructure. But a small chrome-level indicator visible only when the current session is on a fallback persona OR `IS_SUPABASE_ENABLED=false` would surface the most surprising silences without becoming a feature flag.

**The question:** a soft "Demo mode — persona fallback" badge in the user menu, conditional on detectable demo-fallback state. Yes? No? Out of scope? The question exists.

### 17.4 Should we move toward a single error-envelope shape across all routes?

**Today:** drift across the 14 routes (§11; audit B1, B2). `{ error }` vs `{ code }`; snake_case vs PascalCase 405; KYC routes return HTTP 200 with `{ verified: false }`.

**Audit signal:** real cleanup, called out as B1 + B2 in [`report.md`](./report.md) §3 "high".

**The question:** what is the canonical envelope? Candidates: `{ code: <snake>, message?: <human>, details?: <object> }` (most common in REST APIs) vs `{ error: { code, message } }` (JSON:API-ish). The decision is a one-day cleanup once made; the question exists because no one has made it yet. C1 in the cleanup roadmap pitch (per [`report.md`](./report.md) §7) covers it.

---

## See also

- [`CLAUDE.md`](./CLAUDE.md) — slim orientation index, hard rules, anti-patterns, glossary, demo credentials, awareness items
- [`FRONTEND.md`](./FRONTEND.md) — services, hooks, contexts, dashboard variants, signup flow, design tokens, accessibility, frontend findings
- [`BACKEND.md`](./BACKEND.md) — env vars, API routes, `_lib/` helpers, auth flow, schema, migrations, RLS, RPCs, commission state machine, triggers, seeding, runbook
- [`docs/role-permissions.md`](./docs/role-permissions.md) — role × capability matrix
- [`docs/data-model.md`](./docs/data-model.md) — field-level entity model + aggregation rules
- [`docs/api-contracts.md`](./docs/api-contracts.md) — HTTP shapes + cache keys (caveat: per audit X1, currently stale; archive or rewrite pending)
- [`docs/SPEC.md`](./docs/SPEC.md) — product spec, personas, workflows
