# BACKEND.md — Universal Pensions Uganda

Deep backend reference. Pair with `CLAUDE.md` (slim index) and `FRONTEND.md` (deep frontend reference).

Covers the Express + TypeScript routes under `api/**` (mounted by `server/index.ts` and hosted on **Render** — Singapore region, Node 22, free tier), the Supabase Postgres schema + RPCs + RLS in `supabase/migrations/*.sql`, the seed and utility scripts under `scripts/`, and the operational runbook for local + hosted environments. The frontend ships from **Vercel** (Vite preset, no functions); see `docs/render-operational.md` for the post-migration runbook and `renderplan.md` for the migration plan.

> **Scope note.** This platform is a sales-rep **demo**, not a production fintech. Many behaviours (any-6-digit OTP, hardcoded UGX 1,000 unit price, fixed 24h JWT TTL, no refresh, `demo_personas` fallback IDs, mocked KYC, mocked chat, per-session mutation stores) are intentional. See §15a — never reframe them as production-prep TODOs.

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
              │   Render Web Service   │   │   Supabase PostgREST    │
              │   Express 5 / Node 22  │   │   (rest/v1, realtime)   │
              │   server/index.ts +    │   │                         │
              │   api/**/*.ts (Sing.)  │   │                         │
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
| `VITE_SUPABASE_URL` | Public (Vercel frontend) | `src/services/supabaseClient.js` | Supabase project URL (`https://<ref>.supabase.co`) | Yes |
| `SUPABASE_URL` | **Server-only (Render)** | `api/_lib/supabase-admin.ts` | Supabase project URL — server-side rename of `VITE_SUPABASE_URL`. For backwards compat the admin client reads `SUPABASE_URL ?? VITE_SUPABASE_URL`. | Yes |
| `VITE_SUPABASE_ANON_KEY` | Public (Vercel frontend) | `src/services/supabaseClient.js` | PostgREST anon-tier key (default RLS-restricted) | Yes |
| `VITE_USE_SUPABASE` | Public (Vercel frontend) | `src/config/env.js` + every service file | Rollback flag — when `'false'`, services fall back to mockData (FRONTEND.md §4) | Yes |
| `VITE_API_BASE_URL` | Public (Vercel frontend, all 3 scopes) | `src/config/env.js` → `src/services/api.js` | Absolute backend URL baked into the bundle at Vite build time. Local: `http://localhost:3001/api`. Prod: `https://uganda-dashboard-api.onrender.com/api`. | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only (Render)** | `api/_lib/supabase-admin.ts` | Admin client used by all Express routes (bypasses RLS) | Yes |
| `SUPABASE_JWT_SECRET` | **Server-only (Render)** | `api/_lib/jwt.ts` | HS256 signing secret; same secret PostgREST uses to verify JWTs. **Copy verbatim from Supabase Dashboard → API → JWT Settings.** Do NOT regenerate without coordinated user logout — `withOptionalAuth` swallows verification errors and fails open. | Yes |
| `SENTRY_DSN` | **Server-only (Render)** | `server/index.ts` | Optional. Sentry error aggregation (free 5k events/mo). | Yes (commented placeholder) |
| `VITE_SENTRY_DSN` | Public (Vercel frontend, optional) | `src/main.jsx` | Same Sentry project, frontend-side capture. | Yes (commented placeholder) |
| `SUPABASE_DB_URL` | **Local-only** | `scripts/seed-supabase.mjs` | Postgres pooler URL (port 6543) for `npm run seed` | Yes |
| `PORT` | **Server-only (Render + local dev)** | `server/index.ts` | Express listen port. Render injects this automatically; local dev defaults to `3001`. | Yes |

### Frontend-only keys consumed by `src/config/env.js`

These keys are read by the frontend but missing from `.env.local.example`. Defaults are baked into `src/config/env.js`, so the demo runs without them — list and add as needed:

| Variable | Default fallback |
|---|---|
| `VITE_API_BASE_URL` | `/api` only as a legacy fallback. Post-Render-migration the live value is set in Vercel project env (all 3 scopes) to the absolute Render URL (e.g. `https://uganda-dashboard-api.onrender.com/api`); local dev uses `http://localhost:3001/api`. Vite bakes the value at build time — changing it requires a Vercel redeploy. |
| `VITE_LEGAL_TERMS_URL` | `https://universalpensions.com/legal/terms` |
| `VITE_LEGAL_PRIVACY_URL` | `https://universalpensions.com/legal/privacy` |
| `VITE_SUPPORT_WHATSAPP_URL` | `https://wa.me/256700123456` |
| `VITE_SUPPORT_WHATSAPP_DISPLAY` | `+256 700 123 456` |
| `VITE_SUPPORT_EMAIL` | `support@upensions.ug` |

### Notes

- **Never run `vercel env pull`** — it overwrites `.env.local` and wipes `SUPABASE_DB_URL`, which is local-only by design and not stored in Vercel.
- `VITE_*` keys are inlined into the client bundle at build time. Don't put a service-role key behind a `VITE_` prefix even by accident — it would ship to every browser.
- `api/_lib/jwt.ts` treats `SUPABASE_JWT_SECRET` as **raw UTF-8** (`new TextEncoder().encode(raw)`). PostgREST / GoTrue verify HS256 with the same UTF-8 byte interpretation; base64-decoding would mint tokens PostgREST rejects (`PGRST301`).
- `api/_lib/supabase-admin.ts` and `api/_lib/jwt.ts` both hard-fail at first invocation if their env vars are missing (no deploy-time preflight). Cold-boot 500s with a "X is not set" message are diagnostic.
- `src/services/supabaseClient.js` falls back silently to `http://localhost:54321` / `'public-anon-key'` if the `VITE_*` keys are absent; a misconfigured Vercel preview ships a broken-but-running app.

---

## §3. API route inventory

**14 routes** live under `api/`. They were originally written as Vercel serverless functions; post-Render-migration `server/index.ts` mounts each one via a thin `toExpress(handler)` adapter (`server/adapter.ts`) using `app.all('/api/.../<route>', toExpress(<handler>))`. `app.all` (not `app.post`) preserves the per-handler manual 405 contract. All routes accept only `POST`; non-POST returns 405 `{ code: 'method_not_allowed' }` with `Allow: POST`. Breakdown:

- **4 auth routes** — `send-otp`, `verify-otp`, `verify-password`, `change-password`
- **8 KYC routes** — `otp-send`, `otp-verify`, `id-ocr`, `id-quality`, `face-match`, `aml-screen`, `nira-verify`, `agent-referral`
- **2 misc routes** — `contact`, `chat`

The count went from 12 → 14 with the Phase 1 password rollout (`verify-password` + `change-password` shipped as part of the `0026_users_password_hash.sql` work).

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

### Cross-cutting notes

- `agent-referral.ts` and `contact.ts` write through `supabaseAdmin` (service-role) because the caller has no JWT — RLS would otherwise block the INSERT.
- All KYC stubs simulate realistic latencies (600–2200 ms) so the live demo's animated checks remain visible.
- Force-overrides via `x-qa-force` header are documented inline at each KYC file (e.g. `fail-blur`, `partial`, `flagged`, `liveness-fail`).
- All 14 routes set `Cache-Control: no-store` on every response path (Phase 1G `1f0e2e1`). Auth tokens, KYC tracking IDs, and contact-form IDs must never be cached.
- All 14 routes use a unified error envelope `{ code: '<snake>', message?: '<ops-detail>' }`. Full vocabulary in §5.

### KYC phone canonicalization (Phase 1E `d0b805d`)

The 3 phone-accepting KYC routes (`otp-send`, `otp-verify`, `agent-referral`) now call `toCanonicalUGPhone()` on the body's `phone` field before any downstream use — same contract as the auth routes. `agent-referral` additionally persists the canonical `+256XXXXXXXXX` form into `agent_referrals.phone`, so support staff can cross-match referrals against the rest of the codebase's canonical phones. The other 5 KYC routes (`id-quality`, `id-ocr`, `nira-verify`, `face-match`, `aml-screen`) don't accept `phone` in their body.

### KYC verification refusals stay 200 (demo scope)

The 3 verifier routes — `nira-verify`, `aml-screen`, `face-match` — return HTTP 200 with a body-field refusal (`result: 'partial' | 'no-match'`, `outcome: 'flagged'`, `match: false`) rather than 4xx. Each carries an inline `// demo-scope intentional: …` comment confirming the intent. Clients inspect body fields, not status (Phase 1D `43f67e5`).

---

## §4. `api/_lib/` and per-domain `_lib/` helpers

Server-only. Three layers: top-level `api/_lib/` for cross-domain helpers, `api/auth/_lib/` for auth-only helpers, `api/kyc/_lib/` for KYC-only helpers.

### `api/_lib/` (6 files)

| File | Purpose | Exports |
|---|---|---|
| `api/_lib/jwt.ts` | HS256 sign/verify via `jose`. UTF-8 secret interpretation (PGRST301-correct). | `signJwt(claims) → Promise<string>`, `verifyJwt(token) → Promise<JwtClaims>`, types |
| `api/_lib/supabase-admin.ts` | Singleton service-role client (RLS-bypassing). Proxy-deferred init. | default `supabaseAdmin` |
| `api/_lib/bearer.ts` | `Bearer <token>` header extractor; canonical parse for the three callers below. | `extractBearer(req) → string \| null` (default + named) |
| `api/_lib/phone.ts` | UG-phone canonicalization to `+256XXXXXXXXX`. | `toCanonicalUGPhone(raw) → string` |
| `api/_lib/withAuth.ts` | Bearer-JWT middleware; 401 `{ error: 'unauthorized' }` on missing/invalid. **Currently wraps no routes** — reserved for future Employer/Admin endpoints. | `withAuth(handler)`, `AuthedRequest`, `AuthedHandler` |
| `api/_lib/withOptionalAuth.ts` | Bearer-JWT middleware; attaches `req.user: null` on miss. Used by `/api/chat`. | `withOptionalAuth(handler)`, `MaybeAuthedRequest`, `MaybeAuthedHandler` |

Both middlewares delegate header parsing to `extractBearer` from `bearer.ts`. `change-password.ts` does inline `extractBearer` + `verifyJwt` rather than going through `withAuth` because its 401 payload uses `{ code: 'unauthorized' }` (the route's unified error envelope) and `withAuth`'s `{ error }` literal would diverge.

### `api/auth/_lib/` (3 modules)

Auth-only helpers, owned by `verify-otp` / `verify-password` / `change-password`.

| File | Purpose | Exports |
|---|---|---|
| `api/auth/_lib/password.ts` | Sole consumer of `bcryptjs`. | `validatePasswordShape`, `hashPassword`, `verifyPassword` |
| `api/auth/_lib/personas.ts` | Persona resolution shared between `verify-otp` and `verify-password`. | `ROLE_DEFAULTS`, `resolveSubscriber`, `resolveDemoPersona`, `ResolvedIdentity` |
| `api/auth/_lib/claims.ts` | JWT-claim + response-DTO assembly. | `buildJwtClaims`, `buildAuthResponseUser`, `buildAuthResponseDto`, `AuthResponse`, `AuthResponseUser` |

`password.ts` ships three functions: `validatePasswordShape(plain)` (synchronous; returns `null` on pass, or one of: `password_required`, `password_too_short`, `password_too_long` (72-**byte** cap — bcrypt's hard limit), `password_too_weak` (must contain letter + digit)); `hashPassword(plain)` (bcrypt `COST = 10`, ~80ms); `verifyPassword(plain, hash)` (returns `false` — never throws — for any failure mode: missing hash, malformed hash, mismatch).

`personas.ts` ships `ROLE_DEFAULTS` (the demo-stable fallback entity IDs `subscriber → 's-0001'`, `agent → 'a-001'`, `branch → 'b-kam-015'`, `distributor → 'd-001'` — mirrors the seed personas; sync is manual); `resolveSubscriber(supabaseAdmin, phone)` (newest-wins lookup on `subscribers (phone)`; returns `null` on no match or DB error — caller falls back to `ROLE_DEFAULTS.subscriber`); `resolveDemoPersona(supabaseAdmin, phone, role)` (`(phone, role)` lookup on `demo_personas`; always returns an identity, falling back to `ROLE_DEFAULTS[role]`).

`claims.ts` ships `buildJwtClaims` (assembles `sub`, `role: 'authenticated'`, `app_role`, `phone`, and the role-scoped `subscriberId`/`agentId`/`branchId`/`distributorId` claim) and `buildAuthResponseDto` (convenience wrapper that both `verify-otp` and `verify-password` call right before `res.status(200).json(...)`, so the two routes mint byte-identical `{ token, user }` payloads).

### `api/kyc/_lib/` (1 module)

`api/kyc/_lib/mocks.ts` ships `mockTrackingId(prefix?: string) → string` (defaults to `'smile'`). Returns `${prefix}_${ts36}_${rand36}` (e.g. `smile_lwxa3y2k_4f9q2z`). Consumed by `face-match.ts`, `aml-screen.ts`, `nira-verify.ts`. The separator (`_`, not `-`) and prefix default are deliberate — QA fixtures hard-code the shape. Keep stable.

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
- TTL: `DEFAULT_EXPIRY_SECONDS = 60 * 60 * 24` (24h, single source). No refresh path.
- Secret bytes are cached on first decode (`getSecretKey()`).

### Supabase admin client

`supabase-admin.ts` returns a Proxy that lazy-instantiates the client on first property access, so unit tests + type-check passes don't throw when env vars are missing. The real client is built with `auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }` — critical under the **long-lived Render Express process**. The previous Vercel topology rebuilt the client per invocation, masking any session-related drift; under a singleton, leaving these flags unset would leak token-refresh timers across requests. If any future code path imports the admin client with different `auth` options, an internal refresh timer could fire on a stale token and break authenticated reads silently.

**Role claim is frozen at JWT mint time.** `api/auth/_lib/claims.ts:50-66` encodes `app_role` when the token is minted. If the underlying `users.role` row changes in the database (e.g. admin manually re-roles a user), the change does NOT propagate until the user re-logs in. There is no refresh path. Doc-only awareness item; no code change.

---

## §5. Auth flow end-to-end

### OTP path (legacy / fallback)

1. **`POST /api/auth/send-otp`** — Validates `phone` and `role` shape, then canonicalises the phone via `toCanonicalUGPhone`. No SMS provider is wired in (demo scope). Returns `{ success: true }` on a well-formed body.
2. **User enters any 6-digit code** (demo OTP — see §15a).
3. **`POST /api/auth/verify-otp`** — Validates `phone` + `otp` (`^\d{6}$`) + `role`; canonicalises phone; optionally validates a `password` shape if the caller is signing up with a fresh credential. Then:
    - If `role === 'subscriber'`, calls `resolveSubscriber` (newest-wins query on `subscribers (phone)` — see `api/auth/_lib/personas.ts`). If no match → falls back to `ROLE_DEFAULTS.subscriber = 's-0001'` (every demo login succeeds; CLAUDE.md §8).
    - For other roles, calls `resolveDemoPersona`, which looks up `demo_personas` by `(phone, role)` and falls back to `ROLE_DEFAULTS[role]` (`agent → 'a-001'`, `branch → 'b-kam-015'`, `distributor → 'd-001'`).
    - Hashes the supplied password (if any) **after** the role lookup so a malformed phone/role short-circuits before the ~80ms bcrypt cost.
    - Upserts `users(phone, role, last_login_at, password_hash?)` with deterministic PK `id = '<role>:<phone>'`, on-conflict target `(phone, role)`. A Supabase `error` on the upsert path is wrapped in a local `DbError` and surfaced as `500 { code: 'db_error', message: '<supabase code or msg>' }` (Phase 1F `dbe12e2`). PGRST116 ("no row") is treated as non-fatal — the upsert reports `hasPassword: Boolean(passwordHash)` and login still succeeds.
    - Builds the JWT claims via `buildJwtClaims` and the response body via `buildAuthResponseDto` (both from `api/auth/_lib/claims.ts`), signs the token with `signJwt`.
4. **Response:** `{ token, user }` where `user = { role, phone, hasPassword, name?, subscriberId|agentId|branchId|distributorId }`. `AuthContext.login` writes the token to `localStorage.upensions_token` and the user payload to `localStorage.upensions_auth`.

### Password path (`/api/auth/verify-password`)

Companion to `verify-otp` shipped with `0026_users_password_hash.sql`. Same response DTO — `AuthContext.login` consumes either.

1. Looks up `users` by `(phone, role)` (UNIQUE) to fetch `password_hash`. Real DB lookup error → `500 { code: 'db_error', message: '<supabase code or msg>' }` (Phase 1F `dbe12e2`) — distinct from the `password_not_set` auth-failure UX path.
2. NULL hash or no row → `401 { code: 'password_not_set' }` (UI maps this to "use OTP instead").
3. Defense-in-depth role re-check against the row's stored role → `401 { code: 'role_mismatch' }` if the stored role disagrees with the requested role (the SELECT already filters by role, so this is a belt-and-braces guard against future refactors / mid-flight role rewrites).
4. `bcrypt.compare` against `password_hash`. Mismatch → `401 { code: 'invalid_password' }`.
5. Resolves the role-scoped entity ID using the same shared `resolveSubscriber` / `resolveDemoPersona` helpers as `verify-otp` (Phase 1C `c3b54a3`).
6. Best-effort `last_login_at` UPDATE (non-fatal on failure).
7. Mints the JWT and response body via the same `buildJwtClaims` / `buildAuthResponseDto` helpers as `verify-otp` — payloads are byte-identical (`hasPassword` is always `true` on this path).

### `change-password` flow

Authenticated. Body: `{ currentPassword?, newPassword }`. Reads JWT inline via `extractBearer` (from `api/_lib/bearer.ts`, Phase 1A `aab34e9`) + `verifyJwt`. Two flows:

- **Initial set** — row has `password_hash IS NULL`. Skip the currentPassword check; just stamp the new hash.
- **Change** — row already has a hash. Require + bcrypt-verify `currentPassword` before update.

Error vocabulary: `unauthorized`, `current_password_required`, `current_password_invalid`, `password_required` / `password_too_short` / `password_too_long` / `password_too_weak`, `user_not_found`, `db_error` (Phase 1F — for lookup or update failures, attaches Supabase `error.code` in `message`), `unexpected_error`.

### Subsequent requests

Frontend uses the JWT in `Authorization: Bearer <token>` and `apikey: <anon_key>` headers when hitting PostgREST. RLS predicates read `auth.jwt() ->> '<claim>'` — **NOT** `auth.uid()`, which is `NULL` for custom HS256 tokens.

### Expiry

24h fixed TTL, no refresh. On 401 from any service call, `services/api.js` dispatches an `onAuthExpired` event; `AuthContext` consumes it to logout + redirect (FRONTEND.md §5).

### Unified error envelope across all 14 routes

Every route returns `{ code: '<snake>', message?: '<ops-detail>' }` for non-200 responses (Phase 1D `43f67e5`). The vocabulary partitions cleanly into two classes:

**Auth-failure codes (stable client UX).** Surface domain-level outcomes that the frontend branches on:

- `invalid_otp` — bad OTP shape or unknown phone (verify-otp).
- `invalid_password` — bcrypt compare failed (verify-password).
- `password_not_set` — no `users` row OR `password_hash IS NULL` (verify-password). UI maps to "use OTP instead".
- `wrong_old_password` / `current_password_invalid` — supplied `currentPassword` failed verify (change-password).
- `current_password_required` — row has hash but body omitted `currentPassword` (change-password).
- `role_mismatch` — defense-in-depth (verify-password).
- `unauthorized` — missing / invalid / expired JWT (change-password).
- `user_not_found` — JWT claims point at a `(phone, role)` pair with no row (change-password).

**`db_error` (real DB failures, distinct from auth fails).** `500 { code: 'db_error', message: '<supabase error.code or message>' }` (Phase 1F `dbe12e2`). Ops can grep `db_error` in logs to triage actual Supabase failures without it being masked by the demo's `invalid_otp` / `password_not_set` UX codes.

**405 envelope.** Every route returns `{ code: 'method_not_allowed' }` with an `Allow: POST` response header (Phase 1D `43f67e5`).

**`Cache-Control: no-store`** — set unconditionally on every response path of every route, including 405s (Phase 1G `1f0e2e1`).

---

## §6. Custom HS256 JWT model — why NOT Supabase Auth

Supabase Auth ships email/password + magic-link plus a `sub = auth.users.id` claim. The platform needs role-scoped entity IDs (`subscriberId` / `agentId` / `branchId` / `distributorId`) directly on the token so RLS predicates like `agent_id = auth.jwt() ->> 'agentId'` resolve in a single column read. The custom JWT keeps the same `aud: 'authenticated'` audience PostgREST expects, signed with `SUPABASE_JWT_SECRET`, so all of PostgREST + RLS + the Realtime channel accept it natively.

### `auth.uid() = NULL` consequence

Because we never go through Supabase Auth (no `auth.users` row, no `sub` = a Supabase user UUID), `auth.uid()` returns `NULL` for every request. Any RLS policy or RPC that reads `auth.uid()` silently fails — every policy in this repo reads claims via `auth.jwt() ->> '<key>'` instead.

### The `auth.jwt() ->> 'app_role'` vs `'role'` trap (canonical citation)

Hard anti-pattern: **never read `auth.jwt() ->> 'role'` and compare against application role values** (`'distributor'`, `'agent'`, `'branch'`, `'subscriber'`). This single trap has caused at least **two production-grade incidents** in this repo's history (callouts below). It is the highest-stakes correctness rule in the backend.

- PostgREST requires the JWT to carry `role: 'authenticated'` (the Postgres role) so it can issue `SET ROLE authenticated`. With JWTs minted by `signJwt`, **every** `auth.jwt() ->> 'role'` returns the literal string `'authenticated'`.
- The application role lives in a separate `app_role` claim. RLS + RPCs MUST read `auth.jwt() ->> 'app_role'`.

#### Historical incidents (boxed callouts)

> **Incident 2026-04-12 — 0018 metrics-rollup zero regression.** A newly-shipped
> `get_entity_metrics_rollup(p_level, p_entity_ids)` RPC gated on
> `auth.jwt() ->> 'role'` (which returns the Postgres role `'authenticated'`)
> instead of `auth.jwt() ->> 'app_role'` (which returns the application role
> `'subscriber'` / `'agent'` / `'branch'` / `'distributor'`). Effect: **every
> drill-down on the distributor dashboard rendered `0` subscribers and `—` AUM**
> — the role gate raised `role_not_permitted` on every call, the rollup
> returned an empty payload, and the UI silently filled zeros. An abandoned
> 0019 raw-psql hotfix was applied to remote but never landed in git; a
> targeted remote-only migration `fix_metrics_rollup_app_role` (timestamp
> `20260519165115`) patched the role-gate string but is not in the local tree
> either. The canonical fix landed as `0020_entity_metrics_rollup_v3.sql`,
> which re-emits the body reading `'app_role'`. See §7 for the supersession
> narrative.

> **Incident 2026-03 — 0004 commission state-machine silent failure.** The
> first cut of `0004_commission_run_rpcs.sql` shipped 13 SECURITY DEFINER
> state-machine RPCs (`open_run`, `release_run`, `branch_approve_line`,
> `branch_dispute_line`, etc.) — all of which gated on
> `auth.jwt() ->> 'role'` against application role values (`'distributor'`,
> `'branch'`, `'agent'`). Effect: **every branch and agent action on the
> commission queue raised `role_not_permitted`**; the distributor "Open Run"
> button worked only because the role compared against literally was
> `'authenticated'` by coincidence in one of the early local tests. The fix
> arrived as `0007_rls_use_app_role.sql` (DO block + `pg_get_functiondef`
> literal-string swap, which rewrote every policy + RPC body in-place). The
> RPCs were then re-emitted canonically in `0021_commission_rpcs_app_role.sql`
> so the bodies match the source rather than depending on a one-time runtime
> rewrite.

**Why the trap is so easy to make.** Both `'role'` and `'app_role'` are valid string claims; nothing in PostgREST, jose, or the Supabase JS client warns when a policy compares the wrong one. The mistake produces no exception — just an empty result set. A policy that reads `'role'` and gates on `'agent'` will simply never return rows; a `SECURITY DEFINER` RPC that does the same raises a generic role-mismatch on every call.

**How the trap is contract-enforced today.** `src/tests/jwt-claim-contract.test.js` asserts that every minted JWT carries the canonical `app_role` claim with one of the four legal values; a backend audit confirmed all 65 active policies + all 29 RPCs read `'app_role'` correctly in live state. When you add a new RLS policy or `SECURITY DEFINER` function, the rule is:

```sql
-- WRONG — silently returns no rows / raises role_not_permitted:
USING (auth.jwt() ->> 'role' = 'agent')

-- RIGHT:
USING ((SELECT auth.jwt()) ->> 'app_role' = 'agent')
```

(The `(SELECT auth.jwt())` wrap is for InitPlan hoisting — see `0008_rls_wrap_auth_jwt_initplan.sql`.)

---

## §7. Migration discipline

Forward-only. Never edit a shipped migration. For schema fixes, add a new `00NN_*.sql`. The full 28-migration index with per-file one-liners and incident cross-references lives in [`docs/MIGRATIONS.md`](./docs/MIGRATIONS.md); the table below in this section is a short rollup of the high-impact ones plus the supersession narrative around `0018 → (0019 missing) → 0020`.

### Numbering

Files are zero-padded, monotonically increasing. **0019 is intentionally absent** — it was an abandoned raw-psql hotfix for the metrics-rollup `app_role` bug; the canonical fix landed as 0020. See `0020_entity_metrics_rollup_v3.sql:3–5` for the supersession history.

### `.down.sql` partners

Newer migrations ship a `.down.sql` partner alongside the forward file (`0016`, `0022`, `0023`, `0024`, `0025`, `0026`). Older migrations (0001–0015) do not have downs.

### Idempotency

Re-running migrations should be safe. **Four** migrations are missing idempotency guards on at least one statement: `0003` (bare `CREATE POLICY`, would error on re-run); `0006` (`ALTER FUNCTION ... SECURITY DEFINER` — pg-safe to re-run but no guards); `0010` (bare `ALTER FUNCTION ... SET search_path` — pg-safe); `0025` (`ALTER PUBLICATION ... DROP TABLE` does NOT accept `IF EXISTS`, would fail loudly if publication state drifted — documented in the file). All other migrations use `IF NOT EXISTS` / `IF EXISTS` / `CREATE OR REPLACE` consistently.

### High-impact migrations (rollup; full index in [`docs/MIGRATIONS.md`](./docs/MIGRATIONS.md))

| File | Scope |
|---|---|
| `0001_initial_schema.sql` | 21 tables · 4 ENUMs · `pg_trgm` extension |
| `0002_rpc_functions.sql` | 4 trigger fns · 7 read RPCs · 2 atomic-write RPCs |
| `0003_rls_policies.sql` | 65 policies · ENABLE + FORCE RLS on all 20 tables |
| `0004_commission_run_rpcs.sql` | 13 SECURITY DEFINER state-machine RPCs (originally read `'role'` — see §6 incident callout) |
| `0007_rls_use_app_role.sql` | Swaps every `'role'` → `'app_role'` across policies + RPC + trigger bodies (the 0004 incident fix) |
| `0008_rls_wrap_auth_jwt_initplan.sql` | Wraps `auth.jwt()` in `(SELECT auth.jwt())` for InitPlan hoisting |
| `0014_signup_phone_and_agent_dispute.sql` | `_canonical_ug_phone` · `_insert_subscriber_chain` rewrite · **`agent_dispute_line`** RPC |
| `0018_entity_metrics_rollup.sql` | **Superseded by 0020** — left in tree, do not apply |
| `0020_entity_metrics_rollup_v3.sql` | Canonical metrics rollup (the 0018 incident fix). `_demo_now() = '2026-05-18'` |
| `0021_commission_rpcs_app_role.sql` | Re-emits all 13 commission RPCs reading `app_role` directly (canonical) |
| `0024_upsert_nominees.sql` | `nominees_share_range_chk` + `upsert_nominees` RPC |
| `0025_drop_realtime_publication.sql` | Drops 3 tables from `supabase_realtime` (zero `.channel()` subscribers in code) |
| `0026_users_password_hash.sql` | Adds nullable `users.password_hash TEXT` for bcrypt digests |

Every other migration (`0005`, `0006`, `0009–0013`, `0015–0017`, `0022`, `0023`) is a small targeted fix; see [`docs/MIGRATIONS.md`](./docs/MIGRATIONS.md) for the one-liner index.

### Supersession history: 0018 → 0019 (missing) → 0020

- `0018_entity_metrics_rollup.sql` shipped the first body but the role gate read `auth.jwt() ->> 'role'`, raising `role_not_permitted` on every call (every drill-down rendered zeros).
- A raw-psql v2 hotfix was applied to remote — never landed in git as `0019`.
- A targeted remote-only migration `fix_metrics_rollup_app_role` (timestamp `20260519165115`) was applied to remote between 0018 and 0020 — it patches the role gate string but is **not in the local git tree**.
- `0020_entity_metrics_rollup_v3.sql` is the canonical superseder — same `(p_level TEXT, p_entity_ids TEXT[]) → jsonb` signature, output keys are a superset of 0018, time-bucket fields + demographics + KYC counts all live here. **Apply only via the new file; 0018 is operationally stale.**

### Applying migrations

Local: `supabase db reset` (re-runs every `00NN_*.sql`). Hosted: `supabase db push` or the Supabase MCP tool `mcp__supabase__apply_migration` (note: the MCP path wraps DDL in a transaction by default — `0022`'s `CREATE INDEX CONCURRENTLY` must be split out via `execute_sql`; the file documents this inline).

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
| `distributors` | National-singleton network operator. Seeded with `d-001`; seed script also inserts `d-002` (`mockData.js` only knows `d-001`, so mock-backed mode misses `d-002`). Columns: `id TEXT PK`, `name`, `parent_id` (default `'ug'`), `manager_name`, `manager_phone`, `manager_email`, `status`, `created_at`, `updated_at`. Defined in `0016`. |
| `branches` | ~314 rows; FK → `districts(id)`. Carries denorm `score`, `rank`, `district_rank`, `district_branch_count` (seeded once, never refreshed). |
| `agents` | ~500–2,000 rows; FK → `branches(id)`. `languages` / `specialties` are JSONB arrays. `coverage_rate INT` added in 0018, backfilled from active proxy. |

### Domain: Subscribers + per-subscriber (8 tables)

| Table | Purpose |
|---|---|
| `subscribers` | ~30k rows; FK → `agents(id)` + `districts(id)`. Partial `UNIQUE(phone) WHERE NOT is_demo_signup` lets demo signups collide-and-overwrite. |
| `subscriber_balances` | One row per subscriber; maintained by trigger (§12). |
| `contribution_schedules` | One row per subscriber; UPSERTed at signup. `retirement_pct + emergency_pct = 100`. |
| `insurance_policies` | One row per subscriber; nullable. `status` ∈ `'active' \| 'inactive'` (TEXT — see "Status columns" below). |
| `nominees` | Pension + insurance beneficiaries; per-row `CHECK (share BETWEEN 0 AND 100)`. **No `UNIQUE` per `(subscriber_id, type)`** — duplicate beneficiaries are possible at the table level; sum-to-100 enforcement now lives in `upsert_nominees` (0024). |
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

### Status columns are TEXT with implicit enums

`subscribers.kyc_status`, `withdrawals.status`, `claims.status`, `insurance_policies.status`, `agent_referrals.status`, `distributors.status` — all `TEXT` with documented value sets but no `CHECK` constraint. Discipline lives in client code (and the BEFORE-UPDATE trigger for `subscribers`). The four `commission_status` / `settlement_run_state` / `settlement_run_branch_review_state` / `nominee_type` enums are properly enforced.

### Indexes

`0001` ships 8 base indexes: `subscribers (agent_id)`, partial `subscribers (phone) WHERE NOT is_demo_signup`, `transactions (subscriber_id, date DESC)`, `commissions (agent_id, status)`, `commissions (branch_id, status)`, `commissions (run_id)`, `settlement_run_branch_reviews (branch_id)`, `users (phone)` + `demo_personas (phone, role)`. `0017` adds the 3 unique constraints (`ux_agents_email`, `ux_subscribers_nin`, `ux_commissions_agent_subscriber` — the last one closes the first-contribution race, see §15b). FK covering + perf indexes accrue across `0009`/`0013`/`0018`/`0020`/`0022` (including `idx_transactions_type_date` partial). `0011` + `0023` drop unused indexes including the duplicate `subscribers_agent_id_idx`.

### Denormalized columns seeded but never re-written

Columns the seed populates but no API code path updates (some are read-only metric displays; some are entirely unused):

- `agents.coverage_rate`, `agents.tenure_months`, `agents.performance`, `agents.rating`
- `branches.score`, `branches.rank`, `branches.district_rank`, `branches.district_branch_count`
- `subscribers.products_held`, `subscribers.contribution_history`, `subscribers.current_unit_value`, `subscribers.occupation`, `subscribers.unit_value_as_of`
- `transactions.status`, `transactions.method`, `transactions.split_retirement`, `transactions.split_emergency`
- `commissions.subscriber_name` (denorm at insert; never updated when `subscribers.name` changes)

---

## §9. RLS policies

### Discipline summary

- Every JWT signed by `signJwt` carries `role: 'authenticated'` (Postgres role) + `app_role: <JwtRole>` (application role).
- **Every active RLS policy reads `auth.jwt() ->> 'app_role'`** — never `'role'`. All 65 policies are verified correct in live state (see §6 for why this matters).
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

**29 functions** total (24 SECURITY DEFINER + 5 INVOKER), all with `SET search_path` pinned. All 29 read `auth.jwt() ->> 'app_role'` (never `'role'`); zero usage of `auth.uid()` across the codebase (see §6 for why both rules matter).

Breakdown: 5 trigger functions (4 in 0002 + 1 in 0005 — see §12); 3 private/internal helpers (`_validate_signup_payload`, `_insert_subscriber_chain` in 0002 then rewritten 0014/0015; `_canonical_ug_phone` in 0014; `_demo_now()` IMMUTABLE in 0020/0023); 7 read RPCs (below); 2 atomic-write RPCs (below); 13 commission state-machine RPCs (0004 → re-emitted in 0021); 1 agent-side dispute RPC (`agent_dispute_line` in 0014); 1 nominees upsert RPC (`upsert_nominees` in 0024).

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

Shared work (`_insert_subscriber_chain`, rewritten in 0014 then 0015): validate payload (`_validate_signup_payload`); insert subscriber row (idempotent on phone via partial unique index); fire `trg_subscribers_after_insert` (seeds `subscriber_balances`); insert `contribution_schedules` (80/20 default unless overridden); insert `insurance_policies` when `contributionSchedule.includeInsurance = true` (0015); insert `nominees` (pension + insurance); insert the first `transactions` row (`type='contribution'`) — `trg_transactions_contribution` updates balance + creates first-contribution commission at `commission_config.rate`. After 0015 a second `transactions` row (`type='premium'`) is emitted when an insurance premium is set; the contribution + withdrawal triggers are guarded with `WHEN (NEW.type = …)` so the premium row does not double-fire balance writes.

`create_subscriber_from_signup` is granted to `anon, authenticated` so signup works without a JWT yet. `create_subscriber_from_agent_onboard` is `authenticated`-only and cross-checks `calling_agent_id` against `auth.jwt() ->> 'agentId'`.

### Commission state-machine RPCs (13 + 1 agent-side)

All `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`. Each validates `auth.jwt() ->> 'app_role'` against the allowed actor and raises on mismatch. Full RPC list + state transitions + side effects: see §11's transition table. The 14 RPCs are:

- **Distributor-only** (5): `open_run()`, `cancel_run`, `release_run`, `release_branch`, `approve_dispute`, `reject_dispute`.
- **Branch-only** (5): `branch_approve_all`, `mark_branch_reviewed`, `branch_approve_line`, `branch_hold_line`, `branch_dispute_line`.
- **Agent-only** (3): `agent_dispute_line` (the frontend `services/commissions.js#disputeCommission(by='agent')` calls this), `withdraw_dispute`, `agent_confirm_commission` (maker-checker counterpart to admin settlement).

The 13 RPCs from 0004 were re-emitted in `0021_commission_rpcs_app_role.sql` with the role gate inlined (reading `app_role` directly rather than via 0007's `pg_get_functiondef` literal-replace). The 0014 `agent_dispute_line` body got the same treatment in 0021.

### `upsert_nominees` (0024)

`upsert_nominees(p_subscriber_id TEXT, p_pension JSONB, p_insurance JSONB) RETURNS JSONB`. SECURITY DEFINER, role-gated to `subscriber` (own row) or `admin`. Validates `SUM(share)` per type rounds to 100 or empty array. DELETE + INSERT in one transaction. Returns the canonical `{ pension, insurance }` shape that `getSubscriberNominees` consumes. The GRANT preamble in this file revokes only from `anon` (not `PUBLIC`) — inconsistent with house style; see §15b.

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

**Current state:** `supabase_realtime` membership for `public.*` is empty (matches intent, modulo the supersession by 0025 itself). High-write tables (`transactions`, `subscribers`, `subscriber_balances`) were never added to begin with. React Query's 5-minute staleTime + manual invalidation handles cross-laptop demo sync at sufficient resolution.

If a future feature wires `.channel()` subscribers, the 0025 down migration restores the three-table publication.

---

## §14. Seeding & utility scripts

Three scripts in `scripts/`.

### `scripts/seed-supabase.mjs` (~895 lines)

Run via `npm run seed`. Materialises the full `src/data/mockData.js` hierarchy into the Supabase Postgres DB.

**Mechanics:** reads `SUPABASE_DB_URL` from `.env.local` (pooler URL, port 6543); direct `pg.Client` connection (NOT through Supabase JS); wraps everything in `BEGIN … COMMIT`; sets `session_replication_role = 'replica'` for the duration so the 30k seeded contribution transactions don't double-insert via `trg_transactions_contribution` (restored to `'origin'` before `COMMIT` and inside the `catch`); bulk inserts via `INSERT … FROM unnest($1::type[], …) ON CONFLICT (pk) DO UPDATE` — one round-trip per 2,000-row chunk, idempotent on re-run. **Phone dedup:** subscribers with duplicate phones get reassigned to a synthetic `+25671XXXXXXX` range so the partial unique index `subscribers(phone) WHERE NOT is_demo_signup` stays satisfied; per-run state (a `Set`), so if live subscribers exist when seed re-runs, dupes silently reassign to different `+25671XXXXXXX` numbers. `demo_personas` seeded with 7 rows: 3 agents (`a-001/a-042/a-118`), 2 branches (`b-kam-015/b-mba-290`), 2 distributors (`d-001/d-002`) at predictable `+25670000000XX` phones.

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

**`users` table is NOT populated by the seed.** `password_hash` (added in 0026) and `last_login_at` are stamped only on live signups via `/api/auth/verify-otp`. Demo subscribers/agents/branches/distributors have no `users` row by default; the JWT-mint path upserts on first OTP verify.

**`mockData.js` `DISTRIBUTORS` drift.** `src/data/mockData.js:92–103` exports a `DISTRIBUTORS` dictionary containing only `d-001`. The seed inserts `d-001` AND `d-002`. Mock-backed mode (`VITE_USE_SUPABASE='false'`) will miss `d-002`.

**`MOCK_NOW`** = `new Date(2026, 4, 22)` (= `2026-05-22`) at `src/data/mockData.js:24`. Today is `2026-05-26`; small relative-date demos may show negative-day signals.

### `scripts/seed-loader.mjs` + `scripts/clip-districts.mjs`

`seed-loader.mjs` is an ESM resolution hook registered before `import('../src/data/mockData.js')`; auto-appends `.js` to extension-less relative specifiers so the seed can read `mockData.js` unchanged. `clip-districts.mjs` is a boundary-clipping utility using `@turf/turf` — reads `public/uganda-districts.geojson` + `public/uganda-regions.geojson`, intersects each district with its parent region, writes clipped output back (backs up the original to `public/uganda-districts-original.geojson` on first run; idempotent). Run manually: `node scripts/clip-districts.mjs`.

---

## §15. Backend findings

### §15a. Demo scope (by design — do not "fix")

Every item below is intentional for a sales-rep demo. Never frame as a production-prep TODO. (CLAUDE.md §10a is the short-form mirror of this list.)

- **Any 6-digit OTP accepted** at `/api/auth/verify-otp` (regex `^\d{6}$` is the only check). No SMS provider, no rate limiting, no lockout. Same for KYC OTP at `/api/kyc/otp-verify` (4 digits, rejects `'0000'` only).
- **All 8 KYC routes are mocks.** Realistic latencies preserved so the live demo's animated checks land cleanly. Force-overrides via `x-qa-force` header (`fail-blur`, `partial`, `flagged`, `liveness-fail`, …) mirror the frontend's `localStorage upensions_*_force` keys.
- **Unit price hardcoded to 1,000 UGX/unit** at `supabase/migrations/0002_rpc_functions.sql:113` (`v_unit_price NUMERIC := 1000` inside `trg_transactions_contribution`). No fund NAV table.
- **JWT fixed 24h TTL, no refresh** (`DEFAULT_EXPIRY_SECONDS = 60 * 60 * 24`). On 401 the frontend logs out gracefully.
- **`demo_personas` fallback IDs** (`ROLE_DEFAULTS` in both `verify-otp.ts` and `verify-password.ts`): `subscriber → 's-0001'`, `agent → 'a-001'`, `branch → 'b-kam-015'`, `distributor → 'd-001'`. Keeps every login successful for a sales demo even if the persona seed drifted.
- **Mocked chat** — `/api/chat` returns keyword-matched canned strings (no LLM, no DB aggregates). Three flavours: admin/branch/distributor, agent DM, subscriber co-pilot.
- **Per-session mutation stores** — frontend service files keep in-memory write overlays on top of frozen `mockData.js`. Resets on refresh.
- **Static seed metrics.** `district_rank` / `rank` / `district_branch_count` on `branches` computed once at seed time, no daily ranking job. `contribution_history` is a JSONB sparkline denorm from `transactions` with no consistency trigger. `commission_config` is a singleton (`CHECK id = 'default'`) with no UPDATE history.
- **`search_entities` hardcoded `LIMIT 8`.** Plenty for a demo's autocomplete UX.
- **No CSRF / origin checks** on the public POST routes. Acceptable because the demo runs from a single allowed origin. Render's Express layer applies `helmet()` defaults (X-Content-Type-Options + baseline CSP); tightening CSP for an SPA + cross-origin Render API is explicitly out of scope.

### §15b. Real bugs / awareness items

These affect the demo experience or future sessions — track but do NOT bundle with §15a, and do NOT propose production-hardening solutions. Phase-1 post-audit cleanup (2026-05-26) closed API helper duplication, error-envelope drift, KYC phone normalization, DB-error swallowing, dead phone exports, the unused `withAuth` middleware classification, the route-count discrepancy, and the stale `disputeCommission` doc drift (see §3, §4, §5). The remaining items below are open or by-design.

**Auth-route subtleties (open / by-design):** `chat.ts` body `context` overrides role for unauthenticated callers — intentional but inconsistent with the strict role discipline elsewhere; documented at the call-site. `chat.ts` type-checks `body.message` before `.trim()` so non-string bodies short-circuit to `invalid_message` instead of crashing.

**Database invariants:**

- `upsert_nominees` `GRANT` is missing the `REVOKE ALL ON FUNCTION ... FROM PUBLIC` preamble used by every other RPC. Benign at execution time; inconsistent with house style.
- `nominees` table has no `UNIQUE(subscriber_id, type, …)` — duplicate beneficiaries are possible at the table level. Sum-to-100 lives in `upsert_nominees` only; direct INSERTs bypass.
- Status columns (`subscribers.kyc_status`, `withdrawals.status`, `claims.status`, `insurance_policies.status`, `agent_referrals.status`, `distributors.status`) are TEXT with implicit enums and no `CHECK` constraint. Discipline lives in client code.
- 4 migrations lack idempotency guards on at least one statement: `0003`, `0006`, `0010`, `0025`.
- **First-contribution race — mitigated.** `commissions` now carries `ux_commissions_agent_subscriber UNIQUE(agent_id, subscriber_id)` (0017). The trigger's `NOT EXISTS` pre-check is preserved as a fast path; the unique index is the authoritative guard.
- **0018 superseded by 0020** but left in tree. Operationally stale; do not apply. The remote-only `fix_metrics_rollup_app_role` migration (timestamp `20260519165115`) is also not in the local git tree — replay-safe since 0020 supersedes its intent.

**Seed-data drift:** seed does NOT populate `users` (`password_hash` is only stamped via live signups); phone dedup is per-run, not idempotent against pre-existing live data; `mockData.js#DISTRIBUTORS` knows only `d-001` while the seed inserts `d-001` + `d-002`, so mock-backed mode misses `d-002`.

**Other open items (also tracked in CLAUDE.md §10b):** employer + admin roles unbuilt (no RLS policies, no dashboards, no shells); dispute `reason` is free-text TEXT on `commissions.dispute_reason` (UI shows whatever was typed); `agent_referrals` row PK `ar-<epoch>-<rand>` and public `UAG-XXXX` ticket ID (~1.7M space) — collision-tolerant but not cryptographic; no retry / idempotency keys on `/api/contact` or `/api/kyc/agent-referral` (a resubmit creates a second row).

### §15c. Test coverage

12 backend `.test.ts` files cover every route under `api/auth/` and `api/kyc/`: the 4 auth route tests (`send-otp`, `verify-otp`, `verify-password`, `change-password` — ~81 tests covering OTP/password shape errors, role enum, phone canonicalisation, password set vs change flows, JWT round-trip, the `db_error` envelope); the 8 KYC route tests (one per route — ~57 tests covering phone canonicalisation on the 3 phone-accepting routes, every `x-qa-force` branch, `Cache-Control: no-store` + `Allow: POST` headers, the demo-scope 200-with-refusal contract on the 3 verifier routes); plus the pre-existing `api/auth/_lib/password.test.ts` shape + bcrypt round-trip.

`npm test` runs all vitest files (`api/**/*.test.ts` + `src/tests/**/*.test.{js,ts}`). For backend-only iteration: `npm test -- api/auth api/kyc`. Full testing pipeline + Playwright E2E reference lives in [`docs/TESTING.md`](./docs/TESTING.md).

---

## §16. Operational runbook

Operational runbook for Render-side concerns — manual deploy procedure, deploy-time outage window, free-tier resource caps, log retention, failure alerting, silent-failure recovery, provisioning checklist, JWT secret rotation, bandwidth budget — lives in [`docs/render-operational.md`](./docs/render-operational.md). This section keeps only the local-dev + dev-loop reference; do not duplicate operational procedures here.

### Local development

`supabase/config.toml` controls the local CLI emulator only (not the hosted project). Ports: API gateway 54321, Postgres 54322, Studio 54323, Inbucket (email catcher) 54324, Shadow DB 54329. `project_id = "uganda-dashboard"`.

### Common dev operations

| Task | Command / SQL |
|---|---|
| Start local Supabase | `supabase start` |
| Apply migrations locally | `supabase db reset` (re-runs every `00NN_*.sql`) |
| Push migrations to hosted project | `supabase db push` |
| Apply a single migration via MCP | `mcp__supabase__apply_migration` (note: wraps DDL in a transaction; split `CREATE INDEX CONCURRENTLY` out via `execute_sql` — see 0022 header) |
| Reseed Postgres | `npm run seed` (reads `SUPABASE_DB_URL` from `.env.local`) |
| Clip GeoJSON | `node scripts/clip-districts.mjs` |
| Test a read RPC from psql | `SELECT public.get_entity_commission_summary('region', 'r-central');` |
| Impersonate a role in psql | `SET LOCAL request.jwt.claims = '{"role":"authenticated","app_role":"agent","agentId":"a-001","aud":"authenticated"}'; SELECT count(*) FROM subscribers;` |
| Inspect realtime publication | `SELECT pubname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';` (expected: empty for `public.*` after 0025) |
| Confirm `app_role` discipline | `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND (qual LIKE '%''role''%' OR with_check LIKE '%''role''%');` (expected: 0) |

Log tail, deploy trigger, env-rotation, and JWT-secret rotation procedures are in [`docs/render-operational.md`](./docs/render-operational.md).

### `.env.local` workflow

- Start from `.env.local.example`; copy + fill in.
- **Do NOT run `vercel env pull`.** It overwrites `.env.local` and wipes the local-only `SUPABASE_DB_URL` (the seed script's only path to Postgres).
- The 6 `VITE_*` frontend keys with defaults (see §2) can be added when you need to override the hardcoded fallbacks in `src/config/env.js`.

### Smoke checks after deploy

- `POST /api/contact` with a dummy body → verify row in `contact_submissions`.
- `POST /api/auth/send-otp` then `verify-otp` with a known demo persona phone (`+256700000001` → agent `a-001`) → verify `users` row upserts and JWT round-trips.
- Open `/dashboard` as that agent → verify agent-scoped queries return rows (RLS predicate `agent_id = auth.jwt() ->> 'agentId'` matches).
- Run an `open_run()` from the distributor account; PostgREST returns the new run row. (Realtime no longer propagates — 0025 dropped the publication; React Query manual invalidation handles refresh.)

### Migration discipline reminder (forward-only)

Full discipline + the 0018→0020 supersession narrative live in §7; the full per-migration index is in [`docs/MIGRATIONS.md`](./docs/MIGRATIONS.md). The non-negotiable rule for new work:

- New SECURITY DEFINER functions MUST set `search_path = public` (or `public, pg_temp`) and read `auth.jwt() ->> 'app_role'` — never `'role'`. The contract test in `src/tests/jwt-claim-contract.test.js` guards the claim names. See §6 for the trap.

---

## §17. See also

- `CLAUDE.md` — slim index, hard rules, glossary, demo credentials, awareness items.
- `FRONTEND.md` — service/hook/context inventory, dashboard variants, design tokens, React Query keys + invalidation, frontend-side demo behaviours.
- `docs/api-contracts.md` — describes a REST surface that does not match the current Express + PostgREST topology. Treat as stale until reconciled.
- `docs/data-model.md` — field-level entity definitions, metric-aggregation rules, branch-health-score formula, KYC/withdrawal/AUM open questions.
- `docs/role-permissions.md` — role × capability matrix.
- `docs/SPEC.md` — product spec: personas, workflows, business rules.
