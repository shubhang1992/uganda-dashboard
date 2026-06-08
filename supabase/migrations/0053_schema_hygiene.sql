-- =============================================================================
-- Universal Pensions Uganda — 0053: schema-hygiene sweep
-- =============================================================================
-- One coherent migration collecting the LOW-severity schema/RPC hygiene items
-- the 2026-06-08 audit catalogued (§1a.6/.7/.8/.9/.11, §1b.1/.5, §2a.8, §4a D-2,
-- §4b.10). Each block is independently idempotent (IF EXISTS / IF NOT EXISTS /
-- CREATE OR REPLACE) and reversed by the matching 0053_schema_hygiene.down.sql.
--
-- CONVENTIONS (mirroring 0044 / 0049 / 0052):
--   * SECURITY DEFINER bodies re-emitted via CREATE OR REPLACE preserve the exact
--     signature + return shape (so the mocked frontend tests stay green) and pin
--     `SET search_path = public, pg_temp` (NEVER drop the pin — that is the 0042
--     regression 0052 just fixed).
--   * search_path-only fixes use a bare ALTER FUNCTION (the proven 0006/0010/
--     0052 pattern) — NO body re-emit, so no risk of re-introducing drift.
--   * Role read via (SELECT auth.jwt()) ->> 'app_role' (NEVER 'role').
--   * Forward-only; reversible via the matching .down. Idempotent.
--
-- ⚠️ DELIBERATE DEPARTURE FROM THE AUDIT TEXT (§1a.7): the audit's "orphan
--    agents.coverage_rate, drop it" verdict was reached by grepping the JS layer
--    only (src/services/** + seed). It is NOT orphan at the SQL layer — the live
--    get_entity_metrics_rollup RPC (0020) reads it heavily
--    (SUM(coverage_rate * total_subs) in every level). Dropping it would BREAK
--    the distributor/admin drill-down rollup. Per the audit's own sanctioned
--    alternative ("or document as reserved"), this migration KEEPS the column and
--    adds a COMMENT instead of dropping it. See block (2).
-- =============================================================================


-- =============================================================================
-- (1) §1a.6 — drop the DUPLICATE nominees.share CHECK.
-- =============================================================================
-- `nominees` carries two byte-identical range checks on `share`:
--   * nominees_share_check       — the inline CHECK from 0001:227 (KEEP)
--   * nominees_share_range_chk   — the redundant clone added by 0024:22 (DROP)
-- Every write evaluates the same 0..100 predicate twice. Drop the 0024 clone;
-- the 0001 inline check (plus the upsert_nominees RPC sum-to-100 assertion)
-- retain full defence-in-depth.
ALTER TABLE public.nominees DROP CONSTRAINT IF EXISTS nominees_share_range_chk;


-- =============================================================================
-- (2) §1a.7 — agents.coverage_rate: KEEP + document (NOT drop — see header).
-- =============================================================================
-- Consumed by get_entity_metrics_rollup (0020). The JS layer never reads it, so
-- the audit flagged it as orphan; record its real (SQL-side) consumer so the
-- next author does not re-attempt the drop.
COMMENT ON COLUMN public.agents.coverage_rate IS
  'Per-agent coverage % (0-100), seeded in 0018. Consumed by get_entity_metrics_rollup (0020) as the subscriber-weighted coverage aggregate (SUM(coverage_rate * total_subs)). NOT orphan despite no JS-layer reader — do not drop without re-pointing the rollup RPC. (audit 2026-06-08 §1a.7)';


-- =============================================================================
-- (3) §1a.11 / §5b.6 — covering index on employer_invites.subscriber_id.
-- =============================================================================
-- The FK employer_invites.subscriber_id -> subscribers(id) ON DELETE SET NULL
-- (0047:29) has no covering index, so DELETE FROM subscribers (reseed/cleanup)
-- seq-scans employer_invites per deleted row. Add the index.
CREATE INDEX IF NOT EXISTS employer_invites_subscriber_id_idx
  ON public.employer_invites (subscriber_id);


-- =============================================================================
-- (4) §1b.1 — add pg_temp to the 5 DEFINER/INVOKER fns pinned bare `public`.
-- =============================================================================
-- These pin `search_path = public` (no pg_temp), inconsistent with the house
-- `public, pg_temp` convention (a pg_temp-shadowing attacker could otherwise
-- pre-empt an unqualified temp object). None is advisor-flagged today, but
-- normalise them via bare ALTER (no body re-emit → no drift). The two
-- enforce-editable-cols trigger fns are INVOKER and stay INVOKER — only the
-- search_path changes.
ALTER FUNCTION public.create_subscriber_from_signup(jsonb, text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.create_subscriber_from_agent_onboard(jsonb, text, text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.get_entity_metrics_rollup(text, text[])
  SET search_path = public, pg_temp;
ALTER FUNCTION public.upsert_nominees(text, jsonb, jsonb)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_distributors_enforce_editable_cols()
  SET search_path = public, pg_temp;


-- =============================================================================
-- (5) §1a.8 — lock subscribers.employer_id in the editable-columns trigger.
-- =============================================================================
-- trg_subscribers_enforce_editable_cols() (0005, app_role-swapped by 0007,
-- pinned by 0010/0028) RAISEs on a self-UPDATE of 18 immutable columns but never
-- listed employer_id (the 0043 column), so a subscriber could
-- `UPDATE subscribers SET employer_id = '<any-emp>' WHERE id = <self>` and
-- self-attach to / detach from an employer roster, bypassing the employer-gated
-- DEFINER paths. Re-emit the live body (reading 'app_role', INVOKER, pinned
-- public,pg_temp — exactly as 0007+0010 left it live) with employer_id added to
-- the lock-list. The legitimate DEFINER setters run with app_role='employer', so
-- the `IF v_role IS DISTINCT FROM 'subscriber' THEN RETURN NEW` guard still lets
-- them through. INVOKER + pin preserved so it converges with 0010/0028.
CREATE OR REPLACE FUNCTION public.trg_subscribers_enforce_editable_cols()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT := auth.jwt() ->> 'app_role';
BEGIN
  -- Only subscribers are constrained; everyone else (incl. the employer-gated
  -- DEFINER RPCs and service-role) passes through.
  IF v_role IS DISTINCT FROM 'subscriber' THEN
    RETURN NEW;
  END IF;

  -- Non-editable columns must remain unchanged.
  IF NEW.id                        IS DISTINCT FROM OLD.id                        THEN RAISE EXCEPTION 'cannot modify id';                        END IF;
  IF NEW.gender                    IS DISTINCT FROM OLD.gender                    THEN RAISE EXCEPTION 'cannot modify gender';                    END IF;
  IF NEW.age                       IS DISTINCT FROM OLD.age                       THEN RAISE EXCEPTION 'cannot modify age';                       END IF;
  IF NEW.dob                       IS DISTINCT FROM OLD.dob                       THEN RAISE EXCEPTION 'cannot modify dob';                       END IF;
  IF NEW.nin                       IS DISTINCT FROM OLD.nin                       THEN RAISE EXCEPTION 'cannot modify nin';                       END IF;
  IF NEW.agent_id                  IS DISTINCT FROM OLD.agent_id                  THEN RAISE EXCEPTION 'cannot modify agent_id';                  END IF;
  IF NEW.employer_id               IS DISTINCT FROM OLD.employer_id               THEN RAISE EXCEPTION 'cannot modify employer_id';               END IF;
  IF NEW.district_id               IS DISTINCT FROM OLD.district_id               THEN RAISE EXCEPTION 'cannot modify district_id';               END IF;
  IF NEW.kyc_status                IS DISTINCT FROM OLD.kyc_status                THEN RAISE EXCEPTION 'cannot modify kyc_status';                END IF;
  IF NEW.is_active                 IS DISTINCT FROM OLD.is_active                 THEN RAISE EXCEPTION 'cannot modify is_active';                 END IF;
  IF NEW.is_demo_signup            IS DISTINCT FROM OLD.is_demo_signup            THEN RAISE EXCEPTION 'cannot modify is_demo_signup';            END IF;
  IF NEW.insurance_same_as_pension IS DISTINCT FROM OLD.insurance_same_as_pension THEN RAISE EXCEPTION 'cannot modify insurance_same_as_pension'; END IF;
  IF NEW.registered_date           IS DISTINCT FROM OLD.registered_date           THEN RAISE EXCEPTION 'cannot modify registered_date';           END IF;
  IF NEW.last_contribution_date    IS DISTINCT FROM OLD.last_contribution_date    THEN RAISE EXCEPTION 'cannot modify last_contribution_date';    END IF;
  IF NEW.contribution_history      IS DISTINCT FROM OLD.contribution_history      THEN RAISE EXCEPTION 'cannot modify contribution_history';      END IF;
  IF NEW.products_held             IS DISTINCT FROM OLD.products_held             THEN RAISE EXCEPTION 'cannot modify products_held';             END IF;
  IF NEW.current_unit_value        IS DISTINCT FROM OLD.current_unit_value        THEN RAISE EXCEPTION 'cannot modify current_unit_value';        END IF;
  IF NEW.unit_value_as_of          IS DISTINCT FROM OLD.unit_value_as_of          THEN RAISE EXCEPTION 'cannot modify unit_value_as_of';          END IF;
  IF NEW.created_at                IS DISTINCT FROM OLD.created_at                THEN RAISE EXCEPTION 'cannot modify created_at';                END IF;

  RETURN NEW;
END;
$$;


-- =============================================================================
-- (6) §1a.9 — add the missing notifications employer SELECT policy.
-- =============================================================================
-- notifications has _admin/_agent/_branch/_distributor SELECT policies but no
-- _employer one. Latent today (no employer notification is emitted yet), but the
-- first employer-targeted row would be silently unreadable. Add the per-recipient
-- clone gated on the employerId claim. DROP-then-CREATE so a replay converges.
DROP POLICY IF EXISTS notifications_select_employer ON public.notifications;
CREATE POLICY notifications_select_employer ON public.notifications
  FOR SELECT USING (
    (SELECT auth.jwt()) ->> 'app_role'  = 'employer'
    AND recipient_role = 'employer'
    AND recipient_id   = (SELECT auth.jwt()) ->> 'employerId'
  );


-- =============================================================================
-- (7) §4a D-2 — next_due_date interval arithmetic in _insert_subscriber_chain.
-- =============================================================================
-- _insert_subscriber_chain computed the schedule's next_due_date as
-- `v_today + (365 / v_freq_per_year)::int` — integer day arithmetic (monthly
-- = +30 days, quarterly = +91, …), so a "monthly" payer's due date creeps
-- ~5 days earlier each year and never lands on the same day-of-month. Re-emit
-- the 0042 body BYTE-FAITHFULLY except (a) the next_due_date is now true calendar
-- interval arithmetic keyed to frequency and (b) the search_path pin is restored
-- (0052 re-pinned this fn via ALTER; a body re-emit would drop it again, so it is
-- re-asserted here). Signature + RETURN shape unchanged.
CREATE OR REPLACE FUNCTION public._insert_subscriber_chain(
  p_payload          jsonb,
  p_calling_agent_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
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
  -- 3.2 sum-to-100 supporting locals (copied semantics from 0024).
  v_p_count        INTEGER;
  v_p_sum          NUMERIC;
  v_i_count        INTEGER;
  v_i_sum          NUMERIC;
BEGIN
  -- Mint ID inside the function (sequence-backed; > seeded range).
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
  -- §4a D-2: true calendar-interval cadence keyed to frequency (monthly lands on
  -- the same day-of-month, etc.) instead of the legacy 365/periodsPerYear integer
  -- day arithmetic. v_freq_per_year is retained for callers/readers but no longer
  -- drives the date.
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
    -- includeInsurance is nested in the `contributionSchedule` sub-object by the
    -- client (ContributionRoute/OnboardingComplete buildPayload), so read it from
    -- v_schedule, NOT the payload root (root would always be NULL → FALSE, leaving
    -- include_insurance false even for opted-in subscribers). insuranceChoiceMade
    -- IS emitted at the payload root, so it correctly reads p_payload.
    COALESCE((v_schedule ->> 'includeInsurance')::boolean, FALSE),
    COALESCE((p_payload ->> 'insuranceChoiceMade')::boolean, TRUE),
    v_next_due
  );

  ------------------------------------------------------------------- nominees
  -- 3.2: assert sum-to-100 per nominee type BEFORE inserting (copied EXACTLY
  -- from 0024:80-87 — tolerance 0.01, empty array exempt, ERRCODE 'P0005').
  -- Pension beneficiaries always go in.
  v_p_ben := COALESCE(p_payload -> 'pensionBeneficiaries', '[]'::jsonb);

  SELECT COUNT(*), COALESCE(SUM((n->>'share')::numeric), 0)
    INTO v_p_count, v_p_sum
    FROM jsonb_array_elements(v_p_ben) n;
  IF v_p_count > 0 AND ABS(v_p_sum - 100) > 0.01 THEN
    RAISE EXCEPTION 'pension_share_sum_must_equal_100 (got %)', v_p_sum
      USING ERRCODE = 'P0005';
  END IF;

  -- Insurance: validate the array that will actually be inserted. When
  -- insuranceSameAsPension, the inserted list IS the pension list (already
  -- asserted above), so no extra check is needed; otherwise assert the
  -- standalone insuranceBeneficiaries array.
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

  -- Pension beneficiaries always go in.
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

  -- Insurance beneficiaries: if insuranceSameAsPension, copy the pension list.
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
  -- Optional. Accepts either an `insurancePolicy` jsonb sub-object or the
  -- legacy flat `cover` / `premiumMonthly` keys at the payload root.
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
  -- First contribution. The AFTER INSERT trigger above:
  --   • bumps subscriber_balances (split 80/20 or per-row override),
  --   • creates the first-contribution commission row.
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
    -- Honour the schedule's retirement/emergency percentages on the first txn
    -- so the resulting balances mirror what mockData seeds (e.g. 40k → 32k/8k
    -- on the default 80/20 split).
    ROUND(v_amount * (v_retirement_pct / 100.0)),
    v_amount - ROUND(v_amount * (v_retirement_pct / 100.0))
  );

  RETURN v_new_id;
END;
$$;


-- =============================================================================
-- (8) §1b.5 / §2a.8 — input validation on create_employer + create_distributor.
-- =============================================================================
-- Both (0049) gate on app_role='admin' and reject an empty name, but accept any
-- length / format on every other field and never check that p_district (employer)
-- / p_parent_id (distributor) exist. Re-emit with: length caps, email/phone
-- format checks, a jsonb-shape check on the employer config, and district/parent
-- existence (§1b.5). Signatures + RETURN shape (to_jsonb(row)) preserved so the
-- service-layer mapDistributor()/mapEmployer() and mocked tests stay green.
-- Friendly P0001 messages (the service layer surfaces error.message).

CREATE OR REPLACE FUNCTION public.create_distributor(
  p_name          text,
  p_manager_name  text DEFAULT NULL,
  p_manager_phone text DEFAULT NULL,
  p_manager_email text DEFAULT NULL,
  p_parent_id     text DEFAULT 'ug'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role   text := (SELECT auth.jwt()) ->> 'app_role';
  v_parent text := COALESCE(NULLIF(btrim(p_parent_id), ''), 'ug');
  v_id     text;
  v_row    public.distributors%ROWTYPE;
BEGIN
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'role % cannot create a distributor', v_role USING ERRCODE = 'P0001';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'distributor name is required' USING ERRCODE = 'P0001';
  END IF;

  -- Length caps (§2a.8: an admin could otherwise create a 1MB name/field).
  IF length(btrim(p_name))       > 120 THEN RAISE EXCEPTION 'distributor name is too long (max 120)'    USING ERRCODE = 'P0001'; END IF;
  IF length(COALESCE(p_manager_name,  '')) > 120 THEN RAISE EXCEPTION 'manager name is too long (max 120)'  USING ERRCODE = 'P0001'; END IF;
  IF length(COALESCE(p_manager_phone, '')) > 32  THEN RAISE EXCEPTION 'manager phone is too long (max 32)'  USING ERRCODE = 'P0001'; END IF;
  IF length(COALESCE(p_manager_email, '')) > 254 THEN RAISE EXCEPTION 'manager email is too long (max 254)' USING ERRCODE = 'P0001'; END IF;

  -- Format checks (only when a value is supplied — all three are optional).
  IF NULLIF(btrim(p_manager_phone), '') IS NOT NULL
     AND btrim(p_manager_phone) !~ '^\+?[0-9 ()-]{7,32}$' THEN
    RAISE EXCEPTION 'manager phone is not a valid phone number' USING ERRCODE = 'P0001';
  END IF;
  IF NULLIF(btrim(p_manager_email), '') IS NOT NULL
     AND btrim(p_manager_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'manager email is not a valid email address' USING ERRCODE = 'P0001';
  END IF;

  -- Parent must exist (§1b.5: avoid an orphan-parented distributor on a typo).
  IF NOT EXISTS (SELECT 1 FROM public.distributors WHERE id = v_parent) THEN
    RAISE EXCEPTION 'parent distributor % does not exist', v_parent USING ERRCODE = 'P0001';
  END IF;

  v_id := 'd-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.distributors (
    id, name, parent_id, manager_name, manager_phone, manager_email, status
  ) VALUES (
    v_id, btrim(p_name), v_parent,
    NULLIF(btrim(p_manager_name), ''), NULLIF(btrim(p_manager_phone), ''), NULLIF(btrim(p_manager_email), ''),
    'active'
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.create_distributor(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_distributor(text, text, text, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.create_employer(
  p_name                        text,
  p_sector                      text  DEFAULT NULL,
  p_registration_no             text  DEFAULT NULL,
  p_contact_name                text  DEFAULT NULL,
  p_contact_phone               text  DEFAULT NULL,
  p_contact_email               text  DEFAULT NULL,
  p_district                    text  DEFAULT NULL,
  p_payroll_cadence             text  DEFAULT NULL,
  p_default_contribution_config jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role   text  := (SELECT auth.jwt()) ->> 'app_role';
  v_config jsonb := COALESCE(p_default_contribution_config, '{}'::jsonb);
  v_id     text;
  v_row    public.employers%ROWTYPE;
BEGIN
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'role % cannot create an employer', v_role USING ERRCODE = 'P0001';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'employer name is required' USING ERRCODE = 'P0001';
  END IF;

  -- Length caps (§2a.8).
  IF length(btrim(p_name))                    > 160 THEN RAISE EXCEPTION 'employer name is too long (max 160)'    USING ERRCODE = 'P0001'; END IF;
  IF length(COALESCE(p_sector,          '')) > 80   THEN RAISE EXCEPTION 'sector is too long (max 80)'            USING ERRCODE = 'P0001'; END IF;
  IF length(COALESCE(p_registration_no, '')) > 64   THEN RAISE EXCEPTION 'registration no is too long (max 64)'   USING ERRCODE = 'P0001'; END IF;
  IF length(COALESCE(p_contact_name,    '')) > 120  THEN RAISE EXCEPTION 'contact name is too long (max 120)'     USING ERRCODE = 'P0001'; END IF;
  IF length(COALESCE(p_contact_phone,   '')) > 32   THEN RAISE EXCEPTION 'contact phone is too long (max 32)'      USING ERRCODE = 'P0001'; END IF;
  IF length(COALESCE(p_contact_email,   '')) > 254  THEN RAISE EXCEPTION 'contact email is too long (max 254)'     USING ERRCODE = 'P0001'; END IF;
  IF length(COALESCE(p_payroll_cadence, '')) > 32   THEN RAISE EXCEPTION 'payroll cadence is too long (max 32)'    USING ERRCODE = 'P0001'; END IF;

  -- Format checks (only when a value is supplied).
  IF NULLIF(btrim(p_contact_phone), '') IS NOT NULL
     AND btrim(p_contact_phone) !~ '^\+?[0-9 ()-]{7,32}$' THEN
    RAISE EXCEPTION 'contact phone is not a valid phone number' USING ERRCODE = 'P0001';
  END IF;
  IF NULLIF(btrim(p_contact_email), '') IS NOT NULL
     AND btrim(p_contact_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'contact email is not a valid email address' USING ERRCODE = 'P0001';
  END IF;

  -- District (when supplied) must exist (§1b.5).
  IF NULLIF(btrim(p_district), '') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.districts WHERE id = btrim(p_district)) THEN
    RAISE EXCEPTION 'district % does not exist', p_district USING ERRCODE = 'P0001';
  END IF;

  -- Config must be a jsonb OBJECT (§2a.8: a malformed config breaks downstream
  -- contribution runs which read mode/matchPct/employerAmount off it).
  IF jsonb_typeof(v_config) <> 'object' THEN
    RAISE EXCEPTION 'default contribution config must be a JSON object' USING ERRCODE = 'P0001';
  END IF;

  v_id := 'emp-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.employers (
    id, name, sector, registration_no, contact_name, contact_phone,
    contact_email, district, payroll_cadence, default_contribution_config
  ) VALUES (
    v_id, btrim(p_name),
    NULLIF(btrim(p_sector), ''), NULLIF(btrim(p_registration_no), ''),
    NULLIF(btrim(p_contact_name), ''), NULLIF(btrim(p_contact_phone), ''),
    NULLIF(btrim(p_contact_email), ''), NULLIF(btrim(p_district), ''),
    NULLIF(btrim(p_payroll_cadence), ''), v_config
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.create_employer(text, text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_employer(text, text, text, text, text, text, text, text, jsonb) TO authenticated;


-- =============================================================================
-- (9) §1b.5 / §1b.10 — NULLIF guard on submit_employer_contribution_run.
-- =============================================================================
-- The co-contribution branch casts (v_config->>'maxContribution')::numeric (and
-- 'matchPct') directly: an empty-string config value raises 22P02
-- (invalid_text_representation) and aborts the whole run. Re-emit the 0044 body
-- BYTE-FAITHFULLY except the two numeric casts now go through NULLIF(...,'') so
-- an empty string reads as NULL (matchPct → COALESCE 0, maxContribution → no cap)
-- instead of erroring. Signature + RETURN shape + search_path pin unchanged.
CREATE OR REPLACE FUNCTION public.submit_employer_contribution_run(
  p_period_label text DEFAULT NULL,
  p_method       text DEFAULT NULL,
  p_nonce        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  -- Idempotency short-circuit.
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    SELECT result INTO v_prior FROM public.contribution_run_uploads WHERE nonce = p_nonce;
    IF v_prior IS NOT NULL THEN
      RETURN v_prior;
    END IF;
  END IF;

  -- Issue 2: ONE employer-wide config drives every member. Read it once.
  SELECT default_contribution_config INTO v_config FROM public.employers WHERE id = v_employer_id;
  v_config := COALESCE(v_config, '{}'::jsonb);
  v_mode   := COALESCE(v_config ->> 'mode', 'employer-only');

  -- Pre-mint + insert the run header first (FK target for transactions.
  -- contribution_run_id). Deleted at the end if nothing was funded.
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
    -- Re-derive the employer contribution from the company config (NEVER trust client).
    -- §1b.10: NULLIF(...,'') so an empty-string config value reads as NULL
    -- (matchPct → 0, maxContribution → uncapped) instead of raising 22P02.
    IF v_mode = 'co-contribution' THEN
      v_match_pct   := NULLIF(v_config ->> 'matchPct', '')::numeric;
      v_max_contrib := NULLIF(v_config ->> 'maxContribution', '')::numeric;
      v_employer_amt := round(v_sub.own_amount * COALESCE(v_match_pct, 0) / 100);
      IF v_max_contrib IS NOT NULL THEN
        v_employer_amt := LEAST(v_employer_amt, round(v_max_contrib));
      END IF;
    ELSE
      -- employer-only: a fixed monthly amount per member.
      v_employer_amt := round(COALESCE(NULLIF(v_config ->> 'employerAmount', '')::numeric, 0));
    END IF;

    IF v_employer_amt <= 0 THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('subscriberId', v_sub.id, 'reason', 'zero_contribution')
      );
      CONTINUE;
    END IF;

    -- 80/20 (or per-schedule) retirement/emergency split of the employer amount.
    v_ret_pct := v_sub.ret_pct;
    IF v_ret_pct IS NULL OR v_ret_pct < 0 OR v_ret_pct > 100 THEN
      v_ret_pct := 80;
    END IF;
    v_retirement := round(v_employer_amt * v_ret_pct / 100);
    v_emergency  := v_employer_amt - v_retirement;

    -- Real ledger row → trigger bumps subscriber_balances; agent_id NULL ⇒ no commission.
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
$$;

REVOKE ALL ON FUNCTION public.submit_employer_contribution_run(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_employer_contribution_run(text, text, text) TO authenticated;


-- =============================================================================
-- (10) §4b.10 — users(phone) login-ambiguity: documented, constraint unchanged.
-- =============================================================================
-- The audit wants a UNIQUE (or unique-per-role) on users.phone. `users` ALREADY
-- carries `users_phone_role_unique UNIQUE (phone, role)` (0001:424) — the
-- unique-per-role form the audit names — so there is NOTHING to add. A plain
-- UNIQUE(phone) is intentionally NOT added: CLAUDE.md §8 / 0001:413 design
-- explicitly allows one phone across multiple roles (an agent who is also a
-- subscriber). The real defect (§4b.10) is the SEED shipping the same phone under
-- two roles (subscriber + employer), making the phone→user OTP lookup
-- non-deterministic; the de-dup is owned by the seed-reconcile agent (C6), not a
-- schema change. Record the rationale so the next author does not add a phone
-- UNIQUE that would break the legitimate multi-role demo logins.
COMMENT ON CONSTRAINT users_phone_role_unique ON public.users IS
  'Unique per (phone, role): a phone may attach to multiple roles by design (CLAUDE.md §8). Do NOT add a plain UNIQUE(phone) — it would break legitimate multi-role demo logins. The §4b.10 login-ambiguity defect is a SEED duplicate (same phone under two roles), fixed by the seed de-dup, not by the schema.';

-- =============================================================================
-- End of 0053_schema_hygiene.sql
-- =============================================================================
