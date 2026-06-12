-- =============================================================================
-- Down migration for 0059_employer_activity.sql
-- =============================================================================
-- Drops the admin-only employer-channel activity rollup. The frontend treats a
-- missing RPC as an error only under the Employers scope trends card; the rest
-- of the admin dashboard is unaffected.
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_employer_activity_rollup();

-- =============================================================================
-- End of 0059_employer_activity.down.sql
-- =============================================================================
