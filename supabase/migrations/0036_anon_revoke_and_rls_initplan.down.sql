-- =============================================================================
-- DOWN — 0036_anon_revoke_and_rls_initplan.down.sql
-- =============================================================================
-- Reverses 0036: re-grants EXECUTE to PUBLIC on the write/admin RPCs (restoring
-- PostgREST's default anon-callable state) and recreates the four 0034 employer
-- policies in their original UNWRAPPED auth.jwt() form. Idempotent + guarded.
-- =============================================================================

-- Restore PUBLIC EXECUTE on the write/admin RPCs.
DO $$
DECLARE
  fn text;
  write_rpcs text[] := ARRAY[
    'public.apply_settlement(jsonb, text)',
    'public.submit_contribution_run(jsonb, text, text, text)',
    'public.update_employee_contribution_config(text, jsonb)',
    'public.update_employee_insurance(text, numeric, numeric)',
    'public.update_employer_profile(jsonb)',
    'public.create_subscriber_from_agent_onboard(jsonb, text)',
    'public.mark_notifications_read(text[])'
  ];
BEGIN
  FOREACH fn IN ARRAY write_rpcs LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', fn);
    END IF;
  END LOOP;
END
$$;

-- Recreate the four employer policies in their original (unwrapped) form.
DO $$
BEGIN
  IF to_regclass('public.employers') IS NOT NULL THEN
    DROP POLICY IF EXISTS employer_self_select ON public.employers;
    CREATE POLICY employer_self_select ON public.employers
      FOR SELECT
      USING (
        ((auth.jwt() ->> 'app_role') = 'employer')
        AND (id = (auth.jwt() ->> 'employerId'))
      );
  END IF;

  IF to_regclass('public.employees') IS NOT NULL THEN
    DROP POLICY IF EXISTS employees_by_employer_select ON public.employees;
    CREATE POLICY employees_by_employer_select ON public.employees
      FOR SELECT
      USING (
        ((auth.jwt() ->> 'app_role') = 'employer')
        AND (employer_id = (auth.jwt() ->> 'employerId'))
      );
  END IF;

  IF to_regclass('public.contribution_runs') IS NOT NULL THEN
    DROP POLICY IF EXISTS contribution_runs_by_employer_select ON public.contribution_runs;
    CREATE POLICY contribution_runs_by_employer_select ON public.contribution_runs
      FOR SELECT
      USING (
        ((auth.jwt() ->> 'app_role') = 'employer')
        AND (employer_id = (auth.jwt() ->> 'employerId'))
      );
  END IF;

  IF to_regclass('public.contribution_run_lines') IS NOT NULL THEN
    DROP POLICY IF EXISTS contribution_run_lines_by_employer_select ON public.contribution_run_lines;
    CREATE POLICY contribution_run_lines_by_employer_select ON public.contribution_run_lines
      FOR SELECT
      USING (
        ((auth.jwt() ->> 'app_role') = 'employer')
        AND (EXISTS (
          SELECT 1
            FROM public.contribution_runs r
           WHERE r.id = contribution_run_lines.run_id
             AND r.employer_id = (auth.jwt() ->> 'employerId')
        ))
      );
  END IF;
END
$$;

-- =============================================================================
-- End of 0036_anon_revoke_and_rls_initplan.down.sql
-- =============================================================================
