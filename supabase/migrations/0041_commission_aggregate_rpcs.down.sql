-- =============================================================================
-- Universal Pensions Uganda — 0041 DOWN (manual-only rollback)
-- =============================================================================
-- Undoes 0041_commission_aggregate_rpcs.sql. NOT part of the forward-only chain;
-- for manual/emergency use:
--
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/0041_commission_aggregate_rpcs.down.sql
--
-- Drops the three commission aggregate read RPCs. These are pure reads with no
-- table/data side effects, so dropping them leaves all data intact. The JS
-- folds in src/services/commissions.js are unaffected by this drop — only the
-- P4 rewrite (which switches the JS to call these RPCs) depends on them, so run
-- this down ONLY if P4's JS change is also reverted, else those calls 404.
--
-- DROP FUNCTION matches by argument types, so the signatures below are
-- load-bearing and must mirror the CREATE signatures in the forward file.
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_agent_commission_list(text);
DROP FUNCTION IF EXISTS public.get_pending_dues_by_agent();
DROP FUNCTION IF EXISTS public.get_pending_dues_by_branch();

-- =============================================================================
-- End of 0041_commission_aggregate_rpcs.down.sql
-- =============================================================================
