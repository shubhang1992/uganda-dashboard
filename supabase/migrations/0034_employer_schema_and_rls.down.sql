-- =============================================================================
-- Universal Pensions Uganda — 0034 DOWN (manual-only rollback)
-- =============================================================================
-- Undoes 0034_employer_schema_and_rls.sql. NOT part of the forward-only chain;
-- for manual/emergency use:
--
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/0034_employer_schema_and_rls.down.sql
--
-- Drops the five employer tables (and, via CASCADE / DROP TABLE, their RLS
-- policies and indexes). Run AFTER 0035's down (which drops the RPCs that
-- depend on these tables). FK CASCADEs handle child rows; explicit DROP order
-- is child-before-parent for clarity.
--
-- WARNING: destroys all employer/employee/run data. Only run on a verified
-- backup or a throwaway branch.
-- =============================================================================

DROP TABLE IF EXISTS public.contribution_run_uploads;
DROP TABLE IF EXISTS public.contribution_run_lines;
DROP TABLE IF EXISTS public.contribution_runs;
DROP TABLE IF EXISTS public.employees;
DROP TABLE IF EXISTS public.employers;

-- =============================================================================
-- End of 0034_employer_schema_and_rls.down.sql
-- =============================================================================
