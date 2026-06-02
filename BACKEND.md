# BACKEND.md — Universal Pensions Uganda

Deep backend reference. Pair with `CLAUDE.md` (slim index) and `FRONTEND.md` (deep frontend reference).

Covers the Express + TypeScript routes under `api/**` (mounted by `server/index.ts` and hosted on **Render** — Singapore region, Node 22, free tier), the Supabase Postgres schema + RPCs + RLS in `supabase/migrations/*.sql`, the seed and utility scripts under `scripts/`, and the operational runbook for local + hosted environments. The frontend ships from **Vercel** (Vite preset, no functions); see `docs/render-operational.md` for the post-migration runbook and `renderplan.md` for the migration plan.

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

> The box reflects **live** state. The committed-but-not-yet-applied employer migrations (`0034`/`0035`) add 5 tables + 4 SELECT policies + 5 RPCs once applied (see §8/§10.1) — a gated cutover step.

**RLS-first.** Every direct write from a normal authenticated client must pass an explicit policy or go through a `SECURITY DEFINER` RPC. Tables with no INSERT/UPDATE/DELETE policy reject all client writes by default; the service-role key (server-only) bypasses RLS for seeding + the JWT-mint path.

---

## §2. Environment variables

The canonical template is `.env.local.example`. Three keys are public (`VITE_*` prefix, exposed to the browser at build time), three are server-only (never prefix with `VITE_`).

| Variable | Scope | Read by | Purpose | In `.env.local.example` |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | Public (Vercel frontend) | `src/services/supabaseClient.js` | Supabase project URL (`https://<ref>.supabase.co`) | Yes |
| `SUPABASE_URL` | **Server-only (Render)** | `api/_lib/supabase-admin.ts` | Supabase project URL — server-side rename of `VITE_SUPABASE_URL` (G19). For backwards compat the admin client reads `SUPABASE_URL ?? VITE_SUPABASE_URL`. | Yes |
| `VITE_SUPABASE_ANON_KEY` | Public (Vercel frontend) | `src/services/supabaseClient.js` | PostgREST anon-tier key (default RLS-restricted) | Yes |
| `VITE_USE_SUPABASE` | Public (Vercel frontend) | `src/config/env.js` + every service file | Rollback flag — when `'false'`, services fall back to mockData (FRONTEND.md §4) | Yes |
| `VITE_API_BASE_URL` | Public (Vercel frontend, all 3 scopes) | `src/config/env.js` → `src/services/api.js` | Absolute backend URL baked into the bundle at Vite build time. Local: `http://localhost:3001/api`. Prod: `https://uganda-dashboard-api.onrender.com/api`. | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only (Render)** | `api/_lib/supabase-admin.ts` | Admin client used by all Express routes (bypasses RLS) | Yes |
| `SUPABASE_JWT_SECRET` | **Server-only (Render)** | `api/_lib/jwt.ts` | HS256 signing secret; same secret PostgREST uses to verify JWTs. **Copy verbatim from Supabase Dashboard → API → JWT Settings.** Do NOT regenerate during the Render migration (B21) — `withOptionalAuth` swallows verification errors and fails open. | Yes |
| `SENTRY_DSN` | **Server-only (Render)** | `server/index.ts` | Optional. Sentry error aggregation (free 5k events/mo). Init is DSN-gated and runs a PII scrubber (`server/sentryScrub.ts`) via `beforeSend`/`beforeBreadcrumb`; `sendDefaultPii: false`. | Yes (commented placeholder) |
| `VITE_SENTRY_DSN` | Public (Vercel frontend, optional) | `src/main.jsx` | Same Sentry project, frontend-side capture. Init runs the parallel scrubber (`src/utils/sentryScrub.js`); `sendDefaultPii: false`. | Yes (commented placeholder) |
| `SENTRY_RELEASE` | Server-only (Render, optional) | `server/index.ts` | Optional Sentry `release` tag. Falls back to Render's auto-injected `RENDER_GIT_COMMIT`; unset → no `release`. | No |
| `VITE_SENTRY_RELEASE` | Public (Vercel frontend, optional) | `src/main.jsx` | Optional Sentry `release` tag for the frontend (e.g. wired to a commit SHA at build). Vite only exposes `VITE_*` to `import.meta.env`, so a platform SHA must be re-exported under this name to reach the bundle; unset → no `release`. | No |
| `SUPABASE_DB_URL` | **Local-only** | `scripts/seed-supabase.mjs` | Postgres pooler URL (port 6543) for `npm run seed` | Yes |
| `PORT` | **Server-only (Render + local dev)** | `server/index.ts` | Express listen port. Render injects this automatically; local dev defaults to `3001`. | Yes |

### Frontend-only keys consumed by `src/config/env.js`

These keys are read by the frontend but **missing from `.env.local.example`** (audit X5). Defaults are baked into `src/config/env.js`, so the demo runs without them — list and add as needed:

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
- `api/_lib/supabase-admin.ts` and `api/_lib/jwt.ts` both hard-fail at first invocation if their env vars are missing (no deploy-time preflight — audit X14). Cold-boot 500s with a "X is not set" message are diagnostic.
- `src/services/supabaseClient.js` falls back silently to `http://localhost:54321` / `'public-anon-key'` if the `VITE_*` keys are absent (audit X6); a misconfigured Vercel preview ships a broken-but-running app.
- **Sentry PII scrubber (BL-26 / H-4).** Both Sentry inits (`server/index.ts` §0, `src/main.jsx`) run a `beforeSend`/`beforeBreadcrumb` scrubber that redacts Ugandan phone numbers, `role:phone` ids (the JWT `sub` / `users.id`), bearer tokens / JWTs, and password/auth fields from event messages, exception values, breadcrumbs, request data/headers, extra, contexts, and user. `sendDefaultPii` is explicitly `false`. The two scrubber modules (`server/sentryScrub.ts` for `@sentry/node`, `src/utils/sentryScrub.js` for `@sentry/react`) are **intentionally identical** and must be kept in sync — they live in separate build graphs (tsc NodeNext `rootDir: ..` can't reach `src/`, and Vite bundles the frontend copy). Frontend coverage is unit-tested in `src/utils/__tests__/sentryScrub.test.js`.
- **Frontend source maps (BL-29 / H-5).** `vite.config.js` sets `build.sourcemap: 'hidden'` — `.map` files are emitted to `dist/assets/` but the bundle carries no `//# sourceMappingURL=` comment, so it stays minified to end users while maps remain on disk for a future symbolication step. There is intentionally **no `@sentry/vite-plugin`** upload (demo posture — don't over-build). Consequence: the frontend Sentry init (`src/main.jsx`) is **best-effort**; when `VITE_SENTRY_DSN` is set, captured frontend stack frames are minified unless the emitted maps are manually uploaded to the matching Sentry `release`. Backend `@sentry/node` traces are unaffected (Node runs unminified `dist-server/`).

---

## §3. API route inventory

**14 routes** live under `api/`. They were originally written as Vercel serverless functions; post-Render-migration `server/index.ts` mounts each one via a thin `toExpress(handler)` adapter (`server/adapter.ts`) using `app.all('/api/.../<route>', toExpress(<handler>))`. `app.all` (not `app.post`) preserves the per-handler manual 405 contract (B5). All routes accept only `POST`; non-POST returns 405 `{ code: 'method_not_allowed' }` with `Allow: POST`. Breakdown:

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
- All 14 routes set `Cache-Control: no-store` at the top of the handler, so every response path (success + 4xx + 405) is uncacheable (Phase 1G `1f0e2e1`; the 7 KYC mock routes had it added in BL-16 — they previously omitted it). Auth tokens, KYC verification state / identity PII (`id-ocr`), and contact-form IDs must never be cached.
- All 14 routes use a unified error envelope `{ code: '<snake>', message?: '<ops-detail>' }`. Full vocabulary in §5.

### KYC phone canonicalization (Phase 1E `d0b805d`)

The 3 phone-accepting KYC routes (`otp-send`, `otp-verify`, `agent-referral`) now call `toCanonicalUGPhone()` on the body's `phone` field before any downstream use — same contract as the auth routes. `agent-referral` additionally persists the canonical `+256XXXXXXXXX` form into `agent_referrals.phone`, so support staff can cross-match referrals against the rest of the codebase's canonical phones. The other 5 KYC routes (`id-quality`, `id-ocr`, `nira-verify`, `face-match`, `aml-screen`) don't accept `phone` in their body.

### KYC verification refusals stay 200 (demo scope)

The 3 verifier routes — `nira-verify`, `aml-screen`, `face-match` — return HTTP 200 with a body-field refusal (`result: 'partial' | 'no-match'`, `outcome: 'flagged'`, `match: false`) rather than 4xx. Each carries an inline `// B16 demo-scope intentional: …` comment confirming the intent. Clients inspect body fields, not status (Phase 1D `43f67e5`).

---

## §4. `api/_lib/` and per-domain `_lib/` helpers

Server-only. Three layers: top-level `api/_lib/` for cross-domain helpers, `api/auth/_lib/` for auth-only helpers, `api/kyc/_lib/` for KYC-only helpers.

### `api/_lib/` (6 files)

| File | Purpose | Exports |
|---|---|---|
| `api/_lib/jwt.ts` | HS256 sign/verify via `jose`. UTF-8 secret interpretation (PGRST301-correct). | `signJwt(claims) → Promise<string>`, `verifyJwt(token) → Promise<JwtClaims>`, types |
| `api/_lib/supabase-admin.ts` | Singleton service-role client (RLS-bypassing). Proxy-deferred init. | default `supabaseAdmin` |
| `api/_lib/bearer.ts` | `Bearer <token>` header extractor; canonical parse for the three callers below. Phase 1A `aab34e9`. | `extractBearer(req: VercelRequest) → string \| null` (default + named) |
| `api/_lib/phone.ts` | UG-phone canonicalization to `+256XXXXXXXXX`. `parseUGPhoneLocal` and `isValidUGPhone` were removed in Phase 1H `b91f6eb` (dead exports). | `toCanonicalUGPhone(raw) → string` |
| `api/_lib/withAuth.ts` | Bearer-JWT middleware; 401 `{ error: 'unauthorized' }` on missing/invalid. Reserved for future Employer/Admin role rollouts (commented inline at the export site, Phase 1H `b91f6eb`). | `withAuth(handler) → VercelHandler`, types `AuthedRequest` / `AuthedHandler` |
| `api/_lib/withOptionalAuth.ts` | Bearer-JWT middleware; attaches `req.user: null` on miss. Used by `/api/chat`. | `withOptionalAuth(handler) → VercelHandler`, types `MaybeAuthedRequest` / `MaybeAuthedHandler` |

Both middlewares delegate header parsing to `extractBearer` from `bearer.ts` — no inline duplication remains.

### `api/auth/_lib/` (3 modules)

Auth-only helpers, owned by `verify-otp` / `verify-password` / `change-password`.

| File | Purpose | Exports |
|---|---|---|
| `api/auth/_lib/password.ts` | Sole consumer of `bcryptjs`. Pre-existing (untouched by Phase 1). | `validatePasswordShape`, `hashPassword`, `verifyPassword` |
| `api/auth/_lib/personas.ts` | Persona resolution shared between `verify-otp` and `verify-password`. Phase 1C `c3b54a3`. | `ROLE_DEFAULTS`, `resolveSubscriber`, `resolveDemoPersona`, `ResolvedIdentity` type |
| `api/auth/_lib/claims.ts` | JWT-claim + response-DTO assembly. Phase 1C `c3b54a3`. | `buildJwtClaims`, `buildAuthResponseUser`, `buildAuthResponseDto`, `AuthResponse` / `AuthResponseUser` types |

**`password.ts` API (unchanged from pre-Phase-1):**

- `validatePasswordShape(plain)` — synchronous; returns `null` on pass, or one of: `password_required`, `password_too_short`, `password_too_long` (72-**byte** cap — bcrypt's hard limit), `password_too_weak` (must contain letter + digit).
- `hashPassword(plain)` — bcrypt `COST = 10` (~80ms).
- `verifyPassword(plain, hash)` — returns `false` (never throws) for any failure mode: missing hash, malformed hash, mismatch.

**`personas.ts` API:**

- `ROLE_DEFAULTS: Record<JwtRole, string>` — the demo-stable fallback entity IDs (`subscriber → 's-0001'`, `agent → 'a-001'`, `branch → 'b-kam-015'`, `distributor → 'd-001'`, `employer → 'emp-001'`). Mirrors the seed personas; sync is manual (audit D18).
- `resolveSubscriber(supabaseAdmin, phone)` — newest-wins lookup on `subscribers (phone)`. Returns `null` when no match OR the lookup errored (the caller falls back to `ROLE_DEFAULTS.subscriber`). DB errors are logged with the `[auth/personas]` tag and treated as non-fatal at the helper layer; the route catches them via `DbError` for the upsert path only.
- `resolveDemoPersona(supabaseAdmin, phone, role)` — `(phone, role)` lookup on `demo_personas`; always returns an identity (falls back to `ROLE_DEFAULTS[role]` when no row matches). Used for the 3 non-subscriber roles.

**`claims.ts` API:**

- `buildJwtClaims({ role, phone, entityId }) → JwtSignInput` — assembles `sub`, `role: 'authenticated'`, `app_role`, `phone`, and the role-scoped `subscriberId` / `agentId` / `branchId` / `distributorId` / `employerId` claim (the `employer` branch emits `employerId`).
- `buildAuthResponseUser({ role, phone, entityId, hasPassword, name? }) → AuthResponseUser` — assembles the `user` half of the response body.
- `buildAuthResponseDto({ token, role, phone, entityId, hasPassword, name? }) → { token, user }` — convenience wrapper. Both `verify-otp` and `verify-password` call this exactly before `res.status(200).json(...)`, so the two routes mint byte-identical payloads.

Phase 1C lifted these from verbatim duplicates inside `verify-otp.ts` and `verify-password.ts`. The OTP-vs-password parity (`AuthContext.login` consumes either) is now enforced by a shared module rather than by hand-syncing two files.

### `api/kyc/_lib/` (1 module)

| File | Purpose | Exports |
|---|---|---|
| `api/kyc/_lib/mocks.ts` | Smile ID v2 tracking-id shape generator. Phase 1B `92cada2`. | `mockTrackingId(prefix?: string) → string` (defaults to `'smile'`) |

Returns `${prefix}_${ts36}_${rand36}` (e.g. `smile_lwxa3y2k_4f9q2z`). Consumed by `face-match.ts`, `aml-screen.ts`, `nira-verify.ts`. The separator (`_`, not `-`) and prefix default are deliberate — QA fixtures hard-code the shape. Keep stable.

### JWT claim shape (single source of truth)

```ts
type JwtRole = 'subscriber' | 'agent' | 'branch' | 'distributor' | 'employer';

type JwtClaims = {
  iss: 'upensions';                    // hardcoded
  sub: string;                         // entity ID (subscriber/agent/branch/distributor/employer row id)
  role: 'authenticated';               // Postgres role for PostgREST SET ROLE — NEVER the app role
  app_role: JwtRole;                   // application role; RLS reads this
  phone: string;                       // canonical +256...
  subscriberId?: string;               // when app_role === 'subscriber'
  agentId?: string;                    // when app_role === 'agent'
  branchId?: string;                   // when app_role === 'branch'
  distributorId?: string;              // when app_role === 'distributor'
  employerId?: string;                 // when app_role === 'employer' (camelCase claim; RLS reads auth.jwt() ->> 'employerId')
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

`supabase-admin.ts` returns a Proxy that lazy-instantiates the client on first property access, so unit tests + type-check passes don't throw when env vars are missing. The real client is built with `auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }` — critical under the **long-lived Render Express process** (G66). The previous Vercel topology rebuilt the client per invocation, masking any session-related drift; under a singleton, leaving these flags unset would leak token-refresh timers across requests. If any future code path imports the admin client with different `auth` options, an internal refresh timer could fire on a stale token and break authenticated reads silently.

**Role claim is frozen at JWT mint time (G57).** `api/auth/_lib/claims.ts:50-66` encodes `app_role` when the token is minted. If the underlying `users.role` row changes in the database (e.g. admin manually re-roles a user), the change does NOT propagate until the user re-logs in. There is no refresh path. Doc-only awareness item; no code change.

### `withAuth` vs `withOptionalAuth`

- `withAuth` rejects with `401 { error: 'unauthorized' }` if Bearer is missing or invalid. **Currently wraps no routes** — reserved for future Employer/Admin endpoints (commented inline at the export site, Phase 1H `b91f6eb`). `change-password.ts` still does inline `extractBearer` + `verifyJwt` because its 401 payload uses `{ code: 'unauthorized' }` (the rest of the route's vocabulary) and the unified error envelope post-Phase-1D would diverge from `withAuth`'s `{ error }` literal.
- `withOptionalAuth` swallows invalid tokens and attaches `req.user = null`. Used by `/api/chat` so the landing-page chat works for unauthenticated visitors while signed-in users get role-aware replies.
- Both middlewares delegate header parsing to `extractBearer` from `api/_lib/bearer.ts` — Phase 1A removed the previous 3× inline duplication.

---

## §5. Auth flow end-to-end

### OTP path (legacy / fallback)

1. **`POST /api/auth/send-otp`** — Validates `phone` and `role` shape, then canonicalises the phone via `toCanonicalUGPhone`. No SMS provider is wired in (demo scope). Returns `{ success: true }` on a well-formed body.
2. **User enters any 6-digit code** (demo OTP — see §15a).
3. **`POST /api/auth/verify-otp`** — Validates `phone` + `otp` (`^\d{6}$`) + `role`; canonicalises phone; optionally validates a `password` shape if the caller is signing up with a fresh credential. Then:
    - If `role === 'subscriber'`, calls `resolveSubscriber` (newest-wins query on `subscribers (phone)` — see `api/auth/_lib/personas.ts`). If no match → falls back to `ROLE_DEFAULTS.subscriber = 's-0001'` (every demo login succeeds; CLAUDE.md §8).
    - For other roles, calls `resolveDemoPersona`, which looks up `demo_personas` by `(phone, role)` and falls back to `ROLE_DEFAULTS[role]` (`agent → 'a-001'`, `branch → 'b-kam-015'`, `distributor → 'd-001'`, `employer → 'emp-001'`). The seed lands a `demo_personas` row for `EMPLOYER_DEMO_PHONE` (`+256700000031` → `emp-001`); any other phone on the `employer` role still succeeds via the `emp-001` fallback.
    - Hashes the supplied password (if any) **after** the role lookup so a malformed phone/role short-circuits before the ~80ms bcrypt cost.
    - Upserts `users(phone, role, last_login_at, password_hash?)` with deterministic PK `id = '<role>:<phone>'`, on-conflict target `(phone, role)`. A Supabase `error` on the upsert path is wrapped in a local `DbError` and surfaced as `500 { code: 'db_error', message: '<supabase code or msg>' }` (Phase 1F `dbe12e2`). PGRST116 ("no row") is treated as non-fatal — the upsert reports `hasPassword: Boolean(passwordHash)` and login still succeeds.
    - Builds the JWT claims via `buildJwtClaims` and the response body via `buildAuthResponseDto` (both from `api/auth/_lib/claims.ts`), signs the token with `signJwt`.
4. **Response:** `{ token, user }` where `user = { role, phone, hasPassword, name?, subscriberId|agentId|branchId|distributorId|employerId }`. `AuthContext.login` writes the token to `localStorage.upensions_token` and the user payload to `localStorage.upensions_auth`.

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

**`unexpected_error` (generic 500).** `500 { code: 'unexpected_error' }` — the generic-catch path for `verify-otp` / `verify-password` when an unanticipated error (e.g. `signJwt` failure) bubbles up that isn't a typed `DbError` (BL-39). Status and code agree: the 4xx UX vocabulary (`invalid_otp` / `invalid_request`) is reserved for client-correctable shape failures and is never returned with a 500. The frontend's `mapAuthErrorMessage` has no explicit branch for `unexpected_error`, so it degrades to the default error message. Matches the server's final error-handler shape (`server/index.ts §12`).

**405 envelope.** Every route returns `{ code: 'method_not_allowed' }` with an `Allow: POST` response header (Phase 1D `43f67e5`).

**`Cache-Control: no-store`** — set unconditionally at the top of every handler, so every response path (success + 4xx + 405) is uncacheable (Phase 1G `1f0e2e1`; extended to the 7 KYC mock routes — `otp-send`, `otp-verify`, `id-ocr`, `id-quality`, `face-match`, `aml-screen`, `nira-verify` — in BL-16, which previously lacked it). Auth tokens, KYC verification state / identity PII (`id-ocr`), and contact-form IDs must never be cached.

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
| `0029_commission_simplify.sql` (+ `.down.sql`) | 380 | **Commission simplification.** Drops the 14 state-machine + dispute RPCs, `get_run_branch_breakdown`, the `commissions_before_update` trigger/function, and the `settlement_runs` / `settlement_run_branch_reviews` tables (+ their enum types). Collapses `commission_status` to `('due','paid')`. Drops `commissions.{run_id, agent_confirmed, previous_status, dispute_reason, disputed_at, disputed_by, resolved_at, resolved_by, outcome_reason, hold_reason}`; adds `paid_amount NUMERIC`. Re-emits the 3 read RPCs (`get_commission_summary`, `get_entity_commission_summary`, `get_agent_commission_detail`) in slimmed paid/due-only form. |
| `0030_settlement_batches.sql` (+ `.down.sql`) | 72 | NEW `settlement_batches` table (one row per agent-settlement; SELECT-only RLS — distributor all, branch/agent own). |
| `0031_notifications.sql` (+ `.down.sql`) | 280 | NEW `notifications` table (`recipient_role` ∈ `agent`/`branch`; SELECT-only RLS) + the `apply_settlement(p_rows jsonb)` and `mark_notifications_read(p_ids text[])` RPCs. |
| `0032_fix_settlement_apply.sql` (+ `.down.sql`) | ~290 | **Settlement-apply correctness + idempotency.** `CREATE OR REPLACE`s `apply_settlement` as `(p_rows jsonb, p_nonce text)` — FIFO per-line allocation (BL-1/BL-2), whole-UGX `round()` (BL-8), formatted notification bodies (BL-18). Adds the `settlement_uploads` idempotency ledger (PK `nonce`, RPC-internal, RLS-forced, no grants) and `settlement_batches.client_nonce` (BL-13). Drops the 0031 single-arg `apply_settlement(jsonb)`. **NOT YET APPLIED TO LIVE** — gated cutover step. |
| `0033_post_audit_hardening.sql` (+ `.down.sql`) | ~115 | **Post-audit DB hardening (pure DDL, no RPC change).** Adds `notifications.ref_id` FK → `settlement_batches(id) ON DELETE SET NULL` + a covering index (BL-15 — `ref_id` is provably only ever a batch id). Aligns the `settlement_batches` FK `ON DELETE` actions to the commissions convention: `agent_id` → `agents(id) ON DELETE CASCADE`, `branch_id` → `branches(id) ON DELETE SET NULL` (F-12). `ALTER TABLE distributors FORCE ROW LEVEL SECURITY` — the last RLS-enabled-but-not-FORCE'd table (BL-24). Fully guarded/idempotent. **NOT YET APPLIED TO LIVE** — gated cutover step; apply after 0032 + a verified backup. |
| `0034_employer_schema_and_rls.sql` (+ `.down.sql`) | ~235 | **Employer schema + RLS (Phase 0).** 5 new tables — `employers`, `employees` (standalone roster, NOT subscribers; balances live here, not `subscriber_balances`), `contribution_runs`, `contribution_run_lines` (per-employee ledger; employees are NOT in `transactions`), `contribution_run_uploads` (idempotency ledger, parallel to `settlement_uploads`). TEXT PKs (`emp-001`, `empe-NNN`, `run-NNN`); ENABLE + FORCE RLS on all 5; indexes on `employees(employer_id)`, `contribution_runs(employer_id)`, `contribution_run_lines(run_id, employee_id)`. One SELECT policy per table scoped by the camelCase `employerId` claim (run_lines via an EXISTS join to the parent run); `contribution_run_uploads` has **no policy/grant** (RPC-internal). No client write policies — writes go through the 0035 RPCs. **NOT YET APPLIED TO LIVE** — gated cutover step. |
| `0035_employer_rpcs.sql` (+ `.down.sql`) | ~520 | **Employer RPCs (Phase 0).** 5 SECURITY DEFINER functions, each gated on `app_role = 'employer'` + scoped to the `employerId` claim, `SET search_path = public, pg_temp`, house grant pattern (REVOKE PUBLIC / GRANT authenticated). `submit_contribution_run(p_rows, p_period_label, p_method, p_nonce)` — re-derives every amount server-side from `employees.salary` + `contribution_config`, splits gross by the employee's schedule, writes `contribution_run_lines` + bumps `employees` balances **inline** (UGX 1,000/unit), nonce-idempotent via `contribution_run_uploads`, skips suspended/not-owned/not-found/zero rows; **MUST NOT write `transactions`/`subscriber_balances`/`commissions`** (no commission code path is reachable). `update_employee_contribution_config`, `update_employee_insurance`, `update_employer_profile` (ownership-checked patches), `get_employer_metrics()` (STABLE — hero/overview aggregates). Structural template = `apply_settlement` (0032). **NOT YET APPLIED TO LIVE** — gated cutover step. |

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

**21 tables** in the core schema (+ **5 employer tables** added by `0034`, not yet applied to live), **4 ENUMs**, `pg_trgm` extension. All primary keys are `TEXT` for deterministic seed IDs (`a-001`, `b-kam-015`, `c-00001`, `d-001`, `s-XXXXXX`, `emp-001`, `empe-NNN`). Field-level definitions live in `docs/data-model.md` — only domain grouping + one-line purpose is captured here.

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

### Domain: Commissions + notifications (3 tables)

| Table | Purpose |
|---|---|
| `commission_config` | Singleton row (`CHECK id = 'default'`); `rate` is the flat amount-per-subscriber. The legacy `cadence` / `next_run_date` columns remain on the row but are no longer read (settlement is upload-driven, not scheduled). |
| `commissions` | Two-state row (`due → paid`, see §11). Columns: `id, agent_id, branch_id, subscriber_id, subscriber_name, amount, status, first_contribution_date, due_date, paid_date, txn_ref, paid_amount, created_at`. Denormalises `branch_id` + `subscriber_name` for cheap RLS + listings. The `0029` simplification dropped the old run/dispute/hold columns. |
| `settlement_batches` (0030, +`client_nonce` in 0032) | One row per agent-settlement recorded by `apply_settlement`: `id, agent_id, branch_id, pending_total, paid_amount` (the actually-allocated total), `txn_ref, paid_date, line_count, created_at, client_nonce`. SELECT-only RLS (distributor all; branch/agent own). FKs (`ON DELETE` actions added in 0033, matching commissions): `agent_id` → `agents(id) ON DELETE CASCADE`, `branch_id` → `branches(id) ON DELETE SET NULL`. |
| `notifications` (0031) | In-app feed: `id, recipient_role` (`'agent'`/`'branch'`)`, recipient_id, type` (`'commission_settled'`)`, title, body, amount, ref_id, is_read, created_at`. SELECT-only RLS (agent/branch own; distributor all); writes via `apply_settlement` / reads cleared via `mark_notifications_read`. `ref_id` is a real FK → `settlement_batches(id) ON DELETE SET NULL` (0033, BL-15) — it is only ever a batch id; SET NULL keeps the append-only feed row if a batch is deleted/re-seeded. |
| `settlement_uploads` (0032) | Per-upload idempotency ledger (BL-13): `nonce` (PK), `result` (the JSONB the RPC returned), `created_at`. RPC-internal — RLS-forced with **no policies and no grants**; only the `apply_settlement` SECURITY DEFINER RPC reads/writes it (short-circuits a replayed `p_nonce`). |

### Domain: KYC / Auth (4 tables)

| Table | Purpose |
|---|---|
| `users` | Auth identities. `UNIQUE(phone, role)` lets one phone attach to multiple roles. `password_hash TEXT` (0026) nullable; NULL = OTP-only. |
| `demo_personas` | `(phone, role) → entity_id` lookup for non-subscriber roles. 8 seeded rows: 3 agents, 2 branches, 2 distributors, 1 employer (`+256700000031` → `emp-001`). |
| `agent_referrals` | KYC fallback referrals (from `/api/kyc/agent-referral`). |
| `contact_submissions` | Landing-page contact form submissions (from `/api/contact`). |

### Domain: Employer (5 tables, `0034` — not yet applied to live)

The Employer is a B2B account with a **standalone** roster — `employees` are NOT `subscribers`, generate NO agent commissions, and their pension balances live on the `employees` row (not `subscriber_balances`). Funding happens via "contribution runs". All 5 tables are TEXT-PK, ENABLE + FORCE RLS, scoped by the `employerId` claim; writes go through the `0035` RPCs only.

| Table | Purpose |
|---|---|
| `employers` | One row per B2B account (`emp-001`). `name`, `sector`, `registration_no`, `contact_*`, `district`, `payroll_cadence`, `default_contribution_config JSONB` (`{ mode, employerPct, employeePct, employerAmount, employeeAmount }` — the template a new run starts from). |
| `employees` | Standalone staff roster (`empe-NNN`); FK → `employers(id) ON DELETE CASCADE`. Pension balances live HERE (`retirement_balance`/`emergency_balance`/`net_balance`/`units_held`/`total_contributions`) — bumped **inline** by `submit_contribution_run` (no trigger on this table). `contribution_config JSONB` (per-employee funding mode), `contribution_schedule JSONB` (`{ retirementPct, emergencyPct }`, default 80/20), insurance cols, `nominees JSONB`. `status ∈ active|suspended`. Index on `employer_id`. |
| `contribution_runs` | One row per funding batch (`run-NNN`); FK → `employers(id)`. `period_label`, `status ∈ draft|completed`, `employer_total`/`employee_total`/`grand_total`, `run_at`. Index on `employer_id`. |
| `contribution_run_lines` | Per-employee line inside a run; FK → `contribution_runs(id)` + `employees(id)`, both `ON DELETE CASCADE`. `employer_amount`/`employee_amount`/`retirement_amount`/`emergency_amount`/`method`. **Doubles as the per-employee contribution ledger** (employees are NOT in `transactions`). Indexes on `run_id`, `employee_id`. |
| `contribution_run_uploads` | RPC-internal idempotency ledger (`nonce` PK, `result JSONB`) — parallel to `settlement_uploads`. No policy, no grant; only `submit_contribution_run` reads/writes it. |

### ENUMs

| ENUM | Values |
|---|---|
| `commission_status` | `due, paid` (collapsed from 7 states in `0029`) |
| `nominee_type` | `pension, insurance` |

`settlement_run_state` and `settlement_run_branch_review_state` were dropped in `0029` along with their tables.

### Status columns are TEXT with implicit enums (audit D8)

`subscribers.kyc_status`, `withdrawals.status`, `claims.status`, `insurance_policies.status`, `agent_referrals.status`, `distributors.status` — all `TEXT` with documented value sets but no `CHECK` constraint. Discipline lives in client code (and the BEFORE-UPDATE trigger for `subscribers`). The two surviving enums (`commission_status`, `nominee_type`) are properly enforced.

### Indexes

From `0001` (8): `subscribers (agent_id)`, partial `subscribers (phone) WHERE NOT is_demo_signup`, `transactions (subscriber_id, date DESC)`, `commissions (agent_id, status)`, `commissions (branch_id, status)`, plus `users (phone)` + `demo_personas (phone, role)`. (The original `commissions (run_id)` and `settlement_run_branch_reviews (branch_id)` indexes were dropped with the `run_id` column + the `settlement_run_branch_reviews` table in `0029`.)

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
- Every table is both `ENABLE` and `FORCE` ROW LEVEL SECURITY — table owners are not exempt. **Exception until 0033 applies:** in current live state `distributors` is `ENABLE`-only (it was never FORCE'd by `0016`, BL-24); `0033_post_audit_hardening.sql` adds the missing `ALTER TABLE distributors FORCE ROW LEVEL SECURITY`, after which all 21 tables are FORCE'd. (Practical exposure is minimal — all writes flow through service-role/DEFINER paths.)
- The `commissions`, `settlement_batches`, and `notifications` tables have **no direct INSERT/UPDATE/DELETE policies** (all three are SELECT-only). Commission `due → paid` transitions, `settlement_batches` rows, and `notifications` rows are all written by the `apply_settlement` SECURITY DEFINER RPC (0031, re-emitted in 0032); `mark_notifications_read` (0031) is the only other writer (it updates `is_read` on the owner's own rows). The `settlement_uploads` idempotency ledger (0032) is RPC-internal: RLS-forced with **no policies and no grants at all** (not even SELECT to `authenticated`), so it is reachable only from inside the DEFINER RPC.
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
| `settlement_batches` | — | R (`agent_id = agentId`) | R (`branch_id = branchId`) | R |
| `notifications` | — | R (`recipient_role='agent'` + `recipient_id = agentId`) | R (`recipient_role='branch'` + `recipient_id = branchId`) | R |
| `users` | — | — | — | R |
| `agent_referrals` | — | — | — | R |
| `contact_submissions` | — | — | — | R |

Legend: R = SELECT, I = INSERT, U = UPDATE, D = DELETE. The grid covers the core 21 tables and the 4 network/subscriber/commission roles. The **employer** role has its own table family (below); the **admin** role still has no policies — no rows would satisfy any USING clause.

### Employer RLS (5 tables, `0034` — not yet applied to live)

The employer role doesn't appear in the grid above because it scopes a separate table family by the camelCase `employerId` claim (parallel to `branchId` / `distributorId`). **One SELECT policy per table, no client write policies** — every write goes through a `0035` SECURITY DEFINER RPC.

| Table | employer (SELECT) |
|---|---|
| `employers` | `employer_self_select`: `app_role='employer' AND id = auth.jwt() ->> 'employerId'` |
| `employees` | `employees_by_employer_select`: `app_role='employer' AND employer_id = auth.jwt() ->> 'employerId'` |
| `contribution_runs` | `contribution_runs_by_employer_select`: `app_role='employer' AND employer_id = auth.jwt() ->> 'employerId'` |
| `contribution_run_lines` | `contribution_run_lines_by_employer_select`: `app_role='employer'` AND `EXISTS (run with id = run_id AND employer_id = employerId)` (no `employer_id` column on lines — scoped via the parent run, mirroring `settlement_runs_select_agent`'s EXISTS join) |
| `contribution_run_uploads` | **none** — RPC-internal idempotency ledger, no policy + no grant (mirrors `settlement_uploads`); reachable only inside `submit_contribution_run`. |

All 5 tables are ENABLE + FORCE RLS; service-role (seed + `supabase-admin.ts`) bypasses RLS. The other roles (subscriber/agent/branch/distributor) have no policy on these tables, so no rows satisfy any USING clause.

### Notable policy details

- `subscribers_update_self` (after 0005 / 0007) is ownership-only; column immutability is enforced by `trg_subscribers_enforce_editable_cols` (BEFORE UPDATE). Editable: `name, email, phone, occupation, consent_at`.
- Reference-table SELECT policies gate on `auth.jwt() ->> 'app_role' IS NOT NULL` — any authenticated app role passes.
- Subscribers + balances + transactions etc. share the same 4-policy pattern: self / agent (via `subscribers.agent_id`) / branch (via `agents.branch_id`) / distributor (unrestricted).
- `distributors_select USING (true)` (0016) — every authenticated role can read the singleton row. Lets distributor metrics widgets render across roles.
- `distributors_update_self USING ((SELECT auth.jwt() ->> 'distributorId') = id)` (0016 + 0023 InitPlan wrap) — distributor can update its own row only.

---

## §10. RPC inventory

Post-`0029`/`0031`, the active core set is **15 functions** (DEFINER + INVOKER), plus **5 employer RPCs** added by `0035` (not yet applied to live — see §10.1). All have `SET search_path` pinned (audit D2) and read `auth.jwt() ->> 'app_role'` (never `'role'`) — zero `auth.uid()` usage. The `0029` simplification dropped the 14 commission state-machine + dispute RPCs, `get_run_branch_breakdown`, and the `commissions_before_update` trigger function; `0031` added two new write RPCs.

Breakdown:

- 3 trigger functions (0002) — see §11 (`commissions_before_update` dropped in 0029)
- 1 trigger function (0005) — `trg_subscribers_enforce_editable_cols`
- 2 private helpers (0002, then rewritten in 0014 + 0015) — `_validate_signup_payload`, `_insert_subscriber_chain`
- 1 helper (0014) — `_canonical_ug_phone`
- 1 helper (0020 / 0023) — `_demo_now()` (IMMUTABLE; pinned search_path)
- 6 read RPCs (0002, with `get_entity_metrics_rollup` introduced in 0018 and superseded in 0020, `get_top_branch` rewritten in 0022, and the 3 commission read RPCs re-emitted in 0029)
- 2 atomic-write RPCs (0002) — `create_subscriber_from_signup`, `create_subscriber_from_agent_onboard`
- 1 nominees upsert RPC (0024) — `upsert_nominees`
- 2 settlement / notification write RPCs — `apply_settlement` (0031, re-emitted with FIFO + idempotency as `(p_rows, p_nonce)` in 0032), `mark_notifications_read` (0031)
- **5 employer RPCs (0035)** — `submit_contribution_run`, `update_employee_contribution_config`, `update_employee_insurance`, `update_employer_profile`, `get_employer_metrics` (see §10.1)

### Read RPCs (6)

All `LANGUAGE plpgsql STABLE`. Most are SECURITY DEFINER + role-gated; `search_entities` and `get_breadcrumb` are reference-data reads. `GRANT EXECUTE ... TO authenticated`. The 3 commission read RPCs were re-emitted in `0029` in slimmed paid/due-only form (dispute/run fields removed).

| RPC | Signature | Returns | Caller |
|---|---|---|---|
| `get_entity_commission_summary` | `(p_level TEXT, p_entity_id TEXT)` | `jsonb { totalPaid, totalDue, countPaid, countDue, total, countTotal, settlementRate }` (0029 — dropped `totalDisputed`/`countDisputed`) | `src/services/commissions.js#getEntityCommissionSummary` |
| `get_top_branch` | `(p_level TEXT, p_parent_id TEXT)` | `jsonb { name, contribution }` or `NULL` | `entities.js#getTopPerformingBranch`. SECURITY DEFINER (0022) + aggregate-first body using `idx_transactions_type_date`. |
| `get_breadcrumb` | `(p_level TEXT, p_ids jsonb)` | `jsonb[]` of `{ level, id, name }` | `entities.js#getBreadcrumb` |
| `search_entities` | `(p_q TEXT)` | `TABLE(entity_id, entity_name, level, label, parent_id, score)`, hardcoded `LIMIT 8` | `search.js#searchEntities`. Uses `pg_trgm`'s `%` operator + `similarity()` for fuzzy matching. |
| `get_agent_commission_detail` | `(p_agent_id TEXT)` | `jsonb { …, totalPaid, totalDue, paidTransactions[], dueTransactions[] }` (0029 — no disputed/run fields; paid lines expose `paidAmount`) | `commissions.js#getAgentCommissionDetail` |
| `get_commission_summary` | `(p_branch_id TEXT DEFAULT NULL)` | `jsonb { totalCommissions, totalPaid, totalDue, countTotal, countPaid, countDue }` (0029) | `commissions.js#getCommissionSummary` |
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

### Settlement + notification RPCs (2, added in 0031)

The old 14 commission state-machine + dispute RPCs (`open_run`, `cancel_run`, `release_run`, `release_branch`, `branch_approve_all`, `mark_branch_reviewed`, `branch_approve_line`, `branch_hold_line`, `branch_dispute_line`, `agent_dispute_line`, `approve_dispute`, `reject_dispute`, `withdraw_dispute`, `agent_confirm_commission`) and `get_run_branch_breakdown` were **all dropped in `0029`**. Settlement is now a single upload-driven RPC plus a notification-read RPC, both `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`, each reading `auth.jwt() ->> 'app_role'`.

| RPC | Allowed role | What it does |
|---|---|---|
| `apply_settlement(p_rows jsonb, p_nonce text)` | distributor | Processes the re-uploaded settlement template. For each agent's rows: allocates the (whole-UGX-rounded) `amountPaid` **FIFO** across that agent's `due` lines oldest-first — a line flips to `paid` (with `paid_amount = its own amount`, `paid_date`, `txn_ref`) only while the remaining budget covers it in full; uncovered lines stay genuinely `due` (INFORM-NOT-BLOCK partial semantics — see §11). Records one `settlement_batches` row (`paid_amount` = the actually-allocated total, reconciles with `SUM(paid_amount)`), and inserts `commission_settled` notifications (formatted body, BL-18) for the affected agent + branch. `p_nonce` is a per-upload idempotency key: a replay returns the prior result via the `settlement_uploads` ledger without re-recording. Skip reasons: `missing_agent_id`, `no_due`, `amount_too_low`. Returns `{ agentsSettled, linesSettled, totalPaid, skipped: [{ agentId, reason }] }`. **Signature changed in 0032** (added `p_nonce`; the 0031 single-arg overload is dropped). |
| `mark_notifications_read(p_ids text[])` | agent / branch | Owner-scoped — sets `is_read = TRUE` on the caller's own `notifications` rows whose ids are in `p_ids`. |

Both follow the house grant pattern (`REVOKE ALL … FROM PUBLIC; GRANT EXECUTE … TO authenticated`).

### `upsert_nominees` (0024)

`upsert_nominees(p_subscriber_id TEXT, p_pension JSONB, p_insurance JSONB) RETURNS JSONB`. SECURITY DEFINER, role-gated to `subscriber` (own row) or `admin`. Validates `SUM(share)` per type rounds to 100 or empty array. DELETE + INSERT in one transaction. Returns the canonical `{ pension, insurance }` shape that `getSubscriberNominees` consumes.

**Grant pattern gap (audit D3):**

```sql
GRANT EXECUTE ON FUNCTION public.upsert_nominees(TEXT, JSONB, JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_nominees(TEXT, JSONB, JSONB) FROM anon;
```

Every other RPC in the codebase precedes the `GRANT EXECUTE ... TO authenticated` with `REVOKE ALL ON FUNCTION ... FROM PUBLIC;` (defence-in-depth — `PUBLIC` includes any future role). `upsert_nominees` revokes only from `anon`. Benign at execution time (the function still gates on `app_role`), but inconsistent with the codebase convention.

### §10.1 Employer RPCs (5, added in `0035` — not yet applied to live)

All `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp`, gated on `auth.jwt() ->> 'app_role' = 'employer'`, scoped to the caller's `auth.jwt() ->> 'employerId'`, with the house grant pattern (`REVOKE ALL … FROM PUBLIC; GRANT EXECUTE … TO authenticated`). Structural template = `apply_settlement` (0032). Called by `src/services/employer.js` via `supabase.rpc(...)` (the mock branch re-implements the same math offline).

| RPC | Signature | What it does |
|---|---|---|
| `submit_contribution_run` | `(p_rows jsonb, p_period_label text, p_method text, p_nonce text) → jsonb` | The core write. `p_rows = [{ employeeId }]`; any client amounts are **advisory and ignored**. Nonce short-circuits against `contribution_run_uploads` (idempotent replay). For each row: locks the employee `FOR UPDATE`; verifies it belongs to the caller's employer (else skip `not_owned`); skips `not_found`/`suspended`/`zero_contribution`. **Re-derives amounts server-side** from `salary` + `contribution_config` (`employer_half = employerAmount ?? round(salary*employerPct/100)`; `employee_half = mode='co-contribution' ? (employeeAmount ?? round(salary*employeePct/100)) : 0`), splits the gross by the employee's `contribution_schedule` (default 80/20, `emergency = gross − retirement` to avoid penny drift), INSERTs the `contribution_run_lines` row, and bumps the `employees` balance columns **inline** (`net_balance`/`units_held` @ UGX 1,000/unit). After the loop INSERTs one `contribution_runs` header (only if ≥1 line) + writes the nonce ledger. Returns `{ runId, linesCreated, employerTotal, employeeTotal, grandTotal, skipped: [{ employeeId, reason }] }`. **⚠️ MUST NOT write `transactions`, `subscriber_balances`, or `commissions`** — employees aren't subscribers, so a `transactions` insert would FK-fail AND fire `trg_transactions_contribution` (which mutates `subscriber_balances` + creates an agent commission). No commission code path is reachable from this RPC; employer balances live on `employees` and are the RPC's own inline write (there is no employee trigger). |
| `update_employee_contribution_config` | `(p_employee_id text, p_config jsonb) → jsonb` | Ownership-checked. Replaces `contribution_config`, returns the updated row as `to_jsonb`. |
| `update_employee_insurance` | `(p_employee_id text, p_cover numeric, p_premium numeric) → jsonb` | Ownership-checked. Sets cover + monthly premium; `insurance_status` derives from cover (`>0 → active`). Returns the updated row. |
| `update_employer_profile` | `(p_patch jsonb) → jsonb` | Patches the caller's own `employers` row (editable profile/config keys only — `id`/timestamps never patched). Returns the updated row. |
| `get_employer_metrics` | `() → jsonb` (**STABLE**) | Hero/overview aggregates scoped to the caller's employer: `{ headcount, active, suspended, totalBalance, totalContributions, insuredCount, employerYtd, employeeYtd, modeSplit: { coContribution, employerOnly } }`. "YTD" = sum over `contribution_runs` in the current calendar year. Mirrors `get_entity_commission_summary`'s STABLE shape. |

---

## §11. Commission settlement flow

`commission_status` is now a two-value ENUM (`due`, `paid`). The old maker-checker state machine — settlement runs, branch review, holds, the full dispute lifecycle, agent confirmation, and the settlement cadence — was removed in `0029`. There is only one transition (`due → paid`) and it happens through the `apply_settlement` RPC.

### State diagram

```
              insert (trigger)         apply_settlement (distributor)
   ┌──────────┐                 ┌──────────┐
 → │   due    │ ──────────────▶ │   paid   │  (paid_amount / paid_date / txn_ref set)
   └──────────┘                 └──────────┘
```

### How it works

1. **Generation.** A subscriber's first contribution fires `trg_transactions_contribution`, which inserts a `due` commission at `commission_config.rate` (unchanged by 0029).
2. **Offline payment + upload.** The distributor pays the agent offline, then in the UI downloads a per-agent Excel template prefilled with that agent's pending dues, fills in **Amount Paid** + payment reference/date, and re-uploads it. The frontend parses the sheet, **rounds each Amount Paid to whole UGX** (canonical `parseAmount`, `src/utils/finance.js`), mints a per-upload idempotency nonce, and calls `apply_settlement(p_rows, p_nonce)`.
3. **Apply (FIFO partial, INFORM-NOT-BLOCK).** `apply_settlement` (distributor-only, migration **0032**) allocates each agent's (rounded) Amount Paid across that agent's `due` lines **oldest-first**: a line flips to `paid` (with `paid_amount = its OWN amount`, `paid_date`, `txn_ref`) only while the remaining budget covers it in full. When the entered amount is **less** than the agent's due total, the uncovered lines stay genuinely `due` — a partial payment never clears unpaid lines. It records one `settlement_batches` row per agent (`paid_amount` = the actually-allocated total, so `SUM(commissions.paid_amount)` reconciles with the batch), emits `commission_settled` notifications (formatted body) to the affected agent + branch, and returns `{ agentsSettled, linesSettled, totalPaid, skipped: [{ agentId, reason }] }`.

   - **Mismatch surfacing.** The distributor's confirm modal shows per-agent mismatches before applying (it does **not** block). On the agent side, the most recent short-paid settlement raises an amber banner on the commissions page with an "Ask for reason" client-side `mailto:` (prefilled with the batch ref, due total, and paid total) — a demo affordance, not a backend integration.
   - **Idempotency (BL-13).** `p_nonce` is a per-upload UUID minted when the confirm modal opens. A re-submit / reload / second-tab / network-retry replay with the same nonce short-circuits via the `settlement_uploads` ledger (PK on `nonce`) and returns the original result without recording a duplicate batch or duplicate notifications.
   - **Product redirect point.** The FIFO partial behaviour is a deliberate product choice. To switch to "any payment clears ALL of an agent's due lines" (all-or-nothing per agent), the change is localised to the FIFO loop in `0032_fix_settlement_apply.sql` and the mirrored mock in `src/services/commissions.js`. Both files carry a marked `>>> PRODUCT-OWNER REDIRECT POINT <<<` comment.

### Rollback ordering across 0030 / 0031 / 0032 (BL-23)

The settlement stack is split across three migrations with a cross-file ownership coupling, so the `.down.sql` files **must be run in reverse-dependency order**, not just reverse-numeric:

- **`settlement_batches` table is created in `0030`**, but its only writer — the `apply_settlement` RPC — is defined in **`0031`** (and re-emitted in `0032`). `0030_settlement_batches.down.sql` deliberately does **not** drop the RPC; `0031_notifications.down.sql:13` does. **Rolling back only `0030` while keeping `0031` would leave `apply_settlement` referencing a dropped table.** Therefore `0030` and `0031` roll back **as a pair, `0031`-then-`0030`** (drop the RPC + `notifications` first, then the `settlement_batches` table).
- **`0032`** only `CREATE OR REPLACE`s the RPC and adds the `settlement_uploads` ledger + `settlement_batches.client_nonce`; its down restores the 0031 single-arg RPC and is self-contained. **`0033`** adds the `notifications.ref_id` FK (→ `settlement_batches`), the `settlement_batches` FK `ON DELETE` actions, and `distributors FORCE` RLS; its down is likewise self-contained.
- **Full-stack rollback order is therefore:** `0033` → `0032` → (`0031`-then-`0030`). Because `0033` adds a FK from `notifications.ref_id` **to** `settlement_batches.id`, it must be undone **before** `0030` drops `settlement_batches` (otherwise the `DROP TABLE` would fail or cascade). The `0033.down.sql` header records this ordering. All `.down.sql` files are emergency-use only and not part of the forward-only chain.

### Transition table

| From | To | Actor | RPC / trigger | Role check | Side effects |
|---|---|---|---|---|---|
| (insert) | `due` | trigger | `trg_transactions_contribution` | n/a (DEFINER) | First-contribution commission row at `commission_config.rate` |
| `due` | `paid` | distributor | `apply_settlement(p_rows, p_nonce)` | `app_role = 'distributor'` | FIFO-allocates Amount Paid oldest-first; settled lines get `paid_amount = own amount` + `paid_date`/`txn_ref`; uncovered lines stay `due`. Inserts a `settlement_batches` row (per-agent, `paid_amount` = allocated total) + agent & branch `commission_settled` notifications. Idempotent on `p_nonce` |

---

## §12. Triggers

Four triggers across the migrations (the `commissions_before_update` dispute-snapshot trigger was dropped in `0029`). All three cross-table triggers are SECURITY DEFINER + `search_path` pinned.

| Trigger | Table | Timing | Function | Security |
|---|---|---|---|---|
| `subscribers_after_insert` | `subscribers` | AFTER INSERT | `trg_subscribers_after_insert()` | DEFINER (0006) — seeds `subscriber_balances`, `ON CONFLICT DO NOTHING` |
| `transactions_after_insert_contribution` | `transactions` WHEN `type='contribution'` | AFTER INSERT | `trg_transactions_contribution()` | DEFINER (0006) — bumps balances, applies 80/20 default or explicit split, creates first-contribution commission at **hardcoded `v_unit_price NUMERIC := 1000` at line 113 of `0002_rpc_functions.sql`** |
| `transactions_after_insert_withdrawal` | `transactions` WHEN `type='withdrawal'` | AFTER INSERT | `trg_transactions_withdrawal()` | DEFINER (0006) — decrements balances; emergency-first fallback when split is missing |
| `subscribers_enforce_editable_cols` | `subscribers` | BEFORE UPDATE | `trg_subscribers_enforce_editable_cols()` (0005) | INVOKER (`search_path` pinned by 0010, role-claim rewritten by 0007). Rejects any change outside `name/email/phone/occupation/consent_at` from `app_role='subscriber'` callers. |

**Why 0006 exists.** The three cross-table trigger functions in 0002 originally ran as the caller's invoker context. When a subscriber-role direct INSERT into `transactions` fired the contribution trigger, the trigger tried to write to `subscriber_balances` + `commissions` — but the subscriber JWT has no INSERT policy on those tables, so RLS rejected and the whole INSERT aborted. 0006 promotes the three functions to `SECURITY DEFINER` + pins `search_path = public, pg_temp`.

**Why 0005 exists.** The original `subscribers_update_self` WITH CHECK clause pinned non-editable columns via correlated subqueries against `subscribers` itself — Postgres treats that as another row-level check on the same table, producing infinite recursion. 0005 simplifies the policy to ownership-only and enforces immutability via the BEFORE UPDATE trigger (triggers don't re-evaluate RLS).

---

## §13. Realtime publication

`0003_rls_policies.sql` originally added `commissions`, `settlement_runs`, `settlement_run_branch_reviews` to `supabase_realtime`. `0025_drop_realtime_publication.sql` dropped all three — Phase 1 + 2 audits confirmed **zero `.channel()` subscribers** across `src/` and `api/`, so the WAL replication overhead bought nothing. (`settlement_runs` + `settlement_run_branch_reviews` were themselves later dropped entirely in `0029`.)

**Current state:** `supabase_realtime` membership for `public.*` is empty (audit D19 confirmed this matches intent, modulo the supersession by 0025 itself). High-write tables (`transactions`, `subscribers`, `subscriber_balances`) were never added to begin with, and the new `settlement_batches` + `notifications` tables (0030/0031) are not published either — the notification bell polls via React Query. React Query's 5-minute staleTime + manual invalidation handles cross-laptop demo sync at sufficient resolution.

If a future feature wires `.channel()` subscribers, the 0025 down migration restores the original `commissions`-only publication.

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
- `demo_personas` seeded with 8 rows: agents `a-001/a-042/a-118` at phones `+2567000000{1,2,3}`, branches `b-kam-015/b-mba-290` at `+2567000000{11,12}`, distributors `d-001/d-002` at `+2567000000{21,22}`, and the employer `emp-001` at `EMPLOYER_DEMO_PHONE` (`+256700000031`).
- Both `distributors` rows (`d-001`, `d-002`) are inserted by the seed; the `0016` migration also seeds `d-001` on-conflict-do-nothing.
- **Commissions are `due`/`paid` only** (post-0029 simplification — no `settlement_runs`); `paid` rows carry `paid_amount`. The seed also inserts a few `settlement_batches` rows + matching `commission_settled` notifications so the settlement history + notification bell have demo data.
- **Employer seed (`0034` tables):** imports `src/data/employerSeed.js` (the single source of truth shared with the offline mock path) and inserts 1 `employers` row (`emp-001`, "Nile Breweries Demo Ltd"), 16 `employees` (mix of co-contribution / employer-only, 2 suspended, several insured), and 3 historical `contribution_runs` + their lines. Service-role bypasses the employer RLS so these direct inserts succeed despite FORCE. The seed `lineFor` math matches `submit_contribution_run` so the seeded ledger reconciles with the live RPC. Dates anchored to `MOCK_NOW`.

**Approximate row volumes after seed:**

| Table | Rows |
|---|---|
| regions | 4 |
| districts | 135 |
| branches | ~314 |
| agents | ~500–2,000 |
| subscribers | ~30,000 |
| commissions | ~30,000 (mix of `due` + `paid`; paid rows carry `paid_amount`) |
| settlement_batches | a few (0030) |
| notifications | a few (0031, `commission_settled`) |
| distributors | 2 |
| demo_personas | 8 |
| employers | 1 (0034 — `emp-001`) |
| employees | 16 (0034) |
| contribution_runs | 3 (0034) |
| contribution_run_lines | 3 runs × active employees (0034) |

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
- **No application-level security headers (CSP, HSTS, X-Frame-Options) configured by the platform.** Vercel hosts the frontend with default headers; Render's Express layer applies `helmet()` (the post-migration default) which sets sane defaults including X-Content-Type-Options and a baseline CSP. Tightening CSP for an SPA + cross-origin Render API is explicitly out of scope for the demo.

### §15b. Real bugs / awareness items

These affect the demo experience or future sessions — track but do NOT bundle with §15a, and do NOT propose production-hardening solutions.

**Closed in Phase 1 of the post-audit cleanup (2026-05-26).** Audit findings B1–B9, X2, X3 — API helper duplication, error-envelope drift, KYC phone normalization, DB-error swallowing, dead phone exports, the unused `withAuth` middleware classification, the route-count discrepancy, and the stale `disputeCommission` documentation drift — are all resolved. See §3, §4, §5 (and the Phase 1 commit SHAs cited there). The remaining items below are open or by-design.

**Auth-route subtleties (open / by-design):**

- `chat.ts` body `context` overrides role for unauthenticated callers; intentional but inconsistent with the strict role discipline elsewhere (audit B14). Documented at the call-site.
- `chat.ts` `resolveFlavor` reads the JWT **`app_role`** claim (not `role`) for authenticated callers — fixing audit BL-12/H1, where reading `role` (always the literal Postgres role `"authenticated"`) made every signed-in distributor/branch/agent fall through to the subscriber chat flavor. The §5.7 `'role'` vs `'app_role'` trap. Covered by `api/chat.test.ts` (each app_role → correct flavor; body context only honoured when unauthenticated).
- `chat.ts` type-checks `body.message` before `.trim()` (Phase 1G `1f0e2e1` — non-string bodies short-circuit to `invalid_message` instead of crashing).
- `change-password` now mounts behind `authLimiter` (`server/index.ts §9`, BL-17) — consistent with `verify-otp` / `verify-password`. It verifies a JWT then runs bcrypt + a DB write, so an already-authenticated token holder could otherwise hammer that CPU/DB path. This is a per-route throttle only; a real lockout/HIBP flow is out of demo scope (CLAUDE.md §10a).
- `verify-otp` / `verify-password` generic-catch 500 now returns `{ code: 'unexpected_error' }` (BL-39), not the 4xx `invalid_otp` / `invalid_request` vocabulary that previously rode a 500 status. See the error-envelope section above.

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

- Employer role is now **built** (`0034` schema + RLS, `0035` RPCs, desktop-first shell; demo persona `emp-001`). Both employer migrations are committed forward files **NOT yet applied to live** — gated cutover steps (apply after a verified backup, alongside the 0032/0033 stack). Only the **admin** role remains unbuilt (no RLS policies, no dashboard, no shell). Employee **onboarding** is the one deferred employer sub-feature (Phase 9 placeholder; a future `create_employee` RPC).
- `agent_referrals` row PK `ar-<epoch>-<rand>` and public `UAG-XXXX` ticket ID (~1.7M space) — collision-tolerant but not cryptographic.
- No retry / idempotency keys on `/api/contact` or `/api/kyc/agent-referral`. A resubmit creates a second row.

**Commission dispute flow removed.** The entire maker-checker + dispute lifecycle (`agent_dispute_line`, `branch_dispute_line`, `approve/reject/withdraw_dispute`, `agent_confirm_commission`, settlement runs, holds) was dropped in `0029_commission_simplify.sql`, along with the `commissions.dispute_reason` and related columns. Settlement is now the single upload-driven `apply_settlement` RPC (§11). The historical migration `0014_signup_phone_and_agent_dispute.sql` (which once added `agent_dispute_line`) remains in the tree as forward-only history.

### §15c. Test coverage

12 backend `.test.ts` files now cover every route under `api/auth/` and `api/kyc/` (Phase 2B `93c51f2` shipped the 4 auth route tests; Phase 2C `91f413e` shipped the 8 KYC route tests). Combined the two phases added ~138 backend tests on top of the pre-Phase-2 vitest baseline:

| Layer | Files | Notes |
|---|---|---|
| `api/auth/*.test.ts` | 4 (`send-otp`, `verify-otp`, `verify-password`, `change-password`) | Phase 2B `93c51f2`. ~81 tests. Cover OTP-shape errors, password-shape errors, role enum, phone canonicalisation, password set vs change flows, JWT round-trip, DB-error → `db_error` envelope (Phase 1F). |
| `api/kyc/*.test.ts` | 8 (one per route) | Phase 2C `91f413e`. ~57 tests. Cover phone canonicalisation on the 3 phone-accepting routes, every `x-qa-force` branch, `Allow: POST` headers, the demo-scope 200-with-refusal contract on the 3 verifier routes. `Cache-Control: no-store` is now asserted on every route (success + 405, plus the 400 path on `id-ocr`/`face-match`): `agent-referral` since Phase 2C, the 7 mock routes added in BL-16 (the §15c claim previously held only for `agent-referral`). |
| `api/auth/_lib/password.test.ts` | 1 | Pre-existing. Shape validation + bcrypt hash/verify round-trip. |

`npm test` runs all vitest files (`api/**/*.test.ts` + `src/tests/**/*.test.{js,ts}`). For backend-only iteration: `npm test -- api/auth api/kyc`.

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
| Push migrations to hosted project | `supabase db push` — **NOT the live deploy path; do NOT run against live without first reconciling the ledger. See "Migration-ledger drift" below (BL-6).** |
| Apply a single migration via MCP | `mcp__supabase__apply_migration` (note: wraps DDL in a transaction; split `CREATE INDEX CONCURRENTLY` out via `execute_sql` — see 0022 header) |
| Tail backend (Render) logs | Render dashboard → `uganda-dashboard-api` → Logs (live tail; ~7-day retention per `docs/render-operational.md` §Log Retention). Or via MCP: `mcp__render__list_logs`. |
| Tail frontend (Vercel) build/runtime logs | `vercel logs <deployment-url>` — note: post-migration there are no functions, so runtime logs are SPA build/serve only. |
| Reseed Postgres | `npm run seed` (reads `SUPABASE_DB_URL` from `.env.local`) |
| Clip GeoJSON | `node scripts/clip-districts.mjs` |
| Test a read RPC from psql | `SELECT public.get_entity_commission_summary('region', 'r-central');` |
| Impersonate a role in psql | `SET LOCAL request.jwt.claims = '{"role":"authenticated","app_role":"agent","agentId":"a-001","aud":"authenticated"}'; SELECT count(*) FROM subscribers;` |
| Rotate JWT secret | **4-step procedure (G42).** `api/_lib/jwt.ts:59-72` caches the secret as `Uint8Array` for the lifetime of the process; Render does NOT hot-reload env vars. (1) Supabase Dashboard → Project Settings → API → JWT Settings → rotate. (2) Update `SUPABASE_JWT_SECRET` in the Render dashboard env. (3) Trigger a Render restart — Render dashboard → service → Manual Deploy → "Deploy latest commit", or `curl -X POST $RENDER_DEPLOY_HOOK_URL`. (4) Accept that all users get logged out: the 24h-TTL tokens become invalid immediately. (Vercel no longer holds this secret post-migration.) |
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
- From the distributor account, call `apply_settlement(p_rows)` with a small payload of one agent's pending dues; verify the matching `commissions` lines flip to `paid`, a `settlement_batches` row appears, and agent + branch `notifications` rows are emitted. (Realtime no longer propagates — 0025 dropped the publication; React Query manual invalidation handles refresh.)

### Migration-ledger drift — `db push` is NOT the live deploy path (BL-6)

**Live schema reaches the hosted project via the Supabase MCP (`mcp__supabase__apply_migration` / `execute_sql`) + `scripts/seed-supabase.mjs`, NOT via `supabase db push`.** Do **not** run `supabase db push` (or `supabase db reset`) against live without first reconciling the migration ledger — it can half-apply and abort mid-stream.

- **The drift:** the live `supabase_migrations.schema_migrations` ledger is missing **6 local migrations** — `0022_audit_perf`, `0023_rls_initplan_fixes`, `0024_upsert_nominees`, `0025_drop_realtime_publication`, `0027_post_audit_polish`, `0028_replay_safety_guards`. Their *effects* are already applied to live (verified out-of-band), but the ledger does not record them. (The ledger also carries a remote-only `20260519165115 fix_metrics_rollup_app_role` with no local file. The 0029/0030/0031 trio is ledger-tracked + applied; the `0032` fix and `0033` hardening migration are committed forward files that are **NOT yet applied to live** — they are gated cutover steps to run, in order, after a verified backup.)
- **Why it's dangerous:** `db push` re-attempts any migration the ledger doesn't record. Re-running the 6 missing files would re-execute known **non-idempotent** legacy statements (`0003`/`0006`/`0010`/`0025` — see §15b audit D12; e.g. `0025`'s unguarded `ALTER PUBLICATION … DROP TABLE` against an already-removed member errors on a second run). A failure part-way leaves the ledger + schema half-applied.
- **Before any future `db push` against live (cutover gate):** reconcile the ledger first — `supabase migration repair --status applied 0022 0023 0024 0025 0027 0028` (and reconcile/retire `fix_metrics_rollup_app_role`) so the 6 rows are marked applied — **or** continue treating `db push` as out-of-band and keep applying schema via the MCP path + `npm run seed`. Either way, take and verify a full backup before touching the live ledger (pairs with the lossy-`0029.down.sql` backup gate, BL-9). This subsection is the canonical record of "how migrations reach live."

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
