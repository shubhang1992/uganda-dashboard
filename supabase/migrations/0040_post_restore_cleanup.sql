-- =============================================================================
-- Universal Pensions Uganda — 0040: post-restore cleanup
-- =============================================================================
-- Apply at cutover on the freshly-restored Singapore project, AFTER 0039, after
-- a verified backup. Forward-only, drop-only cleanup migration.
--
-- The restored DB carries forward a small amount of cruft accumulated across the
-- 0001-0039 chain. This migration removes exactly that cruft — it drops one
-- stale CHECK constraint, six unused indexes, and two dead columns. It creates
-- nothing, changes no RPC, and touches no policy. Every statement is idempotent
-- (guarded with IF EXISTS) so a replay converges, and each is reversed by the
-- partner 0040_post_restore_cleanup.down.sql — EXCEPT the CHECK constraint, which
-- is deliberately NOT recreated by the down file (it is the bug being removed).
--
-- Addresses three cleanup items:
--
--   * CRITICAL — commissions_status_chk (introduced in 0027) is a stale 7-value
--     enum that does NOT include 'paid'. It blocks the apply_settlement RPC from
--     flipping commission lines to status='paid', breaking live settlements.
--     Drop it; the simplified two-state (due → paid) flow needs no CHECK.
--
--   * Six unused indexes — these no longer back any query path after the
--     rollup/RLS simplifications. Dropping them reclaims write overhead:
--       idx_transactions_subscriber_id    (0020) — superseded by the composite
--                                                  transactions_subscriber_id_date_idx (0001)
--       demo_personas_phone_role_idx      (0001) — superseded by the UNIQUE
--                                                  (phone, role) constraint
--       commissions_agent_id_idx          (0013) — RLS no longer scans it
--       idx_subscribers_registered        (0020)
--       idx_subscribers_gender            (0020)
--       idx_subscribers_kyc               (0020)
--
--   * Two dead columns on agent_referrals — tracking_id / session_id (0001) were
--     never written by any code path; the KYC referral writer stores neither.
--
-- CONVENTIONS (CLAUDE.md / BACKEND.md):
--   * No RPC / policy body changes; pure drop-only cleanup DDL.
--   * Idempotent DDL (IF EXISTS); forward-only; reversible via the .down.sql
--     partner — except the CHECK constraint, intentionally not restored.
--   * Migrations 0001-0039 SQL bodies are FROZEN — this is append-only work.
--   * NOT YET APPLIED TO LIVE — applying it is a gated cutover step the user
--     runs after a verified backup.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CRITICAL — drop the stale commissions_status_chk CHECK constraint
-- -----------------------------------------------------------------------------
-- 0027's 7-value enum predates the two-state simplification and omits 'paid',
-- so apply_settlement's UPDATE … SET status='paid' raises a constraint
-- violation on live. No replacement CHECK — the demo flow is due → paid only.
ALTER TABLE public.commissions
  DROP CONSTRAINT IF EXISTS commissions_status_chk;

-- -----------------------------------------------------------------------------
-- Drop six unused indexes
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_transactions_subscriber_id;
DROP INDEX IF EXISTS demo_personas_phone_role_idx;
DROP INDEX IF EXISTS commissions_agent_id_idx;
DROP INDEX IF EXISTS idx_subscribers_registered;
DROP INDEX IF EXISTS idx_subscribers_gender;
DROP INDEX IF EXISTS idx_subscribers_kyc;

-- -----------------------------------------------------------------------------
-- Drop two dead columns on agent_referrals
-- -----------------------------------------------------------------------------
-- tracking_id / session_id (0001) are never populated by any writer.
ALTER TABLE public.agent_referrals
  DROP COLUMN IF EXISTS tracking_id,
  DROP COLUMN IF EXISTS session_id;

-- =============================================================================
-- End of 0040_post_restore_cleanup.sql
-- =============================================================================
