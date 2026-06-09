-- =============================================================================
-- DOWN — 0053_schema_hygiene.sql
-- =============================================================================
-- Reverses each block of 0053 in REVERSE order. Per audit §1b.6, every function
-- restored here is restored to its HARDENED prior definition (search_path pinned
-- public,pg_temp; same SECURITY model) — NEVER a vulnerable earlier form. All
-- steps are guarded (IF EXISTS / to_regclass / to_regprocedure) so this .down is
-- safe to re-run.
-- =============================================================================


-- (10) §4b.10 — drop the users_phone_role_unique rationale comment.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_role_unique'
               AND conrelid = 'public.users'::regclass) THEN
    EXECUTE 'COMMENT ON CONSTRAINT users_phone_role_unique ON public.users IS NULL';
  END IF;
END $$;


-- (9) §1b.5 — restore submit_employer_contribution_run WITHOUT the NULLIF guards
--     (the 0044 body). Hardened form (DEFINER + pinned) preserved.
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

  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    SELECT result INTO v_prior FROM public.contribution_run_uploads WHERE nonce = p_nonce;
    IF v_prior IS NOT NULL THEN
      RETURN v_prior;
    END IF;
  END IF;

  SELECT default_contribution_config INTO v_config FROM public.employers WHERE id = v_employer_id;
  v_config := COALESCE(v_config, '{}'::jsonb);
  v_mode   := COALESCE(v_config ->> 'mode', 'employer-only');

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
    IF v_mode = 'co-contribution' THEN
      v_match_pct   := (v_config ->> 'matchPct')::numeric;
      v_max_contrib := (v_config ->> 'maxContribution')::numeric;
      v_employer_amt := round(v_sub.own_amount * COALESCE(v_match_pct, 0) / 100);
      IF v_max_contrib IS NOT NULL THEN
        v_employer_amt := LEAST(v_employer_amt, round(v_max_contrib));
      END IF;
    ELSE
      v_employer_amt := round(COALESCE((v_config ->> 'employerAmount')::numeric, 0));
    END IF;

    IF v_employer_amt <= 0 THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('subscriberId', v_sub.id, 'reason', 'zero_contribution')
      );
      CONTINUE;
    END IF;

    v_ret_pct := v_sub.ret_pct;
    IF v_ret_pct IS NULL OR v_ret_pct < 0 OR v_ret_pct > 100 THEN
      v_ret_pct := 80;
    END IF;
    v_retirement := round(v_employer_amt * v_ret_pct / 100);
    v_emergency  := v_employer_amt - v_retirement;

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


-- (8) §1b.5 / §2a.8 — restore create_distributor + create_employer WITHOUT the
--     extra validation (the 0049 bodies). Hardened form preserved.
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
  v_role text := (SELECT auth.jwt()) ->> 'app_role';
  v_id   text;
  v_row  public.distributors%ROWTYPE;
BEGIN
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'role % cannot create a distributor', v_role USING ERRCODE = 'P0001';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'distributor name is required' USING ERRCODE = 'P0001';
  END IF;

  v_id := 'd-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.distributors (
    id, name, parent_id, manager_name, manager_phone, manager_email, status
  ) VALUES (
    v_id, btrim(p_name), COALESCE(NULLIF(btrim(p_parent_id), ''), 'ug'),
    p_manager_name, p_manager_phone, p_manager_email, 'active'
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
  v_role text := (SELECT auth.jwt()) ->> 'app_role';
  v_id   text;
  v_row  public.employers%ROWTYPE;
BEGIN
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'role % cannot create an employer', v_role USING ERRCODE = 'P0001';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'employer name is required' USING ERRCODE = 'P0001';
  END IF;

  v_id := 'emp-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.employers (
    id, name, sector, registration_no, contact_name, contact_phone,
    contact_email, district, payroll_cadence, default_contribution_config
  ) VALUES (
    v_id, btrim(p_name), p_sector, p_registration_no, p_contact_name, p_contact_phone,
    p_contact_email, p_district, p_payroll_cadence,
    COALESCE(p_default_contribution_config, '{}'::jsonb)
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.create_employer(text, text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_employer(text, text, text, text, text, text, text, text, jsonb) TO authenticated;


-- (7) §4a D-2 — restore _insert_subscriber_chain with the 0042 365/freq day
--     arithmetic. Hardened form: INVOKER (as 0042 left it) + search_path pinned
--     public,pg_temp (restores the 0052 re-pin, NOT the un-pinned 0042 form —
--     §1b.6: never restore a vulnerable definition).
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
  v_p_count        INTEGER;
  v_p_sum          NUMERIC;
  v_i_count        INTEGER;
  v_i_sum          NUMERIC;
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

  v_tx_id := 'tx-' || v_new_id || '-init';
  INSERT INTO public.transactions (
    id, subscriber_id, agent_id, type, amount, date, status, method,
    txn_ref, split_retirement, split_emergency
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


-- (6) §1a.9 — drop the notifications employer SELECT policy.
DROP POLICY IF EXISTS notifications_select_employer ON public.notifications;


-- (5) §1a.8 — restore trg_subscribers_enforce_editable_cols WITHOUT the
--     employer_id lock (the live 0007/0010 body: app_role-gated, INVOKER,
--     search_path pinned). employer_id is simply absent from the lock-list.
CREATE OR REPLACE FUNCTION public.trg_subscribers_enforce_editable_cols()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT := auth.jwt() ->> 'app_role';
BEGIN
  IF v_role IS DISTINCT FROM 'subscriber' THEN
    RETURN NEW;
  END IF;

  IF NEW.id                        IS DISTINCT FROM OLD.id                        THEN RAISE EXCEPTION 'cannot modify id';                        END IF;
  IF NEW.gender                    IS DISTINCT FROM OLD.gender                    THEN RAISE EXCEPTION 'cannot modify gender';                    END IF;
  IF NEW.age                       IS DISTINCT FROM OLD.age                       THEN RAISE EXCEPTION 'cannot modify age';                       END IF;
  IF NEW.dob                       IS DISTINCT FROM OLD.dob                       THEN RAISE EXCEPTION 'cannot modify dob';                       END IF;
  IF NEW.nin                       IS DISTINCT FROM OLD.nin                       THEN RAISE EXCEPTION 'cannot modify nin';                       END IF;
  IF NEW.agent_id                  IS DISTINCT FROM OLD.agent_id                  THEN RAISE EXCEPTION 'cannot modify agent_id';                  END IF;
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


-- (4) §1b.1 — revert the 5 functions to their bare `public` search_path.
--     (Bare `public` is the prior, still-safe hardened state — not vulnerable;
--      it is only inconsistent with the house convention — so restoring it
--      satisfies §1b.6.) Guarded so a missing function does not abort the .down.
DO $$
BEGIN
  IF to_regprocedure('public.create_subscriber_from_signup(jsonb, text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.create_subscriber_from_signup(jsonb, text) SET search_path = public';
  END IF;
  IF to_regprocedure('public.create_subscriber_from_agent_onboard(jsonb, text, text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.create_subscriber_from_agent_onboard(jsonb, text, text) SET search_path = public';
  END IF;
  IF to_regprocedure('public.get_entity_metrics_rollup(text, text[])') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.get_entity_metrics_rollup(text, text[]) SET search_path = public';
  END IF;
  IF to_regprocedure('public.upsert_nominees(text, jsonb, jsonb)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.upsert_nominees(text, jsonb, jsonb) SET search_path = public';
  END IF;
  IF to_regprocedure('public.trg_distributors_enforce_editable_cols()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.trg_distributors_enforce_editable_cols() SET search_path = public';
  END IF;
END $$;


-- (3) §1a.11 — drop the employer_invites.subscriber_id index.
DROP INDEX IF EXISTS public.employer_invites_subscriber_id_idx;


-- (2) §1a.7 — drop the agents.coverage_rate documentation comment.
DO $$
BEGIN
  IF to_regclass('public.agents') IS NOT NULL THEN
    EXECUTE 'COMMENT ON COLUMN public.agents.coverage_rate IS NULL';
  END IF;
END $$;


-- (1) §1a.6 — re-add the duplicate nominees.share range check (the 0024 clone),
--     restoring the pre-0053 state. NOT VALID like 0024 so a populated table
--     doesn't block the rollback.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nominees_share_range_chk'
                   AND conrelid = 'public.nominees'::regclass) THEN
    EXECUTE 'ALTER TABLE public.nominees ADD CONSTRAINT nominees_share_range_chk CHECK (share BETWEEN 0 AND 100) NOT VALID';
  END IF;
END $$;

-- =============================================================================
-- End of 0053_schema_hygiene.down.sql
-- =============================================================================
