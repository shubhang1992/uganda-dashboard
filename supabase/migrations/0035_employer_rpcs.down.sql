-- =============================================================================
-- Universal Pensions Uganda — 0035 DOWN (manual-only rollback)
-- =============================================================================
-- Undoes 0035_employer_rpcs.sql. NOT part of the forward-only chain; for
-- manual/emergency use:
--
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/0035_employer_rpcs.down.sql
--
-- Drops the five employer RPCs. Run BEFORE 0034's down (these functions
-- reference the employer tables 0034 creates). Dropping the RPCs leaves the
-- tables/data intact.
-- =============================================================================

DROP FUNCTION IF EXISTS public.submit_contribution_run(jsonb, text, text, text);
DROP FUNCTION IF EXISTS public.update_employee_contribution_config(text, jsonb);
DROP FUNCTION IF EXISTS public.update_employee_insurance(text, numeric, numeric);
DROP FUNCTION IF EXISTS public.update_employer_profile(jsonb);
DROP FUNCTION IF EXISTS public.get_employer_metrics();

-- =============================================================================
-- End of 0035_employer_rpcs.down.sql
-- =============================================================================
