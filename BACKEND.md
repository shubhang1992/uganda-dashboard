# BACKEND.md — Universal Pensions Uganda

Deep backend reference. Pair with `CLAUDE.md` (slim index) and `FRONTEND.md` (deep frontend reference).

This document covers the Vercel serverless TypeScript routes under `api/**`, the Supabase Postgres schema + RPCs + RLS in `supabase/migrations/0001_*.sql` through `0006_*.sql`, the seed and utility scripts under `scripts/`, and the operational runbook for local + hosted environments.

> **Scope note.** This platform is a sales-rep **demo**, not a production fintech. Many demo-scope behaviours (any-6-digit OTP, hardcoded UGX 1,000 unit price, fixed 24h JWT TTL, `demo_personas` fallback IDs) are intentional. See §14a — never reframe them as production-prep TODOs.

---

## §1. Architecture overview

```
                  ┌────────────────────────────────────────────────┐
                  │            Browser (React 19 SPA)              │
                  │   src/services/* → fetch(/api/...) +  JWT       │
                  │   src/services/supabaseClient.js → PostgREST    │
                  └────────────┬─────────────────────┬─────────────┘
                               │                     │
                  Authorization: Bearer <jwt>        │  apikey: anon_key
                               │                     │  Authorization: Bearer <jwt>
                               ▼                     ▼
              ┌────────────────────────┐   ┌─────────────────────────┐
              │   Vercel serverless    │   │   Supabase PostgREST    │
              │   api/**/*.ts (Node)   │   │   (rest/v1, realtime)   │
              │   @vercel/node@4.0.0   │   │                         │
              └───────────┬────────────┘   └────────────┬────────────┘
                          │  supabase-admin             │  enforces RLS
                          │  (service-role key,         │  via auth.jwt()
                          │   bypasses RLS)             │  claims
                          ▼                             ▼
                  ┌─────────────────────────────────────────────────┐
                  │           Supabase Postgres (single DB)         │
                  │  • 20 tables · 4 ENUMs · pg_trgm · 5 triggers   │
                  │  • 29 RPCs (mostly SECURITY DEFINER)            │
                  │  • 65 RLS policies (zero auth.uid() calls)      │
                  │  • supabase_realtime publication tuned (3 ON)   │
                  └─────────────────────────────────────────────────┘
```

**Why custom HS256 JWTs instead of Supabase Auth.** Supabase Auth ships email/password + magic-link plus a `sub = auth.users.id` claim. The platform needs role-scoped entity IDs (`subscriberId` / `agentId` / `branchId` / `distributorId`) directly on the token so RLS predicates like `agent_id = auth.jwt() ->> 'agentId'` resolve in a single column read. The custom JWT keeps the same `aud: 'authenticated'` audience PostgREST expects, signed with `SUPABASE_JWT_SECRET`, so all of PostgREST + RLS + the Realtime channel accept it natively.

**RLS-first.** Every direct write from a normal authenticated client must pass an explicit policy or go through a `SECURITY DEFINER` RPC. Tables with no INSERT/UPDATE/DELETE policy reject all client writes by default; the service-role key (server-only) bypasses RLS for seeding + the JWT-mint path.

---

## §2. Environment variables

`.env.local.example` lists six keys. Three are public (`VITE_*` prefix, exposed to the browser), three are server-only (never prefix with `VITE_`).

| Variable | Scope | Read by | Purpose | In `.env.local.example` |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | Public (frontend + server) | `api/_lib/supabase-admin.ts`, `src/services/supabaseClient.js` | Supabase project URL (`https://<ref>.supabase.co`) | Yes |
| `VITE_SUPABASE_ANON_KEY` | Public | `src/services/supabaseClient.js` | PostgREST anon-tier key (default RLS-restricted) | Yes |
| `VITE_USE_SUPABASE` | Public | `src/config/env.js` and every service file | Rollback flag — when `false`, services fall back to mockData (FRONTEND.md §4) | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** | `api/_lib/supabase-admin.ts` | Admin client used by all serverless routes (bypasses RLS) | Yes |
| `SUPABASE_JWT_SECRET` | **Server-only** | `api/_lib/jwt.ts` | HS256 signing secret; same secret PostgREST uses to verify JWTs | Yes |
| `SUPABASE_DB_URL` | **Local-only** | `scripts/seed-supabase.mjs` | Postgres pooler URL (port 6543) for `npm run seed` | Yes |

Notes:

- Never run `vercel env pull` — it overwrites `.env.local` and wipes `SUPABASE_DB_URL`, which is local-only by design.
- `VITE_*` keys are inlined into the client bundle at build time. Don't put a service-role key behind a `VITE_` prefix even by accident — it would ship to every browser session.
- `api/_lib/jwt.ts` decodes the JWT secret as base64 first (Supabase's default format), with a UTF-8 fallback if the round-trip check fails. This lets the same secret string work whether the project console exposes it base64-encoded or raw.

---

## §3. API route inventory

All 12 routes live under `api/`. Vercel maps each file to a route (`api/auth/send-otp.ts → POST /api/auth/send-otp`). HTTP request/response examples are in `docs/api-contracts.md`; this section documents handler files, auth wrapping, and behaviour only.

| Method | Path | Auth | Body schema | Response | Handler file |
|---|---|---|---|---|---|
| POST | `/api/auth/send-otp` | Public | `{ phone, role }` (phone `^\+256\d{9}$`, role enum) | `{ success: true }` | `api/auth/send-otp.ts` |
| POST | `/api/auth/verify-otp` | Public | `{ phone, otp, role }` (otp `^\d{6}$`) | `{ token, user }` or `{ error }` | `api/auth/verify-otp.ts` |
| POST | `/api/kyc/id-quality` | Public | `{ front?, back? }` envelope | `QualityReport` (blur/corners/glare + pass + score) | `api/kyc/id-quality.ts` |
| POST | `/api/kyc/id-ocr` | Public | `{ front, back, sessionId? }` envelope | `IdExtraction` (fullName, nin, dob, …, confidence) | `api/kyc/id-ocr.ts` |
| POST | `/api/kyc/nira-verify` | Public | `{ payload, sessionId? }` | `NiraResult` (`match` / `partial` / `no-match`) | `api/kyc/nira-verify.ts` |
| POST | `/api/kyc/otp-send` | Public | `{ phone }` | `{ success: true, expiresIn: 300 }` | `api/kyc/otp-send.ts` |
| POST | `/api/kyc/otp-verify` | Public | `{ phone, code }` (4-digit) | `{ verified: boolean }` | `api/kyc/otp-verify.ts` |
| POST | `/api/kyc/face-match` | Public | `{ selfieFile, nin, sessionId? }` | `FaceMatchResult` (match + liveness + score) | `api/kyc/face-match.ts` |
| POST | `/api/kyc/aml-screen` | Public | `{ payload, sessionId? }` | `{ outcome: 'clear' \| 'flagged', trackingId }` | `api/kyc/aml-screen.ts` |
| POST | `/api/kyc/agent-referral` | Public | `{ phone, reason, stage?, trackingId?, sessionId? }` | `{ ticketId, eta }` | `api/kyc/agent-referral.ts` |
| POST | `/api/chat` | `withOptionalAuth` | `{ message, context? }` | `{ reply, suggestions? }` | `api/chat.ts` |
| POST | `/api/contact` | Public | `{ name, email, message }` | `{ submitted: true, id }` | `api/contact.ts` |

Cross-cutting notes:

- Every route rejects non-POST methods with `405` (KYC routes set `Allow: POST`).
- Auth/contact/chat routes return `400` on malformed bodies; KYC routes return `400` only on missing required envelope fields (e.g. ID front+back, selfie). Force-overrides via `x-qa-force` header are documented inline at each file.
- `agent-referral` and `contact` write through `supabaseAdmin` (service-role) because the caller has no JWT — RLS would otherwise block the INSERT.
- All KYC stubs simulate realistic latencies (600–2200 ms) so the live demo's animated checks remain visible.

---

## §4. `_lib/` helpers

Four files in `api/_lib/`, all server-only.

| File | Purpose | Exports |
|---|---|---|
| `api/_lib/jwt.ts` | HS256 sign/verify via `jose` | `signJwt(claims) → Promise<string>`, `verifyJwt(token) → Promise<JwtClaims>`, types |
| `api/_lib/supabase-admin.ts` | Singleton service-role client (RLS-bypassing) | `default supabaseAdmin` (Proxy, lazy-init) |
| `api/_lib/withAuth.ts` | Bearer-JWT middleware; 401 on missing/invalid | `withAuth(handler) → VercelHandler`, types `AuthedRequest`/`AuthedHandler` |
| `api/_lib/withOptionalAuth.ts` | Bearer-JWT middleware; attaches `req.user: null` on miss | `withOptionalAuth(handler) → VercelHandler`, types `MaybeAuthedRequest`/`MaybeAuthedHandler` |

### JWT claim shape (single source of truth)

```ts
type JwtRole = 'subscriber' | 'agent' | 'branch' | 'distributor';

type JwtClaims = {
  iss: 'upensions';
  sub: string;                         // entity ID (subscriber/agent/branch/distributor row id)
  role: JwtRole;
  phone: string;
  subscriberId?: string;               // role === 'subscriber'
  agentId?: string;                    // role === 'agent'
  branchId?: string;                   // role === 'branch'
  distributorId?: string;              // role === 'distributor'
  aud: 'authenticated';                // required by PostgREST RLS
  exp: number;                         // 24h after iat
  iat: number;
};
```

- `signJwt` defaults `iss/aud/iat/exp` when omitted and serialises via `new SignJWT(...).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })`.
- `verifyJwt` validates signature + audience (`authenticated`) + issuer (`upensions`) + expiry. Any failure throws — callers map to 401.
- Secret bytes are cached on first decode (`getSecretKey()`).

### Supabase admin client

`supabase-admin.ts` returns a Proxy that lazy-instantiates the client on first property access, so unit tests + type-check passes don't throw when env vars are missing. The real client is built with `auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }` — serverless functions are stateless.

### `withAuth` vs `withOptionalAuth`

- `withAuth` rejects with `401 { error: 'unauthorized' }` if Bearer is missing or invalid. Used by future authenticated routes (no current routes wrap with it — see Backend findings §14b).
- `withOptionalAuth` swallows invalid tokens and attaches `req.user = null`. Used by `/api/chat` so the landing-page chat works for unauthenticated visitors while signed-in users get role-aware replies.

---

## §5. Auth flow end-to-end

1. **`POST /api/auth/send-otp`** — Validates `phone` (`^\+256\d{9}$`) + role (subscriber/agent/branch/distributor). No SMS provider is wired in (demo scope). Always returns `{ success: true }` on a well-formed body.
2. **User enters any 6-digit code** (demo OTP — see §14a).
3. **`POST /api/auth/verify-otp`** — Validates `phone` + `otp` (`^\d{6}$`) + `role`. Then:
    - If `role === 'subscriber'`, looks up `subscribers` by `phone` (single row, `maybeSingle`). If no match → `401 { error: 'invalid_otp' }` (subscriber must have completed signup first).
    - For other roles, looks up `demo_personas` by `(phone, role)`. If no match, falls back to the hardcoded ID: `agent → 'a-001'`, `branch → 'b-kam-015'`, `distributor → 'd-001'`. The fallback keeps every login successful in a sales demo even when the persona row is missing.
    - Upserts `users(phone, role, last_login_at)` with `onConflict: 'phone,role'` (non-fatal if it fails — log + continue).
    - Builds the JWT claims, fills the role-specific `*Id` field, signs with `signJwt`.
4. **Response:** `{ token, user }` where `user = { role, phone, name?, subscriberId?|agentId?|branchId?|distributorId? }`. The frontend `AuthContext.login` writes the token to `localStorage.upensions_token` and the user payload to `localStorage.upensions_auth`.
5. **Subsequent requests** to PostgREST use the JWT in `Authorization: Bearer <token>` and `apikey: <anon_key>` headers. RLS predicates read `auth.jwt() ->> '<claim>'` (NOT `auth.uid()`, which is NULL for custom JWTs — see §8).
6. **Expiry.** JWT TTL is fixed at 24h (`DEFAULT_EXPIRY_SECONDS = 60 * 60 * 24`). No refresh path. On 401 from any service call, the frontend dispatches an `onAuthExpired` event; `AuthContext` consumes it to logout + redirect (FRONTEND.md §5).

---

## §6. Schema overview

**21 tables** (verified: `grep -c '^CREATE TABLE' supabase/migrations/0001_initial_schema.sql` = 20, plus `distributors` added in `0016_distributors_table.sql`). 4 ENUMs. `pg_trgm` extension. 11 explicit indexes (8 in `0001` + 3 partial UNIQUE in `0016` — see below). All primary keys are `TEXT` for deterministic seed IDs (`a-001`, `b-kam-015`, `c-00001`, `d-001`).

Field-level definitions live in `docs/data-model.md` — only domain grouping + one-line purpose is captured here.

### Domain: Geo (2 tables)

| Table | Purpose |
|---|---|
| `regions` | 4 static rows (Central/Eastern/Northern/Western). `parent_id` always `'ug'`. |
| `districts` | 135 static rows from the GADM list; FK → `regions(id)`. |

### Domain: Network (3 tables)

| Table | Purpose |
|---|---|
| `distributors` | National-singleton network operator. 1 row: `d-001` "Universal Pensions Uganda — National". Columns: `id TEXT PK`, `name`, `parent_id` (default `'ug'`), `manager_name`, `manager_email`, `manager_phone`, `status`, `created_at`, `updated_at`. Sits above `branches` in the entity hierarchy (Country → Distributor → Region/District → Branch → Agent → Subscriber); see `docs/data-model.md`. |
| `branches` | ~314 rows; FK → `districts(id)`. Carries denorm `score`, `rank`, `district_rank`, `district_branch_count` (seeded once). |
| `agents` | ~500–2,000 rows; FK → `branches(id)`. `languages` / `specialties` are JSONB arrays. |

### Domain: Subscribers + per-subscriber tables (8 tables)

| Table | Purpose |
|---|---|
| `subscribers` | ~30k rows; FK → `agents(id)` + `districts(id)`. Partial `UNIQUE(phone) WHERE NOT is_demo_signup` lets demo signups collide-and-overwrite. |
| `subscriber_balances` | One row per subscriber; maintained by trigger (§11). |
| `contribution_schedules` | One row per subscriber; UPSERTed at signup. `retirement_pct + emergency_pct = 100`. |
| `insurance_policies` | One row per subscriber; nullable; `status` ∈ `'active' | 'inactive'`. |
| `nominees` | Pension + insurance beneficiaries; per-row CHECK `0 ≤ share ≤ 100` (no sum-to-100 constraint — see §14b). |
| `transactions` | Append-only ledger; triggers update balances + first-contribution commission. |
| `claims` | Insurance claims; per-subscriber. |
| `withdrawals` | Withdrawal records; per-subscriber. |

### Domain: Commissions (4 tables)

| Table | Purpose |
|---|---|
| `commission_config` | Singleton row (`CHECK id = 'default'`); `rate`, `cadence`, `next_run_date`. |
| `settlement_runs` | Bundles many commissions paid out together; `state` ∈ `draft / branch_review / released / cancelled`. |
| `settlement_run_branch_reviews` | Composite PK `(run_id, branch_id)`; per-branch state inside a run. |
| `commissions` | State-machine row (see §10). Denormalises `branch_id` + `subscriber_name` to keep RLS + run listings cheap. |

### Domain: KYC / Auth (4 tables)

| Table | Purpose |
|---|---|
| `users` | Auth identities. `UNIQUE(phone, role)` lets one phone attach to multiple roles. |
| `demo_personas` | `(phone, role) → entity_id` lookup for non-subscriber roles. 7 seeded rows. |
| `agent_referrals` | KYC fallback referrals (from `/api/kyc/agent-referral`). |
| `contact_submissions` | Landing-page contact form submissions (from `/api/contact`). |

**Domain count check.** Post-`0016` partitioning (Geo 2 / Network 3 / Subscribers 8 / Commissions 4 / KYC-Auth 4) sums to 21 tables. `distributors` joins Network alongside `branches` + `agents`.

### ENUMs

| ENUM | Values |
|---|---|
| `commission_status` | `due, in_run, held, disputed, released, confirmed, rejected` |
| `settlement_run_state` | `draft, branch_review, released, cancelled` |
| `settlement_run_branch_review_state` | `pending, approved, released` |
| `nominee_type` | `pension, insurance` |

### Indexes (11 explicit)

From `0001_initial_schema.sql` (8):

- `subscribers (agent_id)`
- `subscribers (phone) WHERE is_demo_signup = FALSE` — partial UNIQUE
- `transactions (subscriber_id, date DESC)`
- `commissions (agent_id, status)`
- `commissions (branch_id, status)`
- `commissions (run_id)`
- `settlement_run_branch_reviews (branch_id)`
- `users (phone)` + `demo_personas (phone, role)`

Added in `0016_distributors_table.sql` (3 — defensive partial-UNIQUE constraints layered after seed dedup):

- `ux_agents_email` ON `agents (email) WHERE email IS NOT NULL` — partial UNIQUE; collapses the historical duplicate-email cluster (1,057 NULL'd at backfill) and prevents new collisions.
- `ux_subscribers_nin` ON `subscribers (nin) WHERE nin IS NOT NULL` — partial UNIQUE; guards against the rare duplicate-NIN bug surfaced by the audit (2 NULL'd at backfill).
- `ux_commissions_agent_subscriber` ON `commissions (agent_id, subscriber_id)` — UNIQUE; closes the first-contribution-commission double-click race called out in §14b (the trigger's `NOT EXISTS` pre-check is now backed by a hard constraint).

---

## §7. Migration history

Forward-only discipline: never edit a shipped migration; add `00NN_*.sql`. The 6 migrations total **3,835 lines** across 6 files.

| File | Lines | Scope | Adds |
|---|---|---|---|
| `0001_initial_schema.sql` | 494 | Schema bootstrap | 20 tables · 4 ENUMs · 8 indexes · `pg_trgm` ext |
| `0002_rpc_functions.sql` | 1,290 | Triggers + RPCs | 4 triggers · 7 read RPCs · 2 atomic-write RPCs (plus 2 private helpers `_validate_signup_payload`, `_insert_subscriber_chain`) |
| `0003_rls_policies.sql` | 896 | RLS + realtime | 65 policies (49 SELECT + 16 INSERT/UPDATE/DELETE), `ENABLE + FORCE` RLS on all 20 tables, realtime publication tuned |
| `0004_commission_run_rpcs.sql` | 1,055 | State-machine RPCs | 13 SECURITY DEFINER RPCs (see §10) |
| `0005_subscriber_update_fix.sql` | 72 | Bugfix | Drops correlated-subquery WITH CHECK on `subscribers_update_self`; adds BEFORE UPDATE trigger `trg_subscribers_enforce_editable_cols` |
| `0006_trigger_security_definer.sql` | 28 | Privilege fix | Promotes 3 trigger functions to `SECURITY DEFINER` + pinned search_path |

Breaking-change discipline: 0005 + 0006 each fix concrete runtime errors (infinite recursion in `subscribers_update_self`; subscriber-role INSERTs failing on cross-table trigger writes). Neither rewrites schema.

---

## §8. RLS model

### Canonical JWT claim shape

Every JWT signed by `api/_lib/jwt.ts#signJwt` carries exactly these claims (HS256 via `jose`):

| Claim | Value | Purpose |
|---|---|---|
| `iss` | `'upensions'` (hardcoded) | Issuer |
| `aud` | `'authenticated'` (hardcoded) | Audience PostgREST requires |
| `role` | `'authenticated'` (hardcoded) | **Postgres role** for PostgREST `SET ROLE` — **NOT** the application role |
| `app_role` | `'subscriber' \| 'agent' \| 'branch' \| 'distributor' \| 'admin'` | **Application role** — what RLS + RPCs gate on |
| `sub` | role-scoped entity ID | RFC subject |
| `subscriberId` / `agentId` / `branchId` / `distributorId` | TEXT | Set on whichever claim matches `app_role` |
| `phone` | canonical `+256…` | Phone number used at OTP |
| `iat` / `exp` | UNIX timestamps | 24h fixed TTL |

**Critical**: reading `auth.jwt() ->> 'role'` returns `'authenticated'` for every request — it is the PostgREST `SET ROLE` mechanism, not the app role. RLS and RPCs that need the app role MUST read `auth.jwt() ->> 'app_role'`. Migrations 0018 and 0004 originally read the wrong claim and silently failed; 0020 + 0021 fixed them. The contract is enforced by the migration test in `src/tests/jwt-claim-contract.test.js`.

**Key principle.** RLS reads JWT claims via `auth.jwt() ->> '<key>'`, **never** `auth.uid()`. Custom-issued JWTs have no Supabase `auth.users` mapping, so `auth.uid()` is `NULL`. Every policy (since `0007_rls_use_app_role.sql`) keys off `app_role` + the role-scoped ID claim.

**Force-on.** Every table is both `ENABLE` and `FORCE` ROW LEVEL SECURITY — table owners are not exempt.

**Write-table policy gap is intentional.** `commissions`, `settlement_runs`, and `settlement_run_branch_reviews` have **no** direct INSERT/UPDATE/DELETE policies. Every write flows through the SECURITY DEFINER state-machine RPCs in `0004_*.sql` (§10).

### Per-role permission matrix

| Table | subscriber | agent | branch | distributor |
|---|---|---|---|---|
| `regions` | R | R | R | R |
| `districts` | R | R | R | R |
| `distributors` | R | R | R | R + U (own row only — `auth.jwt() ->> 'distributorId' = id`) |
| `branches` | R | R | R | R + IU |
| `agents` | R | R | R + IU (own branch) | R |
| `commission_config` | R | R | R | R + U |
| `demo_personas` | R | R | R | R |
| `subscribers` | R + U (self, editable cols only) | R + I (own) | R (via agent.branch_id) | R |
| `subscriber_balances` | R (self) | R (own subscribers) | R (own branch's subscribers) | R |
| `contribution_schedules` | R + U (self) | R (own subscribers) | R (own branch's subscribers) | R |
| `insurance_policies` | R + IU (self) | R (own subscribers) | R (own branch's subscribers) | R |
| `nominees` | R + IUD (self) | R (own subscribers) | R (own branch's subscribers) | R |
| `transactions` | R + I (self) | R (own subscribers) | R (own branch's subscribers) | R |
| `claims` | R + I (self) | R (own subscribers) | R (own branch's subscribers) | R |
| `withdrawals` | R + I (self) | R (own subscribers) | R (own branch's subscribers) | R |
| `commissions` | — | R (`agent_id = agentId`) | R (`branch_id = branchId`) | R |
| `settlement_runs` | — | R (own runs via `commissions.run_id`) | R (own runs via `branch_reviews`) | R |
| `settlement_run_branch_reviews` | — | — | R (`branch_id = branchId`) | R |
| `users` | — | — | — | R |
| `agent_referrals` | — | — | — | R |
| `contact_submissions` | — | — | — | R |

Legend: R = SELECT, I = INSERT, U = UPDATE, D = DELETE. Employer + admin roles have **no** policies (no rows would satisfy any USING clause).

### Notable policy details

- `subscribers_update_self` (after 0005) is ownership-only; column immutability is enforced by `trg_subscribers_enforce_editable_cols` (BEFORE UPDATE). Editable: `name, email, phone, occupation, consent_at`.
- Reference-table SELECT policies gate on `auth.jwt() ->> 'app_role' IS NOT NULL` — any authenticated app role passes.
- Subscribers + balances + transactions etc. share the same 4-policy pattern: self / agent (via `subscribers.agent_id`) / branch (via `agents.branch_id`) / distributor (unrestricted).
- **`distributors` policies (`0016`):**
  - `distributors_select USING (true)` — every authenticated role can read the singleton row. Lets the distributor metrics widget render for branch/agent/subscriber pages that show "Operated by Universal Pensions Uganda" attribution without leaking other tables.
  - `distributors_update_self USING (auth.jwt() ->> 'distributorId' = id)` — only the distributor role (and only against their own row) can update. With the seed shipping a single row (`d-001`), this is effectively "distributor edits its own contact details" today; the policy is shaped for the multi-distributor case.

### Realtime publication tuning

`0003_*.sql` reshapes `supabase_realtime` membership:

- **ON:** `commissions`, `settlement_runs`, `settlement_run_branch_reviews` — cross-laptop demo loops (branch approves on laptop A → distributor sees update on laptop B). Low write volume.
- **OFF:** `transactions`, `subscribers`, `subscriber_balances` — high-write tables would burn free-tier connections. React Query's 5-minute staleTime + manual invalidation is sufficient.

---

## §9. RPCs

**29 functions total** across all migrations (verified: `grep -c 'CREATE OR REPLACE FUNCTION' supabase/migrations/*.sql` = 15 + 13 + 1 = 29, of which 4 are trigger functions). The breakdown that matters:

- **4 trigger functions** (in `0002_*.sql`) — see §11
- **2 private helpers** (in `0002_*.sql`) — `_validate_signup_payload`, `_insert_subscriber_chain`
- **7 read RPCs** (in `0002_*.sql`) — public surface
- **2 atomic-write RPCs** (in `0002_*.sql`) — public surface
- **13 state-machine RPCs** (in `0004_*.sql`)
- **1 trigger function** (in `0005_*.sql`) — `trg_subscribers_enforce_editable_cols`

Public RPC surface = 7 + 2 + 13 = **22**. Total functions (incl. trigger + helper functions) = 29.

### Read RPCs (7)

All `LANGUAGE plpgsql STABLE` (not SECURITY DEFINER — they run under the caller's RLS context). `GRANT EXECUTE TO authenticated`.

| RPC | Signature | Returns | Caller |
|---|---|---|---|
| `get_entity_commission_summary` | `(p_level TEXT, p_entity_id TEXT)` | `jsonb` (totalPaid/Due/Disputed/etc.) | `src/services/commissions.js#getEntityCommissionSummary` |
| `get_top_branch` | `(p_level TEXT, p_parent_id TEXT)` | `jsonb { name, contribution }` or `NULL` | `entities.js#getTopPerformingBranch` |
| `get_breadcrumb` | `(p_level TEXT, p_ids jsonb)` | `jsonb[]` of `{ level, id, name }` | `entities.js#getBreadcrumb` |
| `search_entities` | `(p_q TEXT)` | `TABLE(entity_id, entity_name, level, label, parent_id, score)`, LIMIT 8 | `search.js#searchEntities` |
| `get_agent_commission_detail` | `(p_agent_id TEXT)` | `jsonb` (paid + due txn arrays, totals, breakdown) | `commissions.js#getAgentCommissionDetail` |
| `get_commission_summary` | `(p_period TEXT DEFAULT NULL)` | `jsonb` of network-wide totals | `commissions.js#getCommissionSummary` |
| `get_run_branch_breakdown` | `(p_run_id TEXT)` | `jsonb` of per-branch run rollups | `commissions.js#getRunBranchBreakdown` |
| `get_entity_metrics_rollup` | `(p_level TEXT, p_entity_ids TEXT[])` | `jsonb` keyed by entity id; values carry 8 base counts + time-period buckets (`daily/weekly/monthlyContributions[12]/Withdrawals` + `prev*`), `newSubscribers*`, `genderRatio`, `ageDistribution`, `kycPending/Incomplete` | `entities.js#getEntityMetricsRollup` (powers `useEntityMetrics` / `useChildrenMetrics` / `useAllEntitiesMetrics`). `SECURITY DEFINER` with `app_role`-gated role check (`COALESCE(auth.jwt() ->> 'app_role', '')` — NULL-safe). Time buckets anchor on `_demo_now()` (see `0020_entity_metrics_rollup_v3.sql`, which supersedes 0018 and the abandoned 0019 hotfixes). |

`search_entities` uses `pg_trgm`'s `%` operator + `similarity()` for fuzzy matching across regions / districts / branches / agents / subscribers. Hardcoded `LIMIT 8` (§14a).

### Atomic-write RPCs (2)

Both `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`. Wrap multi-table inserts so signup is one transactional unit.

```sql
create_subscriber_from_signup(payload jsonb) RETURNS TEXT
create_subscriber_from_agent_onboard(payload jsonb, calling_agent_id TEXT) RETURNS TEXT
```

Shared work (via `_insert_subscriber_chain`):

- Validates payload (`_validate_signup_payload` — IMMUTABLE; throws `RAISE EXCEPTION` on malformed input).
- Inserts subscriber row (idempotent on phone via the partial unique index — re-runs overwrite).
- Inserts `subscriber_balances` (relies on `trg_subscribers_after_insert` plus an explicit upsert).
- Inserts `contribution_schedules` (frequency, amount, 80/20 default retirement/emergency unless caller overrides).
- Inserts `insurance_policies` (when included).
- Inserts `nominees` (pension + insurance).
- Inserts the first `transactions` row, which triggers `trg_transactions_contribution` → balance update + first-contribution `commissions` row at the configured rate.

`create_subscriber_from_signup` is granted to `anon, authenticated` so the signup flow works without a JWT yet. `create_subscriber_from_agent_onboard` is `authenticated`-only and cross-checks `calling_agent_id` against `auth.jwt() ->> 'agentId'` to defend against forged IDs.

### State-machine RPCs (13)

All in `0004_*.sql`, all `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`. Each validates `auth.jwt() ->> 'role'` against the allowed actor and `RAISE EXCEPTION`s on mismatch. Full state diagram in §10.

| RPC | Allowed role | What it does |
|---|---|---|
| `open_run()` | distributor | Bundles all `due` commissions into a new `r-YYYY-MM` run; sweeps them to `in_run`; seeds per-branch review rows. |
| `cancel_run(p_run_id)` | distributor | Reverses `open_run` — reverts `in_run → due`, deletes branch reviews, marks run `cancelled`. |
| `release_run(p_run_id)` | distributor | Flips every `held`/`released`/`approved` line to `released`; sets `paid_date`; marks run `released`. |
| `release_branch(p_run_id, p_branch_id)` | distributor | Per-branch release; sets `released_at` on the branch review row. |
| `branch_approve_all(p_run_id)` | branch | Approves every line in the caller's branch in one go. Returns count touched. |
| `mark_branch_reviewed(p_run_id)` | branch | Flips branch review state `pending → approved`. |
| `branch_approve_line(p_commission_id)` | branch | Approves a single line. |
| `branch_hold_line(p_commission_id, p_hold_reason)` | branch | `in_run → held`. Reason stored. |
| `branch_dispute_line(p_commission_id, p_dispute_reason)` | branch | Snapshots `previous_status`, sets `disputed`, `disputed_by = 'branch'`. |
| `agent_dispute_line(p_commission_id, p_dispute_reason)` | agent | Already shipped in `0014_signup_phone_and_agent_dispute.sql`. Mirrors `branch_dispute_line`: snapshots `previous_status`, sets `disputed`, `disputed_by = 'agent'`, stamps `disputed_at = now()`, stores `dispute_reason`. JWT check requires `role = 'agent'` AND `commissions.agent_id = auth.jwt() ->> 'agentId'`. Frontend `services/commissions.js#disputeCommission(by='agent')` should route here (see §14b — the original "not built" finding is now obsolete). |
| `approve_dispute(p_commission_id, p_outcome_reason?)` | distributor | Restores `previous_status` (fallback `due`); clears dispute fields. |
| `reject_dispute(p_commission_id, p_outcome_reason)` | distributor | Terminal `rejected`. |
| `withdraw_dispute(p_commission_id)` | agent | Restores `previous_status`; clears dispute fields. |
| `agent_confirm_commission(p_commission_id)` | agent | Sets `agent_confirmed = TRUE` on a released/paid line. Maker-checker counterpart to admin settlement. |

**Agent dispute path.** `agent_dispute_line(p_commission_id TEXT, p_dispute_reason TEXT)` now covers the agent surface (shipped in `0014`). The frontend service must wire `disputeCommission(by='agent')` to `supabase.rpc('agent_dispute_line', { p_commission_id, p_dispute_reason })`; the legacy "not built" error path in `services/commissions.js` is the only blocker (see §14b).

---

## §10. Commission state machine

States are `commission_status` ENUM values. Transitions are RPC-driven (each RPC validates the role) plus the BEFORE UPDATE trigger that snapshots `previous_status` whenever a row enters `disputed`.

### State diagram

```
                       ┌──────────┐
              insert → │   due    │ ← cancel_run / withdraw_dispute / approve_dispute (fallback)
                       └────┬─────┘
                 open_run() │
                            ▼
                       ┌──────────┐
              ┌────────│  in_run  │
              │        └───┬──┬───┘
   branch_    │ branch_    │  │ branch_dispute_line
   hold_line  │ approve_   │  │  (snapshot previous_status)
              │ line       │  │
              ▼            │  ▼
       ┌──────────┐        │  ┌──────────┐ ← branch_dispute_line
       │   held   │────────┘  │ disputed │ ← withdraw_dispute (agent) restores prev
       └─────┬────┘           │          │ ← approve_dispute (dist) restores prev / due
             │ release_run    │          │ ← reject_dispute (dist) → rejected
             │ release_branch │          │
             ▼                ▼          │
       ┌─────────────────────────┐       │
       │       released          │       │
       └────┬────────────────────┘       │
            │ agent_confirm_commission   │
            ▼                            ▼
       ┌──────────┐                ┌──────────┐
       │ confirmed│                │ rejected │ (terminal)
       └──────────┘                └──────────┘
```

### Transition table

| From | To | Actor | RPC | RLS / role check | Side effects |
|---|---|---|---|---|---|
| (insert) | `due` | trigger | `trg_transactions_contribution` | n/a (SECURITY DEFINER) | First-contribution commission row at `commission_config.rate` |
| `due` | `in_run` | distributor | `open_run()` | `role = 'distributor'` | Creates `settlement_runs` row + `branch_reviews` rows |
| `in_run` | `due` | distributor | `cancel_run(run_id)` | `role = 'distributor'` | Deletes branch reviews; run state → `cancelled` |
| `in_run` | `held` | branch | `branch_hold_line(c_id, reason)` | `role = 'branch'`, branch owns line | `hold_reason` set |
| `held` | `in_run` | branch | `branch_approve_line(c_id)` | `role = 'branch'`, branch owns line | `hold_reason` cleared |
| `in_run`/`held` | `disputed` | branch | `branch_dispute_line(c_id, reason)` | `role = 'branch'`, branch owns line | `previous_status` snapshot via BEFORE UPDATE trigger; `disputed_by='branch'`, `disputed_at=now()`, `dispute_reason` set |
| `in_run`/`held` | `disputed` | agent | `agent_dispute_line(c_id, reason)` | `role = 'agent'`, agent owns line | `previous_status` snapshot via BEFORE UPDATE trigger; `disputed_by='agent'`, `disputed_at=now()`, `dispute_reason` set |
| `disputed` | `<previous_status>` or `due` | distributor | `approve_dispute(c_id, outcome?)` | `role = 'distributor'` | Clears dispute fields; sets `resolved_at`/`resolved_by`/`outcome_reason` |
| `disputed` | `rejected` | distributor | `reject_dispute(c_id, outcome)` | `role = 'distributor'` | Terminal; `outcome_reason` required |
| `disputed` | `<previous_status>` | agent | `withdraw_dispute(c_id)` | `role = 'agent'`, agent owns line | Clears dispute fields |
| `in_run`/`held` | `released` | distributor | `release_run(run_id)` or `release_branch(run_id, branch_id)` | `role = 'distributor'` | `paid_date = now()`; run/branch state → `released` |
| `released` | `confirmed` | agent | `agent_confirm_commission(c_id)` | `role = 'agent'`, agent owns line | `agent_confirmed = TRUE` (maker-checker) |

**Dispute snapshot mechanic.** `commissions.previous_status` is set by the BEFORE UPDATE trigger (`trg_commissions_before_update`) any time `status` transitions into `disputed` from another state. `approve_dispute` / `withdraw_dispute` read it back to restore the pre-dispute state; if NULL (e.g. set externally), they fall back to `due`.

**`disputed_by` convention.** TEXT column storing the literal role label `'agent'` or `'branch'` — not a user reference. Matches `mockData` convention (see `0004_*.sql` comment header).

---

## §11. Triggers

Five triggers across the migrations.

| Trigger | Table | Timing | Function | Security |
|---|---|---|---|---|
| `subscribers_after_insert` | `subscribers` | AFTER INSERT | `trg_subscribers_after_insert()` | DEFINER (0006) — seeds `subscriber_balances` row, ON CONFLICT DO NOTHING |
| `transactions_after_insert_contribution` | `transactions` WHEN type='contribution' | AFTER INSERT | `trg_transactions_contribution()` | DEFINER (0006) — bumps balances, applies 80/20 default split or explicit override, creates first-contribution commission at hardcoded **unit price 1,000 UGX/unit** |
| `transactions_after_insert_withdrawal` | `transactions` WHEN type='withdrawal' | AFTER INSERT | `trg_transactions_withdrawal()` | DEFINER (0006) — decrements balances; emergency-first fallback when split is missing |
| `commissions_before_update` | `commissions` | BEFORE UPDATE | `trg_commissions_before_update()` | not DEFINER (no cross-table writes) — snapshots `previous_status` when entering `disputed` |
| `subscribers_enforce_editable_cols` | `subscribers` | BEFORE UPDATE | `trg_subscribers_enforce_editable_cols()` (added in 0005) | regular — for subscriber-role JWTs only; rejects any change outside `name/email/phone/occupation/consent_at` |

**Why `0006` exists.** The contribution/withdrawal/subscriber-insert triggers maintain denormalized rows in `subscriber_balances` + `commissions`. When fired by a subscriber-role direct INSERT into `transactions` (the ad-hoc-contribution path), they inherited the subscriber's RLS context — which has no INSERT policy on `subscriber_balances` or `commissions`, so RLS rejected and the whole transaction aborted. `0006` promotes the three functions to `SECURITY DEFINER` + pins `search_path = public, pg_temp` to prevent search-path hijacks.

**Why `0005` exists.** The original `subscribers_update_self` WITH CHECK clause pinned non-editable columns via correlated subqueries against `subscribers` itself — Postgres treats that as another row-level check on the same table, producing infinite recursion. The fix simplifies the policy to ownership-only and enforces immutability via the `trg_subscribers_enforce_editable_cols` trigger (triggers don't re-evaluate RLS).

---

## §12. Seeding & utility scripts

Three scripts in `scripts/`.

### `scripts/seed-supabase.mjs` (35 KB, ~895 lines)

Run via `npm run seed`. Materialises the full `src/data/mockData.js` hierarchy into a Supabase Postgres DB.

Mechanics:

- Reads `SUPABASE_DB_URL` from `.env.local` (pooler URL, port 6543).
- Single `pg.Client` connection; wraps everything in `BEGIN … COMMIT`.
- Runs `SET session_replication_role = 'replica'` for the duration of the seed so the 30k seeded contribution transactions don't double-insert via `trg_transactions_contribution`. Restored to `'origin'` before `COMMIT` (and inside the `catch` for safety).
- Bulk insert via `INSERT … FROM unnest($1::type[], $2::type[], …) ON CONFLICT (pk) DO UPDATE` — one round-trip per 2,000-row chunk. Avoids per-row overhead while keeping idempotent on re-run.
- **Phone dedup:** subscribers with duplicate phones get reassigned to a synthetic `+25671XXXXXXX` range so the partial unique index `subscribers(phone) WHERE NOT is_demo_signup` stays satisfied. Tracked via a `Set`.
- `demo_personas` seeded explicitly: 3 agents (`a-001/a-042/a-118` at phones `+25670000001..3`), 2 branches (`b-kam-015/b-mba-290` at `+25670000011..12`), 2 distributors (`d-001/d-002` at `+25670000021..22`).

Approximate row volumes after seed:

| Table | Rows |
|---|---|
| regions | 4 |
| districts | 135 |
| branches | ~314 |
| agents | ~500–2,000 (depending on mock generation) |
| subscribers | ~30,000 |
| commissions | ~30,000 |
| settlement_runs | ~10 |
| demo_personas | 7 |

Re-run safety: every table's INSERT uses `ON CONFLICT (pk) DO UPDATE`, so subsequent runs converge rather than fail. Wall-clock runtime ≈ 2 minutes against a pooled project.

### `scripts/seed-loader.mjs` (32 lines)

Node ESM resolution hook registered before `import('../src/data/mockData.js')`. Auto-appends `.js` to extension-less relative specifiers (e.g. `import { DISTRICTS } from './mockGeo'`) so the seed can read `mockData.js` unchanged — Vite tolerates extension-less paths but raw Node ESM does not.

### `scripts/clip-districts.mjs` (~82 lines)

Boundary-clipping utility using `@turf/turf` (`intersect`, `featureCollection`). Reads `public/uganda-districts.geojson` + `public/uganda-regions.geojson`, intersects each district with its parent region, and writes the clipped output back. Backs up the original to `public/uganda-districts-original.geojson` on first run. Re-runs are idempotent (intersection of an already-clipped polygon with itself returns the same geometry).

Run manually: `node scripts/clip-districts.mjs`. Output is the canonical `public/uganda-districts.geojson` consumed by `src/dashboard/map/UgandaMap.jsx`.

---

## §13. Chat & contact endpoints

Two thin write/read routes that sit alongside the auth + KYC surface.

### `POST /api/chat`

- Wrapped with `withOptionalAuth` — `req.user: JwtClaims | null`.
- Role flavour resolved by precedence: JWT role → body `context` (only honoured if unauthenticated) → `'subscriber'` default.
- Mapping: `distributor/branch/admin → 'admin'` flavour, `agent → 'agent'` flavour, `subscriber → 'subscriber'` flavour.
- Replies are keyword-matched canned strings (no LLM). The "admin" flavour intentionally uses hard-coded numbers (~30k subscribers, ~78% active rate, etc.) so the route doesn't pull the entire mockData graph into the serverless bundle.
- Response shape: `{ reply, suggestions? }`.
- Important: body `context` MUST NOT override a JWT-verified role. `resolveFlavor` always trusts `req.user.role` first.

### `POST /api/contact`

- Public. Validates `{ name, email, message }` (same regex as the frontend: `/^[^@\s]+@[^@\s]+\.[^@\s]+$/`).
- Inserts into `contact_submissions` via `supabaseAdmin` (service-role bypasses RLS — the form is open to anonymous visitors).
- Generates a row ID locally (`cs-<epoch>-<rand>`); not exposed to the user except in the success response (for support traceability).
- Returns `{ submitted: true, id }`.

---

## §14. Backend findings

### §14a. Demo scope (by design — do not "fix")

Every item below is intentional for a sales-rep demo. Never frame as a production-prep TODO.

- **Any 6-digit OTP accepted** at `/api/auth/verify-otp` (regex `^\d{6}$` is the only check). No SMS provider, no rate limiting, no lockout. Same for KYC OTP at `/api/kyc/otp-verify` (4 digits, rejects `'0000'` only).
- **All KYC routes are mocks** (`id-quality`, `id-ocr`, `nira-verify`, `otp-send`, `otp-verify`, `face-match`, `aml-screen`, `agent-referral`). Realistic latencies preserved so the live demo's animated checks land cleanly. Force-overrides via `x-qa-force` header (e.g. `fail-blur`, `partial`, `flagged`) mirror the frontend's `localStorage upensions_*_force` keys.
- **Unit price hardcoded to 1,000 UGX/unit** in `trg_transactions_contribution` (`v_unit_price NUMERIC := 1000`). No fund NAV table.
- **JWT fixed 24h TTL, no refresh** (`DEFAULT_EXPIRY_SECONDS = 60 * 60 * 24`). On 401 the frontend logs out gracefully.
- **`demo_personas` fallback IDs** for non-subscriber roles when the phone has no persona row: `agent → 'a-001'`, `branch → 'b-kam-015'`, `distributor → 'd-001'`. Keeps every login successful for a sales demo even if the persona seed drifted.
- **`district_rank` / `rank` / `district_branch_count`** on `branches` are computed once at seed time. No daily ranking job. Fine for static demo data.
- **`commission_config` is a singleton** (`CHECK id = 'default'`); no UPDATE history table, no versioning.
- **`contribution_history`** is a JSONB sparkline denormalized from `transactions`; no consistency trigger keeps it in sync with the ledger.
- **`search_entities` hardcoded `LIMIT 8`.** Plenty for a demo's autocomplete UX.
- **No CSRF / origin checks** on the public POST routes. Acceptable because the demo runs from a single allowed origin.

### §14b. Real bugs / awareness items

These affect the demo experience or future sessions — track but do NOT bundle with §14a.

- **Agent-side `disputeCommission` not wired to its RPC.** The SQL counterpart `agent_dispute_line(p_commission_id, p_dispute_reason)` ships in `0014_signup_phone_and_agent_dispute.sql` (signature documented in §9), but `src/services/commissions.js#disputeCommission(by='agent')` still rejects with the legacy "not built" Error. Fix is purely frontend: replace the reject branch with `supabase.rpc('agent_dispute_line', { p_commission_id, p_dispute_reason })` and invalidate the usual commission keys.
- **`nominees.share` lacks a sum-to-100 constraint.** Per-row `CHECK (share >= 0 AND share <= 100)` is the only guard. A demo could enter three pension nominees at 50% each and the table happily saves the row. Fix: a deferred constraint trigger that sums per `(subscriber_id, type)`.
- **First-contribution commission race — fixed in `0016`.** `commissions` now carries `ux_commissions_agent_subscriber UNIQUE(agent_id, subscriber_id)`. The trigger's `NOT EXISTS` pre-check is preserved as a fast path; the unique index is the authoritative guard against a double-click race.
- **Employer + admin roles have no RLS policies and no dashboards.** Hitting any role-aware route returns empty results.
- **No `withAuth`-wrapped routes today.** Every authenticated database operation goes through PostgREST directly with the JWT; the wrapper exists but only `/api/chat` consumes `withOptionalAuth`. Future routes that need server-side enforcement (e.g. a hypothetical admin reset endpoint) should adopt `withAuth`.
- **Dispute `reason` is free text.** Stored as TEXT on `commissions.dispute_reason`. UI shows whatever was typed. Worth knowing during demo storytelling.
- **`agent_referrals` row PK is `ar-<epoch>-<rand>`** — collision-tolerant but not cryptographic. Public-facing `ticket_id` is `UAG-<4 chars>` from a 36-char alphabet (~1.7M space); fine for demo volume.
- **No retry / idempotency keys** on `/api/contact` or `/api/kyc/agent-referral`. A re-submit creates a second row.

---

## §15. Operational runbook

### Local development

`supabase/config.toml` controls the local CLI emulator only (not the hosted project). Key ports:

| Service | Port | Notes |
|---|---|---|
| API gateway | 54321 | `[api]` block, line 10 |
| Postgres | 54322 | `[db]` block, line 29 |
| Studio | 54323 | `[studio]` block, line 91 |
| Inbucket (email) | 54324 | dev mail catcher |
| Shadow DB | 54329 | for `supabase db diff` |

`project_id = "uganda-dashboard"` (line 5).

### Common operations

| Task | Command / SQL |
|---|---|
| Start local Supabase | `supabase start` (uses `supabase/config.toml`) |
| Apply migrations locally | `supabase db reset` (re-runs every `00NN_*.sql` from scratch) |
| Push migrations to hosted project | `supabase db push` |
| Tail Vercel logs | `vercel logs <deployment-url>` or open the project dashboard |
| Reseed Postgres | `npm run seed` (reads `SUPABASE_DB_URL` from `.env.local`) |
| Clip GeoJSON | `node scripts/clip-districts.mjs` |
| Test a read RPC from psql | `SELECT public.get_entity_commission_summary('region', 'r-central');` |
| Test as a specific role | `SET LOCAL request.jwt.claims = '{"role":"agent","agentId":"a-001","aud":"authenticated"}'; SELECT count(*) FROM subscribers;` |
| Rotate JWT secret | Project Settings → API → JWT settings → rotate. Update `SUPABASE_JWT_SECRET` in Vercel env (Preview + Production), then push — existing tokens become invalid (forced logout). |
| Inspect realtime publication | `SELECT pubname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';` |

### Migration discipline (forward-only)

- Never edit a shipped migration file. The Supabase migration system records each file's hash; editing a shipped file breaks `db push`.
- For schema fixes, add a new `00NN_*.sql` — see `0005` (RLS recursion fix) and `0006` (trigger SECURITY DEFINER promotion) for templates.
- For RPC body changes, `CREATE OR REPLACE FUNCTION` in a new migration. The grants in `0002_*.sql` follow each function definition; new migrations inherit those unless the signature changes.

### Smoke checks after deploy

- `POST /api/contact` with a dummy body — verify row appears in `contact_submissions`.
- `POST /api/auth/send-otp` then `verify-otp` with a known demo persona phone (`+256700000001` → agent a-001) — verify `users` row upserts and JWT round-trips.
- Open `/dashboard` as that agent — verify the agent-scoped queries return rows (RLS predicate `agent_id = auth.jwt() ->> 'agentId'` must match).
- Run an `open_run()` from the distributor account and confirm the realtime channel pushes `commissions` changes to other connected clients.

---

## §16. See also

- `CLAUDE.md` — slim index, hard rules, glossary, demo credentials, awareness items.
- `FRONTEND.md` — service/hook/context inventory, dashboard variants, design tokens, React Query keys + invalidation, frontend-side demo behaviours.
- `docs/api-contracts.md` — HTTP request/response shapes for every route + React Query cache keys + invalidation rules.
- `docs/data-model.md` — field-level entity definitions, metric-aggregation rules, branch-health-score formula, KYC/withdrawal/AUM open questions.
- `docs/SPEC.md` — product spec: personas, workflows (enrollment, contributions, commissions, withdrawals, KYC, reporting), business rules.
