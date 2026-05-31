-- =============================================================================
-- Universal Pensions Uganda — 0033 DOWN (manual-only rollback)
-- =============================================================================
-- Undoes 0033_post_audit_hardening.sql. NOT part of the forward-only chain; for
-- manual/emergency use:
--
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/0033_post_audit_hardening.down.sql
--
-- Restores the pre-0033 state:
--   * drops the notifications.ref_id FK + its covering index (back to a soft
--     TEXT ref, per 0031);
--   * restores the settlement_batches FKs WITHOUT an ON DELETE action (the
--     0030 default — system-generated names re-created here);
--   * NO FORCE on distributors RLS (back to the 0016 ENABLE-only state).
--
-- Idempotent (IF EXISTS / pg_constraint probes) and ordered so a re-run
-- converges. 0033 stands alone — it does not couple with the 0030/0031 pair
-- rollback ordering (BACKEND.md §11): undo 0033 first if rolling the whole
-- settlement stack back, then 0032, then 0031-then-0030.
-- =============================================================================

-- BL-24 — back to ENABLE-only on distributors.
DO $$
BEGIN
  IF to_regclass('public.distributors') IS NOT NULL THEN
    ALTER TABLE public.distributors NO FORCE ROW LEVEL SECURITY;
  END IF;
END
$$;

-- BL-15 — drop the ref_id FK + covering index.
ALTER TABLE IF EXISTS public.notifications
  DROP CONSTRAINT IF EXISTS notifications_ref_id_fkey;
DROP INDEX IF EXISTS public.notifications_ref_id_idx;

-- F-12 — restore the 0030 FKs with NO ON DELETE action.
DO $$
BEGIN
  IF to_regclass('public.settlement_batches') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.settlement_batches
    DROP CONSTRAINT IF EXISTS settlement_batches_agent_id_fkey;
  ALTER TABLE public.settlement_batches
    ADD  CONSTRAINT settlement_batches_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES public.agents (id);

  ALTER TABLE public.settlement_batches
    DROP CONSTRAINT IF EXISTS settlement_batches_branch_id_fkey;
  ALTER TABLE public.settlement_batches
    ADD  CONSTRAINT settlement_batches_branch_id_fkey
    FOREIGN KEY (branch_id) REFERENCES public.branches (id);
END
$$;

-- =============================================================================
-- End of 0033_post_audit_hardening.down.sql
-- =============================================================================
