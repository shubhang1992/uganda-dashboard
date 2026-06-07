-- =============================================================================
-- Universal Pensions Uganda — 0046: employer onboard = identity only
-- =============================================================================
-- The 0044 employer-onboard RPC reused _insert_subscriber_chain, which REQUIRES
-- a contribution schedule (amount > 0) and auto-creates a first contribution
-- equal to it. For employer onboarding that's wrong: the employee's own saving
-- is theirs to set (from the subscriber dashboard), and it produced a phantom
-- starting balance. Re-emit the RPC to enrol IDENTITY + CONSENT only — the
-- member starts at a 0 balance, with NO schedule and NO first contribution.
-- Employer money is added separately via submit_employer_contribution_run.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_subscriber_from_employer_onboard(
  payload jsonb, calling_employer_id text, p_nonce text DEFAULT NULL
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
END; $$;
REVOKE ALL ON FUNCTION public.create_subscriber_from_employer_onboard(jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_subscriber_from_employer_onboard(jsonb, text, text) TO authenticated;

-- =============================================================================
-- End of 0046_employer_onboard_no_schedule.sql
-- =============================================================================
