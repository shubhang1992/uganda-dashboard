-- =============================================================================
-- Universal Pensions Uganda — 0035: employer write/read RPCs
-- =============================================================================
-- Second half of the Employer backend (Phase 0). Five SECURITY DEFINER RPCs,
-- each gated on `auth.jwt() ->> 'app_role' = 'employer'` and scoped to the
-- caller's `auth.jwt() ->> 'employerId'`. The structural template is the
-- existing apply_settlement RPC (0032): role gate → nonce short-circuit → loop
-- jsonb_array_elements → per-row ownership check → inline writes → nonce ledger
-- → jsonb summary.
--
-- CONVENTIONS (CLAUDE.md / BACKEND.md, mirroring 0032):
--   * LANGUAGE plpgsql; reads (get_employer_metrics) are STABLE.
--   * SECURITY DEFINER + `SET search_path = public, pg_temp`.
--   * Role read via (SELECT auth.jwt()) ->> 'app_role' (NEVER 'role').
--   * REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated.
--   * `updated_at` set inline (no shared trigger in this repo).
--   * Forward-only; reversible via 0035_employer_rpcs.down.sql.
--   * Applied to live (employer ship 2026-06-03); part of the 0001→0042 restore baseline.
--
-- ⚠️ HARD CONSTRAINT (plan deep dive §A.5): submit_contribution_run MUST NOT
--    write to `transactions`, `subscriber_balances`, or `commissions`.
--    Employees are NOT subscribers — inserting a transaction with
--    subscriber_id = employeeId would (a) FK-fail against subscribers(id) and
--    (b) fire trg_transactions_contribution, which mutates subscriber_balances
--    AND creates an agent commission on first contribution. Both are forbidden
--    by the standalone-roster / no-commission decision. Employer balances live
--    on `employees` and are bumped inline by this RPC itself. There is no
--    commission code path reachable from any function in this file.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- submit_contribution_run(p_rows jsonb, p_period_label text, p_method text,
--                         p_nonce text) RETURNS jsonb
-- -----------------------------------------------------------------------------
-- Employer-only. p_rows is a JSON array of objects, one per employee:
--   { "employeeId": text }   (any client-supplied amounts are ADVISORY and are
--                              IGNORED — the server re-derives every figure).
-- p_nonce is an optional per-upload idempotency key.
--
-- For each row:
--   * Verify the employee belongs to the caller's employer (skip 'not_owned'
--     otherwise — never funds another employer's staff).
--   * Skip 'not_found' / 'suspended' employees.
--   * RE-DERIVE amounts server-side from employees.salary + contribution_config
--     (NEVER trust client amounts):
--       employer_half = employerAmount ?? round(salary * employerPct/100)
--       employee_half = (mode='co-contribution')
--                         ? (employeeAmount ?? round(salary * employeePct/100))
--                         : 0
--   * Split each half across retirement/emergency by the employee's schedule
--     (contribution_schedule.retirementPct/emergencyPct, default 80/20 —
--     mirrors trg_transactions_contribution and contribution_schedules).
--   * INSERT the contribution_run_lines row; bump the employees balance columns
--     INLINE (retirement_balance / emergency_balance / net_balance /
--     units_held @ UGX 1,000/unit / total_contributions).
--   * Accumulate the run totals.
-- After the loop: INSERT one contribution_runs header, write the nonce ledger.
--
-- Returns { runId, linesCreated, employerTotal, employeeTotal, grandTotal,
--           skipped: [{ employeeId, reason }] }.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_contribution_run(
  p_rows         jsonb,
  p_period_label text DEFAULT NULL,
  p_method       text DEFAULT NULL,
  p_nonce        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role           text := (SELECT auth.jwt()) ->> 'app_role';
  v_employer_id    text := (SELECT auth.jwt()) ->> 'employerId';
  v_unit_price     numeric := 1000;       -- UGX/unit (matches the contribution trigger)
  v_row            jsonb;
  v_employee_id    text;
  v_emp            record;
  v_config         jsonb;
  v_mode           text;
  v_employer_half  numeric;
  v_employee_half  numeric;
  v_gross          numeric;               -- employer_half + employee_half for this employee
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
    RAISE EXCEPTION 'role % cannot submit a contribution run', v_role
      USING ERRCODE = 'P0001';
  END IF;

  IF v_employer_id IS NULL OR v_employer_id = '' THEN
    RAISE EXCEPTION 'missing employerId claim'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  -- Idempotency short-circuit: a replay of the same nonce returns the prior
  -- result without re-recording / re-funding anything (parallel to
  -- apply_settlement's settlement_uploads ledger).
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    SELECT result INTO v_prior FROM public.contribution_run_uploads WHERE nonce = p_nonce;
    IF v_prior IS NOT NULL THEN
      RETURN v_prior;
    END IF;
  END IF;

  -- Pre-mint the run id so each line can reference it. Only persisted if at
  -- least one line is created (see the linesCreated guard at the end).
  v_run_id := 'run-' || replace(gen_random_uuid()::text, '-', '');

  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    v_employee_id := v_row ->> 'employeeId';

    IF v_employee_id IS NULL OR v_employee_id = '' THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('employeeId', v_employee_id, 'reason', 'missing_employee_id')
      );
      CONTINUE;
    END IF;

    -- Ownership + status check: lock the row so concurrent runs serialise on
    -- the same employee (the inline balance bump must not interleave).
    SELECT * INTO v_emp
      FROM public.employees
     WHERE id = v_employee_id
     FOR UPDATE;

    IF NOT FOUND THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('employeeId', v_employee_id, 'reason', 'not_found')
      );
      CONTINUE;
    END IF;

    -- Never fund another employer's staff — the core RLS-equivalent guard
    -- inside the DEFINER context (which bypasses RLS).
    IF v_emp.employer_id IS DISTINCT FROM v_employer_id THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('employeeId', v_employee_id, 'reason', 'not_owned')
      );
      CONTINUE;
    END IF;

    IF v_emp.status IS DISTINCT FROM 'active' THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('employeeId', v_employee_id, 'reason', 'suspended')
      );
      CONTINUE;
    END IF;

    -- Re-derive amounts server-side from salary + config (NEVER trust client).
    v_config := COALESCE(v_emp.contribution_config, '{}'::jsonb);
    v_mode   := COALESCE(v_config ->> 'mode', 'employer-only');

    -- Employer half: explicit fixed amount wins, else pct of salary.
    IF (v_config ->> 'employerAmount') IS NOT NULL THEN
      v_employer_half := round((v_config ->> 'employerAmount')::numeric);
    ELSE
      v_employer_half := round(
        COALESCE(v_emp.salary, 0) * COALESCE((v_config ->> 'employerPct')::numeric, 0) / 100
      );
    END IF;

    -- Employee half: only in co-contribution mode; explicit amount else pct.
    IF v_mode = 'co-contribution' THEN
      IF (v_config ->> 'employeeAmount') IS NOT NULL THEN
        v_employee_half := round((v_config ->> 'employeeAmount')::numeric);
      ELSE
        v_employee_half := round(
          COALESCE(v_emp.salary, 0) * COALESCE((v_config ->> 'employeePct')::numeric, 0) / 100
        );
      END IF;
    ELSE
      v_employee_half := 0;
    END IF;

    v_gross := v_employer_half + v_employee_half;

    -- Nothing to fund for this employee — skip rather than write a zero line.
    IF v_gross <= 0 THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('employeeId', v_employee_id, 'reason', 'zero_contribution')
      );
      CONTINUE;
    END IF;

    -- Retirement/emergency split of the GROSS, by the employee's schedule
    -- (default 80/20). emergency = gross - retirement avoids penny drift —
    -- same technique as trg_transactions_contribution.
    v_ret_pct := COALESCE((v_emp.contribution_schedule ->> 'retirementPct')::numeric, 80);
    v_emg_pct := COALESCE((v_emp.contribution_schedule ->> 'emergencyPct')::numeric, 100 - v_ret_pct);
    IF v_ret_pct IS NULL OR v_ret_pct < 0 OR v_ret_pct > 100 THEN
      v_ret_pct := 80;
    END IF;
    v_retirement := round(v_gross * v_ret_pct / 100);
    v_emergency  := v_gross - v_retirement;

    -- Record the per-employee line (doubles as the employee's contribution
    -- ledger — employees are NOT in `transactions`).
    v_line_id := 'crl-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.contribution_run_lines (
      id, run_id, employee_id, employer_amount, employee_amount,
      retirement_amount, emergency_amount, method
    ) VALUES (
      v_line_id, v_run_id, v_employee_id, v_employer_half, v_employee_half,
      v_retirement, v_emergency, p_method
    );

    -- Bump the employee balances INLINE (no trigger on `employees`). This is
    -- the ONLY balance write — nothing touches subscriber_balances.
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

  -- Persist the run header only if it actually funded someone.
  IF v_lines_created > 0 THEN
    INSERT INTO public.contribution_runs (
      id, employer_id, period_label, status,
      employer_total, employee_total, grand_total, run_at
    ) VALUES (
      v_run_id, v_employer_id, p_period_label, 'completed',
      v_employer_total, v_employee_total, v_grand_total, now()
    );
  ELSE
    -- No lines → no run header. Null out the run id in the result so callers
    -- don't dangle a reference to a header that was never written.
    v_run_id := NULL;
  END IF;

  v_result := jsonb_build_object(
    'runId',         v_run_id,
    'linesCreated',  v_lines_created,
    'employerTotal', v_employer_total,
    'employeeTotal', v_employee_total,
    'grandTotal',    v_grand_total,
    'skipped',       v_skipped
  );

  -- Persist the result against the nonce so a future sequential replay
  -- short-circuits (mirrors apply_settlement's ledger write).
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    INSERT INTO public.contribution_run_uploads (nonce, result)
    VALUES (p_nonce, v_result)
    ON CONFLICT (nonce) DO NOTHING;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_contribution_run(jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_contribution_run(jsonb, text, text, text) TO authenticated;


-- -----------------------------------------------------------------------------
-- update_employee_contribution_config(p_employee_id text, p_config jsonb)
--   RETURNS jsonb
-- -----------------------------------------------------------------------------
-- Employer-only. Validates the employee belongs to the caller, replaces the
-- contribution_config, returns the updated row as jsonb.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_employee_contribution_config(
  p_employee_id text,
  p_config      jsonb
)
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
    RAISE EXCEPTION 'role % cannot update an employee config', v_role
      USING ERRCODE = 'P0001';
  END IF;

  SELECT employer_id INTO v_owner FROM public.employees WHERE id = p_employee_id;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM v_employer_id THEN
    RAISE EXCEPTION 'employee % not owned by employer %', p_employee_id, v_employer_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.employees
     SET contribution_config = COALESCE(p_config, '{}'::jsonb),
         updated_at          = now()
   WHERE id = p_employee_id
  RETURNING to_jsonb(employees.*) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_employee_contribution_config(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_employee_contribution_config(text, jsonb) TO authenticated;


-- -----------------------------------------------------------------------------
-- update_employee_insurance(p_employee_id text, p_cover numeric,
--                           p_premium numeric) RETURNS jsonb
-- -----------------------------------------------------------------------------
-- Employer-only. Sets cover + monthly premium; insurance_status derives from
-- cover (>0 → 'active'). Returns the updated row.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_employee_insurance(
  p_employee_id text,
  p_cover       numeric,
  p_premium     numeric
)
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
    RAISE EXCEPTION 'role % cannot update employee insurance', v_role
      USING ERRCODE = 'P0001';
  END IF;

  SELECT employer_id INTO v_owner FROM public.employees WHERE id = p_employee_id;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM v_employer_id THEN
    RAISE EXCEPTION 'employee % not owned by employer %', p_employee_id, v_employer_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.employees
     SET insurance_cover           = COALESCE(p_cover, 0),
         insurance_premium_monthly = COALESCE(p_premium, 0),
         insurance_status          = CASE WHEN COALESCE(p_cover, 0) > 0
                                          THEN 'active' ELSE 'inactive' END,
         updated_at                = now()
   WHERE id = p_employee_id
  RETURNING to_jsonb(employees.*) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_employee_insurance(text, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_employee_insurance(text, numeric, numeric) TO authenticated;


-- -----------------------------------------------------------------------------
-- update_employer_profile(p_patch jsonb) RETURNS jsonb
-- -----------------------------------------------------------------------------
-- Employer-only. Patches the caller's own employers row. Only the editable
-- profile/config columns are honoured (id / timestamps are never patched).
-- Returns the updated row.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_employer_profile(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role        text := (SELECT auth.jwt()) ->> 'app_role';
  v_employer_id text := (SELECT auth.jwt()) ->> 'employerId';
  v_result      jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'employer' THEN
    RAISE EXCEPTION 'role % cannot update an employer profile', v_role
      USING ERRCODE = 'P0001';
  END IF;

  IF v_employer_id IS NULL OR v_employer_id = '' THEN
    RAISE EXCEPTION 'missing employerId claim'
      USING ERRCODE = 'P0001';
  END IF;

  p_patch := COALESCE(p_patch, '{}'::jsonb);

  UPDATE public.employers
     SET name                        = COALESCE(p_patch ->> 'name', name),
         sector                      = COALESCE(p_patch ->> 'sector', sector),
         registration_no             = COALESCE(p_patch ->> 'registrationNo', registration_no),
         contact_name                = COALESCE(p_patch ->> 'contactName', contact_name),
         contact_phone               = COALESCE(p_patch ->> 'contactPhone', contact_phone),
         contact_email               = COALESCE(p_patch ->> 'contactEmail', contact_email),
         district                    = COALESCE(p_patch ->> 'district', district),
         payroll_cadence             = COALESCE(p_patch ->> 'payrollCadence', payroll_cadence),
         default_contribution_config = COALESCE(p_patch -> 'defaultContributionConfig', default_contribution_config),
         updated_at                  = now()
   WHERE id = v_employer_id
  RETURNING to_jsonb(employers.*) INTO v_result;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'employer % not found', v_employer_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_employer_profile(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_employer_profile(jsonb) TO authenticated;


-- -----------------------------------------------------------------------------
-- get_employer_metrics() RETURNS jsonb (STABLE)
-- -----------------------------------------------------------------------------
-- Aggregates for the hero/overview, scoped to the caller's employer. Mirrors
-- the STABLE SECURITY DEFINER shape of get_entity_commission_summary.
--   { headcount, active, suspended, totalBalance, totalContributions,
--     employerYtd, employeeYtd, insuredCount,
--     modeSplit: { coContribution, employerOnly } }
-- "YTD" = sum over contribution_runs in the current calendar year.
-- -----------------------------------------------------------------------------
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
    RAISE EXCEPTION 'role % cannot read employer metrics', v_role
      USING ERRCODE = 'P0001';
  END IF;

  IF v_employer_id IS NULL OR v_employer_id = '' THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT
    COUNT(*)                                                          AS headcount,
    COUNT(*) FILTER (WHERE status = 'active')                         AS active,
    COUNT(*) FILTER (WHERE status = 'suspended')                      AS suspended,
    COALESCE(SUM(net_balance), 0)                                     AS total_balance,
    COALESCE(SUM(total_contributions), 0)                            AS total_contributions,
    COUNT(*) FILTER (WHERE insurance_status = 'active')               AS insured_count,
    COUNT(*) FILTER (WHERE contribution_config ->> 'mode' = 'co-contribution')
                                                                      AS co_contribution,
    COUNT(*) FILTER (WHERE COALESCE(contribution_config ->> 'mode', 'employer-only') <> 'co-contribution')
                                                                      AS employer_only
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

-- =============================================================================
-- End of 0035_employer_rpcs.sql
-- =============================================================================
