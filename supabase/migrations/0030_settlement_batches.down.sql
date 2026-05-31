-- =============================================================================
-- Universal Pensions Uganda — 0030 DOWN (manual-only rollback)
-- =============================================================================
-- Undoes 0030_settlement_batches.sql. NOT part of the forward-only chain; for
-- manual/emergency use:
--
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/0030_settlement_batches.down.sql
--
-- Dropping the table discards every recorded settlement batch.
-- =============================================================================

DROP POLICY IF EXISTS settlement_batches_select_agent       ON public.settlement_batches;
DROP POLICY IF EXISTS settlement_batches_select_branch      ON public.settlement_batches;
DROP POLICY IF EXISTS settlement_batches_select_distributor ON public.settlement_batches;
DROP TABLE IF EXISTS public.settlement_batches;

-- =============================================================================
-- End of 0030_settlement_batches.down.sql
-- =============================================================================
