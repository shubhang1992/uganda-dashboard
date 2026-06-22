-- =============================================================================
-- Down migration for 0065 — drop the agent SELECT policy + restore the 0062
-- _insert_subscriber_chain body (without the insuranceProducts loop).
-- =============================================================================
DROP POLICY IF EXISTS sip_select_agent ON public.subscriber_insurance_products;

-- Restore the 0062 chain body verbatim (same 4-arg signature → CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION public._insert_subscriber_chain(
  p_payload          jsonb,
  p_calling_agent_id text,
  p_amount_override  numeric DEFAULT NULL,
  p_skip_deposit     boolean DEFAULT false
)
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
  v_amount         := COALESCE(p_amount_override, (v_schedule ->> 'amount')::numeric);
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

  IF NOT p_skip_deposit AND COALESCE(v_amount, 0) > 0 THEN
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
  END IF;

  RETURN v_new_id;
END;
$function$;
REVOKE ALL ON FUNCTION public._insert_subscriber_chain(jsonb, text, numeric, boolean) FROM PUBLIC;
