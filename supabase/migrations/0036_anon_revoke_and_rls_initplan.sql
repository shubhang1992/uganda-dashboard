-- =============================================================================
-- Universal Pensions Uganda — 0036: anon EXECUTE revoke + RLS initplan wrap
-- =============================================================================
-- Apply at cutover AFTER 0032 (and 0033). Applied to live (employer ship 2026-06-03).
--
-- Forward-only, additive hardening. Creates no tables and changes no RPC body.
-- It (a) tightens which Postgres role may EXECUTE the write/admin RPCs, and
-- (b) wraps the four 0034 employer-domain RLS policies' `auth.jwt()` calls in a
-- scalar sub-select so they are evaluated once per query, not once per row.
-- Every statement is idempotent (to_regprocedure / DROP POLICY IF EXISTS
-- guards) so a replay converges, and each is reversed by the partner
-- 0036_anon_revoke_and_rls_initplan.down.sql.
--
-- Addresses two audit findings:
--
--   * M2 (supabase security advisor: "Public/Signed-In can execute SECURITY
--     DEFINER function") — the write/admin RPCs are EXECUTE-able by `anon` via
--     PostgREST's default PUBLIC grant. They already gate internally on the
--     `app_role` JWT claim, so this is defense-in-depth, not an open hole.
--     Restrict the WRITE/mutation RPCs to `authenticated` + `service_role`.
--     NOTE: the app calls these RPCs *as* `authenticated` post-login (PostgREST
--     does `SET ROLE authenticated`), so we GRANT to authenticated — we must
--     NOT revoke from it. `create_subscriber_from_signup` and `upsert_nominees`
--     are DELIBERATELY left on `anon`: signup runs before any JWT is minted
--     (`src/services/subscriber.js:createFromSignup` → JWT is minted only after
--     it returns), so revoking anon there would break the public signup flow.
--     Read-only rollups (get_employer_metrics / get_entity_metrics_rollup /
--     get_top_branch) are also left untouched.
--
--   * L2 (supabase performance advisor: auth_rls_initplan) — the four employer
--     policies added in 0034 call `auth.jwt()` unwrapped, so Postgres re-
--     evaluates it per row. Every other policy in the schema already uses the
--     `( SELECT auth.jwt() )` form (0023 onward); these four were missed. Wrap
--     them to match. Pure perf; the row-visibility logic is byte-equivalent.
--
-- CONVENTIONS (CLAUDE.md §5.7 / BACKEND.md):
--   * Policies read `auth.jwt() ->> 'app_role'/'employerId'`, never auth.uid().
--   * Idempotent DDL; forward-only; reversible via the .down.sql partner.
--   * Applied to live (employer ship 2026-06-03); part of the 0001→0042 restore baseline.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- M2 — restrict write/admin RPC EXECUTE to authenticated + service_role
-- -----------------------------------------------------------------------------
-- Each function is guarded by to_regprocedure(...) so a missing overload (e.g.
-- the 2-arg apply_settlement only exists after 0032) is skipped, not an error.
DO $$
DECLARE
  fn text;
  -- Only WRITE/mutation RPCs reached exclusively post-login. Signup-path
  -- functions (create_subscriber_from_signup, upsert_nominees) are excluded on
  -- purpose — see header.
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
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
      EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
    ELSE
      RAISE NOTICE '0036: % not found — skipping EXECUTE revoke', fn;
    END IF;
  END LOOP;
END
$$;

-- -----------------------------------------------------------------------------
-- L2 — wrap auth.jwt() in the four 0034 employer-domain policies
-- -----------------------------------------------------------------------------
-- DROP + CREATE each with the ( SELECT auth.jwt() ) form. Guarded on table
-- existence so a partial 0034 state is skipped rather than erroring.

-- employers.employer_self_select
DO $$
BEGIN
  IF to_regclass('public.employers') IS NOT NULL THEN
    DROP POLICY IF EXISTS employer_self_select ON public.employers;
    CREATE POLICY employer_self_select ON public.employers
      FOR SELECT
      USING (
        ((( SELECT auth.jwt() ) ->> 'app_role') = 'employer')
        AND (id = (( SELECT auth.jwt() ) ->> 'employerId'))
      );
  END IF;
END
$$;

-- employees.employees_by_employer_select
DO $$
BEGIN
  IF to_regclass('public.employees') IS NOT NULL THEN
    DROP POLICY IF EXISTS employees_by_employer_select ON public.employees;
    CREATE POLICY employees_by_employer_select ON public.employees
      FOR SELECT
      USING (
        ((( SELECT auth.jwt() ) ->> 'app_role') = 'employer')
        AND (employer_id = (( SELECT auth.jwt() ) ->> 'employerId'))
      );
  END IF;
END
$$;

-- contribution_runs.contribution_runs_by_employer_select
DO $$
BEGIN
  IF to_regclass('public.contribution_runs') IS NOT NULL THEN
    DROP POLICY IF EXISTS contribution_runs_by_employer_select ON public.contribution_runs;
    CREATE POLICY contribution_runs_by_employer_select ON public.contribution_runs
      FOR SELECT
      USING (
        ((( SELECT auth.jwt() ) ->> 'app_role') = 'employer')
        AND (employer_id = (( SELECT auth.jwt() ) ->> 'employerId'))
      );
  END IF;
END
$$;

-- contribution_run_lines.contribution_run_lines_by_employer_select
DO $$
BEGIN
  IF to_regclass('public.contribution_run_lines') IS NOT NULL THEN
    DROP POLICY IF EXISTS contribution_run_lines_by_employer_select ON public.contribution_run_lines;
    CREATE POLICY contribution_run_lines_by_employer_select ON public.contribution_run_lines
      FOR SELECT
      USING (
        ((( SELECT auth.jwt() ) ->> 'app_role') = 'employer')
        AND (EXISTS (
          SELECT 1
            FROM public.contribution_runs r
           WHERE r.id = contribution_run_lines.run_id
             AND r.employer_id = (( SELECT auth.jwt() ) ->> 'employerId')
        ))
      );
  END IF;
END
$$;

-- =============================================================================
-- End of 0036_anon_revoke_and_rls_initplan.sql
-- =============================================================================
