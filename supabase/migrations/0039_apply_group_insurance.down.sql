-- =============================================================================
-- Universal Pensions Uganda — 0039 DOWN (manual-only rollback)
-- =============================================================================
-- Undoes 0039_apply_group_insurance.sql. NOT part of the forward-only chain;
-- for manual/emergency use:
--
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/0039_apply_group_insurance.down.sql
--
-- Drops the roster-wide group-insurance RPC. The employees' insurance columns
-- (already populated by any prior call) are left intact.
-- =============================================================================

DROP FUNCTION IF EXISTS public.apply_group_insurance(numeric);

-- =============================================================================
-- End of 0039_apply_group_insurance.down.sql
-- =============================================================================
