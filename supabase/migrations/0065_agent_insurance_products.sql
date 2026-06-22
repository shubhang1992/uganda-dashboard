-- =============================================================================
-- Universal Pensions Uganda — 0065: agent reads a subscriber's extra insurance
-- products + the signup chain persists multi-product insurance at creation.
-- =============================================================================
-- WHY: the subscriber dashboard added multi-product insurance (Life / Health /
--   Funeral). The agent dashboard needs to (1) SEE which active policies a
--   subscriber holds, and (2) PERSIST a multi-product selection made during
--   agent onboarding. Two gaps block this today:
--     - subscriber_insurance_products (0064) has subscriber-self RLS only, so the
--       PostgREST embed the agent issues returns an EMPTY array (silently, via
--       RLS) — health/funeral chips would never appear.
--     - _insert_subscriber_chain (0062 body) writes only the life row into
--       insurance_policies; it ignores any extra products in the payload.
--
-- This migration (forward-only; reversible via 0065_agent_insurance_products.down.sql):
--   (1) sip_select_agent — agent SELECT RLS on subscriber_insurance_products,
--       mirroring insurance_policies_select_agent (0008): scope to the agent's own
--       subscribers via subscribers.agent_id. No GRANT needed (0064 inherits the
--       public-schema default SELECT grant to authenticated, same as
--       insurance_policies).
--   (2) Re-emit _insert_subscriber_chain (0062 body, byte-faithful, same 4-arg
--       signature → CREATE OR REPLACE, no DROP/overload dance) adding ONE block
--       after the life insurance_policies INSERT: loop payload.insuranceProducts
--       and INSERT each health/funeral row into subscriber_insurance_products.
--       'life' is never written here (it belongs in insurance_policies); the IN
--       ('health','funeral') guard is belt-and-braces against a mis-built payload.
--       Policy rows ONLY — NO transactions row, so the contribution balance
--       trigger never fires (premium payment stays the subscriber's own later
--       pay_insurance_premium flow).
--
-- RLS-BYPASS NOTE (for maintainers): _insert_subscriber_chain is SECURITY INVOKER,
--   yet its INSERTs bypass RLS. That is NOT because the wrapper is DEFINER — it is
--   because the parent signup RPCs (create_subscriber_from_signup /
--   _from_agent_onboard / _from_employer_invite) are SECURITY DEFINER owned by the
--   migration owner (postgres, BYPASSRLS), and the nested INVOKER chain inherits
--   that effective role. The existing insurance_policies INSERT relies on the same
--   mechanism, so the new subscriber_insurance_products INSERT works identically.
--
-- CONVENTIONS (mirror 0062): _insert_subscriber_chain stays SECURITY INVOKER +
--   SET search_path = public, pg_temp + internal-only (REVOKE ALL FROM PUBLIC).
-- -----------------------------------------------------------------------------

-- (1) Agent SELECT RLS on subscriber_insurance_products -----------------------
DROP POLICY IF EXISTS sip_select_agent ON public.subscriber_insurance_products;
CREATE POLICY sip_select_agent ON public.subscriber_insurance_products
  FOR SELECT
  USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'agent'
    AND EXISTS (
      SELECT 1 FROM public.subscribers s
      WHERE s.id = subscriber_insurance_products.subscriber_id
        AND s.agent_id = (SELECT auth.jwt()) ->> 'agentId'
    )
  );

-- (2) Re-emit _insert_subscriber_chain (0062 body + insuranceProducts loop) ----
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
  v_ins_prod       jsonb;   -- NEW: one element of payload.insuranceProducts
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

  -- NEW: extra (non-life) insurance products -> subscriber_insurance_products.
  -- payload.insuranceProducts = [{product, cover, premiumMonthly, policyStart?,
  -- renewalDate?}]. 'life' lives in insurance_policies (above), so it is ignored
  -- here. status derived from cover>0 to match the life branch. ON CONFLICT keeps
  -- a payload-dup idempotent. NO transactions row → no balance trigger.
  IF jsonb_typeof(p_payload -> 'insuranceProducts') = 'array' THEN
    FOR v_ins_prod IN SELECT jsonb_array_elements(p_payload -> 'insuranceProducts') LOOP
      IF (v_ins_prod ->> 'product') IN ('health', 'funeral') THEN
        INSERT INTO public.subscriber_insurance_products (
          subscriber_id, product, cover, premium_monthly, policy_start, renewal_date, status, updated_at
        ) VALUES (
          v_new_id,
          v_ins_prod ->> 'product',
          COALESCE((v_ins_prod ->> 'cover')::numeric, 0),
          COALESCE((v_ins_prod ->> 'premiumMonthly')::numeric, 0),
          COALESCE((v_ins_prod ->> 'policyStart')::date, v_today),
          COALESCE((v_ins_prod ->> 'renewalDate')::date, (v_today + INTERVAL '1 year')::date),
          CASE
            WHEN COALESCE((v_ins_prod ->> 'cover')::numeric, 0) > 0 THEN 'active'
            ELSE 'inactive'
          END,
          now()
        )
        ON CONFLICT (subscriber_id, product) DO NOTHING;
      END IF;
    END LOOP;
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

-- =============================================================================
-- End of 0065_agent_insurance_products.sql
-- =============================================================================
