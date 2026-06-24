-- 0066_run_insurance_leg.sql
--
-- Make the employer actually PAY for group life insurance as part of the monthly
-- contribution run. Until now a run posted only the two PENSION legs (employee
-- 'own' + employer match 'employer'); the group-life premium was a notional UI
-- figure, never funded.
--
-- This migration:
--   (a) adds contribution_runs.insurance_total (a third, distinct component);
--   (b) rewrites submit_employer_contribution_run to post a per-active-member
--       INSURANCE PREMIUM leg, fully employer-funded:
--         premium = round(groupCoverAmount * 0.002)   -- 0.2%/mo, the individual
--                                                         life rate (2,000 per 1M);
--                                                         mirrors src/utils/groupInsurance.js
--       posted as type='insurance_premium', source='employer', NO retirement/
--       emergency split. Because the balance/units trigger fires only WHEN
--       type='contribution', the premium NEVER inflates a member's pension
--       balance or units — it is a cost, not savings.
--   (c) grand_total = employee + employer + insurance; the RPC result now also
--       returns insuranceTotal. "Total contributions" (pension) stays clean:
--       it sums type='contribution' only, so it is unchanged.
--
-- Parity: src/services/employer.js::_mockSubmitEmployerRun computes the insurance
-- leg identically (groupPremiumPerMember). Keep them in lockstep.

ALTER TABLE public.contribution_runs
  ADD COLUMN IF NOT EXISTS insurance_total numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.submit_employer_contribution_run(p_period_label text DEFAULT NULL::text, p_method text DEFAULT NULL::text, p_nonce text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role             text := (SELECT auth.jwt()) ->> 'app_role';
  v_employer_id      text := (SELECT auth.jwt()) ->> 'employerId';
  v_config           jsonb;
  v_mode             text;
  v_basis            text;
  v_employee_pct     numeric;
  v_employer_pct     numeric;
  v_match_pct        numeric;
  v_employer_amount  numeric;
  v_cover            numeric;
  v_ins_on           boolean;
  v_insurance_leg    numeric;
  v_sub              record;
  v_comp             numeric;
  v_ret_pct          numeric;
  v_employee_leg     numeric;
  v_employer_leg     numeric;
  v_retirement       numeric;
  v_emergency        numeric;
  v_funded           boolean;
  v_run_id           text;
  v_tx_ref           text;
  v_members_funded   integer := 0;
  v_employee_total   numeric := 0;
  v_employer_total   numeric := 0;
  v_insurance_total  numeric := 0;
  v_skipped          jsonb := '[]'::jsonb;
  v_prior            jsonb;
  v_result           jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'employer' THEN
    RAISE EXCEPTION 'role % cannot submit a contribution run', v_role USING ERRCODE = 'P0001';
  END IF;
  IF v_employer_id IS NULL OR v_employer_id = '' THEN
    RAISE EXCEPTION 'missing employerId claim' USING ERRCODE = 'P0001';
  END IF;

  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    SELECT result INTO v_prior FROM public.contribution_run_uploads WHERE nonce = p_nonce;
    IF v_prior IS NOT NULL THEN
      RETURN v_prior;
    END IF;
  END IF;

  SELECT default_contribution_config INTO v_config FROM public.employers WHERE id = v_employer_id;
  v_config := COALESCE(v_config, '{}'::jsonb);
  v_mode   := COALESCE(v_config ->> 'mode', 'employer-only');

  -- Config-level coefficients (defensive defaults keep an un-migrated config from
  -- erroring: absent employerBasis => 'fixed'; missing pcts => 0).
  v_basis            := COALESCE(v_config ->> 'employerBasis', 'fixed');
  v_employee_pct     := COALESCE(NULLIF(v_config ->> 'employeePct', '')::numeric, 0);
  v_match_pct        := COALESCE(NULLIF(v_config ->> 'employerMatchPct', '')::numeric, 0);
  v_employer_pct     := COALESCE(NULLIF(v_config ->> 'employerPct', '')::numeric, 0);
  v_employer_amount  := COALESCE(NULLIF(v_config ->> 'employerAmount', '')::numeric, 0);

  -- Group life: company-wide flat cover; the premium the EMPLOYER funds per
  -- covered member is the same for everyone (mirrors groupPremiumPerMember).
  -- insuranceEnabled defaults to (cover > 0) for un-migrated configs.
  v_cover := COALESCE(NULLIF(v_config ->> 'groupCoverAmount', '')::numeric, 0);
  v_ins_on := COALESCE(NULLIF(v_config ->> 'insuranceEnabled', '')::boolean, v_cover > 0) AND v_cover > 0;
  v_insurance_leg := CASE WHEN v_ins_on THEN round(v_cover * 0.002) ELSE 0 END;

  v_run_id := 'run-' || replace(gen_random_uuid()::text, '-', '');
  v_tx_ref := 'EMP-' || substr(v_run_id, 5, 8);
  INSERT INTO public.contribution_runs (
    id, employer_id, period_label, status, employer_total, employee_total, insurance_total, grand_total, run_at
  ) VALUES (
    v_run_id, v_employer_id, p_period_label, 'completed', 0, 0, 0, 0, now()
  );

  FOR v_sub IN
    SELECT s.id,
           COALESCE(s.compensation, 0)        AS compensation,
           COALESCE(cs.retirement_pct, 80)    AS ret_pct
      FROM public.subscribers s
      LEFT JOIN public.contribution_schedules cs ON cs.subscriber_id = s.id
     WHERE s.employer_id = v_employer_id
       AND s.is_active
     FOR UPDATE OF s
  LOOP
    v_comp := v_sub.compensation;

    IF v_mode = 'co-contribution' THEN
      v_employee_leg := round(v_comp * v_employee_pct / 100);
      v_employer_leg := round(v_employee_leg * v_match_pct / 100);
    ELSE  -- employer-only
      v_employee_leg := 0;
      IF v_basis = 'percent' THEN
        v_employer_leg := round(v_comp * v_employer_pct / 100);
      ELSE
        v_employer_leg := round(v_employer_amount);
      END IF;
    END IF;

    -- A member is funded when ANY of the three legs is positive. Group insurance
    -- is all-or-nothing, so when it is on every active member is funded (even one
    -- with zero compensation gets the premium leg only).
    IF COALESCE(v_employee_leg, 0) <= 0 AND COALESCE(v_employer_leg, 0) <= 0 AND COALESCE(v_insurance_leg, 0) <= 0 THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('subscriberId', v_sub.id, 'reason', 'zero_contribution')
      );
      CONTINUE;
    END IF;

    v_ret_pct := v_sub.ret_pct;
    IF v_ret_pct IS NULL OR v_ret_pct < 0 OR v_ret_pct > 100 THEN
      v_ret_pct := 80;
    END IF;

    v_funded := false;

    -- Employee leg (source='own'): processed by the employer from compensation.
    IF COALESCE(v_employee_leg, 0) > 0 THEN
      v_retirement := round(v_employee_leg * v_ret_pct / 100);
      v_emergency  := v_employee_leg - v_retirement;
      INSERT INTO public.transactions (
        id, subscriber_id, agent_id, type, amount, date, status, method,
        txn_ref, split_retirement, split_emergency, source, contribution_run_id
      ) VALUES (
        't-' || replace(gen_random_uuid()::text, '-', ''), v_sub.id, NULL, 'contribution',
        v_employee_leg, now(), 'settled', p_method, v_tx_ref, v_retirement, v_emergency, 'own', v_run_id
      );
      v_employee_total := v_employee_total + v_employee_leg;
      v_funded := true;
    END IF;

    -- Employer leg (source='employer').
    IF COALESCE(v_employer_leg, 0) > 0 THEN
      v_retirement := round(v_employer_leg * v_ret_pct / 100);
      v_emergency  := v_employer_leg - v_retirement;
      INSERT INTO public.transactions (
        id, subscriber_id, agent_id, type, amount, date, status, method,
        txn_ref, split_retirement, split_emergency, source, contribution_run_id
      ) VALUES (
        't-' || replace(gen_random_uuid()::text, '-', ''), v_sub.id, NULL, 'contribution',
        v_employer_leg, now(), 'settled', p_method, v_tx_ref, v_retirement, v_emergency, 'employer', v_run_id
      );
      v_employer_total := v_employer_total + v_employer_leg;
      v_funded := true;
    END IF;

    -- Insurance premium leg (type='insurance_premium', source='employer'). Fully
    -- employer-funded; NOT split into retirement/emergency and NOT type
    -- 'contribution', so the balance/units trigger never fires for it — the
    -- premium is a cost, it must not inflate the member's pension pot.
    IF COALESCE(v_insurance_leg, 0) > 0 THEN
      INSERT INTO public.transactions (
        id, subscriber_id, agent_id, type, amount, date, status, method,
        txn_ref, split_retirement, split_emergency, source, contribution_run_id
      ) VALUES (
        't-' || replace(gen_random_uuid()::text, '-', ''), v_sub.id, NULL, 'insurance_premium',
        v_insurance_leg, now(), 'settled', p_method, v_tx_ref, NULL, NULL, 'employer', v_run_id
      );
      v_insurance_total := v_insurance_total + v_insurance_leg;
      v_funded := true;
    END IF;

    IF v_funded THEN
      v_members_funded := v_members_funded + 1;
    END IF;
  END LOOP;

  IF v_members_funded > 0 THEN
    UPDATE public.contribution_runs
       SET employer_total  = v_employer_total,
           employee_total  = v_employee_total,
           insurance_total = v_insurance_total,
           grand_total     = v_employer_total + v_employee_total + v_insurance_total
     WHERE id = v_run_id;
  ELSE
    DELETE FROM public.contribution_runs WHERE id = v_run_id;
    v_run_id := NULL;
  END IF;

  v_result := jsonb_build_object(
    'runId',         v_run_id,
    'linesCreated',  v_members_funded,
    'employerTotal', v_employer_total,
    'employeeTotal', v_employee_total,
    'insuranceTotal', v_insurance_total,
    'grandTotal',    v_employer_total + v_employee_total + v_insurance_total,
    'skipped',       v_skipped
  );

  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    INSERT INTO public.contribution_run_uploads (nonce, result)
    VALUES (p_nonce, v_result)
    ON CONFLICT (nonce) DO NOTHING;
  END IF;

  RETURN v_result;
END;
$function$;
