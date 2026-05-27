# CLAUDE.md — Universal Pensions Uganda

Slim entry index for this repo. Two deep specialist docs sit alongside this file: **`FRONTEND.md`** (React/Vite/CSS Modules) and **`BACKEND.md`** (Express on Render + Supabase + RLS). Detail lives in those two files and in `docs/*`; this file is for orientation only.

---

## 1. Project at a glance

**Universal Pensions Uganda** is a digital long-term savings + pension platform aimed at everyday Ugandans (informal workers, gig workers, farmers, self-employed). The app in this repo is a **demo / sales-presentation tool** that sales reps walk prospects through — it is **NOT** a production fintech. Mocked OTP, mocked KYC, `demo_personas` fallback IDs, a hardcoded UGX 1,000 unit price, and a 24-hour fixed JWT are **intentional demo scope** and must not be treated as production-prep TODOs.

- **Live URL:** `uganda-dashboard.vercel.app` (Vercel frontend, auto-deploys on push to `main` — do not push without explicit approval). Backend at `uganda-dashboard-api.onrender.com` is **manual** deploys only (`autoDeployTrigger: off`). Full topology in [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).
- **Stack:** React 19 · Vite 6 · CSS Modules (no Tailwind) · Framer Motion 12 · React Router 7 · TanStack Query 5 / Virtual 3 · Leaflet 1.9 · Recharts 3 · Express 5 on Render (Node 22, Singapore region) · Supabase Postgres · custom HS256 JWT via `jose`.
- **Role build status (4 of 6 built):** subscriber, agent, branch, distributor are live. Employer and admin are deferred (no shells, no RLS policies yet — see `BACKEND.md §8`). Build order when resumed: **Employer first, then Admin** (central admin with global rights).

---

## 2. Where to read next

If you're working on… | Open this
--- | ---
A React component, hook, service, dashboard variant, signup step, commission UI, design token, accessibility rule | `FRONTEND.md`
An API route, SQL schema, RLS policy, RPC, migration, trigger, seed script, JWT/auth flow, commission state machine | `BACKEND.md`
System architecture, layered patterns, role boundaries, auth model, write/realtime patterns | `ARCHITECTURE.md`
Role × capability matrix (who can see/do what) | `docs/role-permissions.md`
Field-level entity model / aggregation rules / health-score formula | `docs/data-model.md`
HTTP request/response shapes + cache keys / invalidation table | `docs/api-contracts.md`
Product spec, personas, workflows, business rules | `docs/SPEC.md`
Testing pipeline, Vitest + Playwright + CI matrix | `docs/TESTING.md`
Deploy topology + env-var sync matrix | `docs/DEPLOYMENT.md`
QA audit findings & fix log (historic) | `docs/archive/DASHBOARD_AUDIT.md`, `docs/archive/DASHBOARD_AUDIT_FIXES.md`
Browser-level E2E suite (`/qa`) + Playwright config | `.claude/skills/qa.md`
Design artifacts (Figma exports etc.) | `docs/design/`

---

## 3. Quick start

```sh
cp .env.local.example .env.local   # fill in Supabase keys
npm install                         # legacy-peer-deps=true per .npmrc
npm run dev                         # frontend only (mock fallback if VITE_USE_SUPABASE=false)
```

**npm scripts** (`package.json`):

Script | Purpose
--- | ---
`npm run dev` | Vite dev server (frontend on `:5173`)
`npm run dev:api` | Express backend on `:3001`; pair with `npm run dev` in a second terminal
`npm run dev:all` | Both servers in one terminal (`concurrently` — Vite + Express)
`npm run build` / `build:api` | Production Vite build / `tsc -p server/tsconfig.json` (Render gate, also runs in CI)
`npm run lint` | ESLint 9 flat config (0 errors expected; 1 TanStack Virtual informational warning is normal)
`npm test` / `:watch` | Vitest one-shot / watch
`npm run test:e2e` | Playwright E2E. Subcommands: `:smoke`, `:flows`, `:headed`, `:ui`. See `.claude/skills/qa.md`.
`npm run seed` | Seed Supabase via `scripts/seed-supabase.mjs` (see `BACKEND.md §12`)

**Env vars** (essentials only; template in `.env.local.example`):

Key | Scope
--- | ---
`VITE_SUPABASE_URL` | Public (frontend)
`VITE_API_BASE_URL` | Public (frontend) — points at the Render backend
`SUPABASE_SERVICE_ROLE_KEY` | Server-only (never expose to frontend)
`SUPABASE_JWT_SECRET` | Server-only (HS256 signing secret)

Full table including server-only + local-only keys: [`BACKEND.md §2`](./BACKEND.md).

**Root config files:**

File | What it does
--- | ---
`vite.config.js` | Path aliases (`@`, `@components`, `@contexts`, `@dashboard`, `@data`, `@utils`); manual vendor chunks; `chunkSizeWarningLimit: 700`; embedded Vitest config
`eslint.config.js` | ESLint 9 flat config (`@eslint/js` + react-hooks + react-refresh)
`.env.local.example` | Canonical env-var template (copy to `.env.local` — gitignored)
`.npmrc` / `.node-version` | `legacy-peer-deps=true` / Node 22 LTS pinned
`index.html` | Vite entry HTML; carries the skip-to-content link targeting `#main`

---

## 4. Hard rules — MUST FOLLOW

1. **Data access.** Components and dashboard files NEVER import from `src/data/mockData.js`. Use hooks from `src/hooks/` → services in `src/services/`. Only service files may import `mockData`. (`FRONTEND.md §4`.)
2. **Routing.** Top-level navigation uses `react-router-dom` (`useNavigate()`). Modal/panel UI state (slide-ins, drawers) is **state-based** in `DashboardPanelContext` and intentionally NOT routed. Subscriber + Agent dashboards have routed sub-pages because each destination is a URL; Distributor + Branch use panels. (`FRONTEND.md §3`.)
3. **Auth.** Use `useAuth()` from `AuthContext`. Session persists under `localStorage` keys `upensions_auth` + `upensions_token`. `services/api.js` raises a 401 event via `onAuthExpired(handler)` — `AuthContext` consumes it to log out + redirect. (`FRONTEND.md §5`, `BACKEND.md §5`.)
4. **Environment.** No hardcoded API endpoints. Read config via `src/config/env.js` (`API_BASE_URL`, `IS_DEV`, `IS_PROD`, public URLs). (`FRONTEND.md §1`.)
5. **Signup persistence.** `SignupContext` (in `src/signup/`, not `src/contexts/`) writes every patch to `localStorage` (`uganda-pensions-signup`). File/Blob fields are dropped on serialise; user re-uploads on refresh, but OCR results, phone, beneficiaries, consent all survive. (`FRONTEND.md §9`.)
6. **Frequency normalisation.** Always pass schedule frequencies through `normalizeFrequency(value)` from `src/utils/finance.js` before reading or writing — legacy formats (`half-yearly`, `halfYearly`, `semi-annually`, …) drift across the codebase. Canonical constants live in `FREQUENCY`. (`FRONTEND.md §12`.)

---

## 5. Anti-patterns — MUST NOT DO

1. Don't import `src/data/mockData.js` from components or dashboard files (services only).
2. Don't hand-roll `fetch()` against `/api/*` — use `services/api.js` (`api.get/post/put/delete`) so the 401 listener fires.
3. Don't write `outline: none` without a `:focus-visible` replacement (or a wrapping `:focus-within` indicator). Global `:focus-visible` baseline lives in `src/index.css`.
4. Don't write `transition: all` — always enumerate the properties.
5. Don't bypass `normalizeFrequency` when reading/writing contribution schedules.
6. Don't write raw SQL from the frontend — every database write goes through a SECURITY DEFINER RPC (`BACKEND.md §9`).
7. Don't trust `auth.uid()` inside RLS policies — it's `NULL` for our custom HS256 JWTs. Read `auth.jwt() ->> 'app_role'/'subscriberId'/'agentId'/'branchId'/'distributorId'` instead (`BACKEND.md §8`). **Trap**: `auth.jwt() ->> 'role'` returns `'authenticated'` (the Postgres role for PostgREST `SET ROLE`), not the application role. Reading `'role'` and gating on app values (`'distributor'`, `'agent'`, …) silently fails — this exact mistake produced both the 0018 rollup regression (zeros across every drill-down) and the 0004 commission-RPC silent failures. Always read `'app_role'`.

---

## 6. Brand & visual identity

- **Primary colour:** Universal Indigo `#292867`. Anchors key headings, primary buttons, hero emphasis, important icons.
- **Reserve red** for error/destructive/critical only — never as a major brand colour.
- **Typography:** Plus Jakarta Sans (display, `--font-display`) + Inter (body, `--font-body`). Headings `font-weight: 800; letter-spacing: -0.03em`.
- **Styling:** CSS Modules only (no Tailwind, no component library). Design tokens are CSS custom properties in `src/index.css`. Animation uses Framer Motion with shared `EASE_OUT_EXPO = [0.16, 1, 0.3, 1]`.
- **Full token list, palette, panel/glass recipes, icon system, brand strategy:** `FRONTEND.md §11` (tokens + UI conventions) and `FRONTEND.md §17` (product & brand context).

---

## 7. Security do/don'ts

1. **Never log JWTs** or include them in error reports — they are bearer tokens for the entire session.
2. **Never expose `SUPABASE_SERVICE_ROLE_KEY`** to the frontend. It bypasses RLS. Server-only, used by `api/_lib/supabase-admin.ts`.
3. **All writes flow through SECURITY DEFINER RPCs** (`create_subscriber_from_signup`, commission state-machine RPCs, etc.) — never write directly to a table from the client. RLS would block it, and the RPCs enforce business invariants atomically.
4. **RLS policies read JWT claims, not `auth.uid()`** — `auth.uid()` is `NULL` for our custom HS256 tokens. See `BACKEND.md §8`.
5. **The demo OTP route accepts any 6-digit code.** It is **not** production-grade and must never ship as-is to a real customer — it's intentional demo scope (see §10a).

Where each env variable lives (Vercel / Render / GHA): [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

---

## 8. Demo credentials & personas

The seeded demo data is generated via `npm run seed` (`scripts/seed-supabase.mjs`, mechanics in `BACKEND.md §12`). Phone numbers use the synthetic `+25671XXXXXXX` range. Login at the sign-in modal with any 6-digit code.

Role | Quick login | Seeded count
--- | --- | ---
Subscriber | 5 seeded phones, e.g. `+25671 100 0001`, `…0002`, `…0003`, `…0004`, `…0005` | ~30,000
Agent | Any `agent` role login; `demo_personas` falls back to `a-001` if no phone match | ~2,049
Branch | Any `branch` role login; fallback to `b-kam-015` (Kampala branch) | ~314
Distributor | Any `distributor` role login; fallback to `d-001` | 1 (singleton)
Employer | (deferred — no dashboard) | —
Admin | (deferred — no dashboard) | —

**Fallback rule.** `demo_personas` maps a phone → role-scoped ID. When no row matches, `verifyOtp` returns the hardcoded fallback IDs above so every demo login succeeds. Intentional. See `BACKEND.md §5` for the lookup chain and `BACKEND.md §12` for seed mechanics.

---

## 9. Glossary

Term | Meaning
--- | ---
Subscriber | Individual saver — a member with a balance and contribution schedule.
Agent | Field agent who onboards and supports subscribers (mobile-first, routed dashboard).
Branch | Sub-distributor entity that supervises agents in a district.
Distributor | Top-of-tree network operator (one in the demo seed: `d-001`).
Employer | (Deferred) Organisation managing employee contributions — no dashboard built.
Admin | (Deferred) Head-office platform admin with global rights — no dashboard built.
Commission state machine | Lifecycle `due → in_run → [held \| disputed] → released → confirmed/paid → rejected (terminal)`. See `BACKEND.md §10`.
RPC | Remote procedure call — a Postgres function (typically `SECURITY DEFINER`) invoked via `supabase.rpc('name', args)`. Atomic writes only.
RLS | Row-Level Security — Postgres policies that scope SELECT/INSERT/UPDATE/DELETE per JWT claim.
`splitMode` | Prop on slide-in panels that suppresses the backdrop so the parent reflows main content beside the panel (Branch overview uses this).
Drill-down | Map/overlay navigation through `country → region → district → branch → agent → subscriber`. Distributor-only.
Maker-checker | Two-actor commission flow — admin settles (`due → paid`); agent confirms receipt (`agentConfirmCommission`).
Scope context | `BranchScopeContext` / `AgentScopeContext` — provide `branchId` / `agentId` to descendants when the tree is rendered for a single-entity role.
Atomic-write RPC | A SECURITY DEFINER function that mutates multiple tables in one transaction (e.g. `create_subscriber_from_signup` creates subscriber + balances + schedule + insurance + nominees + first-contribution commission). See `BACKEND.md §9`.
Realtime publication | Supabase realtime channel. ON for `commissions`, `settlement_runs`, `settlement_run_branch_reviews`; OFF for `transactions`, `subscribers`, `subscriber_balances`.

---

## 10. Demo scope & awareness items

### 10a. Demo scope (by design — NOT bugs)

These are intentional limits of a demo platform built for sales reps. Do not propose "fixing" them with real SMS / payment / KYC / audit / compliance integrations — that is explicitly out of scope.

- **OTP** — any 6-digit code is accepted at `/api/auth/verify-otp`. No SMS provider, no rate limiting, no lockout. Sales reps demo without phones in hand.
- **KYC** — all 8 routes under `/api/kyc/*` are Smile ID-v2-shaped mocks with realistic latency. Force failures via `localStorage upensions_<stage>_force` keys to demo failure paths.
- **Unit price** is hardcoded at **1,000 UGX/unit** in `trg_transactions_contribution`. No real fund NAV.
- **JWT** — fixed 24h TTL, no refresh, custom HS256 (not Supabase Auth). Fine for short demo sessions.
- **`demo_personas` fallback IDs** (`a-001` / `b-kam-015` / `d-001`) keep every login successful even if the persona seed drifted.
- **No payment processor.** "Pay now" buttons demonstrate flow only.
- **Mocked chat.** `src/services/chat.js` returns keyword-matched mock replies for the data assistant, agent DM, and subscriber co-pilot.
- **Per-session mutation stores** (`entities._entityOverrides`, `subscriber._sessionMutations`) layer demo writes over frozen `mockData.js` and reset on refresh — intentional for the "what-if" demo flows.

See `FRONTEND.md §16a` and `BACKEND.md §14a` for the role-specific demo-scope inventories.

### 10b. Awareness items (worth knowing, not urgent)

- **`MOCK_NOW = new Date(2026, 3, 8)`** in `src/data/mockData.js` anchors "due in N days" demos. Slide it forward (or flip to `new Date()`) when the demo's relative dates start looking stale.
- **README.md is stale** — currently 87 lines, only documents the landing page, claims "Vite 8" (actually Vite 6.3), no mention of dashboards or backend. Flagged here; a ~30-min refresh is a separate follow-up.
- **NPM deps inventory (verified 2026-05-22 in audit Phase 6):** every direct dep in `package.json` is actually used. `dotenv` is used by `e2e/fixtures/db.ts:13` + `playwright.config.ts:16` (NOT unused). `react-is` is required transitively by `recharts` (build fails without it). `jose` is used in `api/_lib/jwt.ts`; `pg` is used in `scripts/seed-supabase.mjs`. None should be removed.
- **Real bugs in the demo experience** (not demo-scope) are catalogued in `FRONTEND.md §16b` (agent-side `disputeCommission` returns "not built", subscriber Settings/notifications + Settings/security are `StubPage` placeholders) and `BACKEND.md §14b` (`agent_dispute_line` RPC missing, nominee shares can sum >100%, first-contribution commission lacks `UNIQUE(agent_id, subscriber_id)`, employer/admin roles unbuilt).

---

## 11. Doc maintenance discipline

**When you add a service, hook, table, RPC, migration, route, or context, update `FRONTEND.md` or `BACKEND.md` in the same commit.** These docs are reference material — they decay fast if treated as one-time deliverables. Keep `CLAUDE.md` itself slim: bump it only when the routing table, hard rules, glossary, anti-patterns, or demo scope shift. Schema detail, signatures, and design-token values belong in the specialist docs, not here.

When you create / delete / rename a doc, update §2 routing table AND [`README.md §6`](./README.md) doc map in the same commit.

---

## See also

The two deep specialists: [`FRONTEND.md`](./FRONTEND.md) and [`BACKEND.md`](./BACKEND.md). For everything else, follow §2 above.
