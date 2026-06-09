-- =============================================================================
-- DOWN — 0044_employer_subscriber_rpcs.sql
-- =============================================================================
-- Drops the two new RPCs and restores get_employer_metrics / apply_group_insurance
-- to their 0035 / 0039 (employees-based) bodies. NOTE: a full rollback must run
-- 0045.down FIRST so the `employees` table these restored bodies reference exists.
-- =============================================================================

DROP FUNCTION IF EXISTS public.create_subscriber_from_employer_onboard(jsonb, text, text);
DROP FUNCTION IF EXISTS public.submit_employer_contribution_run(text, text, text);

-- Restore get_employer_metrics (0035 — over employees).
CREATE OR REPLACE FUNCTION public.get_employer_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role        text := (SELECT auth.jwt()) ->> 'app_role';
  v_employer_id text := (SELECT auth.jwt()) ->> 'employerId';
  v_result      jsonb;
  v_emp         record;
  v_runs        record;
BEGIN
  IF v_role IS DISTINCT FROM 'employer' THEN
    RAISE EXCEPTION 'role % cannot read employer metrics', v_role USING ERRCODE = 'P0001';
  END IF;
  IF v_employer_id IS NULL OR v_employer_id = '' THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT
    COUNT(*)                                                          AS headcount,
    COUNT(*) FILTER (WHERE status = 'active')                         AS active,
    COUNT(*) FILTER (WHERE status = 'suspended')                      AS suspended,
    COALESCE(SUM(net_balance), 0)                                     AS total_balance,
    COALESCE(SUM(total_contributions), 0)                             AS total_contributions,
    COUNT(*) FILTER (WHERE insurance_status = 'active')               AS insured_count,
    COUNT(*) FILTER (WHERE contribution_config ->> 'mode' = 'co-contribution') AS co_contribution,
    COUNT(*) FILTER (WHERE COALESCE(contribution_config ->> 'mode', 'employer-only') <> 'co-contribution') AS employer_only
    INTO v_emp
    FROM public.employees
   WHERE employer_id = v_employer_id;

  SELECT
    COALESCE(SUM(employer_total), 0) AS employer_ytd,
    COALESCE(SUM(employee_total), 0) AS employee_ytd
    INTO v_runs
    FROM public.contribution_runs
   WHERE employer_id = v_employer_id
     AND date_part('year', run_at) = date_part('year', now());

  v_result := jsonb_build_object(
    'headcount',          COALESCE(v_emp.headcount, 0),
    'active',             COALESCE(v_emp.active, 0),
    'suspended',          COALESCE(v_emp.suspended, 0),
    'totalBalance',       COALESCE(v_emp.total_balance, 0),
    'totalContributions', COALESCE(v_emp.total_contributions, 0),
    'insuredCount',       COALESCE(v_emp.insured_count, 0),
    'employerYtd',        COALESCE(v_runs.employer_ytd, 0),
    'employeeYtd',        COALESCE(v_runs.employee_ytd, 0),
    'modeSplit', jsonb_build_object(
      'coContribution', COALESCE(v_emp.co_contribution, 0),
      'employerOnly',   COALESCE(v_emp.employer_only, 0)
    )
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_employer_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_employer_metrics() TO authenticated;

-- Restore apply_group_insurance (0039 — over employees).
CREATE OR REPLACE FUNCTION public.apply_group_insurance(p_cover numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role        text := (SELECT auth.jwt()) ->> 'app_role';
  v_employer_id text := (SELECT auth.jwt()) ->> 'employerId';
  v_updated     integer := 0;
BEGIN
  IF v_role IS DISTINCT FROM 'employer' THEN
    RAISE EXCEPTION 'role % cannot apply group insurance', v_role USING ERRCODE = 'P0001';
  END IF;
  IF v_employer_id IS NULL OR v_employer_id = '' THEN
    RAISE EXCEPTION 'missing employerId claim' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.employees
     SET insurance_cover           = round(COALESCE(p_cover, 0)),
         insurance_status          = CASE WHEN COALESCE(p_cover, 0) > 0 THEN 'active' ELSE 'inactive' END,
         insurance_premium_monthly = 0,
         updated_at                = now()
   WHERE employer_id = v_employer_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_updated, 'cover', COALESCE(p_cover, 0));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_group_insurance(numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.apply_group_insurance(numeric) TO authenticated, service_role;

-- =============================================================================
-- End of 0044_employer_subscriber_rpcs.down.sql
-- =============================================================================
