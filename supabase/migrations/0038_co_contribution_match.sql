-- =============================================================================
-- Universal Pensions Uganda — 0038: co-contribution match model
-- =============================================================================
-- Funder-redesign (Phase 5) — switches the co-contribution math in the
-- submit_contribution_run RPC. PREVIOUS model: employer pays employerPct% of
-- salary AND employee pays employeePct% of salary (two independent % of salary).
-- NEW model (approved): the employer MATCHES a % of each employee's OWN monthly
-- contribution (employees.monthly_contribution, added in 0037), capped by an
-- optional fixed UGX maximum on the employer top-up.
--
--   co (matchPct present):
--     employee_half = round(monthly_contribution)              -- own saving
--     employer_half = round(employee_half * matchPct / 100)
--     employer_half = LEAST(employer_half, round(maxContribution)) when set
--   co (legacy, employeePct present, no matchPct):  DUAL-READ back-compat —
--     employer_half = employerAmount ?? round(salary * employerPct/100)
--     employee_half = employeeAmount ?? round(salary * employeePct/100)
--     (keeps any un-migrated live row from zeroing out during cutover.)
--   employer-only (unchanged):
--     employer_half = employerAmount ?? round(salary * employerPct/100)
--     employee_half = 0
--
-- The 80/20 retirement/emergency split, the employerId JWT-claim gate, the
-- nonce idempotency ledger, totals accumulation, and the inline employee
-- balance/units bump are BYTE-IDENTICAL to 0035 — only the per-employee
-- co-contribution branch changes. The full ⚠️ HARD CONSTRAINT from 0035 still
-- holds (this RPC NEVER writes transactions / subscriber_balances /
-- commissions — employer balances live on `employees`).
--
-- CONVENTIONS (mirroring 0035 / 0036 / 0037):
--   * LANGUAGE plpgsql; SECURITY DEFINER + `SET search_path = public, pg_temp`.
--   * Role read via (SELECT auth.jwt()) ->> 'app_role' (NEVER 'role').
--   * Scoped to the caller's (SELECT auth.jwt()) ->> 'employerId'.
--   * Same signature — CREATE OR REPLACE keeps the existing REVOKE/GRANT.
--   * Forward-only; reversible via 0038_co_contribution_match.down.sql (which
--     restores the original salary-based body from 0035).
--   * NOT YET APPLIED TO LIVE — applying it is a gated cutover step.
-- =============================================================================

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
  v_match_pct      numeric;
  v_max_contrib    numeric;
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

    -- Re-derive amounts server-side from salary / monthly_contribution + config
    -- (NEVER trust client). NEW co-contribution model below.
    v_config := COALESCE(v_emp.contribution_config, '{}'::jsonb);
    v_mode   := COALESCE(v_config ->> 'mode', 'employer-only');

    IF v_mode = 'co-contribution' THEN
      v_match_pct := (v_config ->> 'matchPct')::numeric;
      IF v_match_pct IS NOT NULL THEN
        -- NEW: employee funds their own saving; employer matches a % of it,
        -- optionally capped by a fixed UGX maximum on the employer top-up.
        v_employee_half := round(COALESCE(v_emp.monthly_contribution, 0));
        v_employer_half := round(v_employee_half * v_match_pct / 100);
        v_max_contrib   := (v_config ->> 'maxContribution')::numeric;
        IF v_max_contrib IS NOT NULL THEN
          v_employer_half := LEAST(v_employer_half, round(v_max_contrib));
        END IF;
      ELSE
        -- LEGACY dual-read fallback: two independent % of salary (pre-redesign
        -- rows with employeePct and no matchPct). Keeps an un-migrated live row
        -- from zeroing out during cutover.
        IF (v_config ->> 'employerAmount') IS NOT NULL THEN
          v_employer_half := round((v_config ->> 'employerAmount')::numeric);
        ELSE
          v_employer_half := round(
            COALESCE(v_emp.salary, 0) * COALESCE((v_config ->> 'employerPct')::numeric, 0) / 100
          );
        END IF;
        IF (v_config ->> 'employeeAmount') IS NOT NULL THEN
          v_employee_half := round((v_config ->> 'employeeAmount')::numeric);
        ELSE
          v_employee_half := round(
            COALESCE(v_emp.salary, 0) * COALESCE((v_config ->> 'employeePct')::numeric, 0) / 100
          );
        END IF;
      END IF;
    ELSE
      -- employer-only (unchanged): explicit fixed amount wins, else pct of salary.
      IF (v_config ->> 'employerAmount') IS NOT NULL THEN
        v_employer_half := round((v_config ->> 'employerAmount')::numeric);
      ELSE
        v_employer_half := round(
          COALESCE(v_emp.salary, 0) * COALESCE((v_config ->> 'employerPct')::numeric, 0) / 100
        );
      END IF;
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

-- =============================================================================
-- End of 0038_co_contribution_match.sql
-- =============================================================================
