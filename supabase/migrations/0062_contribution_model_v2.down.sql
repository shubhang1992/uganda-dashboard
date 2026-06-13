-- =============================================================================
-- DOWN 0062_contribution_model_v2 — restore the pre-0062 contribution model.
-- Restores the original RPC bodies verbatim, the 2-arg _insert_subscriber_chain,
-- inverse-reshapes the demo employer configs, and drops the compensation column +
-- the new edit RPC. (Demo rollback — the employeePct:10 / maxContribution:200000
-- demo defaults are re-applied; per-employer historical caps are not preserved.)
-- =============================================================================

-- Restore the single-leg (employer-only) contribution run. ----------------------
CREATE OR REPLACE FUNCTION public.submit_employer_contribution_run(p_period_label text DEFAULT NULL::text, p_method text DEFAULT NULL::text, p_nonce text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role           text := (SELECT auth.jwt()) ->> 'app_role';
  v_employer_id    text := (SELECT auth.jwt()) ->> 'employerId';
  v_config         jsonb;
  v_mode           text;
  v_match_pct      numeric;
  v_max_contrib    numeric;
  v_employer_amt   numeric;
  v_sub            record;
  v_ret_pct        numeric;
  v_retirement     numeric;
  v_emergency      numeric;
  v_run_id         text;
  v_tx_id          text;
  v_lines_created  integer := 0;
  v_employer_total numeric := 0;
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

  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    SELECT result INTO v_prior FROM public.contribution_run_uploads WHERE nonce = p_nonce;
    IF v_prior IS NOT NULL THEN
      RETURN v_prior;
    END IF;
  END IF;

  SELECT default_contribution_config INTO v_config FROM public.employers WHERE id = v_employer_id;
  v_config := COALESCE(v_config, '{}'::jsonb);
  v_mode   := COALESCE(v_config ->> 'mode', 'employer-only');

  v_run_id := 'run-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.contribution_runs (
    id, employer_id, period_label, status, employer_total, employee_total, grand_total, run_at
  ) VALUES (
    v_run_id, v_employer_id, p_period_label, 'completed', 0, 0, 0, now()
  );

  FOR v_sub IN
    SELECT s.id, s.is_active,
           COALESCE(cs.amount, 0)                      AS own_amount,
           COALESCE(cs.retirement_pct, 80)             AS ret_pct
      FROM public.subscribers s
      LEFT JOIN public.contribution_schedules cs ON cs.subscriber_id = s.id
     WHERE s.employer_id = v_employer_id
       AND s.is_active
     FOR UPDATE OF s
  LOOP
    IF v_mode = 'co-contribution' THEN
      v_match_pct   := NULLIF(v_config ->> 'matchPct', '')::numeric;
      v_max_contrib := NULLIF(v_config ->> 'maxContribution', '')::numeric;
      v_employer_amt := round(v_sub.own_amount * COALESCE(v_match_pct, 0) / 100);
      IF v_max_contrib IS NOT NULL THEN
        v_employer_amt := LEAST(v_employer_amt, round(v_max_contrib));
      END IF;
    ELSE
      v_employer_amt := round(COALESCE(NULLIF(v_config ->> 'employerAmount', '')::numeric, 0));
    END IF;

    IF v_employer_amt <= 0 THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('subscriberId', v_sub.id, 'reason', 'zero_contribution')
      );
      CONTINUE;
    END IF;

    v_ret_pct := v_sub.ret_pct;
    IF v_ret_pct IS NULL OR v_ret_pct < 0 OR v_ret_pct > 100 THEN
      v_ret_pct := 80;
    END IF;
    v_retirement := round(v_employer_amt * v_ret_pct / 100);
    v_emergency  := v_employer_amt - v_retirement;

    v_tx_id := 't-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.transactions (
      id, subscriber_id, agent_id, type, amount, date, status, method,
      txn_ref, split_retirement, split_emergency, source, contribution_run_id
    ) VALUES (
      v_tx_id, v_sub.id, NULL, 'contribution', v_employer_amt, now(), 'settled', p_method,
      'EMP-' || substr(v_run_id, 5, 8), v_retirement, v_emergency, 'employer', v_run_id
    );

    v_lines_created  := v_lines_created + 1;
    v_employer_total := v_employer_total + v_employer_amt;
  END LOOP;

  IF v_lines_created > 0 THEN
    UPDATE public.contribution_runs
       SET employer_total = v_employer_total,
           grand_total    = v_employer_total
     WHERE id = v_run_id;
  ELSE
    DELETE FROM public.contribution_runs WHERE id = v_run_id;
    v_run_id := NULL;
  END IF;

  v_result := jsonb_build_object(
    'runId',         v_run_id,
    'linesCreated',  v_lines_created,
    'employerTotal', v_employer_total,
    'employeeTotal', 0,
    'grandTotal',    v_employer_total,
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

-- Restore the original employer invite completion (no compensation thread). ------
CREATE OR REPLACE FUNCTION public.create_subscriber_from_employer_invite(payload jsonb, p_token text, p_nonce text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inv record; v_new_id text; v_prior jsonb; v_phone_norm text; v_existing_id text; v_existing_emp text;
  v_sched jsonb; v_dob date; v_age int; v_today date := CURRENT_DATE; v_b jsonb; v_nom_i int := 0;
BEGIN
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    SELECT result INTO v_prior FROM public.subscriber_signup_uploads WHERE nonce = p_nonce;
    IF v_prior IS NOT NULL THEN RETURN v_prior #>> '{}'; END IF;
  END IF;
  SELECT * INTO v_inv FROM public.employer_invites WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite not found' USING ERRCODE='P0002'; END IF;
  IF v_inv.status <> 'pending' THEN RAISE EXCEPTION 'invite already used' USING ERRCODE='P0001'; END IF;
  IF v_inv.expires_at <= now() THEN RAISE EXCEPTION 'invite expired' USING ERRCODE='P0001'; END IF;

  v_phone_norm := right(regexp_replace(COALESCE(payload ->> 'phone',''),'[^0-9]','','g'),9);
  SELECT id, employer_id INTO v_existing_id, v_existing_emp FROM public.subscribers
   WHERE right(regexp_replace(COALESCE(phone,''),'[^0-9]','','g'),9) = v_phone_norm
   ORDER BY created_at DESC LIMIT 1;

  IF v_existing_id IS NOT NULL AND v_existing_emp IS NOT NULL THEN
    RAISE EXCEPTION 'a subscriber with phone % already belongs to an employer', payload ->> 'phone' USING ERRCODE='P0001';
  ELSIF v_existing_id IS NOT NULL THEN
    UPDATE public.subscribers SET employer_id = v_inv.employer_id WHERE id = v_existing_id;
    v_new_id := v_existing_id;
  ELSIF v_inv.collect_schedule THEN
    PERFORM public._validate_signup_payload(payload);
    v_new_id := public._insert_subscriber_chain(payload, NULL);
    UPDATE public.subscribers SET employer_id = v_inv.employer_id WHERE id = v_new_id;
  ELSE
    IF COALESCE(payload ->> 'phone','') !~ '^(\+?256)?[0-9]{9}$' THEN RAISE EXCEPTION 'valid phone is required'; END IF;
    IF length(trim(COALESCE(payload ->> 'fullName',''))) < 2 THEN RAISE EXCEPTION 'fullName is required'; END IF;
    IF COALESCE(payload ->> 'dob','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'dob is required'; END IF;
    IF COALESCE(payload ->> 'gender','') NOT IN ('male','female','other') THEN RAISE EXCEPTION 'gender invalid'; END IF;
    IF COALESCE(payload ->> 'nin','') = '' THEN RAISE EXCEPTION 'nin is required'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.districts WHERE id = payload ->> 'districtId') THEN RAISE EXCEPTION 'unknown district'; END IF;
    v_sched := COALESCE(payload -> 'contributionSchedule', '{}'::jsonb);
    v_dob := (payload ->> 'dob')::date;
    v_age := EXTRACT(YEAR FROM age(v_today, v_dob))::int;
    v_new_id := 's-' || lpad(nextval('public.subscriber_id_seq')::text, 6, '0');
    INSERT INTO public.subscribers (id, name, email, phone, gender, age, dob, nin, occupation, agent_id, employer_id,
      district_id, kyc_status, is_active, is_demo_signup, insurance_same_as_pension, registered_date, consent_at, contribution_history, products_held)
    VALUES (v_new_id, payload ->> 'fullName', NULLIF(payload ->> 'email',''), payload ->> 'phone', payload ->> 'gender',
      v_age, v_dob, payload ->> 'nin', NULLIF(payload ->> 'occupation',''), NULL, v_inv.employer_id, payload ->> 'districtId',
      'complete', TRUE, TRUE, FALSE, v_today, COALESCE((payload ->> 'consentTimestamp')::timestamptz, now()), '[]'::jsonb, '[]'::jsonb);
    INSERT INTO public.subscriber_balances (subscriber_id, retirement_balance, emergency_balance, total_balance, units, updated_at)
    VALUES (v_new_id, 0, 0, 0, 0, now()) ON CONFLICT (subscriber_id) DO NOTHING;
    INSERT INTO public.contribution_schedules (subscriber_id, frequency, amount, retirement_pct, emergency_pct, include_insurance, insurance_choice_made, next_due_date)
    VALUES (v_new_id, 'monthly', 0, COALESCE((v_sched ->> 'retirementPct')::int, 80),
      COALESCE((v_sched ->> 'emergencyPct')::int, 100 - COALESCE((v_sched ->> 'retirementPct')::int, 80)), FALSE, TRUE, v_today + 30);
    FOR v_b IN SELECT jsonb_array_elements(COALESCE(payload -> 'pensionBeneficiaries', '[]'::jsonb)) LOOP
      v_nom_i := v_nom_i + 1;
      INSERT INTO public.nominees (id, subscriber_id, type, name, phone, relationship, nin, share)
      VALUES ('nom-' || v_new_id || '-p-' || v_nom_i, v_new_id, 'pension', v_b ->> 'name', v_b ->> 'phone', v_b ->> 'relationship', v_b ->> 'nin', COALESCE((v_b ->> 'share')::numeric, 0));
    END LOOP;
  END IF;

  UPDATE public.employer_invites SET status='completed', subscriber_id = v_new_id, completed_at = now() WHERE token = p_token;
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    INSERT INTO public.subscriber_signup_uploads (nonce, result) VALUES (p_nonce, to_jsonb(v_new_id)) ON CONFLICT (nonce) DO NOTHING;
  END IF;
  RETURN v_new_id;
END; $function$;

-- Restore the original employer-driven onboard (no compensation thread). ---------
CREATE OR REPLACE FUNCTION public.create_subscriber_from_employer_onboard(payload jsonb, calling_employer_id text, p_nonce text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := (SELECT auth.jwt()) ->> 'app_role';
  v_jwt_emp_id text; v_new_id text; v_prior jsonb; v_phone_norm text; v_existing_id text; v_existing_emp text;
  v_dob date; v_age int; v_today date := CURRENT_DATE;
BEGIN
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    SELECT result INTO v_prior FROM public.subscriber_signup_uploads WHERE nonce = p_nonce;
    IF v_prior IS NOT NULL THEN RETURN v_prior #>> '{}'; END IF;
  END IF;
  IF v_role IS DISTINCT FROM 'employer' THEN RAISE EXCEPTION 'role % cannot onboard an employee', v_role USING ERRCODE='P0001'; END IF;
  IF calling_employer_id IS NULL OR calling_employer_id='' THEN RAISE EXCEPTION 'calling_employer_id is required'; END IF;
  BEGIN v_jwt_emp_id := (SELECT auth.jwt()) ->> 'employerId'; EXCEPTION WHEN OTHERS THEN v_jwt_emp_id := NULL; END;
  IF v_jwt_emp_id IS NOT NULL AND v_jwt_emp_id <> calling_employer_id THEN
    RAISE EXCEPTION 'calling_employer_id (%) does not match JWT employerId (%)', calling_employer_id, v_jwt_emp_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employers WHERE id = calling_employer_id) THEN
    RAISE EXCEPTION 'unknown employer: %', calling_employer_id;
  END IF;

  IF COALESCE(payload->>'phone','') !~ '^(\+?256)?[0-9]{9}$' THEN RAISE EXCEPTION 'valid phone is required'; END IF;
  IF length(trim(COALESCE(payload->>'fullName',''))) < 2 THEN RAISE EXCEPTION 'fullName is required'; END IF;
  IF COALESCE(payload->>'dob','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'dob is required (YYYY-MM-DD)'; END IF;
  IF COALESCE(payload->>'gender','') NOT IN ('male','female','other') THEN RAISE EXCEPTION 'gender must be male|female|other'; END IF;
  IF COALESCE(payload->>'nin','')='' THEN RAISE EXCEPTION 'nin is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.districts WHERE id = payload->>'districtId') THEN RAISE EXCEPTION 'unknown district: %', payload->>'districtId'; END IF;

  v_phone_norm := right(regexp_replace(COALESCE(payload->>'phone',''),'[^0-9]','','g'),9);
  SELECT id, employer_id INTO v_existing_id, v_existing_emp FROM public.subscribers
   WHERE right(regexp_replace(COALESCE(phone,''),'[^0-9]','','g'),9) = v_phone_norm
   ORDER BY created_at DESC LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    IF v_existing_emp = calling_employer_id THEN RAISE EXCEPTION 'a subscriber with phone % is already on your roster', payload->>'phone' USING ERRCODE='P0001';
    ELSIF v_existing_emp IS NOT NULL THEN RAISE EXCEPTION 'a subscriber with phone % already belongs to another employer', payload->>'phone' USING ERRCODE='P0001';
    ELSE
      UPDATE public.subscribers SET employer_id = calling_employer_id WHERE id = v_existing_id;
      v_new_id := v_existing_id;
    END IF;
  ELSE
    v_new_id := 's-' || lpad(nextval('public.subscriber_id_seq')::text, 6, '0');
    v_dob := (payload->>'dob')::date;
    v_age := EXTRACT(YEAR FROM age(v_today, v_dob))::int;
    INSERT INTO public.subscribers (id, name, email, phone, gender, age, dob, nin, occupation, agent_id, employer_id, district_id, kyc_status, is_active, is_demo_signup, insurance_same_as_pension, registered_date, consent_at, contribution_history, products_held)
    VALUES (v_new_id, payload->>'fullName', NULLIF(payload->>'email',''), payload->>'phone', payload->>'gender', v_age, v_dob, payload->>'nin', NULLIF(payload->>'occupation',''), NULL, calling_employer_id, payload->>'districtId', 'complete', TRUE, TRUE, TRUE, v_today, COALESCE((payload->>'consentTimestamp')::timestamptz, now()), '[]'::jsonb, '[]'::jsonb);
    INSERT INTO public.subscriber_balances (subscriber_id, retirement_balance, emergency_balance, total_balance, units, updated_at)
    VALUES (v_new_id, 0, 0, 0, 0, now()) ON CONFLICT (subscriber_id) DO NOTHING;
  END IF;

  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    INSERT INTO public.subscriber_signup_uploads (nonce, result) VALUES (p_nonce, to_jsonb(v_new_id)) ON CONFLICT (nonce) DO NOTHING;
  END IF;
  RETURN v_new_id;
END; $function$;

-- Restore the 2-arg _insert_subscriber_chain (always posts the signup deposit). --
DROP FUNCTION IF EXISTS public._insert_subscriber_chain(jsonb, text, numeric, boolean);

CREATE FUNCTION public._insert_subscriber_chain(p_payload jsonb, p_calling_agent_id text)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new_id         TEXT;
  v_schedule       jsonb;
  v_amount         NUMERIC;
  v_retirement_pct INTEGER;
  v_emergency_pct  INTEGER;
  v_frequency      TEXT;
  v_freq_per_year  INTEGER;
  v_next_due       DATE;
  v_p_ben          jsonb;
  v_i_ben          jsonb;
  v_b              jsonb;
  v_nom_counter    INTEGER := 0;
  v_today          DATE := CURRENT_DATE;
  v_dob            DATE;
  v_age            INTEGER;
  v_insurance_pol  jsonb;
  v_tx_id          TEXT;
  v_p_count        INTEGER;
  v_p_sum          NUMERIC;
  v_i_count        INTEGER;
  v_i_sum          NUMERIC;
BEGIN
  v_new_id := 's-' || lpad(nextval('public.subscriber_id_seq')::text, 6, '0');

  v_schedule       := p_payload -> 'contributionSchedule';
  v_amount         := (v_schedule ->> 'amount')::numeric;
  v_retirement_pct := COALESCE((v_schedule ->> 'retirementPct')::integer, 80);
  v_emergency_pct  := COALESCE((v_schedule ->> 'emergencyPct')::integer,  100 - v_retirement_pct);
  v_frequency      := COALESCE(v_schedule ->> 'frequency', 'monthly');
  v_freq_per_year  := CASE v_frequency
                        WHEN 'weekly'      THEN 52
                        WHEN 'monthly'     THEN 12
                        WHEN 'quarterly'   THEN 4
                        WHEN 'half-yearly' THEN 2
                        WHEN 'annually'    THEN 1
                        ELSE 12
                      END;
  v_next_due := (v_today + CASE v_frequency
                             WHEN 'weekly'      THEN INTERVAL '1 week'
                             WHEN 'monthly'     THEN INTERVAL '1 month'
                             WHEN 'quarterly'   THEN INTERVAL '3 months'
                             WHEN 'half-yearly' THEN INTERVAL '6 months'
                             WHEN 'annually'    THEN INTERVAL '1 year'
                             ELSE INTERVAL '1 month'
                           END)::date;

  v_dob := (p_payload ->> 'dob')::date;
  v_age := EXTRACT(YEAR FROM age(v_today, v_dob))::int;

  INSERT INTO public.subscribers (
    id, name, email, phone, gender, age, dob, nin, occupation, agent_id,
    district_id, kyc_status, is_active, is_demo_signup, insurance_same_as_pension,
    registered_date, consent_at, contribution_history, products_held
  ) VALUES (
    v_new_id,
    p_payload ->> 'fullName',
    NULLIF(p_payload ->> 'email', ''),
    p_payload ->> 'phone',
    p_payload ->> 'gender',
    v_age,
    v_dob,
    p_payload ->> 'nin',
    NULLIF(p_payload ->> 'occupation', ''),
    p_calling_agent_id,
    p_payload ->> 'districtId',
    'complete',
    TRUE,
    TRUE,
    COALESCE((p_payload ->> 'insuranceSameAsPension')::boolean, TRUE),
    v_today,
    COALESCE((p_payload ->> 'consentTimestamp')::timestamptz, now()),
    '[]'::jsonb,
    '[]'::jsonb
  );

  INSERT INTO public.contribution_schedules (
    subscriber_id, frequency, amount, retirement_pct, emergency_pct,
    include_insurance, insurance_choice_made, next_due_date
  ) VALUES (
    v_new_id,
    v_frequency,
    v_amount,
    v_retirement_pct,
    v_emergency_pct,
    COALESCE((v_schedule ->> 'includeInsurance')::boolean, FALSE),
    COALESCE((p_payload ->> 'insuranceChoiceMade')::boolean, TRUE),
    v_next_due
  );

  v_p_ben := COALESCE(p_payload -> 'pensionBeneficiaries', '[]'::jsonb);

  SELECT COUNT(*), COALESCE(SUM((n->>'share')::numeric), 0)
    INTO v_p_count, v_p_sum
    FROM jsonb_array_elements(v_p_ben) n;
  IF v_p_count > 0 AND ABS(v_p_sum - 100) > 0.01 THEN
    RAISE EXCEPTION 'pension_share_sum_must_equal_100 (got %)', v_p_sum
      USING ERRCODE = 'P0005';
  END IF;

  IF NOT COALESCE((p_payload ->> 'insuranceSameAsPension')::boolean, TRUE) THEN
    v_i_ben := COALESCE(p_payload -> 'insuranceBeneficiaries', '[]'::jsonb);
    SELECT COUNT(*), COALESCE(SUM((n->>'share')::numeric), 0)
      INTO v_i_count, v_i_sum
      FROM jsonb_array_elements(v_i_ben) n;
    IF v_i_count > 0 AND ABS(v_i_sum - 100) > 0.01 THEN
      RAISE EXCEPTION 'insurance_share_sum_must_equal_100 (got %)', v_i_sum
        USING ERRCODE = 'P0005';
    END IF;
  END IF;

  FOR v_b IN SELECT jsonb_array_elements(v_p_ben) LOOP
    v_nom_counter := v_nom_counter + 1;
    INSERT INTO public.nominees (
      id, subscriber_id, type, name, phone, relationship, nin, share
    ) VALUES (
      'nom-' || v_new_id || '-p-' || v_nom_counter,
      v_new_id, 'pension',
      v_b ->> 'name', v_b ->> 'phone', v_b ->> 'relationship', v_b ->> 'nin',
      COALESCE((v_b ->> 'share')::numeric, 0)
    );
  END LOOP;

  IF COALESCE((p_payload ->> 'insuranceSameAsPension')::boolean, TRUE) THEN
    v_nom_counter := 0;
    FOR v_b IN SELECT jsonb_array_elements(v_p_ben) LOOP
      v_nom_counter := v_nom_counter + 1;
      INSERT INTO public.nominees (
        id, subscriber_id, type, name, phone, relationship, nin, share
      ) VALUES (
        'nom-' || v_new_id || '-i-' || v_nom_counter,
        v_new_id, 'insurance',
        v_b ->> 'name', v_b ->> 'phone', v_b ->> 'relationship', v_b ->> 'nin',
        COALESCE((v_b ->> 'share')::numeric, 0)
      );
    END LOOP;
  ELSE
    v_i_ben := COALESCE(p_payload -> 'insuranceBeneficiaries', '[]'::jsonb);
    v_nom_counter := 0;
    FOR v_b IN SELECT jsonb_array_elements(v_i_ben) LOOP
      v_nom_counter := v_nom_counter + 1;
      INSERT INTO public.nominees (
        id, subscriber_id, type, name, phone, relationship, nin, share
      ) VALUES (
        'nom-' || v_new_id || '-i-' || v_nom_counter,
        v_new_id, 'insurance',
        v_b ->> 'name', v_b ->> 'phone', v_b ->> 'relationship', v_b ->> 'nin',
        COALESCE((v_b ->> 'share')::numeric, 0)
      );
    END LOOP;
  END IF;

  v_insurance_pol := p_payload -> 'insurancePolicy';
  IF v_insurance_pol IS NOT NULL THEN
    INSERT INTO public.insurance_policies (
      subscriber_id, cover, premium_monthly, policy_start, renewal_date, status
    ) VALUES (
      v_new_id,
      COALESCE((v_insurance_pol ->> 'cover')::numeric, 0),
      COALESCE((v_insurance_pol ->> 'premiumMonthly')::numeric, 0),
      COALESCE((v_insurance_pol ->> 'policyStart')::date, v_today),
      COALESCE((v_insurance_pol ->> 'renewalDate')::date, (v_today + INTERVAL '1 year')::date),
      CASE
        WHEN COALESCE((v_insurance_pol ->> 'cover')::numeric, 0) > 0 THEN 'active'
        ELSE 'inactive'
      END
    );
  END IF;

  v_tx_id := 'tx-' || v_new_id || '-init';
  INSERT INTO public.transactions (
    id, subscriber_id, agent_id, type, amount, date, status, method,
    txn_ref, split_retirement, split_emergency
  ) VALUES (
    v_tx_id, v_new_id, p_calling_agent_id, 'contribution', v_amount, now(), 'settled',
    COALESCE(p_payload ->> 'paymentMethod', 'MTN Mobile Money'),
    'CT-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0'),
    ROUND(v_amount * (v_retirement_pct / 100.0)),
    v_amount - ROUND(v_amount * (v_retirement_pct / 100.0))
  );

  RETURN v_new_id;
END;
$function$;
REVOKE ALL ON FUNCTION public._insert_subscriber_chain(jsonb, text) FROM PUBLIC;

-- Drop the new compensation edit RPC. -------------------------------------------
DROP FUNCTION IF EXISTS public.update_employer_member_compensation(text, numeric);

-- Inverse config reshape (back to the old key shapes). --------------------------
UPDATE public.employers
   SET default_contribution_config =
       (default_contribution_config - 'employeePct' - 'employerMatchPct')
       || jsonb_build_object(
            'matchPct',        COALESCE(NULLIF(default_contribution_config ->> 'employerMatchPct', '')::numeric, 50),
            'maxContribution', 200000
          )
 WHERE default_contribution_config ->> 'mode' = 'co-contribution';

UPDATE public.employers
   SET default_contribution_config =
       default_contribution_config - 'employerBasis' - 'employerPct'
 WHERE default_contribution_config ->> 'mode' = 'employer-only';

-- Drop the compensation column last (restored functions no longer reference it). -
ALTER TABLE public.subscribers DROP COLUMN IF EXISTS compensation;

-- =============================================================================
-- End of 0062_contribution_model_v2.down.sql
-- =============================================================================
