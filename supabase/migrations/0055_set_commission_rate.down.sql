-- =============================================================================
-- DOWN — 0055_set_commission_rate.sql
-- =============================================================================
-- Drops the set_commission_rate DEFINER RPC. The pre-0055 write path was a direct
-- client UPDATE gated by the commission_config_update_distributor RLS policy (0008),
-- which is untouched by 0055 and remains in place — so dropping this function
-- restores the prior behaviour (the frontend's IS_SUPABASE_ENABLED branch would
-- need to be reverted in tandem to resume the direct UPDATE). Idempotent.
-- =============================================================================

DROP FUNCTION IF EXISTS public.set_commission_rate(numeric);

-- =============================================================================
-- End of 0055_set_commission_rate.down.sql
-- =============================================================================
