-- =============================================================================
-- Universal Pensions Uganda — 0049: admin role (platform-wide RLS + create RPCs)
-- =============================================================================
-- Lands the backend for the 6th and final role: the head-office **admin** with
-- global rights. The admin dashboard reuses the distributor's map-theme shell,
-- so the admin needs the same "see-everything" read access the distributor
-- already has, PLUS read access to the employer family (currently employer-
-- scoped) and two create RPCs (distributors + employers).
--
-- WHY THIS IS SMALL: the distributor SELECT policies (0007) carry NO id filter
-- (`USING ((SELECT auth.jwt()) ->> 'app_role' = 'distributor')`), so the
-- distributor is already a platform-wide read role. The frontend data services
-- are role-blind — RLS does all scoping. Cloning those policies under
-- `app_role = 'admin'` makes the entire map dashboard work for admin with zero
-- frontend data-layer changes.
--
-- CONVENTIONS (mirroring 0007 / 0008 / 0044):
--   * RLS HARD RULE (CLAUDE.md §5.7): read `(SELECT auth.jwt()) ->> 'app_role'`
--     (NEVER 'role' — that returns the Postgres role 'authenticated'). The
--     (SELECT ...) wrapper is the 0008 initplan optimisation.
--   * SELECT-only policies; WRITES go through SECURITY DEFINER RPCs (no client
--     INSERT/UPDATE/DELETE policy — same stance as 0034).
--   * RPCs: LANGUAGE plpgsql; SECURITY DEFINER + SET search_path = public,
--     pg_temp; REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO authenticated; gate on
--     app_role='admin'. SECURITY DEFINER bypasses RLS, so no admin INSERT policy
--     on distributors/employers is needed.
--   * DROP-then-CREATE policies so a replay converges (CREATE POLICY isn't
--     idempotent). Forward-only; reversible via 0049_admin_role.down.sql.
--
-- SCOPE NOTE: `settlement_runs` / `settlement_run_branch_reviews` were dropped
-- in the 0029 commission simplification — not referenced here. `employees` is
-- the deprecated standalone roster (retired in 0045); the live employer model
-- is tagged subscribers (0043), which admin already reads via the subscriber
-- clone below — so `employees` is intentionally omitted.
-- =============================================================================

-- =============================================================================
-- 1) Admin SELECT policies — clone the distributor "see-everything" grant.
-- =============================================================================
-- One policy per table the distributor can already read. Reference tables
-- (regions/districts/branches/agents/commission_config/demo_personas) gate on
-- `app_role IS NOT NULL` and `distributors` is `USING (true)` — admin already
-- passes those, so they get no new policy.

DROP POLICY IF EXISTS subscribers_select_admin ON public.subscribers;
CREATE POLICY subscribers_select_admin ON public.subscribers
  FOR SELECT USING ((SELECT auth.jwt()) ->> 'app_role' = 'admin');

DROP POLICY IF EXISTS subscriber_balances_select_admin ON public.subscriber_balances;
CREATE POLICY subscriber_balances_select_admin ON public.subscriber_balances
  FOR SELECT USING ((SELECT auth.jwt()) ->> 'app_role' = 'admin');

DROP POLICY IF EXISTS contribution_schedules_select_admin ON public.contribution_schedules;
CREATE POLICY contribution_schedules_select_admin ON public.contribution_schedules
  FOR SELECT USING ((SELECT auth.jwt()) ->> 'app_role' = 'admin');

DROP POLICY IF EXISTS insurance_policies_select_admin ON public.insurance_policies;
CREATE POLICY insurance_policies_select_admin ON public.insurance_policies
  FOR SELECT USING ((SELECT auth.jwt()) ->> 'app_role' = 'admin');

DROP POLICY IF EXISTS nominees_select_admin ON public.nominees;
CREATE POLICY nominees_select_admin ON public.nominees
  FOR SELECT USING ((SELECT auth.jwt()) ->> 'app_role' = 'admin');

DROP POLICY IF EXISTS transactions_select_admin ON public.transactions;
CREATE POLICY transactions_select_admin ON public.transactions
  FOR SELECT USING ((SELECT auth.jwt()) ->> 'app_role' = 'admin');

DROP POLICY IF EXISTS claims_select_admin ON public.claims;
CREATE POLICY claims_select_admin ON public.claims
  FOR SELECT USING ((SELECT auth.jwt()) ->> 'app_role' = 'admin');

DROP POLICY IF EXISTS withdrawals_select_admin ON public.withdrawals;
CREATE POLICY withdrawals_select_admin ON public.withdrawals
  FOR SELECT USING ((SELECT auth.jwt()) ->> 'app_role' = 'admin');

DROP POLICY IF EXISTS commissions_select_admin ON public.commissions;
CREATE POLICY commissions_select_admin ON public.commissions
  FOR SELECT USING ((SELECT auth.jwt()) ->> 'app_role' = 'admin');

DROP POLICY IF EXISTS settlement_batches_select_admin ON public.settlement_batches;
CREATE POLICY settlement_batches_select_admin ON public.settlement_batches
  FOR SELECT USING ((SELECT auth.jwt()) ->> 'app_role' = 'admin');

DROP POLICY IF EXISTS notifications_select_admin ON public.notifications;
CREATE POLICY notifications_select_admin ON public.notifications
  FOR SELECT USING ((SELECT auth.jwt()) ->> 'app_role' = 'admin');

DROP POLICY IF EXISTS users_select_admin ON public.users;
CREATE POLICY users_select_admin ON public.users
  FOR SELECT USING ((SELECT auth.jwt()) ->> 'app_role' = 'admin');

DROP POLICY IF EXISTS agent_referrals_select_admin ON public.agent_referrals;
CREATE POLICY agent_referrals_select_admin ON public.agent_referrals
  FOR SELECT USING ((SELECT auth.jwt()) ->> 'app_role' = 'admin');

DROP POLICY IF EXISTS contact_submissions_select_admin ON public.contact_submissions;
CREATE POLICY contact_submissions_select_admin ON public.contact_submissions
  FOR SELECT USING ((SELECT auth.jwt()) ->> 'app_role' = 'admin');

-- =============================================================================
-- 2) Admin SELECT policies — employer family (currently employer-scoped).
-- =============================================================================
-- The employer's own SELECT policies are scoped to its `employerId`. Admin gets
-- an unscoped clone so it can list/inspect every employer + their runs.

DROP POLICY IF EXISTS employers_select_admin ON public.employers;
CREATE POLICY employers_select_admin ON public.employers
  FOR SELECT USING ((SELECT auth.jwt()) ->> 'app_role' = 'admin');

DROP POLICY IF EXISTS contribution_runs_select_admin ON public.contribution_runs;
CREATE POLICY contribution_runs_select_admin ON public.contribution_runs
  FOR SELECT USING ((SELECT auth.jwt()) ->> 'app_role' = 'admin');

DROP POLICY IF EXISTS contribution_run_lines_select_admin ON public.contribution_run_lines;
CREATE POLICY contribution_run_lines_select_admin ON public.contribution_run_lines
  FOR SELECT USING ((SELECT auth.jwt()) ->> 'app_role' = 'admin');

DROP POLICY IF EXISTS employer_invites_select_admin ON public.employer_invites;
CREATE POLICY employer_invites_select_admin ON public.employer_invites
  FOR SELECT USING ((SELECT auth.jwt()) ->> 'app_role' = 'admin');

-- =============================================================================
-- 3) create_distributor — admin-only SECURITY DEFINER write.
-- =============================================================================
-- The distributors table has no client INSERT policy (0016); this RPC is the
-- only create path. Returns the new row as jsonb (snake_case) for the service
-- layer's mapDistributor() to consume.
CREATE OR REPLACE FUNCTION public.create_distributor(
  p_name          text,
  p_manager_name  text DEFAULT NULL,
  p_manager_phone text DEFAULT NULL,
  p_manager_email text DEFAULT NULL,
  p_parent_id     text DEFAULT 'ug'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := (SELECT auth.jwt()) ->> 'app_role';
  v_id   text;
  v_row  public.distributors%ROWTYPE;
BEGIN
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'role % cannot create a distributor', v_role USING ERRCODE = 'P0001';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'distributor name is required' USING ERRCODE = 'P0001';
  END IF;

  v_id := 'd-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.distributors (
    id, name, parent_id, manager_name, manager_phone, manager_email, status
  ) VALUES (
    v_id, btrim(p_name), COALESCE(NULLIF(btrim(p_parent_id), ''), 'ug'),
    p_manager_name, p_manager_phone, p_manager_email, 'active'
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.create_distributor(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_distributor(text, text, text, text, text) TO authenticated;

-- =============================================================================
-- 4) create_employer — admin-only SECURITY DEFINER write.
-- =============================================================================
-- Mirrors create_distributor. Columns match the employers table (0034). Returns
-- the new row as jsonb (snake_case) for the service layer's mapEmployer().
CREATE OR REPLACE FUNCTION public.create_employer(
  p_name                        text,
  p_sector                      text  DEFAULT NULL,
  p_registration_no             text  DEFAULT NULL,
  p_contact_name                text  DEFAULT NULL,
  p_contact_phone               text  DEFAULT NULL,
  p_contact_email               text  DEFAULT NULL,
  p_district                    text  DEFAULT NULL,
  p_payroll_cadence             text  DEFAULT NULL,
  p_default_contribution_config jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := (SELECT auth.jwt()) ->> 'app_role';
  v_id   text;
  v_row  public.employers%ROWTYPE;
BEGIN
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'role % cannot create an employer', v_role USING ERRCODE = 'P0001';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'employer name is required' USING ERRCODE = 'P0001';
  END IF;

  v_id := 'emp-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.employers (
    id, name, sector, registration_no, contact_name, contact_phone,
    contact_email, district, payroll_cadence, default_contribution_config
  ) VALUES (
    v_id, btrim(p_name), p_sector, p_registration_no, p_contact_name, p_contact_phone,
    p_contact_email, p_district, p_payroll_cadence,
    COALESCE(p_default_contribution_config, '{}'::jsonb)
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.create_employer(text, text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_employer(text, text, text, text, text, text, text, text, jsonb) TO authenticated;

-- =============================================================================
-- 5) get_all_employers_metrics — admin-only roster rollup across ALL employers.
-- =============================================================================
-- get_employer_metrics() (0044) is scoped to the JWT employerId. The admin needs
-- a per-employer rollup over EVERY employer for the ViewEmployers list. Computed
-- over tagged subscribers (the live employer model, 0043). Scalar subqueries per
-- employer (employer count is tiny) keep the contribution/balance aggregates
-- from fanning out against each other.
CREATE OR REPLACE FUNCTION public.get_all_employers_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role   text := (SELECT auth.jwt()) ->> 'app_role';
  v_result jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'role % cannot read all employer metrics', v_role USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(jsonb_agg(m ORDER BY m.name), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT
      e.id,
      e.name,
      e.sector,
      e.district,
      e.payroll_cadence                                        AS "payrollCadence",
      e.created_at                                             AS "createdAt",
      (SELECT count(*) FROM public.subscribers s
         WHERE s.employer_id = e.id)                           AS headcount,
      (SELECT count(*) FROM public.subscribers s
         WHERE s.employer_id = e.id AND s.is_active)           AS "activeCount",
      (SELECT COALESCE(sum(b.total_balance), 0)
         FROM public.subscriber_balances b
         JOIN public.subscribers s ON s.id = b.subscriber_id
        WHERE s.employer_id = e.id)                            AS "totalBalance",
      (SELECT COALESCE(sum(t.amount), 0)
         FROM public.transactions t
         JOIN public.subscribers s ON s.id = t.subscriber_id
        WHERE s.employer_id = e.id
          AND t.type = 'contribution')                        AS "totalContributions",
      (SELECT COALESCE(sum(t.amount), 0)
         FROM public.transactions t
         JOIN public.subscribers s ON s.id = t.subscriber_id
        WHERE s.employer_id = e.id
          AND t.type = 'contribution'
          AND t.source = 'employer')                          AS "employerContributions",
      (SELECT count(*)
         FROM public.insurance_policies ip
         JOIN public.subscribers s ON s.id = ip.subscriber_id
        WHERE s.employer_id = e.id
          AND ip.status = 'active')                           AS "insuredCount"
    FROM public.employers e
  ) m;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_all_employers_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_employers_metrics() TO authenticated;

-- =============================================================================
-- End of 0049_admin_role.sql
-- =============================================================================
