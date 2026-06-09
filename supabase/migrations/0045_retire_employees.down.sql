-- =============================================================================
-- DOWN — 0045_retire_employees.sql
-- =============================================================================
-- Restores the standalone employees machinery: the `employees` (incl. the 0037
-- monthly_contribution column) and `contribution_run_lines` tables with their
-- indexes + RLS (from 0034), and the three employee-scoped RPCs
-- (submit_contribution_run @ 0042, update_employee_contribution_config @ 0035,
-- update_employee_insurance @ 0035). Run BEFORE 0044.down in a full rollback so
-- 0044.down's employees-based get_employer_metrics / apply_group_insurance bind.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- employees (0034 + 0037 monthly_contribution)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employees (
  id                        TEXT PRIMARY KEY,
  employer_id               TEXT NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  name                      TEXT NOT NULL,
  phone                     TEXT,
  email                     TEXT,
  gender                    TEXT,
  age                       INTEGER,
  nin                       TEXT,
  job_title                 TEXT,
  salary                    NUMERIC NOT NULL DEFAULT 0,
  monthly_contribution      NUMERIC NOT NULL DEFAULT 0,
  status                    TEXT NOT NULL DEFAULT 'active',
  joined_date               DATE,
  contribution_config       JSONB NOT NULL DEFAULT '{}'::jsonb,
  retirement_balance        NUMERIC NOT NULL DEFAULT 0,
  emergency_balance         NUMERIC NOT NULL DEFAULT 0,
  net_balance               NUMERIC NOT NULL DEFAULT 0,
  units_held                NUMERIC NOT NULL DEFAULT 0,
  total_contributions       NUMERIC NOT NULL DEFAULT 0,
  contribution_schedule     JSONB NOT NULL DEFAULT '{}'::jsonb,
  insurance_cover           NUMERIC NOT NULL DEFAULT 0,
  insurance_premium_monthly NUMERIC NOT NULL DEFAULT 0,
  insurance_status          TEXT NOT NULL DEFAULT 'inactive',
  insurance_renewal_date    DATE,
  nominees                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employees_employer_id_idx ON public.employees (employer_id);

CREATE TABLE IF NOT EXISTS public.contribution_run_lines (
  id                TEXT PRIMARY KEY,
  run_id            TEXT NOT NULL REFERENCES public.contribution_runs(id) ON DELETE CASCADE,
  employee_id       TEXT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employer_amount   NUMERIC NOT NULL DEFAULT 0,
  employee_amount   NUMERIC NOT NULL DEFAULT 0,
  retirement_amount NUMERIC NOT NULL DEFAULT 0,
  emergency_amount  NUMERIC NOT NULL DEFAULT 0,
  method            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contribution_run_lines_run_id_idx      ON public.contribution_run_lines (run_id);
CREATE INDEX IF NOT EXISTS contribution_run_lines_employee_id_idx ON public.contribution_run_lines (employee_id);

ALTER TABLE public.employees              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees              FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.contribution_run_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_run_lines FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employees_by_employer_select ON public.employees;
CREATE POLICY employees_by_employer_select ON public.employees
  FOR SELECT USING (
    auth.jwt() ->> 'app_role' = 'employer'
    AND employer_id = auth.jwt() ->> 'employerId'
  );

DROP POLICY IF EXISTS contribution_run_lines_by_employer_select ON public.contribution_run_lines;
CREATE POLICY contribution_run_lines_by_employer_select ON public.contribution_run_lines
  FOR SELECT USING (
    auth.jwt() ->> 'app_role' = 'employer'
    AND EXISTS (
      SELECT 1 FROM public.contribution_runs r
      WHERE r.id = contribution_run_lines.run_id
        AND r.employer_id = auth.jwt() ->> 'employerId'
    )
  );

-- -----------------------------------------------------------------------------
-- submit_contribution_run (restored from 0042 — employees-based)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_contribution_run(
  p_rows jsonb, p_period_label text DEFAULT NULL, p_method text DEFAULT NULL, p_nonce text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role           text := (SELECT auth.jwt()) ->> 'app_role';
  v_employer_id    text := (SELECT auth.jwt()) ->> 'employerId';
  v_unit_price     numeric := 1000;
  v_row            jsonb;
  v_employee_id    text;
  v_emp            record;
  v_config         jsonb;
  v_mode           text;
  v_match_pct      numeric;
  v_max_contrib    numeric;
  v_employer_half  numeric;
  v_employee_half  numeric;
  v_gross          numeric;
  v_ret_pct        numeric;
  v_emg_pct        numeric;
  v_retirement     numeric;
  v_emergency      numeric;
  v_run_id         text;
  v_line_id        text;
  v_lines_created  integer := 0;
  v_employer_total numeric := 0;
  v_employee_total numeric := 0;
  v_grand_total    numeric := 0;
  v_skipped        jsonb := '[]'::jsonb;
  v_prior          jsonb;
  v_result         jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'employer' THEN
    RAISE EXCEPTION 'role % cannot submit a contribution run', v_role USING ERRCODE = 'P0001';
  END IF;
  IF v_employer_id IS NULL OR v_employer_id = '' THEN
    RAISE EXCEPTION 'missing employerId claim' USING ERRCODE = 'P0001';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array' USING ERRCODE = '22023';
  END IF;

  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    SELECT result INTO v_prior FROM public.contribution_run_uploads WHERE nonce = p_nonce;
    IF v_prior IS NOT NULL THEN RETURN v_prior; END IF;
  END IF;

  v_run_id := 'run-' || replace(gen_random_uuid()::text, '-', '');

  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    v_employee_id := v_row ->> 'employeeId';
    IF v_employee_id IS NULL OR v_employee_id = '' THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('employeeId', v_employee_id, 'reason', 'missing_employee_id'));
      CONTINUE;
    END IF;

    SELECT * INTO v_emp FROM public.employees WHERE id = v_employee_id FOR UPDATE;
    IF NOT FOUND THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('employeeId', v_employee_id, 'reason', 'not_found'));
      CONTINUE;
    END IF;
    IF v_emp.employer_id IS DISTINCT FROM v_employer_id THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('employeeId', v_employee_id, 'reason', 'not_owned'));
      CONTINUE;
    END IF;
    IF v_emp.status IS DISTINCT FROM 'active' THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('employeeId', v_employee_id, 'reason', 'suspended'));
      CONTINUE;
    END IF;

    v_config := COALESCE(v_emp.contribution_config, '{}'::jsonb);
    v_mode   := COALESCE(v_config ->> 'mode', 'employer-only');

    IF v_mode = 'co-contribution' THEN
      v_match_pct := (v_config ->> 'matchPct')::numeric;
      IF v_match_pct IS NOT NULL THEN
        v_employee_half := round(COALESCE(v_emp.monthly_contribution, 0));
        v_employer_half := round(v_employee_half * v_match_pct / 100);
        v_max_contrib   := NULLIF((v_config ->> 'maxContribution'), '')::numeric;
        IF v_max_contrib IS NOT NULL THEN
          v_employer_half := LEAST(v_employer_half, round(v_max_contrib));
        END IF;
      ELSE
        IF (v_config ->> 'employerAmount') IS NOT NULL THEN
          v_employer_half := round((v_config ->> 'employerAmount')::numeric);
        ELSE
          v_employer_half := round(COALESCE(v_emp.salary, 0) * COALESCE((v_config ->> 'employerPct')::numeric, 0) / 100);
        END IF;
        IF (v_config ->> 'employeeAmount') IS NOT NULL THEN
          v_employee_half := round((v_config ->> 'employeeAmount')::numeric);
        ELSE
          v_employee_half := round(COALESCE(v_emp.salary, 0) * COALESCE((v_config ->> 'employeePct')::numeric, 0) / 100);
        END IF;
      END IF;
    ELSE
      IF (v_config ->> 'employerAmount') IS NOT NULL THEN
        v_employer_half := round((v_config ->> 'employerAmount')::numeric);
      ELSE
        v_employer_half := round(COALESCE(v_emp.salary, 0) * COALESCE((v_config ->> 'employerPct')::numeric, 0) / 100);
      END IF;
      v_employee_half := 0;
    END IF;

    v_gross := v_employer_half + v_employee_half;
    IF v_gross <= 0 THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('employeeId', v_employee_id, 'reason', 'zero_contribution'));
      CONTINUE;
    END IF;

    v_ret_pct := COALESCE((v_emp.contribution_schedule ->> 'retirementPct')::numeric, 80);
    v_emg_pct := COALESCE((v_emp.contribution_schedule ->> 'emergencyPct')::numeric, 100 - v_ret_pct);
    IF v_ret_pct IS NULL OR v_ret_pct < 0 OR v_ret_pct > 100 THEN v_ret_pct := 80; END IF;
    v_retirement := round(v_gross * v_ret_pct / 100);
    v_emergency  := v_gross - v_retirement;

    v_line_id := 'crl-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.contribution_run_lines (
      id, run_id, employee_id, employer_amount, employee_amount, retirement_amount, emergency_amount, method
    ) VALUES (
      v_line_id, v_run_id, v_employee_id, v_employer_half, v_employee_half, v_retirement, v_emergency, p_method
    );

    UPDATE public.employees
       SET retirement_balance  = retirement_balance  + v_retirement,
           emergency_balance   = emergency_balance   + v_emergency,
           net_balance         = net_balance         + v_gross,
           units_held          = units_held          + (v_gross / v_unit_price),
           total_contributions = total_contributions + v_gross,
           updated_at          = now()
     WHERE id = v_employee_id;

    v_lines_created  := v_lines_created + 1;
    v_employer_total := v_employer_total + v_employer_half;
    v_employee_total := v_employee_total + v_employee_half;
    v_grand_total    := v_grand_total + v_gross;
  END LOOP;

  IF v_lines_created > 0 THEN
    INSERT INTO public.contribution_runs (
      id, employer_id, period_label, status, employer_total, employee_total, grand_total, run_at
    ) VALUES (
      v_run_id, v_employer_id, p_period_label, 'completed', v_employer_total, v_employee_total, v_grand_total, now()
    );
  ELSE
    v_run_id := NULL;
  END IF;

  v_result := jsonb_build_object(
    'runId', v_run_id, 'linesCreated', v_lines_created, 'employerTotal', v_employer_total,
    'employeeTotal', v_employee_total, 'grandTotal', v_grand_total, 'skipped', v_skipped
  );

  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    INSERT INTO public.contribution_run_uploads (nonce, result) VALUES (p_nonce, v_result)
    ON CONFLICT (nonce) DO NOTHING;
  END IF;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_contribution_run(jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_contribution_run(jsonb, text, text, text) TO authenticated;

-- update_employee_contribution_config (restored from 0035)
CREATE OR REPLACE FUNCTION public.update_employee_contribution_config(p_employee_id text, p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role        text := (SELECT auth.jwt()) ->> 'app_role';
  v_employer_id text := (SELECT auth.jwt()) ->> 'employerId';
  v_owner       text;
  v_result      jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'employer' THEN
    RAISE EXCEPTION 'role % cannot update an employee config', v_role USING ERRCODE = 'P0001';
  END IF;
  SELECT employer_id INTO v_owner FROM public.employees WHERE id = p_employee_id;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM v_employer_id THEN
    RAISE EXCEPTION 'employee % not owned by employer %', p_employee_id, v_employer_id USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.employees SET contribution_config = COALESCE(p_config, '{}'::jsonb), updated_at = now()
   WHERE id = p_employee_id RETURNING to_jsonb(employees.*) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.update_employee_contribution_config(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_employee_contribution_config(text, jsonb) TO authenticated;

-- update_employee_insurance (restored from 0035)
CREATE OR REPLACE FUNCTION public.update_employee_insurance(p_employee_id text, p_cover numeric, p_premium numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role        text := (SELECT auth.jwt()) ->> 'app_role';
  v_employer_id text := (SELECT auth.jwt()) ->> 'employerId';
  v_owner       text;
  v_result      jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'employer' THEN
    RAISE EXCEPTION 'role % cannot update employee insurance', v_role USING ERRCODE = 'P0001';
  END IF;
  SELECT employer_id INTO v_owner FROM public.employees WHERE id = p_employee_id;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM v_employer_id THEN
    RAISE EXCEPTION 'employee % not owned by employer %', p_employee_id, v_employer_id USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.employees
     SET insurance_cover           = COALESCE(p_cover, 0),
         insurance_premium_monthly = COALESCE(p_premium, 0),
         insurance_status          = CASE WHEN COALESCE(p_cover, 0) > 0 THEN 'active' ELSE 'inactive' END,
         updated_at                = now()
   WHERE id = p_employee_id RETURNING to_jsonb(employees.*) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.update_employee_insurance(text, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_employee_insurance(text, numeric, numeric) TO authenticated;

-- =============================================================================
-- End of 0045_retire_employees.down.sql
-- =============================================================================
