-- =============================================================================
-- DOWN — 0052_repin_insert_chain.sql
-- =============================================================================
-- Reverses ONLY the _insert_subscriber_chain search_path pin re-added by the up
-- migration (restores the post-0042 state for that one function).
--
-- Per audit §1b.6 (.down must restore the HARDENED prior definition, never a
-- vulnerable one): the step-2 trigger settings are the 0006/0043 hardened
-- baseline that predates 0052 — they are INTENTIONALLY LEFT in place. Undoing
-- the SECURITY DEFINER / search_path pin on the balance trigger functions would
-- re-introduce the very security regression 0052 (and 0006/0043) guard against,
-- so this .down deliberately does not RESET them.
--
-- Guarded with to_regprocedure so it is safe to re-run when the function is
-- absent. Idempotent.
-- =============================================================================

DO $$
BEGIN
  IF to_regprocedure('public._insert_subscriber_chain(jsonb, text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public._insert_subscriber_chain(jsonb, text) RESET search_path';
  END IF;
END $$;

-- =============================================================================
-- End of 0052_repin_insert_chain.down.sql
-- =============================================================================
