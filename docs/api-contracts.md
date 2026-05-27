# Universal Pensions Uganda — API Contracts

Current request/response contract for the platform's backend surface. The old `~30-route REST` design has been archived in `docs/archive/api-contracts-2024-original.md` — it described an aspirational shape that was never built. The real surface is much smaller:

1. **14 API routes** under `api/` (Vercel-shape TypeScript handlers, now mounted by `server/index.ts` on **Render Express** at `https://uganda-dashboard-api.onrender.com`. The Vercel-style request/response signature is preserved via the `toExpress(handler)` adapter in `server/adapter.ts`).
2. **Supabase RPCs** (PostgreSQL `SECURITY DEFINER` functions) called via `supabase.rpc(name, args)` from the frontend with the user's HS256-signed JWT.
3. **PostgREST direct table reads** governed by row-level security policies (no writes — writes always go through RPCs).

Cross-references:
- `BACKEND.md §3-§5` — full route inventory, error vocabulary, auth flow.
- `BACKEND.md §8` — RLS policies and the `auth.jwt() ->> 'app_role'` rule.
- `BACKEND.md §9-§10` — RPC catalogue + commission state machine.
- `ARCHITECTURE.md` — high-level write/read patterns, auth model.

---

## 1. Conventions

### 1.1 Error envelope

All 14 API routes return errors as JSON in the form:

```json
{ "code": "snake_case_reason", "message": "optional human string" }
```

`code` is always present and machine-stable. `message` is optional and only set when the body carries useful operator context (e.g. a propagated Supabase error code). The frontend's `services/api.js` fetch wrapper raises an `Error` with `.code` and `.status` set so callers can branch on `err.code === 'invalid_otp'` etc. See `BACKEND.md §3` for the full vocabulary.

### 1.2 Auth header

Every route except the auth-related ones (`send-otp`, `verify-otp`, `verify-password`) and the public ones (`contact`, all `kyc/*` during signup) accepts:

```
Authorization: Bearer <jwt>
```

JWT is HS256, custom-signed (not Supabase Auth — see `BACKEND.md §6`). Claims include `phone`, `app_role`, plus the role-scoped ID (`subscriberId` / `agentId` / `branchId` / `distributorId`). 401 on the server triggers `onAuthExpired` on the client, clearing `localStorage` and redirecting home.

### 1.3 Cache headers

Every auth handler and the chat/contact handlers set `Cache-Control: no-store` on **every** response path (B13 in the audit). KYC routes don't currently set this; they hit no DB so caching by accident is harmless, but the convention is to add it on any route that touches user-scoped state.

### 1.4 Demo scope (do not propose fixes)

CLAUDE.md §10a is the canonical list. Relevant to this doc:
- `verify-otp` accepts any 6-digit code.
- KYC routes are stateless Smile-ID-v2-shaped mocks with simulated latency. Pass `x-qa-force` headers to force failure paths.
- `chat` is a keyword-matching mock; no LLM.
- `contact` writes to `contact_submissions` but no email is dispatched.

---

## 2. API routes (14 total)

All routes live under `api/` and are served by Express on Render — `server/index.ts` mounts each handler via `app.all('/api/...', toExpress(<handler>))`. (`app.all` instead of `app.post` preserves the per-handler manual 405 contract.) All return JSON. All accept only `POST` unless noted; non-POST returns 405 `{ code: 'method_not_allowed' }` with an `Allow: POST` header. Frontend points at `VITE_API_BASE_URL` (`http://localhost:3001/api` in local dev, absolute Render URL in prod).

### 2.1 Auth (4 routes — `api/auth/`)

#### `POST /api/auth/send-otp`
Dev-bypass stub — no SMS provider. Validates phone shape + role enum and returns success so the OTP entry step proceeds.

- **Body:** `{ phone: string, role: 'subscriber'|'agent'|'branch'|'distributor' }`
- **Response 200:** `{ success: true }`
- **Errors:** `400 invalid_request`, `405 method_not_allowed`
- **Source:** `api/auth/send-otp.ts`

#### `POST /api/auth/verify-otp`
Validates OTP shape, resolves role-scoped entity ID via `demo_personas` (falling back to seeded defaults — see CLAUDE.md §8), upserts `users(phone, role)` row, and mints a JWT. Accepts an optional `password` to stamp a bcrypt hash on first login.

- **Body:** `{ phone: string, otp: string (6 digits), role: JwtRole, password?: string }`
- **Response 200:** `{ token: string, user: { id, phone, role, name?, hasPassword: boolean, subscriberId?|agentId?|branchId?|distributorId? } }`
- **Errors:** `400 invalid_otp | password_required | password_too_short | password_too_long | password_too_weak`, `500 db_error`
- **Source:** `api/auth/verify-otp.ts`

#### `POST /api/auth/verify-password`
Password sign-in companion to `verify-otp`. Looks up the `users(phone, role)` row and bcrypt-verifies `password` against `password_hash`. On success, mints a JWT with the same shape `verify-otp` does.

- **Body:** `{ phone: string, role: JwtRole, password: string }`
- **Response 200:** same shape as `verify-otp`, with `hasPassword: true`.
- **Errors:** `400 invalid_request`, `401 password_not_set | invalid_password | role_mismatch`, `500 db_error`
- **Source:** `api/auth/verify-password.ts`

#### `POST /api/auth/change-password`
Authenticated. Sets or rotates the user's password. Initial-set flow (no existing hash) skips `currentPassword`; change flow requires it.

- **Header:** `Authorization: Bearer <jwt>`
- **Body:** `{ currentPassword?: string, newPassword: string }`
- **Response 200:** `{ ok: true, hasPassword: true }`
- **Errors:** `400 password_required | password_too_short | password_too_long | password_too_weak | current_password_required`, `401 unauthorized | current_password_invalid`, `404 user_not_found`, `500 db_error | unexpected_error`
- **Source:** `api/auth/change-password.ts`

### 2.2 KYC (8 routes — `api/kyc/`)

All KYC routes are stateless Smile-ID-v2-shaped mocks with simulated latency. They take a client-generated `sessionId` for correlation across stages and (where applicable) `prevTrackingIds` to chain. None require a JWT (signup runs pre-auth). QA can pass `x-qa-force: <reason>` headers to force failure outcomes — each route documents its accepted values inline.

| Route | Body (multipart unless noted) | Response | Latency | Force values |
| --- | --- | --- | --- | --- |
| `POST /api/kyc/otp-send` | `{ phone, sessionId? }` (JSON) | `{ success: true, expiresIn: 300 }` | ~600ms | — |
| `POST /api/kyc/otp-verify` | `{ phone, code, sessionId? }` (JSON) | `{ verified: boolean }` | ~700ms | `fail` |
| `POST /api/kyc/id-quality` | `image: File, sessionId?` | `{ blur, corners, glare, pass, score }` | ~900ms | `fail-blur`, `fail-corners`, `fail-glare` |
| `POST /api/kyc/id-ocr` | `front: File, back: File, sessionId?` | `IdExtraction { fullName, nin, cardNumber, dob, districtId, gender, barcodeRaw, confidence, trackingId }` | ~2200ms | — |
| `POST /api/kyc/nira-verify` | `{ nin, cardNumber, dob, fullName, sessionId? }` (JSON) | `{ result: 'match'\|'partial'\|'no-match', mismatchedFields?, reason?, trackingId }` | ~1800ms | `partial`, `no-match` |
| `POST /api/kyc/face-match` | `selfie: File, nin, sessionId?` | `{ match, liveness, matchScore, outcome: 'ok'\|'liveness-fail'\|'no-match', trackingId }` | ~1500ms | `liveness-fail`, `no-match` |
| `POST /api/kyc/aml-screen` | `{ fullName, dob, nin, sessionId?, niraTrackingId? }` (JSON) | `{ outcome: 'clear'\|'flagged', trackingId }` | ~1200ms | `flagged` |
| `POST /api/kyc/agent-referral` | `{ phone, reason, stage?, trackingId?, sessionId? }` (JSON) | `{ ticketId, eta }` | ~600ms | — |

Sources: `api/kyc/*.ts`. Each route also returns `400 invalid_request` for missing/malformed fields and `405 method_not_allowed` for non-POST.

### 2.3 Misc (2 routes)

#### `POST /api/contact`
Public. Validates the landing-page contact form and inserts into `contact_submissions` via the service-role Supabase client (RLS bypassed because the form is open to unauthenticated visitors).

- **Body:** `{ name: string, email: string, message: string }`
- **Response 200:** `{ submitted: true, id: string }`
- **Errors:** `400 invalid_name | invalid_email | invalid_message`, `500 db_error`
- **Source:** `api/contact.ts`

#### `POST /api/chat`
JWT-optional. When a token is present, `req.user.role` selects the flavour (admin vs agent vs subscriber). When absent, the body's `context` field is honoured (intentional demo-scope policy — see B14 in the audit). Keyword-matching mock; no LLM.

- **Header (optional):** `Authorization: Bearer <jwt>`
- **Body:** `{ message: string, context?: 'admin'|'agent'|'subscriber' }`
- **Response 200:** `{ reply: string, suggestions?: string[] }`
- **Errors:** `400 invalid_message`
- **Source:** `api/chat.ts`

---

## 3. Supabase RPCs

The frontend authenticates to Supabase as `authenticated` and calls `SECURITY DEFINER` PL/pgSQL functions via `supabase.rpc(name, args)`. RPCs read JWT claims via `auth.jwt() ->> 'app_role'` etc. (never `auth.uid()` — see CLAUDE.md §5 anti-pattern 7).

### 3.1 Entity / read RPCs

| RPC | Args | Returns | Intent |
| --- | --- | --- | --- |
| `get_entity_metrics_rollup` | `p_level text, p_entity_id text` | `jsonb` (totals + 12-month series + drill-down counts) | One-shot aggregate for distributor/branch overview cards. Replaces N PostgREST queries. |
| `get_top_branch` | `p_level text, p_entity_id text` | `{ name, contribution } \| null` | Highest-contribution branch under the given scope. |
| `get_breadcrumb` | `p_level text, p_ids jsonb` | `Array<{ level, id, name }>` | Path from country down to the currently-selected entity. |
| `search_entities` | `p_q text` | `Array<{ id, name, level, label, parentId }>` (max 8) | Top-bar entity search across regions/districts/branches/agents. |
| `get_commission_summary` | `p_branch_id text \| null` | Summary row (totals + counts by status) | Commission KPI cards. |
| `get_entity_commission_summary` | `p_level text, p_entity_id text` | Summary row | Per-entity commission breakdown (drill-down overlays). |
| `get_agent_commission_detail` | `p_agent_id text` | Agent-level detail object (paid + due transactions, subscriber portfolio) | Agent drawer in commission panel. |
| `get_run_branch_breakdown` | `p_run_id text` | Per-branch settlement run breakdown | Run review UI in commission panel. |

### 3.2 Write RPCs (state machine)

Every write to the commission state machine goes through one of these. The state graph is `due → in_run → [held \| disputed] → released → confirmed/paid → rejected (terminal)`. See `BACKEND.md §10` for the full diagram and trigger logic.

| RPC | Args | Effect |
| --- | --- | --- |
| `open_run` | — | Opens a new settlement run; returns the new `run_id`. |
| `cancel_run` | `p_run_id text` | Cancels an open run. |
| `release_run` | `p_run_id text` | Releases all lines in the run for agent confirmation. |
| `release_branch` | `p_run_id text, p_branch_id text` | Releases lines for a specific branch within a run. |
| `branch_approve_all` | `p_run_id text` | Bulk-approve all due lines for the branch in this run. |
| `mark_branch_reviewed` | `p_run_id text` | Mark branch's review of the run as complete. |
| `branch_approve_line` | `p_commission_id text` | Approve a single commission line. |
| `branch_hold_line` | `p_commission_id text, p_hold_reason text` | Put a line on hold pending investigation. |
| `branch_dispute_line` | `p_commission_id text, p_dispute_reason text` | Mark a line as disputed (branch-initiated). |
| `agent_dispute_line` | `p_commission_id text, p_dispute_reason text` | Mark a line as disputed (agent-initiated — maker-checker counterpart). |
| `approve_dispute` | `p_commission_id text, p_outcome_reason text?` | Resolve a dispute in the agent's favour. |
| `reject_dispute` | `p_commission_id text, p_outcome_reason text` | Resolve a dispute against the agent (terminal `rejected`). |
| `withdraw_dispute` | `p_commission_id text` | Agent withdraws their own dispute. |
| `agent_confirm_commission` | `p_commission_id text` | Agent confirms receipt of payment (closes the maker-checker loop). |

### 3.3 Other write RPCs

| RPC | Args | Effect |
| --- | --- | --- |
| `create_subscriber_from_signup` | `payload jsonb` | Atomic subscriber creation from the public `/signup/*` flow — creates subscriber + balances + schedule + insurance + nominees + first-contribution commission in a single transaction. |
| `create_subscriber_from_agent_onboard` | (named args) | Same shape as above but invoked from the agent's onboard flow; differs in audit trail. |
| `upsert_nominees` | `(p_subscriber_id text, p_pension jsonb, p_insurance jsonb)` | Replaces pension / insurance nominee lists; atomically validates share-sum invariants. |

See `supabase/migrations/0002_rpc_functions.sql`, `0004_commission_run_rpcs.sql`, `0014_signup_phone_and_agent_dispute.sql`, `0024_upsert_nominees.sql` for the canonical PL/pgSQL.

---

## 4. PostgREST reads (RLS-governed)

Reads of tables like `subscribers`, `subscriber_balances`, `transactions`, `claims`, `withdrawals`, `nominees`, `insurance`, `commissions`, `settlement_runs`, `agent_referrals`, `entities`, etc. happen directly via the `supabase-js` query builder (`supabase.from('subscribers').select(...)`).

Every table has RLS enabled. Policies read `auth.jwt() ->> 'app_role'` (the application role) plus `auth.jwt() ->> '<role>Id'` to scope rows. Defer to:

- `supabase/migrations/0003_rls_policies.sql` — initial policy bodies.
- `supabase/migrations/0007_rls_use_app_role.sql` — switch from `'role'` to `'app_role'` (canonical fix for the silent-failure trap).
- `supabase/migrations/0008_rls_wrap_auth_jwt_initplan.sql` + `0023_rls_initplan_fixes.sql` — initplan caching tightenings.
- `ARCHITECTURE.md` and `BACKEND.md §8` — narrative of the RLS model.

Writes are NEVER permitted directly through PostgREST — all writes flow through SECURITY DEFINER RPCs (CLAUDE.md §7).

---

## 5. Realtime channels

Supabase realtime is enabled on **three** tables only:
- `commissions`
- `settlement_runs`
- `settlement_run_branch_reviews`

Realtime is intentionally OFF for `transactions`, `subscribers`, `subscriber_balances` (high-churn, low-value-for-UI). See migration `0025_drop_realtime_publication.sql`.

---

## 6. Quick index

| Surface | Count | Where defined |
| --- | --- | --- |
| API routes | 14 | `api/**/*.ts` (excl. `_lib/`, `*.test.ts`) |
| Migrations | 28 | `supabase/migrations/*.sql` |
| RPCs (read) | 8 | `0002_rpc_functions.sql`, `0018_entity_metrics_rollup.sql`, `0020_entity_metrics_rollup_v3.sql` |
| RPCs (state machine) | 14 | `0004_commission_run_rpcs.sql`, `0014_signup_phone_and_agent_dispute.sql`, `0021_commission_rpcs_app_role.sql` |
| RPCs (other write) | 3 | `0002_rpc_functions.sql`, `0024_upsert_nominees.sql` |
| Tables with realtime | 3 | `0025_drop_realtime_publication.sql` |

For runtime detail (env vars, auth flow, JWT shape, trigger logic, the `app_role` vs `role` trap), open `BACKEND.md`. For role × capability questions, open `docs/role-permissions.md`. For the legacy aspirational REST design, open `docs/archive/api-contracts-2024-original.md`.
