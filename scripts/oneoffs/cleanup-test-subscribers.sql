-- =============================================================================
-- Universal Pensions Uganda — cleanup test subscribers
-- =============================================================================
-- Purpose
--   Removes a SPECIFIC set of test subscribers (and ALL their dependent rows)
--   created during demo testing. Does NOT touch seeded data or any other
--   subscribers. Targets are identified explicitly by phone number — no
--   pattern-matching, no date filters, no blanket sweeps.
--
-- Safety
--   DO NOT run blindly. Always dry-run with the trailing `ROLLBACK;` first
--   to confirm the row counts. Only flip to `COMMIT;` once you have eyeballed
--   the verification SELECTs and they all show 0 remaining rows for the
--   targeted IDs.
--
-- Usage
--   1. Edit the `targets` VALUES list below — replace the placeholder phones
--      with the actual test phone numbers you want to nuke. One phone per
--      row, in canonical `+256…` format. Add or remove rows as needed.
--   2. Paste the entire file into the Supabase SQL editor, or invoke via the
--      Supabase MCP `execute_sql` tool. (CLI: `psql "$SUPABASE_DB_URL" -f
--      scripts/oneoffs/cleanup-test-subscribers.sql` also works.)
--   3. First run: leave the final `ROLLBACK;` in place — Postgres will
--      execute the deletes inside the transaction, return all the
--      verification counts, then roll everything back. Nothing is persisted.
--   4. If the counts look right (children pre-delete > 0, post-delete = 0,
--      parent count = N matching subscribers, post-delete = 0), change the
--      final line to `COMMIT;` and re-run. The deletes are then persisted.
--
-- Dependent tables hit by this script
--   Direct deletes:
--     - demo_personas (gated to role='subscriber' — see warning below)
--     - subscribers (parent; cascades flush everything below)
--   Cascaded automatically by ON DELETE CASCADE on subscribers.id:
--     - subscriber_balances
--     - contribution_schedules
--     - insurance_policies
--     - nominees
--     - transactions
--     - claims
--     - withdrawals
--     - commissions
--   Verified against supabase/migrations/0001_initial_schema.sql — every
--   table that FK-links to subscribers does so with ON DELETE CASCADE.
--   The DELETE FROM subscribers at the end is therefore sufficient to clear
--   all eight per-subscriber tables in one shot.
--
-- WARNING: users table
--   The `users` table (auth identities) is keyed by (phone, role) and is
--   upserted by /api/auth/verify-otp on every successful login. It has NO FK
--   to subscribers, so it is NOT auto-cleaned by the cascade. If your test
--   subscribers also generated `users` rows (they will have, once they
--   logged in with OTP), and you want those gone too, uncomment the explicit
--   DELETE FROM users block below. Default is to LEAVE THEM IN PLACE — they
--   are harmless on their own (no balances, no commissions) and re-creating
--   them happens automatically next login.
--
-- WARNING: demo_personas role gating
--   The DELETE on demo_personas is gated by `role = 'subscriber'`. This is
--   deliberate: a test phone reused across roles (e.g. agent persona phones
--   like +25670000001) must NEVER be wiped by this script. Do not remove
--   the role filter.
--
-- WARNING: cross-subscriber shared rows
--   None of the child tables share rows across subscribers in this schema —
--   every row carries exactly one `subscriber_id` and is per-subscriber.
--   Commissions denormalise `agent_id` + `branch_id` but the row itself is
--   1:1 with a (agent, subscriber) pair, so cascading from subscribers.id
--   only removes that subscriber's commission lines. Settlement_runs and
--   settlement_run_branch_reviews are NOT cascade-deleted — if a deleted
--   commission was part of an open `in_run` run, its run will simply show
--   one fewer line afterwards. Verify the run's `total_amount` and
--   `commission_count` denorms separately if that matters for your demo.
--
-- WARNING: shared phones across subscribers
--   In the seed + demo dataset, the same phone can map to BOTH a seeded
--   subscriber (is_demo_signup=false) AND one or more demo-signup test rows
--   (is_demo_signup=true). Example: phone +256777247884 maps to seeded
--   Brian Okello (s-0001) AND to a test subscriber (s-100007). A naive
--   phone-only filter would wipe Brian Okello too. The target-resolution
--   below therefore ALSO requires `is_demo_signup = true` — never remove
--   this guard. If you need to delete a seeded subscriber, do it manually
--   with their explicit ID, NOT through this script.
-- =============================================================================

BEGIN;

-- ─── 1. Targets (EDIT THIS LIST) ─────────────────────────────────────────────
-- Replace these with your actual test phones. One row per phone. Canonical
-- +256XXXXXXXXX format. Add commas between rows; no trailing comma.
WITH targets AS (
  SELECT phone FROM (VALUES
    ('+256711234567'),   -- example: replace me
    ('+256711234568'),   -- example: replace me
    ('+256711234569')    -- example: replace me
  ) AS t(phone)
)
SELECT phone
INTO TEMP TABLE target_phones
FROM targets;

-- Resolve target phones → subscriber IDs. Captured into a TEMP TABLE so the
-- subsequent DELETE/SELECT statements can re-read the ID list without
-- re-running the join (and without holding open a CTE across statements).
CREATE TEMP TABLE target_subscribers AS
SELECT s.id, s.phone, s.name, s.is_demo_signup, s.created_at
FROM public.subscribers s
WHERE s.phone IN (SELECT phone FROM target_phones)
  AND s.is_demo_signup = true;  -- safety: never touch seeded rows even on phone collision

-- ─── 2. Preview: what we are about to delete ─────────────────────────────────
-- Sanity check. If this returns 0 rows, your phone list does not match any
-- subscriber — STOP and double-check the format / spacing before continuing.
SELECT
  'preview_subscribers' AS marker,
  count(*) AS rows_matched,
  count(*) FILTER (WHERE is_demo_signup) AS demo_signups,
  count(*) FILTER (WHERE NOT is_demo_signup) AS seeded_or_legacy
FROM target_subscribers;

-- Per-table pre-delete counts. Useful to see exactly how many child rows the
-- cascade will sweep. If `seeded_or_legacy > 0` above and you did NOT mean to
-- delete a seeded subscriber, ROLLBACK and re-check your phone list.
SELECT 'pre_balances'       AS marker, count(*) AS rows FROM public.subscriber_balances     WHERE subscriber_id IN (SELECT id FROM target_subscribers);
SELECT 'pre_schedules'      AS marker, count(*) AS rows FROM public.contribution_schedules  WHERE subscriber_id IN (SELECT id FROM target_subscribers);
SELECT 'pre_insurance'      AS marker, count(*) AS rows FROM public.insurance_policies      WHERE subscriber_id IN (SELECT id FROM target_subscribers);
SELECT 'pre_nominees'       AS marker, count(*) AS rows FROM public.nominees                WHERE subscriber_id IN (SELECT id FROM target_subscribers);
SELECT 'pre_transactions'   AS marker, count(*) AS rows FROM public.transactions            WHERE subscriber_id IN (SELECT id FROM target_subscribers);
SELECT 'pre_claims'         AS marker, count(*) AS rows FROM public.claims                  WHERE subscriber_id IN (SELECT id FROM target_subscribers);
SELECT 'pre_withdrawals'    AS marker, count(*) AS rows FROM public.withdrawals             WHERE subscriber_id IN (SELECT id FROM target_subscribers);
SELECT 'pre_commissions'    AS marker, count(*) AS rows FROM public.commissions             WHERE subscriber_id IN (SELECT id FROM target_subscribers);
SELECT 'pre_demo_personas'  AS marker, count(*) AS rows FROM public.demo_personas           WHERE phone IN (SELECT phone FROM target_phones) AND role = 'subscriber';

-- ─── 3. Deletes ──────────────────────────────────────────────────────────────
-- The following eight per-subscriber tables ALL have `ON DELETE CASCADE` on
-- their FK to subscribers.id (verified in 0001_initial_schema.sql lines 174,
-- 191, 207, 221, 244, 263, 278, 350). No explicit DELETE is needed — the
-- single `DELETE FROM subscribers` at the bottom of this block sweeps them
-- all in one transactional step.
--
--   subscriber_balances     — CASCADE
--   contribution_schedules  — CASCADE
--   insurance_policies      — CASCADE
--   nominees                — CASCADE
--   transactions            — CASCADE
--   claims                  — CASCADE
--   withdrawals             — CASCADE
--   commissions             — CASCADE
--
-- demo_personas has NO FK to subscribers (it is a phone → entity-id lookup),
-- so it is deleted explicitly. The `role = 'subscriber'` filter is critical
-- — never drop it. See header warning.

DELETE FROM public.demo_personas
WHERE phone IN (SELECT phone FROM target_phones)
  AND role = 'subscriber';

-- Optional: also remove `users` rows for these phones (role='subscriber').
-- LEFT COMMENTED OUT by default. Uncomment if you also want their auth row
-- gone (they will re-create on next login). The users table has NO FK to
-- subscribers, so this is independent of the cascade below.
--
-- DELETE FROM public.users
-- WHERE phone IN (SELECT phone FROM target_phones)
--   AND role = 'subscriber';

-- Parent delete — cascade clears all eight child tables listed above.
DELETE FROM public.subscribers
WHERE id IN (SELECT id FROM target_subscribers);

-- ─── 4. Verification (post-delete) ───────────────────────────────────────────
-- Every count below MUST be 0. If any row remains, ROLLBACK immediately and
-- investigate before flipping to COMMIT. A non-zero count likely indicates a
-- new FK was added in a later migration without ON DELETE CASCADE — update
-- this script before persisting.

SELECT 'post_subscribers'    AS marker, count(*) AS remaining FROM public.subscribers             WHERE id IN (SELECT id FROM target_subscribers);
SELECT 'post_balances'       AS marker, count(*) AS remaining FROM public.subscriber_balances     WHERE subscriber_id IN (SELECT id FROM target_subscribers);
SELECT 'post_schedules'      AS marker, count(*) AS remaining FROM public.contribution_schedules  WHERE subscriber_id IN (SELECT id FROM target_subscribers);
SELECT 'post_insurance'      AS marker, count(*) AS remaining FROM public.insurance_policies      WHERE subscriber_id IN (SELECT id FROM target_subscribers);
SELECT 'post_nominees'       AS marker, count(*) AS remaining FROM public.nominees                WHERE subscriber_id IN (SELECT id FROM target_subscribers);
SELECT 'post_transactions'   AS marker, count(*) AS remaining FROM public.transactions            WHERE subscriber_id IN (SELECT id FROM target_subscribers);
SELECT 'post_claims'         AS marker, count(*) AS remaining FROM public.claims                  WHERE subscriber_id IN (SELECT id FROM target_subscribers);
SELECT 'post_withdrawals'    AS marker, count(*) AS remaining FROM public.withdrawals             WHERE subscriber_id IN (SELECT id FROM target_subscribers);
SELECT 'post_commissions'    AS marker, count(*) AS remaining FROM public.commissions             WHERE subscriber_id IN (SELECT id FROM target_subscribers);
SELECT 'post_demo_personas'  AS marker, count(*) AS remaining FROM public.demo_personas           WHERE phone IN (SELECT phone FROM target_phones) AND role = 'subscriber';

-- TODO (manual): if any settlement_runs were partially built from these test
-- subscribers' commissions, their `total_amount` and `commission_count`
-- denorms will drift. Re-running `SELECT * FROM public.settlement_runs WHERE
-- state IN ('draft','branch_review');` and reconciling against the live
-- `commissions` rows is a separate exercise — out of scope for this script.

-- ─── 5. Commit or rollback ───────────────────────────────────────────────────
-- Leave as ROLLBACK on first run to dry-run. After verifying every `post_*`
-- count above is 0 (and the `preview_subscribers.rows_matched` matched what
-- you expected), change this line to `COMMIT;` and re-run to persist.

ROLLBACK; -- Change to COMMIT; once you've verified the row counts above.

-- =============================================================================
-- End of cleanup-test-subscribers.sql
-- =============================================================================
