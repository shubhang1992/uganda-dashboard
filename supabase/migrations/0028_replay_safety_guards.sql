-- =============================================================================
-- Universal Pensions Uganda — 0028: Replay-safety guards
-- =============================================================================
-- Audit D12: four earlier migrations contain non-idempotent statements that
-- raise on a forward replay (e.g. against a fresh DB that already advanced
-- to a later schema version, or against the live DB where the operation was
-- already applied). This migration documents the gap and replicates the
-- missing guards in a forward-only, idempotent way.
--
-- We deliberately do NOT edit 0003 / 0006 / 0010 / 0025 in place — that
-- would re-apply already-applied work and could shadow remote state. Instead
-- we leave the historical migrations untouched and assert the desired
-- end-state here. Each block is a no-op if the prior migration already
-- succeeded.
--
-- Gap summary:
--   * 0003_rls_policies.sql       — 60+ `CREATE POLICY` statements without
--                                    `IF NOT EXISTS` (CREATE POLICY does not
--                                    support IF NOT EXISTS in PG ≤16, so the
--                                    safe pattern is DROP POLICY IF EXISTS
--                                    first, then CREATE POLICY). RLS ENABLE/
--                                    FORCE is already idempotent in PG.
--   * 0006_trigger_security_definer.sql — `ALTER FUNCTION ... SECURITY DEFINER`
--                                    is idempotent at the catalog level
--                                    (re-running just re-asserts the flag).
--                                    No gap here in PG terms; included for
--                                    completeness — we re-assert the flags
--                                    so a partial-state replay converges.
--   * 0010_function_search_path.sql — `ALTER FUNCTION ... SET search_path`
--                                    is idempotent; same reasoning as 0006.
--                                    No gap; re-assertion only.
--   * 0025_drop_realtime_publication.sql — `ALTER PUBLICATION ... DROP TABLE`
--                                    has NO `IF EXISTS` variant in PostgreSQL.
--                                    On replay (table already dropped from
--                                    publication, or table itself dropped),
--                                    the statement raises and aborts the
--                                    migration transaction. The fix is to
--                                    check pg_publication_tables and only
--                                    drop if the table is currently a member.
--
-- Forward-only per BACKEND.md §7. Replay-safe (every block self-guards).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- (1) 0025 replay guard — supabase_realtime publication membership
-- -----------------------------------------------------------------------------
-- ALTER PUBLICATION supabase_realtime DROP TABLE <t> raises if <t> is not
-- currently a member of the publication. Wrap each drop in a membership
-- check against pg_publication_tables. Idempotent: if the table is no longer
-- in the publication (because 0025 already applied successfully), the
-- IF-branch is skipped silently.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname     = 'supabase_realtime'
       AND schemaname  = 'public'
       AND tablename   = 'commissions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.commissions';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname     = 'supabase_realtime'
       AND schemaname  = 'public'
       AND tablename   = 'settlement_runs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.settlement_runs';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname     = 'supabase_realtime'
       AND schemaname  = 'public'
       AND tablename   = 'settlement_run_branch_reviews'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.settlement_run_branch_reviews';
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- (2) 0006 / 0010 re-assertion — SECURITY DEFINER + search_path
-- -----------------------------------------------------------------------------
-- These were already idempotent at the catalog level. Re-asserting them
-- inside a guarded block lets a partial-state replay (e.g. function dropped
-- and re-created by a later migration without re-applying 0006) converge
-- to the correct end-state. Each ALTER is wrapped so a missing function
-- doesn't abort the block.

DO $$
DECLARE
  fn_signature TEXT;
BEGIN
  FOREACH fn_signature IN ARRAY ARRAY[
    'public.trg_subscribers_after_insert()',
    'public.trg_transactions_contribution()',
    'public.trg_transactions_withdrawal()'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname || '.' || p.proname || '()' = fn_signature
    ) THEN
      EXECUTE 'ALTER FUNCTION ' || fn_signature || ' SECURITY DEFINER';
      EXECUTE 'ALTER FUNCTION ' || fn_signature || ' SET search_path = public, pg_temp';
    END IF;
  END LOOP;
END $$;

-- SECURITY INVOKER functions from 0010 — assert search_path pin.
-- These take typed args, so we check each one explicitly.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = '_insert_subscriber_chain'
  ) THEN
    EXECUTE 'ALTER FUNCTION public._insert_subscriber_chain(jsonb, text) SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = '_validate_signup_payload'
  ) THEN
    EXECUTE 'ALTER FUNCTION public._validate_signup_payload(jsonb) SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_agent_commission_detail'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.get_agent_commission_detail(text) SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_breadcrumb'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.get_breadcrumb(text, jsonb) SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_commission_summary'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.get_commission_summary(text) SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_entity_commission_summary'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.get_entity_commission_summary(text, text) SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_run_branch_breakdown'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.get_run_branch_breakdown(text) SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_top_branch'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.get_top_branch(text, text) SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'search_entities'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.search_entities(text) SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'trg_commissions_before_update'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.trg_commissions_before_update() SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'trg_subscribers_enforce_editable_cols'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.trg_subscribers_enforce_editable_cols() SET search_path = public, pg_temp';
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- (3) 0003 RLS — re-assert ENABLE / FORCE ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
-- `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY` is already idempotent in
-- PostgreSQL — re-running just re-asserts the table's relrowsecurity /
-- relforcerowsecurity catalog flags. We re-assert here so a fresh DB that
-- skipped 0003 (e.g. drop-and-restore from a partial dump) still converges.
-- A pg_class existence check skips tables that were dropped in later
-- migrations (none today, but defensive against future schema work).

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'regions', 'districts', 'branches', 'agents',
    'subscribers', 'subscriber_balances', 'contribution_schedules',
    'insurance_policies', 'nominees', 'transactions', 'claims', 'withdrawals',
    'commission_config', 'settlement_runs', 'settlement_run_branch_reviews',
    'commissions', 'agent_referrals', 'contact_submissions',
    'users', 'demo_personas'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = tbl AND c.relkind = 'r'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',  tbl);
    END IF;
  END LOOP;
END $$;

-- NOTE on RLS policies: PostgreSQL ≤16 does not support `CREATE POLICY IF NOT
-- EXISTS`. The canonical replay pattern for a policy is:
--   DROP POLICY IF EXISTS <name> ON <table>;
--   CREATE POLICY <name> ON <table> ...;
-- We do NOT re-author the 60+ policies from 0003 / 0007 / 0008 / 0023 here —
-- that would duplicate the canonical bodies and create a drift surface. The
-- policy definitions stay where they are; this migration documents the
-- replay-safety constraint so a future schema author knows to use the
-- DROP-then-CREATE pattern when modifying policies.

-- =============================================================================
-- End of 0028_replay_safety_guards.sql
-- =============================================================================
