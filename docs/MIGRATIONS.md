# MIGRATIONS.md — SQL Migration Index

This is a one-liner index of every SQL migration in [`supabase/migrations/`](../supabase/migrations/). For the discipline (forward-only, idempotency, naming convention, `.down.sql` partners), see [`BACKEND.md §7`](../BACKEND.md). For the schema as it currently exists (tables, ENUMs, FKs by domain), see [`BACKEND.md §8`](../BACKEND.md).

## Reading order

Start with [`BACKEND.md §7-9`](../BACKEND.md) for the schema overview, then read this index in order for the evolution. Each row's `Incident` column flags migrations that were driven by a production bug — those are the ones with cross-references to other migrations and audit notes worth tracing.

The first read-through gives you the **shape** of the database (Group 1). The second pass shows the **`app_role` cutover** (Group 2 — the single most consequential rename in the project). Groups 3-4 are mostly **incident-driven fixes** with full provenance in the migration headers. Group 5 is the most recent surface (password auth foundation + idempotency guards).

## Conventions

- **#** — four-digit migration number (zero-padded). Numbers are strictly forward-only; no in-place edits. The next available number is `0029`.
- **File** — short filename suffix; the full path is `supabase/migrations/NNNN_<suffix>`.
- **Concern** — rough bucket:
  - `core` — schema (tables, ENUMs, columns, FKs)
  - `RLS` — Row-Level Security policy work
  - `RPC` — SECURITY DEFINER or SECURITY INVOKER functions
  - `perf` — indexes, planner hints, advisor lints
  - `audit` — cleanup explicitly driven by an audit finding (D-tags, AUDIT-N-N tags)
- **Incident?** — `—` for routine work; `YES` with a one-line note for migrations that fixed a confirmed production regression. Search the codebase for `YES` to scan the project's bug history.

A handful of migrations also ship a paired `.down.sql` file (0016, 0022, 0023, 0024, 0025, 0026); those reverse-scripts are not indexed here — open the `.down.sql` next to the forward file when a rollback is needed. The remaining migrations are forward-only by design; reapplying them is safe because each is idempotent (`CREATE OR REPLACE`, `IF NOT EXISTS`, `DROP IF EXISTS` then create).

## The single highest-value trap: `'role'` vs `'app_role'`

PostgREST treats the JWT `role` claim as a Postgres role to `SET ROLE` against. Our application role (subscriber / agent / branch / distributor / admin) lives in a separate `app_role` claim — `role` is hardcoded to `'authenticated'`. Reading `auth.jwt() ->> 'role'` and comparing against app values (`'distributor'`, `'agent'`, …) is the same kind of silent failure repeated across the history below: **the predicate never matches, the call falls through, and the user sees zeros or empty results without an error.** See [`BACKEND.md §6`](../BACKEND.md) for the canonical write-up. Migrations 0007, 0018, 0020, and 0021 are all chapters of this trap.

---

## Group 1 — Init schema (0001-0005)

Bootstrap the database: tables, ENUMs, indexes, FKs, triggers, the first wave of RPCs, and the first RLS pass. This group establishes every convention the rest of the project depends on — TEXT primary keys (not UUID / bigserial), snake_case columns mirroring `src/data/mockData.js` field names, and the SECURITY DEFINER write model. The two `YES` flags in this group (`0004`, `0005`) are early discoveries of two distinct traps: the `'role'` claim collision (in `0004`, only confirmed and fully fixed in `0021`) and Postgres RLS infinite-recursion when policies cross-reference their own table (`0005`).

| # | File | Concern | One-line description | Incident? |
|---|---|---|---|---|
| 0001 | initial_schema.sql | core | Creates the 20 tables, 4 ENUMs, indexes, and FKs (text PKs, snake_case columns mirroring `mockData.js`). | — |
| 0002 | rpc_functions.sql | RPC | Adds the subscriber-ID sequence, 4 denorm triggers (balances + first-contribution commission), and 7 read RPCs. | — |
| 0003 | rls_policies.sql | RLS | Enables RLS on all 20 tables; defines SELECT + write policies per role; commission/settlement writes routed through SECURITY DEFINER. | — |
| 0004 | commission_run_rpcs.sql | RPC | 13 SECURITY DEFINER state-machine RPCs for commissions and settlement runs (initial body — reads `'role'` claim; later corrected in 0021). | YES — `'role'` trap; superseded by 0021. |
| 0005 | subscriber_update_fix.sql | RLS | Replaces the recursive `subscribers_update_self` policy with ownership-only + a BEFORE UPDATE trigger for column immutability. | YES — infinite-recursion error at policy eval. |

---

## Group 2 — RLS / advisor cleanup (0006-0013)

Plumbing fixes driven by Supabase performance + security advisors: function-context corrections, the `app_role` claim cutover, initplan caching, and FK covering indexes. Migration `0007` is the **load-bearing one** — it switches every policy from `'role'` to `'app_role'`. Migration `0008` is the perf companion: every `auth.jwt()` call gets wrapped in `(SELECT auth.jwt())` so the planner caches the JWT decode per query instead of per row (the dominant cost on `transactions` at 522K rows and `nominees` at 145K rows). `0011`/`0013` show a small loop: `0011` drops three indexes the advisor said were unused, and `0013` re-adds two of them once the advisor immediately re-flagged them as unindexed FKs.

| # | File | Concern | One-line description | Incident? |
|---|---|---|---|---|
| 0006 | trigger_security_definer.sql | RPC | Marks the contribution/withdrawal/subscriber-insert trigger functions SECURITY DEFINER so subscriber-role INSERTs don't fail RLS on denorm writes. | YES — direct-INSERT path aborted on RLS. |
| 0007 | rls_use_app_role.sql | RLS | Rewrites every policy from `auth.jwt() ->> 'role'` to `'app_role'`; the canonical fix for the PostgREST `SET ROLE` collision. | YES — `22023 role "subscriber" does not exist`. |
| 0008 | rls_wrap_auth_jwt_initplan.sql | perf | Wraps `auth.jwt()` in `(SELECT auth.jwt())` so PostgreSQL caches the JWT decode in an InitPlan node instead of re-evaluating per row. | YES — perf lint 0003 (`auth_rls_initplan`). |
| 0009 | fk_covering_indexes.sql | perf | Adds covering indexes for 9 unindexed FK constraints flagged by perf lint 0002. | — |
| 0010 | function_search_path.sql | RLS | Sets `search_path = public, pg_temp` on 11 SECURITY INVOKER functions flagged by security lint 0011. | — |
| 0011 | drop_unused_indexes.sql | perf | Drops 3 indexes with zero recorded scans (`unused_index` lint 0005). | — |
| 0012 | pg_trgm_into_extensions_schema.sql | RLS | Relocates the `pg_trgm` extension from `public` into the dedicated `extensions` schema (security lint 0014). | — |
| 0013 | fk_covering_indexes_followup.sql | perf | Re-adds the 2 FK covering indexes unmasked by 0011's drops (advisor re-flagged after the drops). | — |

---

## Group 3 — RPC additions + reference data (0014-0017)

Signup-path fixes (phone canonicalization, insurance toggle, premium transaction), the missing `distributors` table that backed a long-running JWT claim with no table behind it, and tightening with UNIQUE constraints. `0014` closes three confirmed defects across one migration (anonymous geo reads for the signup combobox, subscriber phone canonicalization, and the agent dispute RPC) — note the audit pattern: migrations in this range deliberately batch related defects to keep the migration count low, but each defect remains independently traceable via the header comment.

| # | File | Concern | One-line description | Incident? |
|---|---|---|---|---|
| 0014 | signup_phone_and_agent_dispute.sql | RPC | Opens anonymous geo reads (regions/districts), canonicalizes subscriber phone, and adds the agent dispute RPC. | YES — signup district combobox silently empty. |
| 0015 | signup_insurance_and_premium_tx.sql | RPC | Fixes `_insert_subscriber_chain` to read `includeInsurance` from the nested schedule, emit insurance policies, and write the premium transaction. | YES — insurance shown OFF on dashboard. |
| 0016 | distributors_table.sql | core | Lands the `distributors` table to back the long-running JWT `distributorId` claim and seed `d-001`. | — |
| 0017 | unique_constraints.sql | core | Adds UNIQUE on `agents.email`, `subscribers.nin`, and `commissions(agent_id, subscriber_id)` (race-window guard for first-contribution). | — |

---

## Group 4 — Audit-driven cleanup (0018-0025)

The 2026-04 audit pass: the metrics rollup regression triad (`0018` → `0019` hotfix → `0020` v3), the commission RPC `app_role` forward-port (`0021`, the same `'role'` trap applied to writes), hot-path perf (`0022`), an RLS initplan tail (`0023`), the nominees upsert RPC that closes a "shares can sum >100%" defect (`0024`), and dropping idle Realtime publications (`0025`). The triad in particular is worth tracing in full: `0018` shipped the rollup with the `'role'` trap, every drill-down silently returned zero, `0019` was a hotfix applied directly to the remote DB before reaching the repo (recovering remote-vs-local migration drift, audit D5), and `0020` ships the canonical v3 body. The two superseded migrations are **kept on disk for replay safety** (audit D4) — do not delete them.

| # | File | Concern | One-line description | Incident? |
|---|---|---|---|---|
| 0018 | entity_metrics_rollup.sql | RPC | First rollup RPC for distributor drill-down — body reads `'role'` claim instead of `'app_role'`, so every drill-down returned zero. **Retained for replay safety** (audit D4). | YES — zero subscribers / em-dash AUM; superseded by 0020. |
| 0019 | fix_metrics_rollup_app_role.sql | RLS | Hotfix landed on remote before reaching the repo (audit D5) — defensive ACL adjustments only; the function body is fully replaced by 0020. | YES — recovers remote-vs-local migration drift. |
| 0020 | entity_metrics_rollup_v3.sql | RPC | Canonical replacement for 0018/0019: corrected `app_role` gate, NULL-safe `COALESCE` on the role check, and the v2 time-bucket superset (daily/weekly/monthly contribution+withdrawal fields). | YES — final fix of the rollup zero-count regression. |
| 0021 | commission_rpcs_app_role.sql | RPC | Forward-port of all 13 commission state-machine RPCs from 0004, swapping `'role'` for `'app_role'`. Same trap as 0018, applied to writes. | YES — every commission write returned `role_not_permitted`. |
| 0022 | audit_perf.sql | perf | Closes 4 audit perf findings: partial index on `transactions(type, date)`, index on `commissions(status)`, and rewrites `get_top_branch` as SECURITY DEFINER with an aggregate-first body. | YES — 8s statement_timeout HTTP 500s on the branch endpoint. |
| 0023 | rls_initplan_fixes.sql | RLS | Three small audit findings: drops duplicate `subscribers(agent_id)` index, wraps `distributors_update_self` in InitPlan, and pins `_demo_now()` search_path. | — |
| 0024 | upsert_nominees.sql | RPC | Replaces direct `.delete/.insert` on `nominees` with `upsert_nominees(...)` RPC; adds CHECK on `share` and asserts SUM(share)=100 atomically. | YES — nominee shares could silently sum > 100%. |
| 0025 | drop_realtime_publication.sql | perf | Drops `commissions`, `settlement_runs`, `settlement_run_branch_reviews` from `supabase_realtime` (no `.channel()` consumers; WAL replication overhead for zero readers). | — |

---

## Group 5 — Recent additions (0026-0028)

Password-auth foundation, post-audit polish (ACL/CHECK/UNIQUE), and idempotency guards to make every prior migration replay-safe. `0026` is the first half of password auth (column-only — the bcrypt code lands in `api/auth/_lib/`); a NULL `password_hash` means "OTP only, prompt to set on next login." `0027` is a small grab-bag that closes three audit findings in one migration: REVOKE EXECUTE from PUBLIC on `upsert_nominees` (D3), CHECK constraints on free-text status columns to turn silent drift into loud INSERT/UPDATE failures (D8), and additional UNIQUE constraints. `0028` documents the gap that motivated this whole project's "idempotent forward-only" discipline — four earlier migrations (`0003`, `0006`, `0010`, `0025`) shipped non-idempotent statements, and rather than editing them in place (which would shadow remote state), `0028` asserts the desired end-state in a forward-only way that no-ops if the prior migration already succeeded.

| # | File | Concern | One-line description | Incident? |
|---|---|---|---|---|
| 0026 | users_password_hash.sql | core | Adds nullable `password_hash` column on `public.users` (bcrypt digests) — NULL means OTP-only, password set-up prompted next login. | — |
| 0027 | post_audit_polish.sql | audit | Closes 3 findings: REVOKE FROM PUBLIC on `upsert_nominees` (D3), CHECK constraints on free-text status columns (D8), and additional UNIQUE constraints. | — |
| 0028 | replay_safety_guards.sql | audit | Documents and patches non-idempotent statements in 0003/0006/0010/0025 — leaves historical files untouched and asserts the desired end-state forward-only. | — |

---

## `.down.sql` partners

The following forward migrations ship a paired reverse script. The down scripts are intentionally minimal — they undo the forward action enough to allow a clean re-apply, not enough to roll a production database all the way back. For full rollback procedure see [`docs/render-operational.md`](./render-operational.md).

| Forward | Reverse | When you'd use the reverse |
|---|---|---|
| `0016_distributors_table.sql` | `0016_distributors_table.down.sql` | Drop the distributors table during a development reset. |
| `0022_audit_perf.sql` | `0022_audit_perf.down.sql` | Reverse the perf indexes + the `get_top_branch` SECURITY DEFINER rewrite. |
| `0023_rls_initplan_fixes.sql` | `0023_rls_initplan_fixes.down.sql` | Restore the duplicate `subscribers(agent_id)` index and undo the InitPlan wrap. |
| `0024_upsert_nominees.sql` | `0024_upsert_nominees.down.sql` | Drop the upsert RPC + the share CHECK (frontend would then need to revert too). |
| `0025_drop_realtime_publication.sql` | `0025_drop_realtime_publication.down.sql` | Re-add `commissions` / `settlement_runs` / `settlement_run_branch_reviews` to `supabase_realtime`. |
| `0026_users_password_hash.sql` | `0026_users_password_hash.down.sql` | Drop the `password_hash` column (only safe if no row has set a password). |

The other 22 forward migrations are intentionally one-way. If a one-way migration needs to be undone, the standard procedure is to write a new forward migration that asserts the desired end-state — not to author a retrospective down script. This is the same discipline `0028` applies to the four migrations that originally lacked idempotency guards.

## Patterns and traps that recur in the history

A short index of recurring shapes you'll see in the migration set, so you can recognize them faster on a second read:

1. **The `'role'` vs `'app_role'` trap.** Migrations `0007`, `0018`, `0020`, `0021` are all chapters of the same trap. Search any new migration that touches a JWT claim for `'role'` before merging.
2. **The "Postgres advisor cycle."** Migrations `0008`-`0013` are entirely advisor-driven; each one cites a specific lint number (e.g. `auth_rls_initplan`, `unindexed_foreign_keys`, `function_search_path_mutable`, `unused_index`, `extension_in_public`). When the database surface changes, re-run the advisor and expect new entries.
3. **The "remote drift" recovery."** Migration `0019` recovers a hotfix that was applied directly on the live database before reaching the repo. The pattern that prevents drift: never apply SQL outside of a migration file — even for emergencies — and if you must, immediately backport with a number that captures the gap.
4. **The "batched-fix migration."** Migrations `0014`, `0022`, `0023`, `0027` each close multiple distinct findings in one file. The header documents which findings, in numbered subsections. Acceptable when the findings are tightly related.
5. **Replay safety.** Migration `0028` is the discipline contract: every migration must be idempotent so that replaying the directory against a fresh DB produces the same end-state. New migrations should follow the same convention (`DROP IF EXISTS` then `CREATE`, `CREATE OR REPLACE`, `CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).

## When you add a new migration

1. Bump the next number (currently `0029`). Zero-pad to four digits.
2. Write a top-of-file comment block explaining the concern + one line of purpose. If there's an audit / incident context, capture it in the header — that header is the canonical historical record.
3. Make every statement idempotent. If a particular statement has no idempotent form (e.g. `CREATE POLICY` pre-PG16), pair it with a guarded `DROP POLICY IF EXISTS` first.
4. Add a row to this index in the same PR.
5. If you ship a `.down.sql`, also add a row to the `.down.sql` partner table above.
6. If the migration fixes a production bug, set the `Incident?` column to `YES — <short note>` and cross-link any related migration numbers.
7. After applying, re-run the Supabase advisors. Expect new lint entries on tables you've touched.

That's the entire contract — keep it tight and the next reader (you, in three months) will thank you.

## Where to look when…

A quick cheat-sheet for navigating the history when you need to debug something specific. Each row points at the migrations whose headers contain the load-bearing detail.

| If you're investigating… | Read first |
|---|---|
| A drill-down returning zero counts at the distributor level | 0018, 0019, 0020 (rollup triad) |
| A commission state-machine call returning `role_not_permitted` | 0021, 0004 (forward-port history) |
| An `auth.uid()` returning NULL inside a policy or RPC | [`BACKEND.md §6`](../BACKEND.md) (custom HS256 JWT model) |
| A policy on `subscribers` raising infinite recursion | 0005 (BEFORE UPDATE trigger pattern) |
| `22023 role "X" does not exist` in PostgREST logs | 0007 (the `app_role` cutover) |
| Hot-path query timing out at 8s | 0022 (`get_top_branch` SECURITY DEFINER rewrite) |
| Nominee shares that don't sum to 100 | 0024 (`upsert_nominees` RPC + CHECK) |
| Schema search_path / extensions in `public` warnings | 0010, 0012 |
| Realtime channel subscriptions not firing | 0025 (the publication is intentionally OFF) |
| Password-auth column missing | 0026 (added but auth code lands in `api/auth/_lib/`) |
| A migration that doesn't replay cleanly on a fresh DB | 0028 (replay-safety guards) |
| The signup district combobox rendering empty | 0014 (anonymous geo read policies) |
| Insurance toggle showing OFF on the dashboard after signup | 0015 (`includeInsurance` path fix) |

When any of these patterns reappears in a new context, prefer **opening the original migration's header** over re-deriving the rationale — the headers were written immediately after the bug was caught and contain context that's easy to lose in a second-hand summary.
