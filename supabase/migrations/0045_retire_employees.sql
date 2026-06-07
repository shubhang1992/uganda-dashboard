-- =============================================================================
-- Universal Pensions Uganda — 0045: retire the standalone employees machinery
-- =============================================================================
-- The employer roster is now unified into subscribers (0043/0044): an employer's
-- staff are tagged subscribers, funded via real `transactions` (source='employer')
-- by submit_employer_contribution_run. The standalone `employees` /
-- `contribution_run_lines` tables and the employee-scoped RPCs are now dead — drop
-- them. `contribution_runs` is KEPT (re-pointed to the employer-source ledger);
-- `contribution_run_uploads` is KEPT (run idempotency).
--
-- Safe for this demo platform: the new path lands first (0044), and the DB is
-- reseeded after the cutover. Reversible via the .down.sql (restores tables +
-- RLS + the three RPC bodies from 0034 / 0035 / 0037 / 0038).
--
-- Ordering: MUST run AFTER 0044 (the replacement RPCs exist before the drops).
-- =============================================================================

-- 1) Drop the employee-scoped RPCs (they reference public.employees by name).
DROP FUNCTION IF EXISTS public.submit_contribution_run(jsonb, text, text, text);
DROP FUNCTION IF EXISTS public.update_employee_contribution_config(text, jsonb);
DROP FUNCTION IF EXISTS public.update_employee_insurance(text, numeric, numeric);

-- 2) Drop the per-employee ledger first (FK → employees + contribution_runs),
--    then the roster table. contribution_runs / contribution_run_uploads stay.
DROP TABLE IF EXISTS public.contribution_run_lines;
DROP TABLE IF EXISTS public.employees;

-- =============================================================================
-- End of 0045_retire_employees.sql
-- =============================================================================
