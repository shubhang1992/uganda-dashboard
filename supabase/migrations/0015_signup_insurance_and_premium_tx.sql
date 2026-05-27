-- =============================================================================
-- Universal Pensions Uganda — 0015: signup insurance toggle + premium tx
-- =============================================================================
-- Closes three closely-related defects in `_insert_subscriber_chain` that all
-- stem from the signup payload landing in the DB but never showing up on the
-- dashboard side:
--
--   1. `includeInsurance` is read from the root of `p_payload`, but
--      `ContributionRoute.buildPayload` nests it under `contributionSchedule`.
--      Every signup writes `include_insurance = FALSE` to
--      `contribution_schedules`, so the dashboard contribution-settings panel
--      always shows insurance OFF, no matter what the subscriber selected.
--      Resolution: read from `v_schedule ->> 'includeInsurance'` (the schedule
--      sub-object we've already extracted into `v_schedule`).
--
--   2. The `insurance_policies` INSERT is only emitted when a legacy
--      `insurancePolicy` sub-object is present on the payload. The current
--      frontend doesn't send that sub-object — the cover + premium values are
--      threaded through `contributionSchedule` instead. Resolution: insert
--      when `(v_schedule ->> 'includeInsurance')::boolean = TRUE` OR when the
--      legacy sub-object is present (back-compat for any caller still on the
--      old shape). Cover/premium fall back through the schedule then the
--      legacy sub-object then 0.
--
--   3. Only one `transactions` row was ever inserted (type='contribution').
--      The "Recent Activity" widget on the subscriber dashboard expects the
--      premium to appear as its own line item alongside the contribution.
--      Resolution: after the existing contribution INSERT, emit a second
--      INSERT with type='premium', amount=v_schedule.insurancePremium,
--      txn_ref='PR-XXXXXX'. The contribution AFTER-INSERT trigger
--      (`transactions_after_insert_contribution`) and the withdrawal trigger
--      both have `WHEN (NEW.type = 'contribution'|'withdrawal')` guards
--      verified against pg_trigger before writing this migration, so a
--      type='premium' row will NOT trigger any balance update — premium
--      doesn't credit retirement_balance or emergency_balance.
--
-- Forward-only, re-runnable. The function is `CREATE OR REPLACE` on the
-- same signature 0014 used; the later wins. No trigger modifications needed.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- _insert_subscriber_chain — CREATE OR REPLACE with three fixes
-- -----------------------------------------------------------------------------
-- Re-emits the function body from 0014_signup_phone_and_agent_dispute.sql:115-332
-- byte-for-byte except for:
--   * line 223: read `includeInsurance` from `v_schedule`, not `p_payload`.
--   * lines 283-300: widen the insurance_policies guard + fall through the
--     schedule before the legacy sub-object.
--   * after line 328: append a guarded premium-transaction INSERT.

CREATE OR REPLACE FUNCTION public._insert_subscriber_chain(
  p_payload          jsonb,
  p_calling_agent_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
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
  v_include_ins    BOOLEAN;
  v_ins_cover      NUMERIC;
  v_ins_premium    NUMERIC;
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
  v_next_due := v_today + ((365 / v_freq_per_year))::int;

  v_dob := (p_payload ->> 'dob')::date;
  v_age := EXTRACT(YEAR FROM age(v_today, v_dob))::int;

  ------------------------------------------------------------- subscribers
  INSERT INTO public.subscribers (
    id,
    name,
    email,
    phone,
    gender,
    age,
    dob,
    nin,
    occupation,
    agent_id,
    district_id,
    kyc_status,
    is_active,
    is_demo_signup,
    insurance_same_as_pension,
    registered_date,
    consent_at,
    contribution_history,
    products_held
  ) VALUES (
    v_new_id,
    p_payload ->> 'fullName',
    NULLIF(p_payload ->> 'email', ''),
    -- 0014: canonicalise phone before storage so verify-otp's `+256…` lookup
    -- can find this row. COALESCE preserves _validate_signup_payload's
    -- permissive regex if the helper rejects unusable input.
    COALESCE(public._canonical_ug_phone(p_payload ->> 'phone'), p_payload ->> 'phone'),
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

  ------------------------------------------------------- contribution_schedules
  -- 0015 fix 1: `includeInsurance` lives under `contributionSchedule`, not the
  -- payload root. The frontend nests it; reading from the root silently
  -- coerces NULL → FALSE for every signup.
  INSERT INTO public.contribution_schedules (
    subscriber_id,
    frequency,
    amount,
    retirement_pct,
    emergency_pct,
    include_insurance,
    insurance_choice_made,
    next_due_date
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

  ------------------------------------------------------------------- nominees
  v_p_ben := COALESCE(p_payload -> 'pensionBeneficiaries', '[]'::jsonb);
  FOR v_b IN SELECT jsonb_array_elements(v_p_ben) LOOP
    v_nom_counter := v_nom_counter + 1;
    INSERT INTO public.nominees (
      id, subscriber_id, type, name, phone, relationship, nin, share
    ) VALUES (
      'nom-' || v_new_id || '-p-' || v_nom_counter,
      v_new_id,
      'pension',
      v_b ->> 'name',
      v_b ->> 'phone',
      v_b ->> 'relationship',
      v_b ->> 'nin',
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
        v_new_id,
        'insurance',
        v_b ->> 'name',
        v_b ->> 'phone',
        v_b ->> 'relationship',
        v_b ->> 'nin',
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
        v_new_id,
        'insurance',
        v_b ->> 'name',
        v_b ->> 'phone',
        v_b ->> 'relationship',
        v_b ->> 'nin',
        COALESCE((v_b ->> 'share')::numeric, 0)
      );
    END LOOP;
  END IF;

  ----------------------------------------------------------- insurance_policies
  -- 0015 fix 2: insert a policy row whenever insurance is on, regardless of
  -- whether the legacy `insurancePolicy` sub-object is present. Cover and
  -- premium come from the schedule first (current frontend), then the legacy
  -- sub-object (back-compat), then default to 0.
  v_insurance_pol := p_payload -> 'insurancePolicy';
  v_include_ins   := COALESCE((v_schedule ->> 'includeInsurance')::boolean, FALSE);
  IF v_include_ins OR v_insurance_pol IS NOT NULL THEN
    v_ins_cover   := COALESCE(
      (v_schedule       ->> 'insuranceCover')::numeric,
      (v_insurance_pol  ->> 'cover')::numeric,
      0
    );
    v_ins_premium := COALESCE(
      (v_schedule       ->> 'insurancePremium')::numeric,
      (v_insurance_pol  ->> 'premiumMonthly')::numeric,
      0
    );
    INSERT INTO public.insurance_policies (
      subscriber_id, cover, premium_monthly,
      policy_start, renewal_date, status
    ) VALUES (
      v_new_id,
      v_ins_cover,
      v_ins_premium,
      COALESCE((v_insurance_pol ->> 'policyStart')::date, v_today),
      COALESCE((v_insurance_pol ->> 'renewalDate')::date, (v_today + INTERVAL '1 year')::date),
      CASE
        WHEN v_ins_cover > 0 THEN 'active'
        ELSE 'inactive'
      END
    );
  END IF;

  ----------------------------------------------------------------- transactions
  v_tx_id := 'tx-' || v_new_id || '-init';
  INSERT INTO public.transactions (
    id,
    subscriber_id,
    agent_id,
    type,
    amount,
    date,
    status,
    method,
    txn_ref,
    split_retirement,
    split_emergency
  ) VALUES (
    v_tx_id,
    v_new_id,
    p_calling_agent_id,
    'contribution',
    v_amount,
    now(),
    'settled',
    COALESCE(p_payload ->> 'paymentMethod', 'MTN Mobile Money'),
    'CT-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0'),
    ROUND(v_amount * (v_retirement_pct / 100.0)),
    v_amount - ROUND(v_amount * (v_retirement_pct / 100.0))
  );

  -- 0015 fix 3: emit the premium as its own transactions row so the dashboard
  -- "Recent Activity" widget surfaces it alongside the contribution. No
  -- split_retirement / split_emergency — premium does NOT credit balance.
  -- The contribution AFTER-INSERT trigger and the withdrawal trigger both
  -- carry `WHEN (NEW.type = 'contribution'|'withdrawal')` guards, so this
  -- type='premium' row will not touch subscriber_balances.
  IF v_include_ins THEN
    INSERT INTO public.transactions (
      id,
      subscriber_id,
      agent_id,
      type,
      amount,
      date,
      status,
      method,
      txn_ref
    ) VALUES (
      'tx-' || v_new_id || '-init-prem',
      v_new_id,
      p_calling_agent_id,
      'premium',
      COALESCE((v_schedule ->> 'insurancePremium')::numeric, 0),
      now(),
      'settled',
      COALESCE(p_payload ->> 'paymentMethod', 'MTN Mobile Money'),
      'PR-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0')
    );
  END IF;

  RETURN v_new_id;
END;
$$;

ALTER FUNCTION public._insert_subscriber_chain(jsonb, text) SET search_path = public, pg_temp;


-- =============================================================================
-- End of 0015_signup_insurance_and_premium_tx.sql
-- =============================================================================
