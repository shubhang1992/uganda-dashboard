-- =============================================================================
-- Universal Pensions Uganda — 0044: employer ⇄ subscriber write/read RPCs
-- =============================================================================
-- The unified-model RPCs (partner to 0043). An employer now onboards a real
-- subscriber, funds tagged subscribers via a contribution run that posts to the
-- normal `transactions` ledger (source='employer'), and reads metrics over
-- tagged subscribers. Issue 2: the funding model is the SINGLE company-wide
-- `employers.default_contribution_config` applied to everyone — never per-member.
--
-- CONVENTIONS (mirroring 0035 / 0038 / 0042):
--   * LANGUAGE plpgsql; SECURITY DEFINER + SET search_path = public, pg_temp.
--   * Role read via (SELECT auth.jwt()) ->> 'app_role' (NEVER 'role'); scoped to
--     the caller's (SELECT auth.jwt()) ->> 'employerId'.
--   * Reuse _insert_subscriber_chain / _validate_signup_payload (0042) and the
--     subscriber_signup_uploads nonce ledger; contribution_run_uploads for runs.
--   * Forward-only; reversible via 0044_employer_subscriber_rpcs.down.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_subscriber_from_employer_onboard(payload, calling_employer_id, p_nonce)
-- -----------------------------------------------------------------------------
-- Mirror of create_subscriber_from_agent_onboard (0042) but employer-initiated:
--   * gates app_role='employer', cross-checks the employerId claim;
--   * DUP-CHECK by normalised phone (last 9 digits) — link an existing untagged
--     subscriber to this employer rather than creating a second record; error if
--     already on this (or another) employer's roster;
--   * inserts the subscriber chain with agent_id = NULL (NO agent commission —
--     the trigger's `IF v_agent_id IS NOT NULL` guard skips it), then tags the
--     new row with employer_id.
-- Returns the (new or linked) subscriber id.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_subscriber_from_employer_onboard(
  payload             jsonb,
  calling_employer_id TEXT,
  p_nonce             TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role         TEXT := (SELECT auth.jwt()) ->> 'app_role';
  v_jwt_emp_id   TEXT;
  v_new_id       TEXT;
  v_prior        JSONB;
  v_phone_norm   TEXT;
  v_existing_id  TEXT;
  v_existing_emp TEXT;
BEGIN
  -- Idempotency short-circuit (same nonce → prior subscriber id).
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    SELECT result INTO v_prior FROM public.subscriber_signup_uploads WHERE nonce = p_nonce;
    IF v_prior IS NOT NULL THEN
      RETURN v_prior #>> '{}';
    END IF;
  END IF;

  IF v_role IS DISTINCT FROM 'employer' THEN
    RAISE EXCEPTION 'role % cannot onboard an employee', v_role USING ERRCODE = 'P0001';
  END IF;
  IF calling_employer_id IS NULL OR calling_employer_id = '' THEN
    RAISE EXCEPTION 'calling_employer_id is required';
  END IF;

  -- Cross-check the explicit arg against the verified JWT claim (defence in
  -- depth; tolerant of psql/service_role where auth.jwt() may be NULL).
  BEGIN
    v_jwt_emp_id := (SELECT auth.jwt()) ->> 'employerId';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_emp_id := NULL;
  END;
  IF v_jwt_emp_id IS NOT NULL AND v_jwt_emp_id <> calling_employer_id THEN
    RAISE EXCEPTION 'calling_employer_id (%) does not match JWT employerId (%)',
      calling_employer_id, v_jwt_emp_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employers WHERE id = calling_employer_id) THEN
    RAISE EXCEPTION 'unknown employer: %', calling_employer_id;
  END IF;

  -- Validate the signup payload (phone/dob/gender/nin/districtId/consent/
  -- contributionSchedule). districtId must exist in `districts`.
  PERFORM public._validate_signup_payload(payload);

  -- DUP-CHECK by normalised phone (last 9 digits). Newest-wins.
  v_phone_norm := right(regexp_replace(COALESCE(payload ->> 'phone', ''), '[^0-9]', '', 'g'), 9);
  SELECT id, employer_id INTO v_existing_id, v_existing_emp
    FROM public.subscribers
   WHERE right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 9) = v_phone_norm
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_emp = calling_employer_id THEN
      RAISE EXCEPTION 'a subscriber with phone % is already on your roster', payload ->> 'phone'
        USING ERRCODE = 'P0001';
    ELSIF v_existing_emp IS NOT NULL THEN
      RAISE EXCEPTION 'a subscriber with phone % already belongs to another employer', payload ->> 'phone'
        USING ERRCODE = 'P0001';
    ELSE
      -- Untagged existing subscriber → LINK rather than duplicate.
      UPDATE public.subscribers SET employer_id = calling_employer_id WHERE id = v_existing_id;
      v_new_id := v_existing_id;
    END IF;
  ELSE
    -- Fresh subscriber: insert the chain with NO agent (no commission), then tag.
    v_new_id := public._insert_subscriber_chain(payload, NULL);
    UPDATE public.subscribers SET employer_id = calling_employer_id WHERE id = v_new_id;
  END IF;

  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    INSERT INTO public.subscriber_signup_uploads (nonce, result)
    VALUES (p_nonce, to_jsonb(v_new_id))
    ON CONFLICT (nonce) DO NOTHING;
  END IF;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_subscriber_from_employer_onboard(jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_subscriber_from_employer_onboard(jsonb, text, text) TO authenticated;


-- -----------------------------------------------------------------------------
-- submit_employer_contribution_run(p_period_label, p_method, p_nonce)
-- -----------------------------------------------------------------------------
-- The re-pointed employer "fund my staff" action. Posts ONE employer-source
-- contribution per active tagged subscriber, computed from the SINGLE company
-- config (Issue 2):
--   co-contribution: employer matches matchPct% of the subscriber's own monthly
--                    saving (contribution_schedules.amount), capped at maxContribution.
--   employer-only:   a fixed monthly amount (config.employerAmount).
-- Each row is a real `transactions` insert (source='employer', agent_id NULL),
-- so the existing trigger bumps subscriber_balances and the subscriber sees it —
-- and the commission is skipped (no agent). Idempotent via contribution_run_uploads.
-- -----------------------------------------------------------------------------
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
    IF v_mode = 'co-contribution' THEN
      v_match_pct   := (v_config ->> 'matchPct')::numeric;
      v_max_contrib := (v_config ->> 'maxContribution')::numeric;
      v_employer_amt := round(v_sub.own_amount * COALESCE(v_match_pct, 0) / 100);
      IF v_max_contrib IS NOT NULL THEN
        v_employer_amt := LEAST(v_employer_amt, round(v_max_contrib));
      END IF;
    ELSE
      -- employer-only: a fixed monthly amount per member.
      v_employer_amt := round(COALESCE((v_config ->> 'employerAmount')::numeric, 0));
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


-- -----------------------------------------------------------------------------
-- get_employer_metrics() — re-emit over tagged subscribers (supersedes 0035)
-- -----------------------------------------------------------------------------
-- Same top-level keys the dashboard already consumes, recomputed from
-- subscribers + subscriber_balances + transactions(source) + insurance_policies.
-- Adds ownContributions / employerContributions. modeSplit reports the single
-- company mode (Issue 2). "employeeYtd" is repurposed as the members' own YTD.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_employer_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role        text := (SELECT auth.jwt()) ->> 'app_role';
  v_employer_id text := (SELECT auth.jwt()) ->> 'employerId';
  v_sub         record;
  v_tx          record;
  v_insured     integer;
  v_mode        text;
  v_result      jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'employer' THEN
    RAISE EXCEPTION 'role % cannot read employer metrics', v_role USING ERRCODE = 'P0001';
  END IF;
  IF v_employer_id IS NULL OR v_employer_id = '' THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT
    COUNT(*)                                   AS headcount,
    COUNT(*) FILTER (WHERE s.is_active)        AS active,
    COUNT(*) FILTER (WHERE NOT s.is_active)    AS suspended,
    COALESCE(SUM(b.total_balance), 0)          AS total_balance
    INTO v_sub
    FROM public.subscribers s
    LEFT JOIN public.subscriber_balances b ON b.subscriber_id = s.id
   WHERE s.employer_id = v_employer_id;

  SELECT
    COALESCE(SUM(t.amount) FILTER (WHERE t.source = 'own'), 0)      AS own_total,
    COALESCE(SUM(t.amount) FILTER (WHERE t.source = 'employer'), 0) AS employer_total,
    COALESCE(SUM(t.amount) FILTER (
      WHERE t.source = 'own' AND date_part('year', t.date) = date_part('year', now())), 0)      AS own_ytd,
    COALESCE(SUM(t.amount) FILTER (
      WHERE t.source = 'employer' AND date_part('year', t.date) = date_part('year', now())), 0) AS employer_ytd
    INTO v_tx
    FROM public.transactions t
    JOIN public.subscribers s ON s.id = t.subscriber_id
   WHERE s.employer_id = v_employer_id
     AND t.type = 'contribution';

  SELECT COUNT(*) INTO v_insured
    FROM public.insurance_policies ip
    JOIN public.subscribers s ON s.id = ip.subscriber_id
   WHERE s.employer_id = v_employer_id
     AND ip.status = 'active';

  SELECT default_contribution_config ->> 'mode' INTO v_mode
    FROM public.employers WHERE id = v_employer_id;

  v_result := jsonb_build_object(
    'headcount',             COALESCE(v_sub.headcount, 0),
    'active',                COALESCE(v_sub.active, 0),
    'suspended',             COALESCE(v_sub.suspended, 0),
    'totalBalance',          COALESCE(v_sub.total_balance, 0),
    'totalContributions',    COALESCE(v_tx.own_total, 0) + COALESCE(v_tx.employer_total, 0),
    'ownContributions',      COALESCE(v_tx.own_total, 0),
    'employerContributions', COALESCE(v_tx.employer_total, 0),
    'insuredCount',          COALESCE(v_insured, 0),
    'employerYtd',           COALESCE(v_tx.employer_ytd, 0),
    'employeeYtd',           COALESCE(v_tx.own_ytd, 0),
    'modeSplit', CASE
      WHEN v_mode = 'co-contribution'
        THEN jsonb_build_object('coContribution', COALESCE(v_sub.headcount, 0), 'employerOnly', 0)
      ELSE jsonb_build_object('coContribution', 0, 'employerOnly', COALESCE(v_sub.headcount, 0))
    END
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_employer_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_employer_metrics() TO authenticated;


-- -----------------------------------------------------------------------------
-- apply_group_insurance(p_cover) — re-point to tagged subscribers' insurance
-- -----------------------------------------------------------------------------
-- Activates a flat group life cover across the caller's tagged subscribers,
-- writing public.insurance_policies (PK subscriber_id) instead of the retired
-- employees table. Premium zeroed (group-included). Supersedes 0039.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_group_insurance(p_cover numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role        text := (SELECT auth.jwt()) ->> 'app_role';
  v_employer_id text := (SELECT auth.jwt()) ->> 'employerId';
  v_status      text := CASE WHEN COALESCE(p_cover, 0) > 0 THEN 'active' ELSE 'inactive' END;
  v_updated     integer := 0;
BEGIN
  IF v_role IS DISTINCT FROM 'employer' THEN
    RAISE EXCEPTION 'role % cannot apply group insurance', v_role USING ERRCODE = 'P0001';
  END IF;
  IF v_employer_id IS NULL OR v_employer_id = '' THEN
    RAISE EXCEPTION 'missing employerId claim' USING ERRCODE = 'P0001';
  END IF;

  WITH tagged AS (
    SELECT id FROM public.subscribers WHERE employer_id = v_employer_id
  ),
  upsert AS (
    INSERT INTO public.insurance_policies (subscriber_id, cover, premium_monthly, status, updated_at)
    SELECT id, COALESCE(p_cover, 0), 0, v_status, now() FROM tagged
    ON CONFLICT (subscriber_id) DO UPDATE SET
      cover           = EXCLUDED.cover,
      premium_monthly = 0,
      status          = EXCLUDED.status,
      updated_at      = now()
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated FROM upsert;

  RETURN jsonb_build_object('updated', v_updated, 'cover', COALESCE(p_cover, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.apply_group_insurance(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_group_insurance(numeric) TO authenticated;

-- =============================================================================
-- End of 0044_employer_subscriber_rpcs.sql
-- Partner: 0045_retire_employees.sql (drops the standalone employees machinery).
-- =============================================================================
