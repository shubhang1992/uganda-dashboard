-- =============================================================================
-- DOWN — 0046_employer_onboard_no_schedule.sql
-- =============================================================================
-- Restores the 0044 onboard RPC (which reused _insert_subscriber_chain — creates
-- a schedule + first contribution from payload.contributionSchedule).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_subscriber_from_employer_onboard(
  payload jsonb, calling_employer_id TEXT, p_nonce TEXT DEFAULT NULL
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT := (SELECT auth.jwt()) ->> 'app_role';
  v_jwt_emp_id TEXT; v_new_id TEXT; v_prior JSONB; v_phone_norm TEXT; v_existing_id TEXT; v_existing_emp TEXT;
BEGIN
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    SELECT result INTO v_prior FROM public.subscriber_signup_uploads WHERE nonce = p_nonce;
    IF v_prior IS NOT NULL THEN RETURN v_prior #>> '{}'; END IF;
  END IF;
  IF v_role IS DISTINCT FROM 'employer' THEN RAISE EXCEPTION 'role % cannot onboard an employee', v_role USING ERRCODE = 'P0001'; END IF;
  IF calling_employer_id IS NULL OR calling_employer_id = '' THEN RAISE EXCEPTION 'calling_employer_id is required'; END IF;
  BEGIN v_jwt_emp_id := (SELECT auth.jwt()) ->> 'employerId'; EXCEPTION WHEN OTHERS THEN v_jwt_emp_id := NULL; END;
  IF v_jwt_emp_id IS NOT NULL AND v_jwt_emp_id <> calling_employer_id THEN
    RAISE EXCEPTION 'calling_employer_id (%) does not match JWT employerId (%)', calling_employer_id, v_jwt_emp_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employers WHERE id = calling_employer_id) THEN
    RAISE EXCEPTION 'unknown employer: %', calling_employer_id;
  END IF;
  PERFORM public._validate_signup_payload(payload);
  v_phone_norm := right(regexp_replace(COALESCE(payload ->> 'phone', ''), '[^0-9]', '', 'g'), 9);
  SELECT id, employer_id INTO v_existing_id, v_existing_emp FROM public.subscribers
   WHERE right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 9) = v_phone_norm
   ORDER BY created_at DESC LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    IF v_existing_emp = calling_employer_id THEN RAISE EXCEPTION 'a subscriber with phone % is already on your roster', payload ->> 'phone' USING ERRCODE = 'P0001';
    ELSIF v_existing_emp IS NOT NULL THEN RAISE EXCEPTION 'a subscriber with phone % already belongs to another employer', payload ->> 'phone' USING ERRCODE = 'P0001';
    ELSE
      UPDATE public.subscribers SET employer_id = calling_employer_id WHERE id = v_existing_id;
      v_new_id := v_existing_id;
    END IF;
  ELSE
    v_new_id := public._insert_subscriber_chain(payload, NULL);
    UPDATE public.subscribers SET employer_id = calling_employer_id WHERE id = v_new_id;
  END IF;
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    INSERT INTO public.subscriber_signup_uploads (nonce, result) VALUES (p_nonce, to_jsonb(v_new_id)) ON CONFLICT (nonce) DO NOTHING;
  END IF;
  RETURN v_new_id;
END; $$;
REVOKE ALL ON FUNCTION public.create_subscriber_from_employer_onboard(jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_subscriber_from_employer_onboard(jsonb, text, text) TO authenticated;
