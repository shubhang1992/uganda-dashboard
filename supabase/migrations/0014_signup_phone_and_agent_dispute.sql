-- =============================================================================
-- Universal Pensions Uganda — 0014: signup phone canonicalisation,
--                                   public geo reads, agent dispute RPC
-- =============================================================================
-- Closes three confirmed gaps identified across the cross-role backend audit:
--
--   A. Anonymous signup callers can't read `districts` / `regions`. The
--      pre-0014 policies gated on `app_role IS NOT NULL`; a user on the signup
--      screen has no JWT (no `accessToken` yet → anon key), so the policy
--      returns 0 rows. The signup district combobox renders empty silently.
--      Districts and regions are pure geographic reference data (verified
--      column-by-column: id/name/parent_id/center_*/active — no PII).
--      Resolution: replace the gated SELECT policy with `USING (true)`.
--
--   B. `_insert_subscriber_chain` writes `subscribers.phone` verbatim from the
--      JSON payload. Both subscriber signup (`ContributionRoute.buildPayload`)
--      and agent onboarding (`OnboardingComplete.buildPayload`) ship the 9-digit
--      local form (e.g. '777247884'); the seed and `verify-otp.toCanonicalUGPhone`
--      use the canonical `+256XXXXXXXXX` form. The mismatch makes verify-otp's
--      phone lookup fail for every signup → fallback to ROLE_DEFAULTS.subscriber
--      ('s-0001') → every fresh signup lands on Brian Okello's dashboard.
--      Resolution: add a SQL helper `_canonical_ug_phone` that mirrors
--      `src/utils/phone.js#toCanonicalUGPhone`, COALESCE through it inside
--      the chain function, and backfill demo-signup rows that were inserted
--      with the wrong shape pre-fix.
--
--   C. Frontend `disputeCommission(by='agent')` rejects with
--      "agent dispute path not yet built (no agent_dispute_line RPC)". Branch
--      admins have `branch_dispute_line` (0004 line 666); agents have nothing.
--      Resolution: add `agent_dispute_line(commission_id, dispute_reason)`,
--      mirroring `branch_dispute_line` byte-for-byte except for the role check
--      (`app_role = 'agent'`), the ownership clause (`agent_id = agentId claim`),
--      and the `disputed_by = 'agent'` literal. `withdraw_dispute` already
--      scopes by `agent_id` ownership only, so unwinding either-role disputes
--      Just Works (0004 line 944).
--
-- Migration shape follows the project convention: forward-only, re-runnable.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- A. Public geo reads
-- -----------------------------------------------------------------------------
-- Drop the gated `*_select_authenticated` policies installed by 0003 and
-- carried forward by 0007/0008. Replace with `USING (true)` so the anon key
-- can read districts and regions before login. Default Supabase grants
-- already give SELECT on public.* to anon — no GRANT statement needed.

DROP POLICY IF EXISTS regions_select_authenticated ON public.regions;
DROP POLICY IF EXISTS regions_select_public        ON public.regions;
CREATE POLICY regions_select_public ON public.regions
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS districts_select_authenticated ON public.districts;
DROP POLICY IF EXISTS districts_select_public        ON public.districts;
CREATE POLICY districts_select_public ON public.districts
  FOR SELECT
  USING (true);


-- -----------------------------------------------------------------------------
-- B1. _canonical_ug_phone(text) helper
-- -----------------------------------------------------------------------------
-- Mirrors src/utils/phone.js#toCanonicalUGPhone and api/_lib/phone.ts:
--   * strip every non-digit,
--   * if leading '256', drop it; else if leading '0', drop it,
--   * require length 9 and prefix ∈ {70,71,74,75,76,77,78},
--   * return '+256' || local, otherwise NULL.
-- IMMUTABLE so it can appear inside trigger bodies / generated columns.
-- search_path pinned per 0010 convention.

CREATE OR REPLACE FUNCTION public._canonical_ug_phone(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits text;
  v_local  text;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  v_digits := regexp_replace(raw, '\D', '', 'g');
  IF v_digits LIKE '256%' THEN
    v_local := substr(v_digits, 4);
  ELSIF v_digits LIKE '0%' THEN
    v_local := substr(v_digits, 2);
  ELSE
    v_local := v_digits;
  END IF;
  IF length(v_local) <> 9 THEN
    RETURN NULL;
  END IF;
  IF substr(v_local, 1, 2) NOT IN ('70','71','74','75','76','77','78') THEN
    RETURN NULL;
  END IF;
  RETURN '+256' || v_local;
END;
$$;

ALTER FUNCTION public._canonical_ug_phone(text) SET search_path = public, pg_temp;


-- -----------------------------------------------------------------------------
-- B2. _insert_subscriber_chain — CREATE OR REPLACE with canonical phone
-- -----------------------------------------------------------------------------
-- Re-emit the function body from 0002_rpc_functions.sql:943-1170 byte-for-byte
-- except the `subscribers.phone` INSERT value, which now goes through the
-- canonicaliser. `COALESCE` keeps `_validate_signup_payload`'s permissive
-- regex tolerance intact: if the helper rejects garbage, we fall back to the
-- raw payload value (which the validator already accepted).

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
    COALESCE((p_payload ->> 'includeInsurance')::boolean, FALSE),
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
  v_insurance_pol := p_payload -> 'insurancePolicy';
  IF v_insurance_pol IS NOT NULL THEN
    INSERT INTO public.insurance_policies (
      subscriber_id, cover, premium_monthly,
      policy_start, renewal_date, status
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

  RETURN v_new_id;
END;
$$;

ALTER FUNCTION public._insert_subscriber_chain(jsonb, text) SET search_path = public, pg_temp;


-- -----------------------------------------------------------------------------
-- B3. Backfill demo-signup rows whose phone is non-canonical
-- -----------------------------------------------------------------------------
-- The partial unique index `subscribers_phone_unique_non_demo_idx` is
-- `WHERE NOT is_demo_signup` (0001_initial_schema.sql:455). Demo-signup rows
-- are exempt — backfill cannot collide with seeded uniqueness. Seeded rows
-- (`is_demo_signup = FALSE`) are already canonical (scripts/seed-supabase.mjs)
-- and are untouched.

UPDATE public.subscribers
SET phone = public._canonical_ug_phone(phone)
WHERE is_demo_signup = TRUE
  AND public._canonical_ug_phone(phone) IS NOT NULL
  AND phone <> public._canonical_ug_phone(phone);


-- -----------------------------------------------------------------------------
-- C. agent_dispute_line(commission_id text, dispute_reason text) RETURNS void
-- -----------------------------------------------------------------------------
-- Mirrors `branch_dispute_line` in 0004_commission_run_rpcs.sql:666, with
-- three differences:
--   * Role guard: app_role = 'agent' (the live policy uses app_role; new
--     functions skip the legacy `role` claim, no need for 0007's dynamic swap).
--   * Ownership clause: commission.agent_id = JWT.agentId.
--   * `disputed_by` literal = 'agent' (matches branch's role-label convention
--     so approve_dispute / reject_dispute / withdraw_dispute downstream paths
--     stay symmetric).
-- State machine: identical to branch — idempotent on 'disputed', terminal on
-- 'rejected', detach from run on 'in_run', preserve run association elsewhere.
-- The BEFORE-UPDATE trigger captures OLD.status into NEW.previous_status when
-- NEW.status='disputed', so withdraw / approve_dispute can restore correctly.
-- SECURITY DEFINER + GRANT mirrors the rest of the state machine.

CREATE OR REPLACE FUNCTION public.agent_dispute_line(
  p_commission_id  text,
  p_dispute_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role     text := (SELECT auth.jwt()) ->> 'app_role';
  v_agent    text := (SELECT auth.jwt()) ->> 'agentId';
  v_c_agent  text;
  v_status   commission_status;
BEGIN
  IF v_role IS DISTINCT FROM 'agent' THEN
    RAISE EXCEPTION 'role % cannot dispute a commission line', v_role
      USING ERRCODE = 'P0001';
  END IF;

  IF v_agent IS NULL OR v_agent = '' THEN
    RAISE EXCEPTION 'agentId claim missing from JWT'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT agent_id, status INTO v_c_agent, v_status
    FROM commissions WHERE id = p_commission_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Commission not found: %', p_commission_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_c_agent IS DISTINCT FROM v_agent THEN
    RAISE EXCEPTION 'Commission % does not belong to agent %', p_commission_id, v_agent
      USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent on already-disputed (matches branch_dispute_line at 0004:701).
  IF v_status = 'disputed' THEN
    RETURN;
  END IF;

  -- Terminal 'rejected' cannot be re-disputed.
  IF v_status = 'rejected' THEN
    RAISE EXCEPTION 'Commission % is rejected; cannot dispute', p_commission_id
      USING ERRCODE = 'P0001';
  END IF;

  -- in_run lines detach from the run; paid/released/confirmed keep audit trail.
  IF v_status = 'in_run' THEN
    UPDATE commissions
       SET status         = 'disputed',
           run_id         = NULL,
           dispute_reason = COALESCE(p_dispute_reason, 'Dispute raised'),
           disputed_at    = now(),
           disputed_by    = 'agent',
           resolved_at    = NULL,
           resolved_by    = NULL,
           outcome_reason = NULL
     WHERE id = p_commission_id;
  ELSE
    UPDATE commissions
       SET status         = 'disputed',
           dispute_reason = COALESCE(p_dispute_reason, 'Dispute raised'),
           disputed_at    = now(),
           disputed_by    = 'agent',
           resolved_at    = NULL,
           resolved_by    = NULL,
           outcome_reason = NULL
     WHERE id = p_commission_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_dispute_line(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agent_dispute_line(text, text) TO authenticated;


-- =============================================================================
-- End of 0014_signup_phone_and_agent_dispute.sql
-- =============================================================================
