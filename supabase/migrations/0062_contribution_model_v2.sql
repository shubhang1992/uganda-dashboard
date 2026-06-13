-- =============================================================================
-- Universal Pensions Uganda — 0062: contribution model v2 (compensation-driven,
-- employer-processed, two-leg)
-- =============================================================================
-- WHY: the employer contribution model is being decoupled from platform activity.
--   OLD: admin sets cadence + model at employer-creation; "co-contribution" matches
--        a % of whatever the employee self-saves on the platform
--        (contribution_schedules.amount), capped by maxContribution. The employer
--        leg therefore depends on the employee using the app.
--   NEW: the EMPLOYER owns cadence + model in their own profile, and BOTH the
--        employee and employer legs are computed from the employee's MONTHLY
--        COMPENSATION and processed by the employer (payroll) — regardless of
--        whether the employee ever touches the app.
--
-- NEW MODEL (precise):
--   employer-only  -> employee leg = 0
--                     employerBasis='fixed'   : employer_leg = round(employerAmount)
--                     employerBasis='percent' : employer_leg = round(comp*employerPct/100)
--   co-contribution -> employee_leg = round(comp*employeePct/100)
--                      employer_leg = round(employee_leg*employerMatchPct/100)   (no cap)
--   New default_contribution_config shapes (insurance keys ride along unchanged):
--     {mode:'employer-only', employerBasis:'fixed',   employerAmount:50000}
--     {mode:'employer-only', employerBasis:'percent', employerPct:10}
--     {mode:'co-contribution', employeePct:10, employerMatchPct:50}
--
-- This migration (forward-only; reversible via 0062_contribution_model_v2.down.sql):
--   (a) subscribers.compensation NUMERIC NOT NULL DEFAULT 0  — the core missing field.
--   (b) _insert_subscriber_chain gains two TRAILING DEFAULTED params
--       (p_amount_override, p_skip_deposit) so the employer co-contribution invite
--       branch can seed amount=0 and post NO signup first-contribution while still
--       collecting full-KYC beneficiaries/insurance (decision D-A(a)). The three
--       2-arg callers (create_subscriber_from_signup / _from_agent_onboard /
--       _from_employer_invite) resolve to the new function with defaults =>
--       byte-identical behaviour for the agent + self-signup paths.
--   (c) submit_employer_contribution_run rewritten to the two-leg model: posts an
--       employee leg (source='own') AND an employer leg (source='employer') per
--       member from compensation, both agent_id=NULL (no commission), both split by
--       the member's retirement_pct; populates contribution_runs.employee_total.
--   (d) both completion RPCs thread compensation onto the new subscriber
--       (invite: from employer_invites.prefill; onboard: from payload).
--   (e) new employer-gated RPC update_employer_member_compensation (raises etc.),
--       mirroring remove_employer_member (0048).
--   (f) demo-data reshape: MERGE existing employer configs to the new key shapes
--       (preserving insurance + any other keys) and backfill member compensation.
--
-- CONVENTIONS (mirror 0048/0056/0060/0061): SECURITY DEFINER + SET search_path =
--   public, pg_temp on client-callable RPCs; gate via (SELECT auth.jwt()) ->>
--   'app_role' (NEVER 'role'); RAISE P0001; REVOKE ALL FROM PUBLIC + GRANT EXECUTE
--   TO authenticated for new client RPCs. _insert_subscriber_chain stays
--   SECURITY INVOKER (as before) and is internal-only (REVOKE ALL FROM PUBLIC).
--   The trg_transactions_contribution balance trigger keys off type/splits and
--   ignores source, so two 'contribution' inserts grow the balance by both legs.
-- -----------------------------------------------------------------------------

-- (a) -------------------------------------------------------------------------
ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS compensation NUMERIC NOT NULL DEFAULT 0;

-- (b) -------------------------------------------------------------------------
-- DROP+CREATE (the new 4-arg signature differs from the 2-arg, so CREATE OR
-- REPLACE would create an ambiguous overload). plpgsql callers are late-bound, so
-- recreating in the same migration is safe.
DROP FUNCTION IF EXISTS public._insert_subscriber_chain(jsonb, text);

CREATE FUNCTION public._insert_subscriber_chain(
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
  -- p_amount_override forces the schedule amount (0 for employer co-contribution
  -- members, who do not self-save under the new model); NULL => use payload.
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

  -- Signup first-contribution deposit. Skipped for employer co-contribution
  -- members (p_skip_deposit) and never posted for a zero amount.
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

-- (d.1) invite completion: inline KYC validate (no amount requirement) for the
-- co-contribution branch + seed amount=0/no-deposit via the chain, and thread
-- compensation from the stored prefill onto every branch. -----------------------
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
    -- Co-contribution member. New model: members do NOT self-set a saving amount.
    -- Validate KYC fields inline (the amount>0 rule in _validate_signup_payload no
    -- longer applies) and insert via the shared chain with amount forced to 0 and
    -- the signup deposit skipped (decision D-A(a)) — keeps full-KYC beneficiary /
    -- insurance collection; ongoing runs compute both legs from compensation.
    IF COALESCE(payload ->> 'phone','') !~ '^(\+?256)?[0-9]{9}$' THEN RAISE EXCEPTION 'valid phone is required'; END IF;
    IF length(trim(COALESCE(payload ->> 'fullName',''))) < 2 THEN RAISE EXCEPTION 'fullName is required'; END IF;
    IF COALESCE(payload ->> 'dob','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'dob is required'; END IF;
    IF COALESCE(payload ->> 'gender','') NOT IN ('male','female','other') THEN RAISE EXCEPTION 'gender invalid'; END IF;
    IF COALESCE(payload ->> 'nin','') = '' THEN RAISE EXCEPTION 'nin is required'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.districts WHERE id = payload ->> 'districtId') THEN RAISE EXCEPTION 'unknown district'; END IF;
    v_new_id := public._insert_subscriber_chain(payload, NULL, 0, true);
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

  -- Thread the employer-stated monthly compensation onto the member (all branches).
  UPDATE public.subscribers
     SET compensation = COALESCE(NULLIF(v_inv.prefill ->> 'compensation','')::numeric, 0)
   WHERE id = v_new_id;

  UPDATE public.employer_invites SET status='completed', subscriber_id = v_new_id, completed_at = now() WHERE token = p_token;
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    INSERT INTO public.subscriber_signup_uploads (nonce, result) VALUES (p_nonce, to_jsonb(v_new_id)) ON CONFLICT (nonce) DO NOTHING;
  END IF;
  RETURN v_new_id;
END; $function$;

-- (d.2) employer-driven onboard: thread compensation from the payload. ----------
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

  -- Thread the employer-stated monthly compensation onto the member (all branches).
  UPDATE public.subscribers
     SET compensation = COALESCE(NULLIF(payload ->> 'compensation','')::numeric, 0)
   WHERE id = v_new_id;

  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    INSERT INTO public.subscriber_signup_uploads (nonce, result) VALUES (p_nonce, to_jsonb(v_new_id)) ON CONFLICT (nonce) DO NOTHING;
  END IF;
  RETURN v_new_id;
END; $function$;

-- (c) two-leg contribution run -------------------------------------------------
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

  v_run_id := 'run-' || replace(gen_random_uuid()::text, '-', '');
  v_tx_ref := 'EMP-' || substr(v_run_id, 5, 8);
  INSERT INTO public.contribution_runs (
    id, employer_id, period_label, status, employer_total, employee_total, grand_total, run_at
  ) VALUES (
    v_run_id, v_employer_id, p_period_label, 'completed', 0, 0, 0, now()
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

    IF COALESCE(v_employee_leg, 0) <= 0 AND COALESCE(v_employer_leg, 0) <= 0 THEN
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

    IF v_funded THEN
      v_members_funded := v_members_funded + 1;
    END IF;
  END LOOP;

  IF v_members_funded > 0 THEN
    UPDATE public.contribution_runs
       SET employer_total = v_employer_total,
           employee_total = v_employee_total,
           grand_total    = v_employer_total + v_employee_total
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
    'grandTotal',    v_employer_total + v_employee_total,
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

-- (e) employer-gated compensation edit (mirrors remove_employer_member, 0048) ----
CREATE OR REPLACE FUNCTION public.update_employer_member_compensation(p_subscriber_id text, p_compensation numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role        text := (SELECT auth.jwt()) ->> 'app_role';
  v_employer_id text := (SELECT auth.jwt()) ->> 'employerId';
  v_updated     integer := 0;
BEGIN
  IF v_role IS DISTINCT FROM 'employer' THEN
    RAISE EXCEPTION 'role % cannot update member compensation', v_role USING ERRCODE = 'P0001';
  END IF;
  IF v_employer_id IS NULL OR v_employer_id = '' THEN
    RAISE EXCEPTION 'missing employerId claim' USING ERRCODE = 'P0001';
  END IF;
  IF p_compensation IS NULL OR p_compensation < 0 THEN
    RAISE EXCEPTION 'compensation must be >= 0' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.subscribers
     SET compensation = p_compensation
   WHERE id = p_subscriber_id
     AND employer_id = v_employer_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'no member % on this employer''s roster', p_subscriber_id USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('id', p_subscriber_id, 'compensation', p_compensation, 'updated', v_updated);
END;
$function$;
REVOKE ALL ON FUNCTION public.update_employer_member_compensation(text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_employer_member_compensation(text, numeric) TO authenticated;

-- (f) demo-data reshape (MERGE-preserve insurance + any other keys) + backfill ---
-- co-contribution: drop matchPct/maxContribution, add employeePct (demo default 10)
--                  + employerMatchPct (carried from the old matchPct).
UPDATE public.employers
   SET default_contribution_config =
       (default_contribution_config - 'matchPct' - 'maxContribution')
       || jsonb_build_object(
            'employeePct',      10,
            'employerMatchPct', COALESCE(NULLIF(default_contribution_config ->> 'matchPct', '')::numeric, 50)
          )
 WHERE default_contribution_config ->> 'mode' = 'co-contribution';

-- employer-only: tag the existing fixed-amount configs with employerBasis='fixed'.
UPDATE public.employers
   SET default_contribution_config =
       default_contribution_config || jsonb_build_object('employerBasis', 'fixed')
 WHERE default_contribution_config ->> 'mode' = 'employer-only'
   AND NOT (default_contribution_config ? 'employerBasis');

-- backfill member compensation (demo-realistic; leaves untagged subscribers at 0).
UPDATE public.subscribers s
   SET compensation = GREATEST(
         COALESCE((SELECT cs.amount FROM public.contribution_schedules cs WHERE cs.subscriber_id = s.id), 0) * 10,
         500000
       )
 WHERE s.employer_id IS NOT NULL;

-- =============================================================================
-- End of 0062_contribution_model_v2.sql
-- =============================================================================
