-- =============================================================================
-- Universal Pensions Uganda — 0033: post-audit DB hardening
-- =============================================================================
-- Apply at cutover AFTER 0032, after a verified backup; NOT yet applied to live.
--
-- Forward-only, additive hardening migration. The live DB already has
-- 0029/0030/0031 (and, at cutover, 0032) applied, so this migration only ADDs
-- constraints / flips RLS flags — it creates no tables and changes no RPC.
-- Every statement is idempotent (guarded with IF EXISTS / pg_constraint probes
-- inside DO blocks) so a replay converges, and each is reversed by the partner
-- 0033_post_audit_hardening.down.sql.
--
-- Addresses three audit findings:
--
--   * BL-15 — notifications.ref_id had no FK. It is ONLY ever written with a
--     settlement_batches.id: the apply_settlement RPC stamps v_batch_id into
--     ref_id (0031:186/201, 0032:249/264) and the mock seed/service use
--     'sb-...' batch ids (src/data/mockData.js, src/services/notifications.js).
--     No other writer or notification `type` exists. So a real FK is correct;
--     ON DELETE SET NULL keeps the append-only feed intact if a batch is ever
--     deleted/re-seeded (the body text still records what was paid).
--
--   * BL-24 — distributors was the only RLS-enabled table NOT FORCE'd (0016
--     did ENABLE but not FORCE). FORCE closes the table-owner RLS-bypass path
--     and matches the other 20 tables.
--
--   * F-12 — settlement_batches FKs (agent_id, branch_id) had no ON DELETE
--     action. Align them to the commissions convention (0001:348-349):
--       agent_id  -> agents(id)   ON DELETE CASCADE
--       branch_id -> branches(id) ON DELETE SET NULL
--
-- CONVENTIONS (CLAUDE.md / BACKEND.md):
--   * No RPC / policy body changes; pure DDL hardening.
--   * Idempotent DDL; forward-only; reversible via the .down.sql partner.
--   * NOT YET APPLIED TO LIVE — applying it is a gated cutover step the user
--     runs after a verified backup.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- F-12 — settlement_batches FK ON DELETE policy (match the commissions table)
-- -----------------------------------------------------------------------------
-- 0030 created both FKs with no ON DELETE action (system-generated constraint
-- names: settlement_batches_agent_id_fkey / settlement_batches_branch_id_fkey).
-- Drop each by name if present (IF EXISTS) and re-add with the commissions
-- convention. Wrapped in a guard so this only runs where the table exists.
DO $$
BEGIN
  IF to_regclass('public.settlement_batches') IS NULL THEN
    RAISE NOTICE '0033: settlement_batches missing — skipping FK hardening';
    RETURN;
  END IF;

  -- agent_id -> agents(id) ON DELETE CASCADE
  ALTER TABLE public.settlement_batches
    DROP CONSTRAINT IF EXISTS settlement_batches_agent_id_fkey;
  ALTER TABLE public.settlement_batches
    ADD  CONSTRAINT settlement_batches_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES public.agents (id) ON DELETE CASCADE;

  -- branch_id -> branches(id) ON DELETE SET NULL
  ALTER TABLE public.settlement_batches
    DROP CONSTRAINT IF EXISTS settlement_batches_branch_id_fkey;
  ALTER TABLE public.settlement_batches
    ADD  CONSTRAINT settlement_batches_branch_id_fkey
    FOREIGN KEY (branch_id) REFERENCES public.branches (id) ON DELETE SET NULL;
END
$$;

-- -----------------------------------------------------------------------------
-- BL-15 — notifications.ref_id -> settlement_batches(id) ON DELETE SET NULL
-- -----------------------------------------------------------------------------
-- ref_id is a soft ref today (0031:32 `ref_id TEXT`, no REFERENCES). Promote it
-- to a real FK now that it is provably only ever a batch id. SET NULL (not
-- CASCADE) keeps the notification row — the feed is append-only history.
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NULL
     OR to_regclass('public.settlement_batches') IS NULL THEN
    RAISE NOTICE '0033: notifications/settlement_batches missing — skipping ref_id FK';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'notifications_ref_id_fkey'
       AND conrelid = 'public.notifications'::regclass
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_ref_id_fkey
      FOREIGN KEY (ref_id) REFERENCES public.settlement_batches (id) ON DELETE SET NULL;
  END IF;
END
$$;

-- A covering index for the new FK keeps the ON DELETE SET NULL fan-out cheap
-- (mirrors the FK-covering-index convention from 0009/0013).
CREATE INDEX IF NOT EXISTS notifications_ref_id_idx
  ON public.notifications (ref_id);

-- -----------------------------------------------------------------------------
-- BL-24 — distributors FORCE ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
-- 0016 only ENABLE'd RLS on distributors. FORCE it so even the table owner is
-- subject to the policies (matches the other 20 tables). FORCE is idempotent.
DO $$
BEGIN
  IF to_regclass('public.distributors') IS NOT NULL THEN
    ALTER TABLE public.distributors FORCE ROW LEVEL SECURITY;
  END IF;
END
$$;

-- =============================================================================
-- End of 0033_post_audit_hardening.sql
-- =============================================================================
