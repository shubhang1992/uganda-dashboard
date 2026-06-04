-- =============================================================================
-- Universal Pensions Uganda — 0042: signup / write-flow hardening
-- =============================================================================
-- Apply at cutover AFTER 0041, after a verified backup; NOT yet applied to live.
--
-- Five INDEPENDENT hardening sections bundled into one forward-only migration.
-- Each mirrors an established house pattern from an earlier (frozen) migration:
--
--   3.1 Signup idempotency (nonce) — a new public.subscriber_signup_uploads
--       ledger (mirrors public.settlement_uploads from 0032), plus an optional
--       p_nonce parameter on BOTH signup-entry RPCs so a sequential re-submit /
--       reload / second-tab / network-retry replay with the same nonce returns
--       the stored prior subscriber id instead of minting a duplicate chain.
--
--   3.2 Nominee sum-to-100 in the signup chain — _insert_subscriber_chain
--       inserted nominees with NO per-type SUM(share) assertion, while the
--       subscriber-self path (upsert_nominees, 0024) enforces it. Copy the
--       0024 invariant EXACTLY (tolerance 0.01, empty array exempt, ERRCODE
--       'P0005') so the signup chain can no longer persist shares that sum to
--       anything other than 100 per nominee type.
--
--   3.3 maxContribution NULLIF — submit_contribution_run (0038) casts
--       (v_config->>'maxContribution')::numeric, which throws 22P02 on an empty
--       string. Wrap the cast in NULLIF(...,''). The full 0038 body is re-emitted
--       verbatim with ONLY that one cast hardened (it is the sole maxContribution
--       cast site across 0038/0039 — see SELF-CHECK in the orchestration log).
--
--   3.4 distributors_update_self hardening — the 0016 policy was ownership-only
--       (acknowledged-deferred in 0016/0023) with no app_role gate and no column
--       immutability. Re-emit it with the house ((SELECT auth.jwt())->>'app_role')
--       = 'distributor' gate (initplan-wrapped, 0036 form), and add a BEFORE
--       UPDATE trigger that freezes id / parent_id for distributor-role callers
--       (the codebase expresses column immutability via a trigger comparing OLD
--       vs NEW — see 0005's subscribers_enforce_editable_cols; an RLS WITH CHECK
--       subquery against the same table recursed, which is why 0005 moved to a
--       trigger).
--
--   3.5 Commission dedup grain — trg_transactions_contribution (0002) guards the
--       first-contribution commission with NOT EXISTS keyed on subscriber_id
--       ONLY, while the unique index is (agent_id, subscriber_id) (0017). Add
--       AND agent_id = v_agent_id so the dedup grain matches the index. Latent
--       today (one agent per subscriber), but encodes the intended contract.
--
-- CONVENTIONS (CLAUDE.md / BACKEND.md):
--   * SECURITY DEFINER RPCs read auth.jwt() ->> 'app_role' (NEVER 'role').
--   * search_path pinned; REVOKE ... FROM PUBLIC; GRANT EXECUTE re-issued after
--     any signature change.
--   * Idempotent DDL (CREATE TABLE/INDEX IF NOT EXISTS, DROP POLICY/TRIGGER IF
--     EXISTS, CREATE OR REPLACE) so a replay converges.
--   * Forward-only; reversible via 0042_signup_writeflow_hardening.down.sql.
--   * Migrations 0001-0039 SQL bodies are FROZEN — this migration is append-only
--     and re-emits their functions via CREATE OR REPLACE without editing them.
--   * NOT YET APPLIED TO LIVE — applying it is a gated cutover step the user runs
--     after a verified backup.
-- =============================================================================


-- =============================================================================
-- 3.1 — Signup idempotency ledger + nonce on the two signup-entry RPCs
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schema: per-signup idempotency ledger
-- -----------------------------------------------------------------------------
-- One row per applied signup, keyed by the client-supplied nonce. Stores the
-- minted subscriber id (as a JSON scalar) so a replay returns the original id
-- without minting a second subscriber chain. Mirrors public.settlement_uploads
-- (0032): RLS ENABLED + FORCED, no permissive policy, no GRANT — only the
-- SECURITY DEFINER signup RPCs read or write it.
CREATE TABLE IF NOT EXISTS public.subscriber_signup_uploads (
  nonce       TEXT PRIMARY KEY,
  result      JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriber_signup_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriber_signup_uploads FORCE  ROW LEVEL SECURITY;

-- No direct policies — only the SECURITY DEFINER create_subscriber_from_signup /
-- create_subscriber_from_agent_onboard RPCs read or write this ledger (mirrors
-- the locked stance of settlement_uploads). No GRANT to anon/authenticated: the
-- table is RPC-internal.

-- -----------------------------------------------------------------------------
-- create_subscriber_from_signup(payload jsonb, p_nonce text DEFAULT NULL) → text
-- -----------------------------------------------------------------------------
-- Public entry point for the live-signup `/signup/contribution` flow. Bypasses
-- RLS via SECURITY DEFINER (prospect has no JWT yet). When p_nonce is provided
-- and already recorded, returns the stored prior subscriber id (idempotent
-- no-op); otherwise mints the chain and records (nonce, id) on success.
--
-- The 0002 signature was (jsonb). CREATE OR REPLACE cannot change an argument
-- list, so this is a NEW overload; the down file drops it and the old single-arg
-- function is restored from 0002. The single-arg overload is dropped below so a
-- caller can't invoke a stale non-idempotent version.
CREATE OR REPLACE FUNCTION public.create_subscriber_from_signup(
  payload jsonb,
  p_nonce text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id TEXT;
  v_prior  JSONB;
BEGIN
  -- Idempotency short-circuit: a replay of the same nonce returns the prior
  -- subscriber id without re-inserting the chain.
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    SELECT result INTO v_prior
      FROM public.subscriber_signup_uploads
     WHERE nonce = p_nonce;
    IF v_prior IS NOT NULL THEN
      RETURN v_prior #>> '{}';   -- unwrap the JSON scalar back to text
    END IF;
  END IF;

  PERFORM public._validate_signup_payload(payload);
  v_new_id := public._insert_subscriber_chain(payload, 'a-001');

  -- Persist the result against the nonce so a future sequential replay
  -- short-circuits (mirrors apply_settlement's settlement_uploads ledger).
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    INSERT INTO public.subscriber_signup_uploads (nonce, result)
    VALUES (p_nonce, to_jsonb(v_new_id))
    ON CONFLICT (nonce) DO NOTHING;
  END IF;

  RETURN v_new_id;
END;
$$;

-- Drop the old single-arg signature so callers can't accidentally invoke the
-- stale, non-idempotent overload (CREATE OR REPLACE only matches identical
-- argument lists; the 0002 (jsonb) function is a distinct overload).
DROP FUNCTION IF EXISTS public.create_subscriber_from_signup(jsonb);

-- Re-grant the new signature exactly as 0002 did (anon + authenticated — the
-- signup RPC must be callable without a JWT).
REVOKE ALL ON FUNCTION public.create_subscriber_from_signup(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_subscriber_from_signup(jsonb, text)
  TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- create_subscriber_from_agent_onboard(payload, calling_agent_id, p_nonce) → text
-- -----------------------------------------------------------------------------
-- Agent-initiated subscriber onboarding. Same idempotency behaviour as above;
-- the agent identity gate is unchanged from 0002.
--
-- The 0002 signature was (jsonb, text). This NEW overload appends p_nonce; the
-- down file drops it and restores the 0002 two-arg function. The old two-arg
-- overload is dropped below.
CREATE OR REPLACE FUNCTION public.create_subscriber_from_agent_onboard(
  payload          jsonb,
  calling_agent_id TEXT,
  p_nonce          TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_agent_id TEXT;
  v_new_id       TEXT;
  v_prior        JSONB;
BEGIN
  -- Idempotency short-circuit: a replay of the same nonce returns the prior
  -- subscriber id without re-inserting the chain.
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    SELECT result INTO v_prior
      FROM public.subscriber_signup_uploads
     WHERE nonce = p_nonce;
    IF v_prior IS NOT NULL THEN
      RETURN v_prior #>> '{}';   -- unwrap the JSON scalar back to text
    END IF;
  END IF;

  IF calling_agent_id IS NULL OR calling_agent_id = '' THEN
    RAISE EXCEPTION 'calling_agent_id is required';
  END IF;

  -- Cross-check the explicit arg against the JWT claim. auth.jwt() returns a
  -- jsonb of the verified JWT; the caller is expected to pass the same
  -- agentId they extracted from auth.jwt() ->> 'agentId'. This both protects
  -- against forged IDs and keeps the function callable from psql in dev (where
  -- auth.jwt() may be null) as long as the caller is service_role.
  BEGIN
    v_jwt_agent_id := auth.jwt() ->> 'agentId';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_agent_id := NULL;
  END;

  IF v_jwt_agent_id IS NOT NULL AND v_jwt_agent_id <> calling_agent_id THEN
    RAISE EXCEPTION 'calling_agent_id (%) does not match JWT agentId (%)',
      calling_agent_id, v_jwt_agent_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.agents WHERE id = calling_agent_id) THEN
    RAISE EXCEPTION 'unknown agent: %', calling_agent_id;
  END IF;

  PERFORM public._validate_signup_payload(payload);
  v_new_id := public._insert_subscriber_chain(payload, calling_agent_id);

  -- Persist the result against the nonce so a future sequential replay
  -- short-circuits (mirrors apply_settlement's settlement_uploads ledger).
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    INSERT INTO public.subscriber_signup_uploads (nonce, result)
    VALUES (p_nonce, to_jsonb(v_new_id))
    ON CONFLICT (nonce) DO NOTHING;
  END IF;

  RETURN v_new_id;
END;
$$;

-- Drop the old two-arg signature so callers can't invoke the stale,
-- non-idempotent overload.
DROP FUNCTION IF EXISTS public.create_subscriber_from_agent_onboard(jsonb, text);

-- Re-grant the new signature exactly as 0002 did (authenticated only).
REVOKE ALL ON FUNCTION public.create_subscriber_from_agent_onboard(jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_subscriber_from_agent_onboard(jsonb, text, text)
  TO authenticated;


-- =============================================================================
-- 3.2 — Nominee sum-to-100 invariant in the signup insert chain
-- =============================================================================
-- Re-emit _insert_subscriber_chain (0002) with the 0024 sum-to-100 assertion
-- applied per nominee type BEFORE the inserts. Copied EXACTLY from 0024 lines
-- 80-87: tolerance 0.01, empty array exempt (zero rows = "no nominees declared"
-- is legitimate), RAISE with ERRCODE 'P0005'. The body is otherwise byte-faithful
-- to 0002 — only the two assertion blocks and their supporting locals are added.
--
-- The insurance branch has two shapes (mirroring 0002): when
-- insuranceSameAsPension the pension list is copied (so the pension assertion
-- already covers it), otherwise the separate insuranceBeneficiaries array is
-- validated on its own. Both shapes get the per-type SUM(share) check.
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
  -- Next due = today + (365 / periodsPerYear) days; matches the spirit of
  -- mockData.js's nextDueOffsetDays default (1..30 days from now).
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
    COALESCE((p_payload ->> 'includeInsurance')::boolean, FALSE),
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
-- 3.3 — maxContribution NULLIF guard in submit_contribution_run
-- =============================================================================
-- Re-emit the 0038 submit_contribution_run body VERBATIM with ONLY the
-- maxContribution cast hardened: (v_config->>'maxContribution')::numeric becomes
-- NULLIF((v_config->>'maxContribution'),'')::numeric so an empty-string config
-- value no longer raises 22P02 (invalid_text_representation). This is the sole
-- maxContribution cast across 0038/0039. Signature, SECURITY DEFINER,
-- search_path, REVOKE/GRANT all unchanged.
CREATE OR REPLACE FUNCTION public.submit_contribution_run(
  p_rows         jsonb,
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
  v_unit_price     numeric := 1000;       -- UGX/unit (matches the contribution trigger)
  v_row            jsonb;
  v_employee_id    text;
  v_emp            record;
  v_config         jsonb;
  v_mode           text;
  v_match_pct      numeric;
  v_max_contrib    numeric;
  v_employer_half  numeric;
  v_employee_half  numeric;
  v_gross          numeric;               -- employer_half + employee_half for this employee
  v_ret_pct        numeric;
  v_emg_pct        numeric;
  v_retirement     numeric;
  v_emergency      numeric;
  v_run_id         text;
  v_line_id        text;
  v_lines_created  integer := 0;
  v_employer_total numeric := 0;
  v_employee_total numeric := 0;
  v_grand_total    numeric := 0;
  v_skipped        jsonb := '[]'::jsonb;
  v_prior          jsonb;
  v_result         jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'employer' THEN
    RAISE EXCEPTION 'role % cannot submit a contribution run', v_role
      USING ERRCODE = 'P0001';
  END IF;

  IF v_employer_id IS NULL OR v_employer_id = '' THEN
    RAISE EXCEPTION 'missing employerId claim'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  -- Idempotency short-circuit: a replay of the same nonce returns the prior
  -- result without re-recording / re-funding anything (parallel to
  -- apply_settlement's settlement_uploads ledger).
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    SELECT result INTO v_prior FROM public.contribution_run_uploads WHERE nonce = p_nonce;
    IF v_prior IS NOT NULL THEN
      RETURN v_prior;
    END IF;
  END IF;

  -- Pre-mint the run id so each line can reference it. Only persisted if at
  -- least one line is created (see the linesCreated guard at the end).
  v_run_id := 'run-' || replace(gen_random_uuid()::text, '-', '');

  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    v_employee_id := v_row ->> 'employeeId';

    IF v_employee_id IS NULL OR v_employee_id = '' THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('employeeId', v_employee_id, 'reason', 'missing_employee_id')
      );
      CONTINUE;
    END IF;

    -- Ownership + status check: lock the row so concurrent runs serialise on
    -- the same employee (the inline balance bump must not interleave).
    SELECT * INTO v_emp
      FROM public.employees
     WHERE id = v_employee_id
     FOR UPDATE;

    IF NOT FOUND THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('employeeId', v_employee_id, 'reason', 'not_found')
      );
      CONTINUE;
    END IF;

    -- Never fund another employer's staff — the core RLS-equivalent guard
    -- inside the DEFINER context (which bypasses RLS).
    IF v_emp.employer_id IS DISTINCT FROM v_employer_id THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('employeeId', v_employee_id, 'reason', 'not_owned')
      );
      CONTINUE;
    END IF;

    IF v_emp.status IS DISTINCT FROM 'active' THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('employeeId', v_employee_id, 'reason', 'suspended')
      );
      CONTINUE;
    END IF;

    -- Re-derive amounts server-side from salary / monthly_contribution + config
    -- (NEVER trust client). NEW co-contribution model below.
    v_config := COALESCE(v_emp.contribution_config, '{}'::jsonb);
    v_mode   := COALESCE(v_config ->> 'mode', 'employer-only');

    IF v_mode = 'co-contribution' THEN
      v_match_pct := (v_config ->> 'matchPct')::numeric;
      IF v_match_pct IS NOT NULL THEN
        -- NEW: employee funds their own saving; employer matches a % of it,
        -- optionally capped by a fixed UGX maximum on the employer top-up.
        v_employee_half := round(COALESCE(v_emp.monthly_contribution, 0));
        v_employer_half := round(v_employee_half * v_match_pct / 100);
        -- 3.3: NULLIF guards an empty-string config value (would raise 22P02).
        v_max_contrib   := NULLIF((v_config ->> 'maxContribution'), '')::numeric;
        IF v_max_contrib IS NOT NULL THEN
          v_employer_half := LEAST(v_employer_half, round(v_max_contrib));
        END IF;
      ELSE
        -- LEGACY dual-read fallback: two independent % of salary (pre-redesign
        -- rows with employeePct and no matchPct). Keeps an un-migrated live row
        -- from zeroing out during cutover.
        IF (v_config ->> 'employerAmount') IS NOT NULL THEN
          v_employer_half := round((v_config ->> 'employerAmount')::numeric);
        ELSE
          v_employer_half := round(
            COALESCE(v_emp.salary, 0) * COALESCE((v_config ->> 'employerPct')::numeric, 0) / 100
          );
        END IF;
        IF (v_config ->> 'employeeAmount') IS NOT NULL THEN
          v_employee_half := round((v_config ->> 'employeeAmount')::numeric);
        ELSE
          v_employee_half := round(
            COALESCE(v_emp.salary, 0) * COALESCE((v_config ->> 'employeePct')::numeric, 0) / 100
          );
        END IF;
      END IF;
    ELSE
      -- employer-only (unchanged): explicit fixed amount wins, else pct of salary.
      IF (v_config ->> 'employerAmount') IS NOT NULL THEN
        v_employer_half := round((v_config ->> 'employerAmount')::numeric);
      ELSE
        v_employer_half := round(
          COALESCE(v_emp.salary, 0) * COALESCE((v_config ->> 'employerPct')::numeric, 0) / 100
        );
      END IF;
      v_employee_half := 0;
    END IF;

    v_gross := v_employer_half + v_employee_half;

    -- Nothing to fund for this employee — skip rather than write a zero line.
    IF v_gross <= 0 THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('employeeId', v_employee_id, 'reason', 'zero_contribution')
      );
      CONTINUE;
    END IF;

    -- Retirement/emergency split of the GROSS, by the employee's schedule
    -- (default 80/20). emergency = gross - retirement avoids penny drift —
    -- same technique as trg_transactions_contribution.
    v_ret_pct := COALESCE((v_emp.contribution_schedule ->> 'retirementPct')::numeric, 80);
    v_emg_pct := COALESCE((v_emp.contribution_schedule ->> 'emergencyPct')::numeric, 100 - v_ret_pct);
    IF v_ret_pct IS NULL OR v_ret_pct < 0 OR v_ret_pct > 100 THEN
      v_ret_pct := 80;
    END IF;
    v_retirement := round(v_gross * v_ret_pct / 100);
    v_emergency  := v_gross - v_retirement;

    -- Record the per-employee line (doubles as the employee's contribution
    -- ledger — employees are NOT in `transactions`).
    v_line_id := 'crl-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.contribution_run_lines (
      id, run_id, employee_id, employer_amount, employee_amount,
      retirement_amount, emergency_amount, method
    ) VALUES (
      v_line_id, v_run_id, v_employee_id, v_employer_half, v_employee_half,
      v_retirement, v_emergency, p_method
    );

    -- Bump the employee balances INLINE (no trigger on `employees`). This is
    -- the ONLY balance write — nothing touches subscriber_balances.
    UPDATE public.employees
       SET retirement_balance  = retirement_balance  + v_retirement,
           emergency_balance   = emergency_balance   + v_emergency,
           net_balance         = net_balance         + v_gross,
           units_held          = units_held          + (v_gross / v_unit_price),
           total_contributions = total_contributions + v_gross,
           updated_at          = now()
     WHERE id = v_employee_id;

    v_lines_created  := v_lines_created + 1;
    v_employer_total := v_employer_total + v_employer_half;
    v_employee_total := v_employee_total + v_employee_half;
    v_grand_total    := v_grand_total + v_gross;
  END LOOP;

  -- Persist the run header only if it actually funded someone.
  IF v_lines_created > 0 THEN
    INSERT INTO public.contribution_runs (
      id, employer_id, period_label, status,
      employer_total, employee_total, grand_total, run_at
    ) VALUES (
      v_run_id, v_employer_id, p_period_label, 'completed',
      v_employer_total, v_employee_total, v_grand_total, now()
    );
  ELSE
    -- No lines → no run header. Null out the run id in the result so callers
    -- don't dangle a reference to a header that was never written.
    v_run_id := NULL;
  END IF;

  v_result := jsonb_build_object(
    'runId',         v_run_id,
    'linesCreated',  v_lines_created,
    'employerTotal', v_employer_total,
    'employeeTotal', v_employee_total,
    'grandTotal',    v_grand_total,
    'skipped',       v_skipped
  );

  -- Persist the result against the nonce so a future sequential replay
  -- short-circuits (mirrors apply_settlement's ledger write).
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    INSERT INTO public.contribution_run_uploads (nonce, result)
    VALUES (p_nonce, v_result)
    ON CONFLICT (nonce) DO NOTHING;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_contribution_run(jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_contribution_run(jsonb, text, text, text) TO authenticated;


-- =============================================================================
-- 3.4 — distributors_update_self hardening (app_role gate + column immutability)
-- =============================================================================
-- The 0016 policy was ownership-only (no app_role gate). Re-emit it with the
-- house ((SELECT auth.jwt())->>'app_role') = 'distributor' gate in both USING
-- and WITH CHECK, initplan-wrapped per the 0036 form. id/parent_id immutability
-- is enforced by a BEFORE UPDATE trigger comparing OLD vs NEW (the codebase
-- expresses column immutability via a trigger — see 0005's
-- subscribers_enforce_editable_cols; an RLS WITH CHECK subquery against the same
-- table recursed, which is why 0005 moved to a trigger).
DROP POLICY IF EXISTS distributors_update_self ON public.distributors;
CREATE POLICY distributors_update_self ON public.distributors
  FOR UPDATE
  USING (
    ((( SELECT auth.jwt() ) ->> 'app_role') = 'distributor')
    AND (id = (( SELECT auth.jwt() ) ->> 'distributorId'))
  )
  WITH CHECK (
    ((( SELECT auth.jwt() ) ->> 'app_role') = 'distributor')
    AND (id = (( SELECT auth.jwt() ) ->> 'distributorId'))
  );

-- Column-immutability guard: a distributor-role caller cannot rewrite id or
-- parent_id. Other roles (service_role / admin tooling) pass through. Mirrors
-- the 0005 subscribers trigger pattern.
CREATE OR REPLACE FUNCTION public.trg_distributors_enforce_editable_cols()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_role TEXT := auth.jwt() ->> 'app_role';
BEGIN
  -- Only distributors are constrained; everyone else passes through.
  IF v_role IS DISTINCT FROM 'distributor' THEN
    RETURN NEW;
  END IF;

  IF NEW.id        IS DISTINCT FROM OLD.id        THEN RAISE EXCEPTION 'cannot modify id';        END IF;
  IF NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN RAISE EXCEPTION 'cannot modify parent_id'; END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS distributors_enforce_editable_cols ON public.distributors;
CREATE TRIGGER distributors_enforce_editable_cols
  BEFORE UPDATE ON public.distributors
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_distributors_enforce_editable_cols();


-- =============================================================================
-- 3.5 — Commission dedup grain: per-(agent, subscriber)
-- =============================================================================
-- Re-emit trg_transactions_contribution (0002) with ONLY the first-contribution
-- dedup predicate hardened. The 0002 guard was NOT EXISTS keyed on subscriber_id
-- alone; the unique index is (agent_id, subscriber_id) (0017:47). The agent is
-- resolved BEFORE the guard now so the NOT EXISTS can also match agent_id —
-- making the read-then-write grain match the index. Everything else (balance
-- update, rate lookup, insert columns) is byte-faithful to 0002.
CREATE OR REPLACE FUNCTION public.trg_transactions_contribution()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  -- See unit-price comment at top of file. Replace with a NAV-table lookup if
  -- the fund-pricing table is ever added.
  v_unit_price       NUMERIC := 1000;
  v_retirement_share NUMERIC;
  v_emergency_share  NUMERIC;
  v_agent_id         TEXT;
  v_branch_id        TEXT;
  v_subscriber_name  TEXT;
  v_commission_rate  NUMERIC;
  v_new_commission_id TEXT;
BEGIN
  -- (b) Bucket split ---------------------------------------------------------
  IF NEW.split_retirement IS NOT NULL AND NEW.split_emergency IS NOT NULL THEN
    v_retirement_share := NEW.split_retirement;
    v_emergency_share  := NEW.split_emergency;
  ELSE
    v_retirement_share := ROUND(NEW.amount * 0.80);
    v_emergency_share  := NEW.amount - v_retirement_share;  -- avoids penny drift
  END IF;

  -- (a) Balance update -------------------------------------------------------
  -- subscriber_balances row should already exist (subscribers AFTER INSERT
  -- trigger), but ON CONFLICT keeps us safe against trigger-replica seed runs
  -- where the balance row was hand-inserted by the seeder.
  INSERT INTO public.subscriber_balances (
    subscriber_id,
    retirement_balance,
    emergency_balance,
    total_balance,
    units,
    updated_at
  ) VALUES (
    NEW.subscriber_id,
    v_retirement_share,
    v_emergency_share,
    NEW.amount,
    NEW.amount / v_unit_price,
    now()
  )
  ON CONFLICT (subscriber_id) DO UPDATE SET
    retirement_balance = public.subscriber_balances.retirement_balance + EXCLUDED.retirement_balance,
    emergency_balance  = public.subscriber_balances.emergency_balance  + EXCLUDED.emergency_balance,
    total_balance      = public.subscriber_balances.total_balance      + EXCLUDED.total_balance,
    units              = public.subscriber_balances.units              + EXCLUDED.units,
    updated_at         = now();

  -- (c) First-contribution commission ---------------------------------------
  -- Resolve agent + branch + subscriber name FIRST (so the dedup guard below
  -- can be keyed on (agent_id, subscriber_id) — matching ux_commissions_agent_
  -- subscriber from 0017). Denormalised at insert time so reads don't need a
  -- join (mirrors src/services/commissions.js shape).
  SELECT s.agent_id, s.name, a.branch_id
    INTO v_agent_id, v_subscriber_name, v_branch_id
    FROM public.subscribers s
    LEFT JOIN public.agents a ON a.id = s.agent_id
   WHERE s.id = NEW.subscriber_id;

  IF v_agent_id IS NOT NULL THEN
    -- 3.5: dedup grain matches the unique index (agent_id, subscriber_id), not
    -- subscriber_id alone. NOT EXISTS ensures one commission per (agent,
    -- subscriber) lifetime.
    IF NOT EXISTS (
      SELECT 1 FROM public.commissions
       WHERE subscriber_id = NEW.subscriber_id
         AND agent_id = v_agent_id
    ) THEN
      SELECT rate INTO v_commission_rate
        FROM public.commission_config
       WHERE id = 'default';

      -- Defensive: if commission_config row hasn't been seeded yet, skip
      -- gracefully rather than failing the contribution insert.
      IF v_commission_rate IS NOT NULL THEN
        v_new_commission_id := 'c-' || lpad(
          nextval('public.commission_id_seq')::text, 8, '0'
        );

        INSERT INTO public.commissions (
          id,
          agent_id,
          branch_id,
          subscriber_id,
          subscriber_name,
          amount,
          status,
          first_contribution_date,
          due_date
        ) VALUES (
          v_new_commission_id,
          v_agent_id,
          v_branch_id,
          NEW.subscriber_id,
          v_subscriber_name,
          v_commission_rate,
          'due',
          NEW.date::date,
          NEW.date::date  -- live signups: due immediately; settlement runs sweep them up
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Re-bind the trigger (CREATE OR REPLACE FUNCTION keeps the existing binding,
-- but re-issue idempotently to match the 0002 DROP/CREATE shape).
DROP TRIGGER IF EXISTS transactions_after_insert_contribution ON public.transactions;
CREATE TRIGGER transactions_after_insert_contribution
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  WHEN (NEW.type = 'contribution')
  EXECUTE FUNCTION public.trg_transactions_contribution();


-- =============================================================================
-- End of 0042_signup_writeflow_hardening.sql
-- =============================================================================
