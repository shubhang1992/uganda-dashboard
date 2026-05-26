# BACKEND.md — Universal Pensions Uganda

Deep backend reference. Pair with `CLAUDE.md` (slim index) and `FRONTEND.md` (deep frontend reference).

Covers the Vercel serverless TypeScript routes under `api/**`, the Supabase Postgres schema + RPCs + RLS in `supabase/migrations/*.sql`, the seed and utility scripts under `scripts/`, and the operational runbook for local + hosted environments.

> **Scope note.** This platform is a sales-rep **demo**, not a production fintech. Many behaviours (any-6-digit OTP, hardcoded UGX 1,000 unit price, fixed 24h JWT TTL, no refresh, `demo_personas` fallback IDs, mocked KYC, mocked chat, per-session mutation stores) are intentional. See §14a — never reframe them as production-prep TODOs.

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
                  │  21 tables · 4 ENUMs · pg_trgm · 5 triggers     │
                  │  29 RPCs (mostly SECURITY DEFINER)              │
                  │  65 RLS policies (zero auth.uid() calls)        │
                  │  supabase_realtime publication: empty (0025)    │
                  └─────────────────────────────────────────────────┘
```

**RLS-first.** Every direct write from a normal authenticated client must pass an explicit policy or go through a `SECURITY DEFINER` RPC. Tables with no INSERT/UPDATE/DELETE policy reject all client writes by default; the service-role key (server-only) bypasses RLS for seeding + the JWT-mint path.

---

## §2. Environment variables

The canonical template is `.env.local.example`. Three keys are public (`VITE_*` prefix, exposed to the browser at build time), three are server-only (never prefix with `VITE_`).

| Variable | Scope | Read by | Purpose | In `.env.local.example` |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | Public (frontend + server) | `api/_lib/supabase-admin.ts`, `src/services/supabaseClient.js` | Supabase project URL (`https://<ref>.supabase.co`) | Yes |
| `VITE_SUPABASE_ANON_KEY` | Public | `src/services/supabaseClient.js` | PostgREST anon-tier key (default RLS-restricted) | Yes |
| `VITE_USE_SUPABASE` | Public | `src/config/env.js` + every service file | Rollback flag — when `'false'`, services fall back to mockData (FRONTEND.md §4) | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** | `api/_lib/supabase-admin.ts` | Admin client used by all serverless routes (bypasses RLS) | Yes |
| `SUPABASE_JWT_SECRET` | **Server-only** | `api/_lib/jwt.ts` | HS256 signing secret; same secret PostgREST uses to verify JWTs | Yes |
| `SUPABASE_DB_URL` | **Local-only** | `scripts/seed-supabase.mjs` | Postgres pooler URL (port 6543) for `npm run seed` | Yes |

### Frontend-only keys consumed by `src/config/env.js`

These keys are read by the frontend but **missing from `.env.local.example`** (audit X5). Defaults are baked into `src/config/env.js`, so the demo runs without them — list and add as needed:

| Variable | Default fallback |
|---|---|
| `VITE_API_BASE_URL` | `/api` (used as `services/api.js` base; current code hardcodes `'/api'` and doesn't actually consume the env value — audit X15) |
| `VITE_LEGAL_TERMS_URL` | `https://universalpensions.com/legal/terms` |
| `VITE_LEGAL_PRIVACY_URL` | `https://universalpensions.com/legal/privacy` |
| `VITE_SUPPORT_WHATSAPP_URL` | `https://wa.me/256700123456` |
| `VITE_SUPPORT_WHATSAPP_DISPLAY` | `+256 700 123 456` |
| `VITE_SUPPORT_EMAIL` | `support@upensions.ug` |

### Notes

- **Never run `vercel env pull`** — it overwrites `.env.local` and wipes `SUPABASE_DB_URL`, which is local-only by design and not stored in Vercel.
- `VITE_*` keys are inlined into the client bundle at build time. Don't put a service-role key behind a `VITE_` prefix even by accident — it would ship to every browser.
- `api/_lib/jwt.ts` treats `SUPABASE_JWT_SECRET` as **raw UTF-8** (`new TextEncoder().encode(raw)`). PostgREST / GoTrue verify HS256 with the same UTF-8 byte interpretation; base64-decoding would mint tokens PostgREST rejects (`PGRST301`).
- `api/_lib/supabase-admin.ts` and `api/_lib/jwt.ts` both hard-fail at first invocation if their env vars are missing (no deploy-time preflight — audit X14). Cold-boot 500s with a "X is not set" message are diagnostic.
- `src/services/supabaseClient.js` falls back silently to `http://localhost:54321` / `'public-anon-key'` if the `VITE_*` keys are absent (audit X6); a misconfigured Vercel preview ships a broken-but-running app.

---

## §3. API route inventory

**14 routes** live under `api/`. Vercel maps each file to a route (`api/auth/send-otp.ts → POST /api/auth/send-otp`). All routes accept only `POST`; the 405 envelope differs by route (see "405 vocabulary drift" below).

| # | Method | Path | Auth | Body | 2xx response | Handler file |
|---|---|---|---|---|---|---|
| 1 | POST | `/api/auth/send-otp` | Public | `{ phone, role }` | `{ success: true }` | `api/auth/send-otp.ts` |
| 2 | POST | `/api/auth/verify-otp` | Public | `{ phone, otp, role, password? }` | `{ token, user }` | `api/auth/verify-otp.ts` |
| 3 | POST | `/api/auth/verify-password` | Public | `{ phone, role, password }` | `{ token, user }` | `api/auth/verify-password.ts` |
| 4 | POST | `/api/auth/change-password` | Bearer JWT (inline) | `{ currentPassword?, newPassword }` | `{ ok: true, hasPassword: true }` | `api/auth/change-password.ts` |
| 5 | POST | `/api/kyc/id-quality` | Public | `{ front?, back? }` | `QualityReport` (blur/corners/glare/pass/score) | `api/kyc/id-quality.ts` |
| 6 | POST | `/api/kyc/id-ocr` | Public | `{ front, back, sessionId? }` | `IdExtraction` (fullName, nin, dob, …, confidence) | `api/kyc/id-ocr.ts` |
| 7 | POST | `/api/kyc/nira-verify` | Public | `{ payload, sessionId? }` | `NiraResult` (`match`/`partial`/`no-match`) | `api/kyc/nira-verify.ts` |
| 8 | POST | `/api/kyc/otp-send` | Public | `{ phone }` | `{ success: true, expiresIn: 300 }` | `api/kyc/otp-send.ts` |
| 9 | POST | `/api/kyc/otp-verify` | Public | `{ phone, code }` (4-digit) | `{ verified: boolean }` | `api/kyc/otp-verify.ts` |
| 10 | POST | `/api/kyc/face-match` | Public | `{ selfieFile, nin, sessionId? }` | `FaceMatchResult` (match + liveness + score) | `api/kyc/face-match.ts` |
| 11 | POST | `/api/kyc/aml-screen` | Public | `{ payload, sessionId? }` | `{ outcome: 'clear' \| 'flagged', trackingId }` | `api/kyc/aml-screen.ts` |
| 12 | POST | `/api/kyc/agent-referral` | Public | `{ phone, reason, stage?, trackingId?, sessionId? }` | `{ ticketId, eta }` | `api/kyc/agent-referral.ts` |
| 13 | POST | `/api/chat` | `withOptionalAuth` | `{ message, context? }` | `{ reply, suggestions? }` | `api/chat.ts` |
| 14 | POST | `/api/contact` | Public | `{ name, email, message }` | `{ submitted: true, id }` | `api/contact.ts` |

### Error envelope drift (audit B1, B2)

The current code is **not** unified — documented honestly:

- **`{ error: <code> }`** is used by auth routes (`send-otp`, `verify-otp`, KYC routes for legacy 4xx shape, `chat`, `contact`).
- **`{ code: <code> }`** is used by `verify-password.ts` for 4xx (and by `verify-otp.ts` line 199 specifically for password-shape errors — the same route mixes both envelopes on different code paths).
- **`change-password.ts`** uses `{ code: <code> }` for everything except the 405, which is `{ error: 'method_not_allowed' }`.

**405 vocabulary drift** (audit B2):

- Auth routes (`send-otp`, `verify-otp`, `verify-password`, `change-password`): `{ error: 'method_not_allowed' }` (snake_case). Do **not** set `Allow: POST` header.
- KYC routes + `chat` + `contact`: `{ error: 'Method not allowed' }` (PascalCase). Set `Allow: POST` header — **except** `otp-send.ts` and `otp-verify.ts`, both of which DO set the header (the audit B19 note in the report is reversed for these two — verified: they both `res.setHeader('Allow', 'POST')`).

### Cross-cutting notes

- `agent-referral.ts` and `contact.ts` write through `supabaseAdmin` (service-role) because the caller has no JWT — RLS would otherwise block the INSERT.
- All KYC stubs simulate realistic latencies (600–2200 ms) so the live demo's animated checks remain visible.
- KYC routes return **HTTP 200** with `{ verified: false }` / `{ result: 'no-match' }` instead of 4xx (audit B16) — clients inspect body fields, not status.
- No `Cache-Control: no-store` headers are set on auth/contact/referral responses (audit B13).
- Force-overrides via `x-qa-force` header are documented inline at each KYC file (e.g. `fail-blur`, `partial`, `flagged`, `liveness-fail`).

### KYC phone-normalization gap (audit B3, B4)

Six KYC routes accept `phone` in the body **without** calling `toCanonicalUGPhone()` (auth routes do; KYC does not):

- `api/kyc/otp-send.ts`, `otp-verify.ts`, `nira-verify.ts`, `id-ocr.ts`, `face-match.ts`, `agent-referral.ts`.

`agent-referral.ts` is the load-bearing offender (audit B4): line 51 captures `body.phone.trim()` and the INSERT at lines 62–72 persists that raw string into `agent_referrals.phone`. Support staff cannot cross-match that row against the canonical `+256…` form stored everywhere else.

### DB error swallowing (audit B5)

- `verify-otp.ts:84–88` returns `null` from `resolveSubscriber` on a real DB error, which the handler then surfaces as a `500 { error: 'invalid_otp' }` via the outer catch.
- `verify-password.ts:153–158` returns `401 { code: 'password_not_set' }` on a DB lookup error to avoid leaking state — the audit notes this swallows a real failure mode as the same code as the "no password set" branch.

---

## §4. `api/_lib/` helpers

Five files in `api/_lib/`, all server-only.

| File | Purpose | Exports |
|---|---|---|
| `api/_lib/jwt.ts` | HS256 sign/verify via `jose`. UTF-8 secret interpretation (PGRST301-correct). | `signJwt(claims) → Promise<string>`, `verifyJwt(token) → Promise<JwtClaims>`, types |
| `api/_lib/supabase-admin.ts` | Singleton service-role client (RLS-bypassing). Proxy-deferred init. | default `supabaseAdmin` |
| `api/_lib/phone.ts` | UG-phone canonicalization (`+256XXXXXXXXX`) | `parseUGPhoneLocal`, `isValidUGPhone`, `toCanonicalUGPhone` |
| `api/_lib/withAuth.ts` | Bearer-JWT middleware; 401 on missing/invalid. **Reserved-unused** (audit B11). | `withAuth(handler) → VercelHandler`, types `AuthedRequest`/`AuthedHandler` |
| `api/_lib/withOptionalAuth.ts` | Bearer-JWT middleware; attaches `req.user: null` on miss. Used by `/api/chat`. | `withOptionalAuth(handler) → VercelHandler`, types `MaybeAuthedRequest`/`MaybeAuthedHandler` |

### `api/auth/_lib/password.ts`

Sole consumer of `bcryptjs` in the codebase. Centralises the shape rules + hash/verify so every password-touching route uses the same vocabulary. Never imported from `src/` — the frontend never hashes or compares.

- `validatePasswordShape(plain)` — synchronous; returns `null` on pass, or one of: `password_required`, `password_too_short`, `password_too_long` (72-**byte** cap — bcrypt's hard limit), `password_too_weak` (must contain letter + digit).
- `hashPassword(plain)` — bcrypt `COST = 10` (~80ms).
- `verifyPassword(plain, hash)` — returns `false` (never throws) for any failure mode: missing hash, malformed hash, mismatch.

### Helper duplication (audit B6, B7)

- **`extractBearer`** is defined **3× verbatim** (~7 lines each): `api/_lib/withAuth.ts:21–28`, `api/_lib/withOptionalAuth.ts:21–27`, `api/auth/change-password.ts:38–44`. No shared `api/_lib/bearer.ts` exists.
- **`mockTrackingId`** (`smile_<base36-time>_<base36-rand>`) is defined **3× verbatim**: `api/kyc/face-match.ts:25–27`, `api/kyc/aml-screen.ts:22–24`, `api/kyc/nira-verify.ts:29–31`. No `api/kyc/_lib/` directory exists.
- `api/_lib/phone.ts` exports `parseUGPhoneLocal` and `isValidUGPhone` that are **never imported** anywhere — `toCanonicalUGPhone` is the only consumed export (audit B10).

### JWT claim shape (single source of truth)

```ts
type JwtRole = 'subscriber' | 'agent' | 'branch' | 'distributor';

type JwtClaims = {
  iss: 'upensions';                    // hardcoded
  sub: string;                         // entity ID (subscriber/agent/branch/distributor row id)
  role: 'authenticated';               // Postgres role for PostgREST SET ROLE — NEVER the app role
  app_role: JwtRole;                   // application role; RLS reads this
  phone: string;                       // canonical +256...
  subscriberId?: string;               // when app_role === 'subscriber'
  agentId?: string;                    // when app_role === 'agent'
  branchId?: string;                   // when app_role === 'branch'
  distributorId?: string;              // when app_role === 'distributor'
  aud: 'authenticated';                // required by PostgREST RLS
  iat: number;
  exp: number;                         // iat + 24h (DEFAULT_EXPIRY_SECONDS)
};
```

- `signJwt` defaults `iss/aud/iat/exp/role` when omitted and signs via `new SignJWT(...).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })`.
- `verifyJwt` validates signature + audience + issuer + expiry. Any failure throws — callers map to 401.
- TTL: `DEFAULT_EXPIRY_SECONDS = 60 * 60 * 24` (24h, single source — audit B20). No refresh path.
- Secret bytes are cached on first decode (`getSecretKey()`).

### Supabase admin client

`supabase-admin.ts` returns a Proxy that lazy-instantiates the client on first property access, so unit tests + type-check passes don't throw when env vars are missing. The real client is built with `auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }` — serverless functions are stateless.

### `withAuth` vs `withOptionalAuth`

- `withAuth` rejects with `401 { error: 'unauthorized' }` if Bearer is missing or invalid. **Currently wraps no routes.** `change-password.ts` re-implements its own bearer-extract + JWT-verify inline rather than wrap with `withAuth`. The middleware is intentionally retained for future Employer/Admin endpoints.
- `withOptionalAuth` swallows invalid tokens and attaches `req.user = null`. Used by `/api/chat` so the landing-page chat works for unauthenticated visitors while signed-in users get role-aware replies.

---

## §5. Auth flow end-to-end

### OTP path (legacy / fallback)

1. **`POST /api/auth/send-otp`** — Normalises phone via `toCanonicalUGPhone`, validates role enum. No SMS provider is wired in (demo scope). Returns `{ success: true }` on a well-formed body.
2. **User enters any 6-digit code** (demo OTP — see §14a).
3. **`POST /api/auth/verify-otp`** — Validates `phone` + `otp` (`^\d{6}$`) + `role`; normalises phone; optionally validates a `password` shape if the caller is signing up with a fresh credential. Then:
    - If `role === 'subscriber'`, looks up `subscribers` **newest-wins** by `phone` (`ORDER BY created_at DESC LIMIT 1` — see comment in `verify-otp.ts:68–82`). If no match → falls back to `ROLE_DEFAULTS.subscriber = 's-0001'` (every demo login succeeds; CLAUDE.md §8).
    - For other roles, looks up `demo_personas` by `(phone, role)`. If no match → hardcoded fallback: `agent → 'a-001'`, `branch → 'b-kam-015'`, `distributor → 'd-001'`.
    - Hashes the supplied password (if any) **after** the role lookup so a malformed phone/role short-circuits before the ~80ms bcrypt cost.
    - Upserts `users(phone, role, last_login_at, password_hash?)` with deterministic PK `id = '<role>:<phone>'`, on-conflict target `(phone, role)`. Failure is non-fatal — login still succeeds.
    - Builds the JWT claims, fills the role-specific `*Id` field, signs with `signJwt`.
4. **Response:** `{ token, user }` where `user = { role, phone, hasPassword, name?, subscriberId|agentId|branchId|distributorId }`. `AuthContext.login` writes the token to `localStorage.upensions_token` and the user payload to `localStorage.upensions_auth`.

### Password path (`/api/auth/verify-password`)

Companion to `verify-otp` shipped with `0026_users_password_hash.sql`. Same response DTO — `AuthContext.login` consumes either.

1. Looks up `users` by `(phone, role)` (UNIQUE) to fetch `password_hash`. DB lookup error → `401 { code: 'password_not_set' }` (audit B5 swallow).
2. NULL or missing hash → `401 { code: 'password_not_set' }` (UI maps this to "use OTP instead").
3. `bcrypt.compare` against `password_hash`. Mismatch → `401 { code: 'invalid_password' }`.
4. Resolves role-scoped entity ID using the same `resolveSubscriber` / `resolveDemoPersona` helpers as `verify-otp` (see duplication note below).
5. Best-effort `last_login_at` UPDATE (non-fatal on failure).
6. Mints the JWT exactly like `verify-otp` (same claims, same DTO).

### `change-password` flow

Authenticated. Body: `{ currentPassword?, newPassword }`. Reads JWT inline (`extractBearer` + `verifyJwt`). Two flows:

- **Initial set** — row has `password_hash IS NULL`. Skip the currentPassword check; just stamp the new hash.
- **Change** — row already has a hash. Require + bcrypt-verify `currentPassword` before update.

Error vocabulary: `unauthorized`, `current_password_required`, `current_password_invalid`, `password_required`/`too_short`/`too_long`/`too_weak`, `user_not_found`, `unexpected_error`.

### Auth helper duplication (audit B8, B9)

`verify-otp.ts` and `verify-password.ts` carry **verbatim duplicates** of:

- `ROLE_DEFAULTS` (4 hardcoded fallback IDs — `s-0001`, `a-001`, `b-kam-015`, `d-001`). Mirrors the seed personas; sync is manual (audit D18).
- `resolveSubscriber(phone)` — newest-wins query on `subscribers`.
- `resolveDemoPersona(phone, role)` — `(phone, role)` lookup with `ROLE_DEFAULTS` fallback.
- The JWT-claims assembly block (~10 lines, conditional `*Id`).
- The Response-DTO assembly block (~10 lines, conditional `*Id`).

Roughly 50 lines duplicated across both files. No `api/auth/_lib/personas.ts` extraction has been done.

### Subsequent requests

Frontend uses the JWT in `Authorization: Bearer <token>` and `apikey: <anon_key>` headers when hitting PostgREST. RLS predicates read `auth.jwt() ->> '<claim>'` — **NOT** `auth.uid()`, which is `NULL` for custom HS256 tokens.

### Expiry

24h fixed TTL, no refresh. On 401 from any service call, `services/api.js` dispatches an `onAuthExpired` event; `AuthContext` consumes it to logout + redirect (FRONTEND.md §5).

---

## §6. Custom HS256 JWT model — why NOT Supabase Auth

Supabase Auth ships email/password + magic-link plus a `sub = auth.users.id` claim. The platform needs role-scoped entity IDs (`subscriberId` / `agentId` / `branchId` / `distributorId`) directly on the token so RLS predicates like `agent_id = auth.jwt() ->> 'agentId'` resolve in a single column read. The custom JWT keeps the same `aud: 'authenticated'` audience PostgREST expects, signed with `SUPABASE_JWT_SECRET`, so all of PostgREST + RLS + the Realtime channel accept it natively.

### `auth.uid() = NULL` consequence

Because we never go through Supabase Auth (no `auth.users` row, no `sub` = a Supabase user UUID), `auth.uid()` returns `NULL` for every request. Any RLS policy or RPC that reads `auth.uid()` silently fails — every policy in this repo reads claims via `auth.jwt() ->> '<key>'` instead.

### The `auth.jwt() ->> 'app_role'` vs `'role'` trap (canonical citation)

Hard anti-pattern: **never read `auth.jwt() ->> 'role'` and compare against application role values** (`'distributor'`, `'agent'`, `'branch'`, `'subscriber'`).

- PostgREST requires the JWT to carry `role: 'authenticated'` (the Postgres role) so it can issue `SET ROLE authenticated`. With JWTs minted by `signJwt`, **every** `auth.jwt() ->> 'role'` returns the literal string `'authenticated'`.
- The application role lives in a separate `app_role` claim. RLS + RPCs MUST read `auth.jwt() ->> 'app_role'`.

Historical incidents this exact mistake produced:

- **0018 rollup-zero regression.** `get_entity_metrics_rollup` read `'role'` for its role gate; every drill-down rendered `0` subscribers / `—` AUM. Fixed in 0020 (after an abandoned 0019 raw-psql hotfix and a remote-only `fix_metrics_rollup_app_role` migration — see §7).
- **0004 commission-RPC silent failures.** The 13 state-machine RPCs read `'role'`; every branch/agent action raised `role_not_permitted`. Fixed by 0007 (DO block + `pg_get_functiondef` literal-string swap) and again by 0021 (re-emitted bodies as canonical).

Contract-enforced by `src/tests/jwt-claim-contract.test.js`. The audit (D1) confirmed all 65 active policies + all 29 RPCs read `app_role` correctly in live state.

---

## §7. Migration discipline

Forward-only. Never edit a shipped migration. For schema fixes, add a new `00NN_*.sql`.

### Numbering

Files are zero-padded, monotonically increasing. **0019 is intentionally absent** — it was an abandoned raw-psql hotfix for the metrics-rollup `app_role` bug; the canonical fix landed as 0020. See `0020_entity_metrics_rollup_v3.sql:3–5` for the supersession history.

### `.down.sql` partners

Newer migrations ship a `.down.sql` partner alongside the forward file (`0016`, `0022`, `0023`, `0024`, `0025`, `0026`). Older migrations (0001–0015) do not have downs.

### Idempotency

Re-running migrations should be safe. The audit (D12) flagged **four** migrations as **missing idempotency guards** on at least one statement:

- `0003_rls_policies.sql` — `CREATE POLICY` statements without `DROP POLICY IF EXISTS` (re-run would error on existing policy names).
- `0006_trigger_security_definer.sql` — `ALTER FUNCTION ... SECURITY DEFINER` statements (re-run is idempotent in pg, but no guards exist; not strictly broken).
- `0010_function_search_path.sql` — bare `ALTER FUNCTION ... SET search_path` (same as 0006 — pg-safe to re-run, but no guards).
- `0025_drop_realtime_publication.sql` — `ALTER PUBLICATION ... DROP TABLE` does **not** accept `IF EXISTS`; sequential drops would fail loudly if the publication state has drifted (the file comment explicitly documents this).

The remaining migrations use `IF NOT EXISTS` / `IF EXISTS` / `CREATE OR REPLACE` / `DROP ... IF EXISTS` guards consistently.

### Migration inventory

| File | Lines | Scope |
|---|---|---|
| `0001_initial_schema.sql` | 494 | 21 tables · 4 ENUMs · 8 indexes · `pg_trgm` extension |
| `0002_rpc_functions.sql` | 1,290 | 4 trigger fns · 7 read RPCs · 2 atomic-write RPCs · 2 private helpers |
| `0003_rls_policies.sql` | 896 | 65 policies · ENABLE + FORCE RLS on all 20 tables · realtime tuning (later dropped by 0025) |
| `0004_commission_run_rpcs.sql` | 1,055 | 13 SECURITY DEFINER state-machine RPCs |
| `0005_subscriber_update_fix.sql` | 72 | Drops correlated-subquery WITH CHECK; adds `trg_subscribers_enforce_editable_cols` |
| `0006_trigger_security_definer.sql` | 28 | Promotes 3 trigger fns to `SECURITY DEFINER` + pinned search_path |
| `0007_rls_use_app_role.sql` | 715 | Swaps every `'role'` → `'app_role'` across policies + RPC + trigger bodies |
| `0008_rls_wrap_auth_jwt_initplan.sql` | 638 | Wraps `auth.jwt()` in `(SELECT auth.jwt())` for InitPlan hoisting |
| `0009_fk_covering_indexes.sql` | 33 | FK covering indexes |
| `0010_function_search_path.sql` | 48 | Pins `search_path = public, pg_temp` on 11 INVOKER functions |
| `0011_drop_unused_indexes.sql` | 28 | Drops unused indexes |
| `0012_pg_trgm_into_extensions_schema.sql` | 35 | Moves `pg_trgm` to `extensions` schema |
| `0013_fk_covering_indexes_followup.sql` | 33 | More FK indexes |
| `0014_signup_phone_and_agent_dispute.sql` | 437 | `_canonical_ug_phone` · `_insert_subscriber_chain` rewrite · **`agent_dispute_line`** RPC |
| `0015_signup_insurance_and_premium_tx.sql` | 312 | `_insert_subscriber_chain` insurance toggle + premium tx fix |
| `0016_distributors_table.sql` (+ `.down.sql`) | 69 | `distributors` table + policies; seeds `d-001` |
| `0017_unique_constraints.sql` | 53 | `ux_agents_email`, `ux_subscribers_nin`, `ux_commissions_agent_subscriber` |
| `0018_entity_metrics_rollup.sql` | 532 | **Superseded by 0020** — left in tree (audit D4) |
| `0020_entity_metrics_rollup_v3.sql` | 1,536 | Canonical metrics rollup. Reads `app_role` correctly. `_demo_now() = '2026-05-18'` |
| `0021_commission_rpcs_app_role.sql` | 1,055 | Re-emits all 13 commission RPCs reading `app_role` directly (canonical) |
| `0022_audit_perf.sql` (+ `.down.sql`) | 150 | `idx_transactions_type_date`, `idx_commissions_status`, `get_top_branch` rewrite |
| `0023_rls_initplan_fixes.sql` (+ `.down.sql`) | 52 | Duplicate-index drop, `distributors_update_self` InitPlan wrap, `_demo_now` search_path lock |
| `0024_upsert_nominees.sql` (+ `.down.sql`) | 147 | `nominees_share_range_chk` (`NOT VALID`) + `upsert_nominees` RPC |
| `0025_drop_realtime_publication.sql` (+ `.down.sql`) | 18 | Drops 3 tables from `supabase_realtime` (zero subscribers — Phase 1+2 confirmed) |
| `0026_users_password_hash.sql` (+ `.down.sql`) | 22 | Adds nullable `users.password_hash TEXT` for bcrypt digests |

### Supersession history: 0018 → 0019 (missing) → 0020

- `0018_entity_metrics_rollup.sql` shipped the first body but the role gate read `auth.jwt() ->> 'role'`, raising `role_not_permitted` on every call (every drill-down rendered zeros).
- A raw-psql v2 hotfix was applied to remote — never landed in git as `0019`.
- A targeted remote-only migration `fix_metrics_rollup_app_role` (timestamp `20260519165115`, audit D5) was applied to remote between 0018 and 0020 — it patches the role gate string but is **not in the local git tree**.
- `0020_entity_metrics_rollup_v3.sql` is the canonical superseder — same `(p_level TEXT, p_entity_ids TEXT[]) → jsonb` signature, output keys are a superset of 0018, time-bucket fields + demographics + KYC counts all live here. **Apply only via the new file; 0018 is operationally stale.**

### Applying migrations

- **Local**: `supabase db reset` (re-runs every `00NN_*.sql` from scratch).
- **Hosted**: `supabase db push`, OR via the Supabase MCP tool `mcp__supabase__apply_migration`. The MCP path wraps DDL in a transaction by default — `0022`'s `CREATE INDEX CONCURRENTLY` statements cannot run inside a transaction, so the file documents splitting them into `execute_sql` calls outside the transaction. Most other migrations apply cleanly via the MCP wrapper.

---

## §8. Schema overview

**21 tables**, **4 ENUMs**, `pg_trgm` extension. All primary keys are `TEXT` for deterministic seed IDs (`a-001`, `b-kam-015`, `c-00001`, `d-001`, `s-XXXXXX`). Field-level definitions live in `docs/data-model.md` — only domain grouping + one-line purpose is captured here.

### Domain: Geo (2 tables)

| Table | Purpose |
|---|---|
| `regions` | 4 static rows (Central/Eastern/Northern/Western). `parent_id` always `'ug'`. |
| `districts` | 135 static rows from the GADM list; FK → `regions(id)`. |

### Domain: Network (3 tables)

| Table | Purpose |
|---|---|
| `distributors` | National-singleton network operator. Seeded with `d-001`; seed script also inserts `d-002` (audit D15: `mockData.js` only knows `d-001`). Columns: `id TEXT PK`, `name`, `parent_id` (default `'ug'`), `manager_name`, `manager_phone`, `manager_email`, `status`, `created_at`, `updated_at`. Defined in `0016`. |
| `branches` | ~314 rows; FK → `districts(id)`. Carries denorm `score`, `rank`, `district_rank`, `district_branch_count` (seeded once, never refreshed). |
| `agents` | ~500–2,000 rows; FK → `branches(id)`. `languages` / `specialties` are JSONB arrays. `coverage_rate INT` added in 0018, backfilled from active proxy. |

### Domain: Subscribers + per-subscriber (8 tables)

| Table | Purpose |
|---|---|
| `subscribers` | ~30k rows; FK → `agents(id)` + `districts(id)`. Partial `UNIQUE(phone) WHERE NOT is_demo_signup` lets demo signups collide-and-overwrite. |
| `subscriber_balances` | One row per subscriber; maintained by trigger (§11). |
| `contribution_schedules` | One row per subscriber; UPSERTed at signup. `retirement_pct + emergency_pct = 100`. |
| `insurance_policies` | One row per subscriber; nullable. `status` ∈ `'active' \| 'inactive'` (TEXT — see D8). |
| `nominees` | Pension + insurance beneficiaries; per-row `CHECK (share BETWEEN 0 AND 100)`. **No `UNIQUE` per `(subscriber_id, type)`** (audit D9) — duplicate beneficiaries are possible at the table level; sum-to-100 enforcement now lives in `upsert_nominees` (0024). |
| `transactions` | Append-only ledger; triggers update balances + first-contribution commission. Includes `type` ∈ `'contribution' \| 'withdrawal' \| 'premium' \| …`. |
| `claims` | Insurance claims; per-subscriber. |
| `withdrawals` | Withdrawal records; per-subscriber. |

### Domain: Commissions (4 tables)

| Table | Purpose |
|---|---|
| `commission_config` | Singleton row (`CHECK id = 'default'`); `rate`, `cadence`, `next_run_date`. |
| `settlement_runs` | Bundles many commissions paid out together; `state` ∈ `draft / branch_review / released / cancelled`. |
| `settlement_run_branch_reviews` | Composite PK `(run_id, branch_id)`; per-branch state inside a run. |
| `commissions` | State-machine row (see §10). Denormalises `branch_id` + `subscriber_name` for cheap RLS + run listings. |

### Domain: KYC / Auth (4 tables)

| Table | Purpose |
|---|---|
| `users` | Auth identities. `UNIQUE(phone, role)` lets one phone attach to multiple roles. `password_hash TEXT` (0026) nullable; NULL = OTP-only. |
| `demo_personas` | `(phone, role) → entity_id` lookup for non-subscriber roles. 7 seeded rows: 3 agents, 2 branches, 2 distributors. |
| `agent_referrals` | KYC fallback referrals (from `/api/kyc/agent-referral`). |
| `contact_submissions` | Landing-page contact form submissions (from `/api/contact`). |

### ENUMs

| ENUM | Values |
|---|---|
| `commission_status` | `due, in_run, held, disputed, released, confirmed, rejected` |
| `settlement_run_state` | `draft, branch_review, released, cancelled` |
| `settlement_run_branch_review_state` | `pending, approved, released` |
| `nominee_type` | `pension, insurance` |

### Status columns are TEXT with implicit enums (audit D8)

`subscribers.kyc_status`, `withdrawals.status`, `claims.status`, `insurance_policies.status`, `agent_referrals.status`, `distributors.status` — all `TEXT` with documented value sets but no `CHECK` constraint. Discipline lives in client code (and the BEFORE-UPDATE trigger for `subscribers`). The four `commission_status` / `settlement_run_state` / `settlement_run_branch_review_state` / `nominee_type` enums are properly enforced.

### Indexes

From `0001` (8): `subscribers (agent_id)`, partial `subscribers (phone) WHERE NOT is_demo_signup`, `transactions (subscriber_id, date DESC)`, `commissions (agent_id, status)`, `commissions (branch_id, status)`, `commissions (run_id)`, `settlement_run_branch_reviews (branch_id)`, plus `users (phone)` + `demo_personas (phone, role)`.

Added in `0017_unique_constraints.sql` (3 partial / full unique): `ux_agents_email`, `ux_subscribers_nin`, `ux_commissions_agent_subscriber` (closes the first-contribution race — see §11).

Added in `0009`, `0013`, `0018`, `0020`, `0022`: FK covering indexes, `idx_transactions_date`, `idx_transactions_subscriber_id`, `idx_subscribers_registered`, `idx_subscribers_agent_id`, `idx_subscribers_gender`, `idx_subscribers_kyc`, `idx_transactions_type_date` (partial, `WHERE type IN ('contribution','withdrawal')`), `idx_commissions_status`.

Dropped in `0011`, `0023`: unused indexes and the duplicate `subscribers_agent_id_idx` (728 KB → kept the smaller `idx_subscribers_agent_id` at 264 KB).

### Denormalized columns seeded but never re-written (audit D11)

Columns the seed populates but no API code path updates (some are read-only metric displays; some are entirely unused):

- `agents.coverage_rate`, `agents.tenure_months`, `agents.performance`, `agents.rating`
- `branches.score`, `branches.rank`, `branches.district_rank`, `branches.district_branch_count`
- `subscribers.products_held`, `subscribers.contribution_history`, `subscribers.current_unit_value`, `subscribers.occupation`, `subscribers.unit_value_as_of`
- `transactions.status`, `transactions.method`, `transactions.split_retirement`, `transactions.split_emergency`
- `commissions.subscriber_name` (denorm at insert; never updated when `subscribers.name` changes — audit D10)

---

## §9. RLS policies

### Discipline summary

- Every JWT signed by `signJwt` carries `role: 'authenticated'` (Postgres role) + `app_role: <JwtRole>` (application role).
- **Every active RLS policy reads `auth.jwt() ->> 'app_role'`** — never `'role'`. Audit D1 verified all 65 policies in live state are correct.
- **0 policies use `auth.uid()`** — would return `NULL` for our custom JWTs.
- Every table is both `ENABLE` and `FORCE` ROW LEVEL SECURITY — table owners are not exempt.
- The `commissions`, `settlement_runs`, and `settlement_run_branch_reviews` tables have **no direct INSERT/UPDATE/DELETE policies**. Every write flows through the SECURITY DEFINER state-machine RPCs in `0004` / `0021` (§10).
- Most predicates are wrapped in `(SELECT auth.jwt())` (per `0008`) so PostgREST hoists the call into an InitPlan node instead of re-evaluating per row.

### Per-role permission grid

| Table | subscriber | agent | branch | distributor |
|---|---|---|---|---|
| `regions` | R | R | R | R |
| `districts` | R | R | R | R |
| `distributors` | R | R | R | R + U (own row, `auth.jwt() ->> 'distributorId' = id`) |
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

Legend: R = SELECT, I = INSERT, U = UPDATE, D = DELETE. **Employer + admin roles have no policies** — no rows would satisfy any USING clause.

### Notable policy details

- `subscribers_update_self` (after 0005 / 0007) is ownership-only; column immutability is enforced by `trg_subscribers_enforce_editable_cols` (BEFORE UPDATE). Editable: `name, email, phone, occupation, consent_at`.
- Reference-table SELECT policies gate on `auth.jwt() ->> 'app_role' IS NOT NULL` — any authenticated app role passes.
- Subscribers + balances + transactions etc. share the same 4-policy pattern: self / agent (via `subscribers.agent_id`) / branch (via `agents.branch_id`) / distributor (unrestricted).
- `distributors_select USING (true)` (0016) — every authenticated role can read the singleton row. Lets distributor metrics widgets render across roles.
- `distributors_update_self USING ((SELECT auth.jwt() ->> 'distributorId') = id)` (0016 + 0023 InitPlan wrap) — distributor can update its own row only.

---

## §10. RPC inventory

**29 functions** total (24 SECURITY DEFINER + 5 INVOKER), all with `SET search_path` pinned (audit D2). All 29 read `auth.jwt() ->> 'app_role'` (never `'role'`) — audit D2 verified zero `auth.uid()` usage.

Breakdown:

- 4 trigger functions (0002) — see §11
- 1 trigger function (0005) — `trg_subscribers_enforce_editable_cols`
- 2 private helpers (0002, then rewritten in 0014 + 0015) — `_validate_signup_payload`, `_insert_subscriber_chain`
- 1 helper (0014) — `_canonical_ug_phone`
- 1 helper (0020 / 0023) — `_demo_now()` (IMMUTABLE; pinned search_path)
- 7 read RPCs (0002, with `get_entity_metrics_rollup` introduced in 0018 and superseded in 0020, plus `get_top_branch` rewritten in 0022)
- 2 atomic-write RPCs (0002) — `create_subscriber_from_signup`, `create_subscriber_from_agent_onboard`
- 13 commission state-machine RPCs (0004 → re-emitted in 0021)
- 1 agent-side dispute RPC (0014) — `agent_dispute_line`
- 1 nominees upsert RPC (0024) — `upsert_nominees`

### Read RPCs (7)

All `LANGUAGE plpgsql STABLE`. Most are SECURITY DEFINER + role-gated; `search_entities` and `get_breadcrumb` are reference-data reads. `GRANT EXECUTE ... TO authenticated`.

| RPC | Signature | Returns | Caller |
|---|---|---|---|
| `get_entity_commission_summary` | `(p_level TEXT, p_entity_id TEXT)` | `jsonb` (totalPaid/Due/Disputed/etc.) | `src/services/commissions.js#getEntityCommissionSummary` |
| `get_top_branch` | `(p_level TEXT, p_parent_id TEXT)` | `jsonb { name, contribution }` or `NULL` | `entities.js#getTopPerformingBranch`. SECURITY DEFINER (0022) + aggregate-first body using `idx_transactions_type_date`. |
| `get_breadcrumb` | `(p_level TEXT, p_ids jsonb)` | `jsonb[]` of `{ level, id, name }` | `entities.js#getBreadcrumb` |
| `search_entities` | `(p_q TEXT)` | `TABLE(entity_id, entity_name, level, label, parent_id, score)`, hardcoded `LIMIT 8` | `search.js#searchEntities`. Uses `pg_trgm`'s `%` operator + `similarity()` for fuzzy matching. |
| `get_agent_commission_detail` | `(p_agent_id TEXT)` | `jsonb` (paid + due txn arrays, totals, breakdown) | `commissions.js#getAgentCommissionDetail` |
| `get_commission_summary` | `(p_period TEXT DEFAULT NULL)` | `jsonb` of network-wide totals | `commissions.js#getCommissionSummary` |
| `get_run_branch_breakdown` | `(p_run_id TEXT)` | `jsonb` of per-branch run rollups | `commissions.js#getRunBranchBreakdown` |
| `get_entity_metrics_rollup` | `(p_level TEXT, p_entity_ids TEXT[])` | `jsonb` keyed by entity id; 8 base counts + time-period buckets (`daily/weekly/monthlyContributions[12]/Withdrawals` + `prev*`), `newSubscribers*`, `genderRatio`, `ageDistribution`, `kycPending/Incomplete` | `entities.js#getEntityMetricsRollup`. **Canonical body in 0020** (supersedes 0018 + the remote `fix_metrics_rollup_app_role`). Time buckets anchor on `_demo_now()` = `'2026-05-18 23:59:59+00'`. |

### Atomic-write RPCs (2)

Both `SECURITY DEFINER SET search_path = public`. Wrap multi-table inserts so signup is one transactional unit.

```
create_subscriber_from_signup(payload jsonb) RETURNS TEXT
create_subscriber_from_agent_onboard(payload jsonb, calling_agent_id TEXT) RETURNS TEXT
```

Shared work (`_insert_subscriber_chain`, rewritten in 0014 then 0015):

- Validates payload (`_validate_signup_payload`).
- Inserts subscriber row (idempotent on phone via the partial unique index).
- Triggers `trg_subscribers_after_insert` (seeds `subscriber_balances`).
- Inserts `contribution_schedules` (frequency, amount, 80/20 default unless overridden).
- Inserts `insurance_policies` when `contributionSchedule.includeInsurance = true` (0015 fix).
- Inserts `nominees` (pension + insurance).
- Inserts the first `transactions` row (`type='contribution'`) — triggers `trg_transactions_contribution` → balance update + first-contribution commission row at `commission_config.rate`.
- After 0015: emits a second `transactions` row (`type='premium'`) when an insurance premium is set. The contribution + withdrawal triggers are guarded with `WHEN (NEW.type = 'contribution'|'withdrawal')` so the premium row does not double-fire balance writes.

`create_subscriber_from_signup` is granted to `anon, authenticated` so the signup flow works without a JWT yet. `create_subscriber_from_agent_onboard` is `authenticated`-only and cross-checks `calling_agent_id` against `auth.jwt() ->> 'agentId'`.

### Commission state-machine RPCs (13 + 1 agent-side)

All `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`. Each validates `auth.jwt() ->> 'app_role'` against the allowed actor and raises on mismatch. Full state diagram in §11.

| RPC | Allowed role | What it does |
|---|---|---|
| `open_run()` | distributor | Bundles all `due` commissions into a new `r-YYYY-MM` run; sweeps them to `in_run`; seeds per-branch review rows. |
| `cancel_run(p_run_id)` | distributor | Reverses `open_run`. |
| `release_run(p_run_id)` | distributor | Flips lines to `released`, sets `paid_date`; marks run `released`. |
| `release_branch(p_run_id, p_branch_id)` | distributor | Per-branch release; sets `released_at` on the branch review row. |
| `branch_approve_all(p_run_id)` | branch | Approves every line in the caller's branch. Returns count. |
| `mark_branch_reviewed(p_run_id)` | branch | Flips branch review state `pending → approved`. |
| `branch_approve_line(p_commission_id)` | branch | Approves a single line. |
| `branch_hold_line(p_commission_id, p_hold_reason)` | branch | `in_run → held`. Reason stored. |
| `branch_dispute_line(p_commission_id, p_dispute_reason)` | branch | `previous_status` snapshot via BEFORE UPDATE; `disputed_by='branch'`, `disputed_at=now()`. |
| `agent_dispute_line(p_commission_id, p_dispute_reason)` | agent | Mirrors branch dispute; `disputed_by='agent'`. Shipped in 0014, role-gate fixed in 0021. **The frontend `services/commissions.js#disputeCommission(by='agent')` wires to this RPC** (prior BACKEND.md claim that this was "not built" is stale per audit X3). |
| `approve_dispute(p_commission_id, p_outcome_reason?)` | distributor | Restores `previous_status` (fallback `due`); clears dispute fields. |
| `reject_dispute(p_commission_id, p_outcome_reason)` | distributor | Terminal `rejected`. |
| `withdraw_dispute(p_commission_id)` | agent | Restores `previous_status`; clears dispute fields. |
| `agent_confirm_commission(p_commission_id)` | agent | Sets `agent_confirmed = TRUE` on a released line. Maker-checker counterpart to admin settlement. |

The 13 RPCs from 0004 were re-emitted in `0021_commission_rpcs_app_role.sql` with the role gate inlined (reading `app_role` directly rather than via 0007's `pg_get_functiondef` literal-replace). The 0014 `agent_dispute_line` body got the same treatment in 0021.

### `upsert_nominees` (0024)

`upsert_nominees(p_subscriber_id TEXT, p_pension JSONB, p_insurance JSONB) RETURNS JSONB`. SECURITY DEFINER, role-gated to `subscriber` (own row) or `admin`. Validates `SUM(share)` per type rounds to 100 or empty array. DELETE + INSERT in one transaction. Returns the canonical `{ pension, insurance }` shape that `getSubscriberNominees` consumes.

**Grant pattern gap (audit D3):**

```sql
GRANT EXECUTE ON FUNCTION public.upsert_nominees(TEXT, JSONB, JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_nominees(TEXT, JSONB, JSONB) FROM anon;
```

Every other RPC in the codebase precedes the `GRANT EXECUTE ... TO authenticated` with `REVOKE ALL ON FUNCTION ... FROM PUBLIC;` (defence-in-depth — `PUBLIC` includes any future role). `upsert_nominees` revokes only from `anon`. Benign at execution time (the function still gates on `app_role`), but inconsistent with the codebase convention.

---

## §11. Commission state machine

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
   branch_    │ branch_    │  │ branch_dispute_line / agent_dispute_line
   hold_line  │ approve_   │  │   (snapshot previous_status)
              │ line       │  │
              ▼            │  ▼
       ┌──────────┐        │  ┌──────────┐ ← agent/branch_dispute_line
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

| From | To | Actor | RPC | Role check | Side effects |
|---|---|---|---|---|---|
| (insert) | `due` | trigger | `trg_transactions_contribution` | n/a (DEFINER) | First-contribution commission row at `commission_config.rate` |
| `due` | `in_run` | distributor | `open_run()` | `app_role = 'distributor'` | Creates `settlement_runs` row + branch_reviews rows |
| `in_run` | `due` | distributor | `cancel_run(run_id)` | distributor | Deletes branch reviews; run state → `cancelled` |
| `in_run` | `held` | branch | `branch_hold_line(c_id, reason)` | branch + ownership | `hold_reason` set |
| `held` | `in_run` | branch | `branch_approve_line(c_id)` | branch + ownership | `hold_reason` cleared |
| `in_run`/`held` | `disputed` | branch | `branch_dispute_line(c_id, reason)` | branch + ownership | `previous_status` snapshot via BEFORE UPDATE; `disputed_by='branch'` |
| `in_run`/`held` | `disputed` | agent | `agent_dispute_line(c_id, reason)` | agent + ownership | `previous_status` snapshot; `disputed_by='agent'` |
| `disputed` | `<previous_status>` or `due` | distributor | `approve_dispute(c_id, outcome?)` | distributor | Clears dispute fields; sets `resolved_at`/`resolved_by`/`outcome_reason` |
| `disputed` | `rejected` | distributor | `reject_dispute(c_id, outcome)` | distributor | Terminal; `outcome_reason` required |
| `disputed` | `<previous_status>` | agent | `withdraw_dispute(c_id)` | agent + ownership | Clears dispute fields |
| `in_run`/`held` | `released` | distributor | `release_run(run_id)` or `release_branch(run_id, branch_id)` | distributor | `paid_date = now()`; run/branch state → `released` |
| `released` | `confirmed` | agent | `agent_confirm_commission(c_id)` | agent + ownership | `agent_confirmed = TRUE` (maker-checker) |

### Dispute snapshot

`trg_commissions_before_update` (0002) sets `commissions.previous_status` whenever `status` transitions into `disputed`. `approve_dispute` / `withdraw_dispute` read it back to restore the pre-dispute state; if NULL (e.g. an external write), they fall back to `due`. `disputed_by` is a TEXT column storing the literal `'agent'` / `'branch'`.

---

## §12. Triggers

Five triggers across the migrations. All four cross-table triggers are SECURITY DEFINER + `search_path` pinned.

| Trigger | Table | Timing | Function | Security |
|---|---|---|---|---|
| `subscribers_after_insert` | `subscribers` | AFTER INSERT | `trg_subscribers_after_insert()` | DEFINER (0006) — seeds `subscriber_balances`, `ON CONFLICT DO NOTHING` |
| `transactions_after_insert_contribution` | `transactions` WHEN `type='contribution'` | AFTER INSERT | `trg_transactions_contribution()` | DEFINER (0006) — bumps balances, applies 80/20 default or explicit split, creates first-contribution commission at **hardcoded `v_unit_price NUMERIC := 1000` at line 113 of `0002_rpc_functions.sql`** |
| `transactions_after_insert_withdrawal` | `transactions` WHEN `type='withdrawal'` | AFTER INSERT | `trg_transactions_withdrawal()` | DEFINER (0006) — decrements balances; emergency-first fallback when split is missing |
| `commissions_before_update` | `commissions` | BEFORE UPDATE | `trg_commissions_before_update()` | INVOKER (no cross-table writes) — snapshots `previous_status` when entering `disputed`. `search_path` pinned by 0010. |
| `subscribers_enforce_editable_cols` | `subscribers` | BEFORE UPDATE | `trg_subscribers_enforce_editable_cols()` (0005) | INVOKER (`search_path` pinned by 0010, role-claim rewritten by 0007). Rejects any change outside `name/email/phone/occupation/consent_at` from `app_role='subscriber'` callers. |

**Why 0006 exists.** The three cross-table trigger functions in 0002 originally ran as the caller's invoker context. When a subscriber-role direct INSERT into `transactions` fired the contribution trigger, the trigger tried to write to `subscriber_balances` + `commissions` — but the subscriber JWT has no INSERT policy on those tables, so RLS rejected and the whole INSERT aborted. 0006 promotes the three functions to `SECURITY DEFINER` + pins `search_path = public, pg_temp`.

**Why 0005 exists.** The original `subscribers_update_self` WITH CHECK clause pinned non-editable columns via correlated subqueries against `subscribers` itself — Postgres treats that as another row-level check on the same table, producing infinite recursion. 0005 simplifies the policy to ownership-only and enforces immutability via the BEFORE UPDATE trigger (triggers don't re-evaluate RLS).

---

## §13. Realtime publication

`0003_rls_policies.sql` originally added `commissions`, `settlement_runs`, `settlement_run_branch_reviews` to `supabase_realtime`. `0025_drop_realtime_publication.sql` dropped all three — Phase 1 + 2 audits confirmed **zero `.channel()` subscribers** across `src/` and `api/`, so the WAL replication overhead bought nothing.

**Current state:** `supabase_realtime` membership for `public.*` is empty (audit D19 confirmed this matches intent, modulo the supersession by 0025 itself). High-write tables (`transactions`, `subscribers`, `subscriber_balances`) were never added to begin with. React Query's 5-minute staleTime + manual invalidation handles cross-laptop demo sync at sufficient resolution.

If a future feature wires `.channel()` subscribers, the 0025 down migration restores the three-table publication.

---

## §14. Seeding & utility scripts

Three scripts in `scripts/`.

### `scripts/seed-supabase.mjs` (~895 lines)

Run via `npm run seed`. Materialises the full `src/data/mockData.js` hierarchy into the Supabase Postgres DB.

**Mechanics:**

- Reads `SUPABASE_DB_URL` from `.env.local` (pooler URL, port 6543). Direct `pg.Client` connection (NOT through Supabase JS).
- Wraps everything in `BEGIN … COMMIT`.
- Runs `SET session_replication_role = 'replica'` at line 189 for the duration of the seed so the 30k seeded contribution transactions don't double-insert via `trg_transactions_contribution`. Restored to `'origin'` before `COMMIT` (and inside the `catch` for safety).
- Bulk insert via `INSERT … FROM unnest($1::type[], $2::type[], …) ON CONFLICT (pk) DO UPDATE` — one round-trip per 2,000-row chunk. Idempotent on re-run.
- **Phone dedup:** subscribers with duplicate phones get reassigned to a synthetic `+25671XXXXXXX` range so the partial unique index `subscribers(phone) WHERE NOT is_demo_signup` stays satisfied. Per-run state (a `Set`); if live subscribers exist when seed re-runs, dupes silently reassign to different `+25671XXXXXXX` numbers (audit D14).
- `demo_personas` seeded with 7 rows: agents `a-001/a-042/a-118` at phones `+2567000000{1,2,3}`, branches `b-kam-015/b-mba-290` at `+2567000000{11,12}`, distributors `d-001/d-002` at `+2567000000{21,22}`.
- Both `distributors` rows (`d-001`, `d-002`) are inserted by the seed; the `0016` migration also seeds `d-001` on-conflict-do-nothing.

**Approximate row volumes after seed:**

| Table | Rows |
|---|---|
| regions | 4 |
| districts | 135 |
| branches | ~314 |
| agents | ~500–2,000 |
| subscribers | ~30,000 |
| commissions | ~30,000 |
| settlement_runs | ~10 |
| distributors | 2 |
| demo_personas | 7 |

**`users` table is NOT populated by the seed** (audit D13). `password_hash` (added in 0026) and `last_login_at` are stamped only on live signups via `/api/auth/verify-otp`. Demo subscribers/agents/branches/distributors have no `users` row by default; the JWT-mint path upserts on first OTP verify.

**`mockData.js` `DISTRIBUTORS` drift** (audit D15). `src/data/mockData.js:92–103` exports a `DISTRIBUTORS` dictionary containing only `d-001`. The seed inserts `d-001` AND `d-002`. Mock-backed mode (`VITE_USE_SUPABASE='false'`) will miss `d-002`.

**`MOCK_NOW`** = `new Date(2026, 4, 22)` (= `2026-05-22`) at `src/data/mockData.js:24`. Today is `2026-05-26`; small relative-date demos may show negative-day signals.

### `scripts/seed-loader.mjs`

ESM resolution hook registered before `import('../src/data/mockData.js')`. Auto-appends `.js` to extension-less relative specifiers so the seed can read `mockData.js` unchanged.

### `scripts/clip-districts.mjs`

Boundary-clipping utility using `@turf/turf`. Reads `public/uganda-districts.geojson` + `public/uganda-regions.geojson`, intersects each district with its parent region, writes clipped output back. Backs up the original to `public/uganda-districts-original.geojson` on first run. Idempotent. Run manually: `node scripts/clip-districts.mjs`.

---

## §15. Backend findings

### §15a. Demo scope (by design — do not "fix")

Every item below is intentional for a sales-rep demo. Never frame as a production-prep TODO.

- **Any 6-digit OTP accepted** at `/api/auth/verify-otp` (regex `^\d{6}$` is the only check). No SMS provider, no rate limiting, no lockout. Same for KYC OTP at `/api/kyc/otp-verify` (4 digits, rejects `'0000'` only).
- **All 8 KYC routes are mocks** (`id-quality`, `id-ocr`, `nira-verify`, `otp-send`, `otp-verify`, `face-match`, `aml-screen`, `agent-referral`). Realistic latencies preserved so the live demo's animated checks land cleanly. Force-overrides via `x-qa-force` header (`fail-blur`, `partial`, `flagged`, `liveness-fail`, …) mirror the frontend's `localStorage upensions_*_force` keys.
- **Unit price hardcoded to 1,000 UGX/unit** at `supabase/migrations/0002_rpc_functions.sql:113` (`v_unit_price NUMERIC := 1000` inside `trg_transactions_contribution`). No fund NAV table.
- **JWT fixed 24h TTL, no refresh** (`DEFAULT_EXPIRY_SECONDS = 60 * 60 * 24`). On 401 the frontend logs out gracefully.
- **`demo_personas` fallback IDs** (`ROLE_DEFAULTS` in both `verify-otp.ts` and `verify-password.ts`): `subscriber → 's-0001'`, `agent → 'a-001'`, `branch → 'b-kam-015'`, `distributor → 'd-001'`. Keeps every login successful for a sales demo even if the persona seed drifted.
- **Mocked chat** — `/api/chat` returns keyword-matched canned strings with hardcoded numbers (no LLM, no DB aggregates). Three flavours: admin (distributor/branch/admin), agent DM, subscriber co-pilot.
- **Per-session mutation stores** — frontend service files keep in-memory write overlays on top of frozen `mockData.js`. Resets on refresh (CLAUDE.md §10a).
- **`district_rank` / `rank` / `district_branch_count`** on `branches` computed once at seed time. No daily ranking job.
- **`commission_config` is a singleton** (`CHECK id = 'default'`); no UPDATE history table, no versioning.
- **`contribution_history`** is a JSONB sparkline denormalized from `transactions`; no consistency trigger keeps it in sync with the ledger.
- **`search_entities` hardcoded `LIMIT 8`.** Plenty for a demo's autocomplete UX.
- **No CSRF / origin checks** on the public POST routes. Acceptable because the demo runs from a single allowed origin.
- **`vercel.json` has no security headers** — no CSP, HSTS, X-Frame-Options, etc. Logged at low severity (audit X8) and explicitly out of scope.

### §15b. Real bugs / awareness items

These affect the demo experience or future sessions — track but do NOT bundle with §15a, and do NOT propose production-hardening solutions.

**API duplication / structural drift** (Theme A from the audit):

- `extractBearer` defined 3× verbatim across `api/_lib/withAuth.ts`, `api/_lib/withOptionalAuth.ts`, `api/auth/change-password.ts` (audit B6). No `api/_lib/bearer.ts` extraction.
- `mockTrackingId` defined 3× verbatim across `api/kyc/face-match.ts`, `aml-screen.ts`, `nira-verify.ts` (audit B7). No `api/kyc/_lib/` directory.
- `ROLE_DEFAULTS` + `resolveSubscriber` + `resolveDemoPersona` + JWT-claims block + Response-DTO block duplicated verbatim between `verify-otp.ts` and `verify-password.ts` (audit B8, B9, D18). ~50 lines across both files.
- `api/_lib/phone.ts` exports `parseUGPhoneLocal` and `isValidUGPhone` neither of which is imported anywhere — dead code (audit B10).
- `api/_lib/withAuth.ts` middleware exported but never wraps any route (audit B11). Reserved for future Employer/Admin endpoints — intentional, document.

**Error envelope inconsistency:**

- `verify-otp.ts` mixes `{ error }` (line 174 OTP shape errors) and `{ code }` (line 199 password shape errors) within the same handler (audit B1).
- 405 vocabulary drift: auth routes use `'method_not_allowed'`, KYC + chat + contact use `'Method not allowed'` (audit B2).
- KYC routes return `200` with `{ verified: false }` / `{ result: 'no-match' }` instead of 4xx (audit B16). Clients inspect body fields.
- `contact.ts` uses prose error messages (`'name is required.'`) where auth routes use codes (`'invalid_request'`) (audit B18).

**KYC phone & DB error swallowing:**

- 6 KYC routes (`otp-send`, `otp-verify`, `nira-verify`, `id-ocr`, `face-match`, `agent-referral`) accept `phone` without `toCanonicalUGPhone()` normalization (audit B3).
- `agent-referral.ts` lines 51–67 persist the raw `body.phone.trim()` to `agent_referrals.phone` — support staff cannot cross-match the row to the canonical `+256…` form stored everywhere else (audit B4). **Most consequential of these.**
- `verify-otp.ts` / `verify-password.ts` swallow real DB errors as generic auth codes (`invalid_otp`, `password_not_set`) — ops cannot triage real DB drift from a misconfigured table (audit B5).

**Auth-route subtleties:**

- `verify-password.ts:100–102` doesn't re-validate the body-supplied role against the stored `users` row — if a phone is enrolled in two roles, the wrong row could match (audit B12, needs-verify).
- `chat.ts:225–226` body `context` overrides role for unauthenticated callers; intentional but inconsistent with the strict role discipline elsewhere (audit B14).
- `chat.ts:239` doesn't type-check `body.message` before `.trim()` — a non-string would crash the route (audit B15).
- `change-password.ts` has three separate `console.error` + `res.status` blocks (lookup, update, outer-try) — no response-builder helper exists (audit B17).

**Database invariants:**

- `upsert_nominees` `GRANT` is missing the `REVOKE ALL ON FUNCTION ... FROM PUBLIC` preamble used by every other RPC (audit D3). Benign at execution time; inconsistent with house style.
- `nominees` table has no `UNIQUE(subscriber_id, type, …)` — duplicate beneficiaries are possible at the table level (audit D9). Sum-to-100 lives in `upsert_nominees` only; direct INSERTs bypass.
- Status columns (`subscribers.kyc_status`, `withdrawals.status`, `claims.status`, `insurance_policies.status`, `agent_referrals.status`, `distributors.status`) are TEXT with implicit enums and no `CHECK` constraint (audit D8). Discipline lives in client code.
- 4 migrations lack idempotency guards on at least one statement: `0003`, `0006`, `0010`, `0025` (audit D12).
- **First-contribution race — mitigated.** `commissions` now carries `ux_commissions_agent_subscriber UNIQUE(agent_id, subscriber_id)` (0017). The trigger's `NOT EXISTS` pre-check is preserved as a fast path; the unique index is the authoritative guard (CLAUDE.md §10b reference).
- **0018 superseded by 0020** but left in tree (audit D4). Operationally stale; do not apply.
- **`fix_metrics_rollup_app_role`** remote-only migration (timestamp `20260519165115`) is **not in the local git tree** (audit D5). Replay-safe — 0020 supersedes intent.

**Seed-data drift:**

- Seed does NOT populate `users` (audit D13) — `password_hash` is only stamped via live signups.
- Phone dedup is per-run, not idempotent against pre-existing live data (audit D14).
- `mockData.js#DISTRIBUTORS` knows only `d-001`; seed inserts `d-001` + `d-002` (audit D15). Mock-backed mode misses `d-002`.

**Existing awareness items (already in CLAUDE.md §10b):**

- Employer + admin roles unbuilt — no RLS policies, no dashboards, no shells.
- Dispute `reason` is free-text TEXT on `commissions.dispute_reason`. UI shows whatever was typed.
- `agent_referrals` row PK `ar-<epoch>-<rand>` and public `UAG-XXXX` ticket ID (~1.7M space) — collision-tolerant but not cryptographic.
- No retry / idempotency keys on `/api/contact` or `/api/kyc/agent-referral`. A resubmit creates a second row.

**Stale claim removed (audit X3).** Earlier versions of §15b stated agent-side `disputeCommission` is "not built" / "purely a frontend fix". That is now obsolete: the `agent_dispute_line` RPC shipped in `0014_signup_phone_and_agent_dispute.sql` and was canonicalised in `0021_commission_rpcs_app_role.sql`; the frontend service in `src/services/commissions.js#disputeCommission(by='agent')` calls it successfully.

---

## §16. Operational runbook

### Local development

`supabase/config.toml` controls the local CLI emulator only (not the hosted project). Key ports:

| Service | Port | Notes |
|---|---|---|
| API gateway | 54321 | `[api]` block |
| Postgres | 54322 | `[db]` block |
| Studio | 54323 | `[studio]` block |
| Inbucket (email) | 54324 | dev mail catcher |
| Shadow DB | 54329 | for `supabase db diff` |

`project_id = "uganda-dashboard"`.

### Common operations

| Task | Command / SQL |
|---|---|
| Start local Supabase | `supabase start` |
| Apply migrations locally | `supabase db reset` (re-runs every `00NN_*.sql`) |
| Push migrations to hosted project | `supabase db push` |
| Apply a single migration via MCP | `mcp__supabase__apply_migration` (note: wraps DDL in a transaction; split `CREATE INDEX CONCURRENTLY` out via `execute_sql` — see 0022 header) |
| Tail Vercel logs | `vercel logs <deployment-url>` |
| Reseed Postgres | `npm run seed` (reads `SUPABASE_DB_URL` from `.env.local`) |
| Clip GeoJSON | `node scripts/clip-districts.mjs` |
| Test a read RPC from psql | `SELECT public.get_entity_commission_summary('region', 'r-central');` |
| Impersonate a role in psql | `SET LOCAL request.jwt.claims = '{"role":"authenticated","app_role":"agent","agentId":"a-001","aud":"authenticated"}'; SELECT count(*) FROM subscribers;` |
| Rotate JWT secret | Project Settings → API → JWT settings → rotate. Update `SUPABASE_JWT_SECRET` in Vercel env (Preview + Production). Existing tokens become invalid (forced logout). |
| Inspect realtime publication | `SELECT pubname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';` (expected: empty for `public.*` after 0025) |
| Confirm app_role discipline | `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND (qual LIKE '%''role''%' OR with_check LIKE '%''role''%');` (expected: 0) |

### `.env.local` workflow

- Start from `.env.local.example`; copy + fill in.
- **Do NOT run `vercel env pull`.** It overwrites `.env.local` and wipes the local-only `SUPABASE_DB_URL` (the seed script's only path to Postgres).
- The 6 `VITE_*` frontend keys with defaults (see §2) can be added when you need to override the hardcoded fallbacks in `src/config/env.js`.

### Smoke checks after deploy

- `POST /api/contact` with a dummy body → verify row in `contact_submissions`.
- `POST /api/auth/send-otp` then `verify-otp` with a known demo persona phone (`+256700000001` → agent `a-001`) → verify `users` row upserts and JWT round-trips.
- Open `/dashboard` as that agent → verify agent-scoped queries return rows (RLS predicate `agent_id = auth.jwt() ->> 'agentId'` matches).
- Run an `open_run()` from the distributor account; PostgREST returns the new run row. (Realtime no longer propagates — 0025 dropped the publication; React Query manual invalidation handles refresh.)

### Migration discipline (forward-only)

- Never edit a shipped migration file. The Supabase migration system records each file's hash; editing a shipped file breaks `db push`.
- For schema fixes, add a new `00NN_*.sql`. New migrations should ship a `.down.sql` partner (see 0016/0022/0023/0024/0025/0026).
- For RPC body changes, `CREATE OR REPLACE FUNCTION` in a new migration. The grants in `0002` follow each function definition; new migrations inherit those unless the signature changes.
- New SECURITY DEFINER functions MUST set `search_path = public` (or `public, pg_temp`) and read `auth.jwt() ->> 'app_role'` — never `'role'`. The contract test in `src/tests/jwt-claim-contract.test.js` guards the claim names.

---

## §17. See also

- `CLAUDE.md` — slim index, hard rules, glossary, demo credentials, awareness items.
- `FRONTEND.md` — service/hook/context inventory, dashboard variants, design tokens, React Query keys + invalidation, frontend-side demo behaviours.
- `docs/api-contracts.md` — currently describes a REST surface that does not exist (audit X1). Treat as stale until reconciled.
- `docs/data-model.md` — field-level entity definitions, metric-aggregation rules, branch-health-score formula, KYC/withdrawal/AUM open questions.
- `docs/role-permissions.md` — role × capability matrix.
- `docs/SPEC.md` — product spec: personas, workflows, business rules.
