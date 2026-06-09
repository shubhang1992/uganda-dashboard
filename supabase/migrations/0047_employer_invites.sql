-- =============================================================================
-- Universal Pensions Uganda — 0047: employer invite-based onboarding (KYC)
-- =============================================================================
-- Replaces the instant employer onboard with an invite + KYC flow, gated on the
-- employer's default_contribution_config.mode:
--   • employer-only   → invitee does full KYC, sets only the retirement/emergency
--                       split (no schedule, no first payment); starts at 0.
--   • co-contribution → same + a contribution schedule & first payment (mirrors
--                       normal self-signup).
-- The employer enters identity → create_employer_invite mints a token + pending
-- row (prefill). The invitee opens /invite/:token, completes KYC, and
-- create_subscriber_from_employer_invite creates a REAL subscriber tagged to the
-- employer (agent_id NULL ⇒ NO commission) and marks the invite completed.
--
-- CONVENTIONS: TEXT keys; snake_case; SECURITY DEFINER + SET search_path; read
-- (SELECT auth.jwt()) ->> 'app_role' (never 'role'); forward-only + .down.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- employer_invites — one pending row per invited prospective member
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employer_invites (
  token            TEXT PRIMARY KEY,
  employer_id      TEXT NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  prefill          JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { name, phone, email, nin, gender }
  collect_schedule BOOLEAN NOT NULL DEFAULT FALSE,        -- true = co-contribution flow
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'completed', 'expired')),
  subscriber_id    TEXT REFERENCES public.subscribers(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  completed_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS employer_invites_employer_id_idx ON public.employer_invites (employer_id);

ALTER TABLE public.employer_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_invites FORCE  ROW LEVEL SECURITY;

-- Employer reads its own invites (the roster's "pending" list). Writes go only
-- through the DEFINER RPCs below; anon never reads the table directly.
DROP POLICY IF EXISTS employer_invites_select_employer ON public.employer_invites;
CREATE POLICY employer_invites_select_employer ON public.employer_invites
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'employer'
    AND employer_id = (SELECT auth.jwt()) ->> 'employerId'
  );

-- -----------------------------------------------------------------------------
-- create_employer_invite(p_prefill jsonb) → jsonb { token, collectSchedule }
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_employer_invite(p_prefill jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_role        text := (SELECT auth.jwt()) ->> 'app_role';
  v_employer_id text := (SELECT auth.jwt()) ->> 'employerId';
  v_mode        text;
  v_collect     boolean;
  v_token       text;
  v_phone_norm  text;
BEGIN
  IF v_role IS DISTINCT FROM 'employer' THEN
    RAISE EXCEPTION 'role % cannot invite a member', v_role USING ERRCODE = 'P0001';
  END IF;
  IF v_employer_id IS NULL OR v_employer_id = '' THEN
    RAISE EXCEPTION 'missing employerId claim' USING ERRCODE = 'P0001';
  END IF;
  IF length(trim(COALESCE(p_prefill ->> 'fullName', ''))) < 2 THEN
    RAISE EXCEPTION 'member full name is required';
  END IF;
  IF COALESCE(p_prefill ->> 'phone', '') !~ '^(\+?256)?[0-9]{9}$' THEN
    RAISE EXCEPTION 'a valid member phone is required';
  END IF;

  SELECT default_contribution_config ->> 'mode' INTO v_mode FROM public.employers WHERE id = v_employer_id;
  v_collect := (v_mode = 'co-contribution');

  v_phone_norm := right(regexp_replace(COALESCE(p_prefill ->> 'phone', ''), '[^0-9]', '', 'g'), 9);

  -- Dup-guard: don't invite someone already on this employer's roster …
  IF EXISTS (
    SELECT 1 FROM public.subscribers s
     WHERE s.employer_id = v_employer_id
       AND right(regexp_replace(COALESCE(s.phone, ''), '[^0-9]', '', 'g'), 9) = v_phone_norm
  ) THEN
    RAISE EXCEPTION 'a member with phone % is already on your roster', p_prefill ->> 'phone' USING ERRCODE = 'P0001';
  END IF;
  -- … or already has a live pending invite.
  IF EXISTS (
    SELECT 1 FROM public.employer_invites i
     WHERE i.employer_id = v_employer_id AND i.status = 'pending' AND i.expires_at > now()
       AND right(regexp_replace(COALESCE(i.prefill ->> 'phone', ''), '[^0-9]', '', 'g'), 9) = v_phone_norm
  ) THEN
    RAISE EXCEPTION 'phone % already has a pending invite', p_prefill ->> 'phone' USING ERRCODE = 'P0001';
  END IF;

  v_token := 'inv-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.employer_invites (token, employer_id, prefill, collect_schedule)
  VALUES (v_token, v_employer_id, COALESCE(p_prefill, '{}'::jsonb), v_collect);

  RETURN jsonb_build_object('token', v_token, 'collectSchedule', v_collect);
END; $$;
REVOKE ALL ON FUNCTION public.create_employer_invite(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_employer_invite(jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- get_employer_invite(p_token text) → jsonb  (anon — pre-login invitee)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_employer_invite(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_inv record; v_employer_name text;
BEGIN
  SELECT * INTO v_inv FROM public.employer_invites WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite not found' USING ERRCODE = 'P0002'; END IF;
  IF v_inv.status <> 'pending' THEN RAISE EXCEPTION 'invite already used' USING ERRCODE = 'P0001'; END IF;
  IF v_inv.expires_at <= now() THEN RAISE EXCEPTION 'invite expired' USING ERRCODE = 'P0001'; END IF;

  SELECT name INTO v_employer_name FROM public.employers WHERE id = v_inv.employer_id;
  RETURN jsonb_build_object(
    'employerId', v_inv.employer_id,
    'employerName', v_employer_name,
    'prefill', v_inv.prefill,
    'collectSchedule', v_inv.collect_schedule
  );
END; $$;
REVOKE ALL ON FUNCTION public.get_employer_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_employer_invite(text) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- create_subscriber_from_employer_invite(payload, p_token, p_nonce) → text
--   (anon — completes after KYC). agent_id NULL ⇒ NO commission.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_subscriber_from_employer_invite(
  payload jsonb, p_token text, p_nonce text DEFAULT NULL
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_inv          record;
  v_new_id       text;
  v_prior        jsonb;
  v_phone_norm   text;
  v_existing_id  text;
  v_existing_emp text;
  v_sched        jsonb;
  v_dob          date;
  v_age          int;
  v_today        date := CURRENT_DATE;
  v_b            jsonb;
  v_nom_i        int := 0;
BEGIN
  -- Idempotency
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    SELECT result INTO v_prior FROM public.subscriber_signup_uploads WHERE nonce = p_nonce;
    IF v_prior IS NOT NULL THEN RETURN v_prior #>> '{}'; END IF;
  END IF;

  SELECT * INTO v_inv FROM public.employer_invites WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite not found' USING ERRCODE = 'P0002'; END IF;
  IF v_inv.status <> 'pending' THEN RAISE EXCEPTION 'invite already used' USING ERRCODE = 'P0001'; END IF;
  IF v_inv.expires_at <= now() THEN RAISE EXCEPTION 'invite expired' USING ERRCODE = 'P0001'; END IF;

  -- Dup-check by canonical phone: link an untagged existing subscriber rather
  -- than creating a second record; error if already tagged.
  v_phone_norm := right(regexp_replace(COALESCE(payload ->> 'phone', ''), '[^0-9]', '', 'g'), 9);
  SELECT id, employer_id INTO v_existing_id, v_existing_emp FROM public.subscribers
   WHERE right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 9) = v_phone_norm
   ORDER BY created_at DESC LIMIT 1;

  IF v_existing_id IS NOT NULL AND v_existing_emp IS NOT NULL THEN
    RAISE EXCEPTION 'a subscriber with phone % already belongs to an employer', payload ->> 'phone' USING ERRCODE = 'P0001';
  ELSIF v_existing_id IS NOT NULL THEN
    UPDATE public.subscribers SET employer_id = v_inv.employer_id WHERE id = v_existing_id;
    v_new_id := v_existing_id;
  ELSIF v_inv.collect_schedule THEN
    -- CO-CONTRIBUTION: full chain (schedule + first contribution + nominees +
    -- insurance) with NO agent, then tag the employer.
    PERFORM public._validate_signup_payload(payload);
    v_new_id := public._insert_subscriber_chain(payload, NULL);
    UPDATE public.subscribers SET employer_id = v_inv.employer_id WHERE id = v_new_id;
  ELSE
    -- EMPLOYER-ONLY: minimal insert — identity + 0 balance + schedule carrying
    -- ONLY the split (amount 0) + pension nominees. No first contribution.
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

    INSERT INTO public.subscribers (
      id, name, email, phone, gender, age, dob, nin, occupation, agent_id, employer_id,
      district_id, kyc_status, is_active, is_demo_signup, insurance_same_as_pension,
      registered_date, consent_at, contribution_history, products_held
    ) VALUES (
      v_new_id, payload ->> 'fullName', NULLIF(payload ->> 'email',''), payload ->> 'phone',
      payload ->> 'gender', v_age, v_dob, payload ->> 'nin', NULLIF(payload ->> 'occupation',''),
      NULL, v_inv.employer_id, payload ->> 'districtId', 'complete', TRUE, TRUE, FALSE,
      v_today, COALESCE((payload ->> 'consentTimestamp')::timestamptz, now()), '[]'::jsonb, '[]'::jsonb
    );
    INSERT INTO public.subscriber_balances (subscriber_id, retirement_balance, emergency_balance, total_balance, units, updated_at)
    VALUES (v_new_id, 0, 0, 0, 0, now()) ON CONFLICT (subscriber_id) DO NOTHING;
    INSERT INTO public.contribution_schedules (subscriber_id, frequency, amount, retirement_pct, emergency_pct, include_insurance, insurance_choice_made, next_due_date)
    VALUES (
      v_new_id, 'monthly', 0,
      COALESCE((v_sched ->> 'retirementPct')::int, 80),
      COALESCE((v_sched ->> 'emergencyPct')::int, 100 - COALESCE((v_sched ->> 'retirementPct')::int, 80)),
      FALSE, TRUE, v_today + 30
    );
    -- Pension nominees from the KYC beneficiaries step (if any).
    FOR v_b IN SELECT jsonb_array_elements(COALESCE(payload -> 'pensionBeneficiaries', '[]'::jsonb)) LOOP
      v_nom_i := v_nom_i + 1;
      INSERT INTO public.nominees (id, subscriber_id, type, name, phone, relationship, nin, share)
      VALUES ('nom-' || v_new_id || '-p-' || v_nom_i, v_new_id, 'pension',
              v_b ->> 'name', v_b ->> 'phone', v_b ->> 'relationship', v_b ->> 'nin',
              COALESCE((v_b ->> 'share')::numeric, 0));
    END LOOP;
  END IF;

  UPDATE public.employer_invites
     SET status = 'completed', subscriber_id = v_new_id, completed_at = now()
   WHERE token = p_token;

  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    INSERT INTO public.subscriber_signup_uploads (nonce, result) VALUES (p_nonce, to_jsonb(v_new_id)) ON CONFLICT (nonce) DO NOTHING;
  END IF;
  RETURN v_new_id;
END; $$;
REVOKE ALL ON FUNCTION public.create_subscriber_from_employer_invite(jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_subscriber_from_employer_invite(jsonb, text, text) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- cancel_employer_invite(p_token text) → void  (employer-gated)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_employer_invite(p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_employer_id text := (SELECT auth.jwt()) ->> 'employerId';
BEGIN
  IF (SELECT auth.jwt()) ->> 'app_role' IS DISTINCT FROM 'employer' THEN
    RAISE EXCEPTION 'not an employer' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.employer_invites SET status = 'expired'
   WHERE token = p_token AND employer_id = v_employer_id AND status = 'pending';
END; $$;
REVOKE ALL ON FUNCTION public.cancel_employer_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_employer_invite(text) TO authenticated;

-- =============================================================================
-- End of 0047_employer_invites.sql
-- =============================================================================
