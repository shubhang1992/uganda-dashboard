-- 0067_employer_multiproduct_insurance.sql
--
-- Extend EMPLOYER group insurance from a single flat "group life" cover to the
-- same multi-product model the subscriber dashboard has — Life / Health /
-- Funeral — and reflect employer-funded products on the sponsored subscriber's
-- own policies.
--
-- Config (employers.default_contribution_config) now carries:
--   groupInsuranceProducts: { life:{enabled,cover}, health:{enabled,cover}, funeral:{enabled,cover} }
-- Legacy { insuranceEnabled, groupCoverAmount } still works (normalised to a
-- single life product) so un-migrated configs keep functioning.
--
-- This migration:
--   (a) adds funded_by ('self' | 'employer') to insurance_policies +
--       subscriber_insurance_products so a sponsored subscriber's policies can be
--       marked employer-paid (and the subscriber blocked from re-buying them);
--   (b) adds group_insurance_premium_per_member(config) — the per-member monthly
--       premium the employer funds = Σ over enabled products of round(cover*0.2%);
--   (c) rewrites update_employer_profile to fan the saved config out to EVERY
--       sponsored subscriber: life → insurance_policies, health/funeral →
--       subscriber_insurance_products, funded_by='employer', premium 0, active;
--       disabled products deactivate the EMPLOYER-funded rows only (self-bought
--       policies are never touched);
--   (d) rewrites the run insurance leg (0066) to charge the multi-product sum.
--
-- Parity: src/utils/groupInsurance.js (groupInsuranceProducts / *PremiumPerMember)
-- + src/services/employer.js mock compute the same numbers.

-- ── (a) employer-funded marker ──────────────────────────────────────────────
ALTER TABLE public.insurance_policies
  ADD COLUMN IF NOT EXISTS funded_by text NOT NULL DEFAULT 'self';
ALTER TABLE public.subscriber_insurance_products
  ADD COLUMN IF NOT EXISTS funded_by text NOT NULL DEFAULT 'self';

-- ── (b) shared premium helper (mirrors groupInsurancePremiumPerMember) ──────
CREATE OR REPLACE FUNCTION public.group_insurance_premium_per_member(p_config jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  WITH cfg AS (SELECT COALESCE(p_config, '{}'::jsonb) AS c),
       gip AS (SELECT (SELECT c FROM cfg) -> 'groupInsuranceProducts' AS g)
  SELECT COALESCE(
    CASE
      WHEN (SELECT g FROM gip) IS NOT NULL AND jsonb_typeof((SELECT g FROM gip)) = 'object' THEN (
        SELECT COALESCE(SUM(
          CASE
            WHEN COALESCE((v.value ->> 'enabled')::boolean, COALESCE(NULLIF(v.value ->> 'cover','')::numeric, 0) > 0)
                 AND COALESCE(NULLIF(v.value ->> 'cover','')::numeric, 0) > 0
            THEN round(COALESCE(NULLIF(v.value ->> 'cover','')::numeric, 0) * 0.002)
            ELSE 0
          END), 0)
        FROM jsonb_each((SELECT g FROM gip)) v
        WHERE v.key IN ('life', 'health', 'funeral')
      )
      ELSE  -- legacy single flat group life
        CASE
          WHEN COALESCE(((SELECT c FROM cfg) ->> 'insuranceEnabled')::boolean,
                        COALESCE(NULLIF((SELECT c FROM cfg) ->> 'groupCoverAmount','')::numeric, 0) > 0)
               AND COALESCE(NULLIF((SELECT c FROM cfg) ->> 'groupCoverAmount','')::numeric, 0) > 0
          THEN round(COALESCE(NULLIF((SELECT c FROM cfg) ->> 'groupCoverAmount','')::numeric, 0) * 0.002)
          ELSE 0
        END
    END, 0);
$$;

-- ── (c) config-save fans out to per-product employer-funded policies ────────
DROP FUNCTION IF EXISTS public.update_employer_profile(jsonb, numeric, boolean);

CREATE OR REPLACE FUNCTION public.update_employer_profile(
  p_patch             jsonb,
  p_group_cover       numeric DEFAULT NULL,
  p_insurance_enabled boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role        text := (SELECT auth.jwt()) ->> 'app_role';
  v_employer_id text := (SELECT auth.jwt()) ->> 'employerId';
  v_config      jsonb;
  v_gip         jsonb;
  v_cover       numeric;
  v_status      text;
  v_prod        text;
  v_pc          jsonb;
  v_pcover      numeric;
  v_pon         boolean;
  v_result      jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'employer' THEN
    RAISE EXCEPTION 'role % cannot update an employer profile', v_role USING ERRCODE = 'P0001';
  END IF;
  IF v_employer_id IS NULL OR v_employer_id = '' THEN
    RAISE EXCEPTION 'missing employerId claim' USING ERRCODE = 'P0001';
  END IF;

  p_patch := COALESCE(p_patch, '{}'::jsonb);

  UPDATE public.employers
     SET name                        = COALESCE(p_patch ->> 'name', name),
         sector                      = COALESCE(p_patch ->> 'sector', sector),
         registration_no             = COALESCE(p_patch ->> 'registrationNo', registration_no),
         contact_name                = COALESCE(p_patch ->> 'contactName', contact_name),
         contact_phone               = COALESCE(p_patch ->> 'contactPhone', contact_phone),
         contact_email               = COALESCE(p_patch ->> 'contactEmail', contact_email),
         district                    = COALESCE(p_patch ->> 'district', district),
         payroll_cadence             = COALESCE(p_patch ->> 'payrollCadence', payroll_cadence),
         default_contribution_config = COALESCE(p_patch -> 'defaultContributionConfig', default_contribution_config),
         updated_at                  = now()
   WHERE id = v_employer_id
  RETURNING to_jsonb(employers.*) INTO v_result;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'employer % not found', v_employer_id USING ERRCODE = 'P0001';
  END IF;

  v_config := v_result -> 'default_contribution_config';
  v_gip    := v_config -> 'groupInsuranceProducts';

  IF v_gip IS NOT NULL AND jsonb_typeof(v_gip) = 'object' THEN
    -- Multi-product fan-out. LIFE → insurance_policies (single row per member).
    v_cover := round(COALESCE(NULLIF(v_gip -> 'life' ->> 'cover','')::numeric, 0));
    IF COALESCE((v_gip -> 'life' ->> 'enabled')::boolean, v_cover > 0) AND v_cover > 0 THEN
      INSERT INTO public.insurance_policies (subscriber_id, cover, premium_monthly, status, funded_by, updated_at)
      SELECT id, v_cover, 0, 'active', 'employer', now()
        FROM public.subscribers WHERE employer_id = v_employer_id
      ON CONFLICT (subscriber_id) DO UPDATE SET
        cover = EXCLUDED.cover, premium_monthly = 0, status = 'active',
        funded_by = 'employer', updated_at = now();
    ELSE
      UPDATE public.insurance_policies SET status = 'inactive', updated_at = now()
       WHERE funded_by = 'employer'
         AND subscriber_id IN (SELECT id FROM public.subscribers WHERE employer_id = v_employer_id);
    END IF;

    -- HEALTH + FUNERAL → subscriber_insurance_products (PK subscriber_id, product).
    FOREACH v_prod IN ARRAY ARRAY['health', 'funeral'] LOOP
      v_pc     := v_gip -> v_prod;
      v_pcover := round(COALESCE(NULLIF(v_pc ->> 'cover','')::numeric, 0));
      v_pon    := COALESCE((v_pc ->> 'enabled')::boolean, v_pcover > 0) AND v_pcover > 0;
      IF v_pon THEN
        INSERT INTO public.subscriber_insurance_products (subscriber_id, product, cover, premium_monthly, status, funded_by, updated_at)
        SELECT id, v_prod, v_pcover, 0, 'active', 'employer', now()
          FROM public.subscribers WHERE employer_id = v_employer_id
        ON CONFLICT (subscriber_id, product) DO UPDATE SET
          cover = EXCLUDED.cover, premium_monthly = 0, status = 'active',
          funded_by = 'employer', updated_at = now();
      ELSE
        UPDATE public.subscriber_insurance_products SET status = 'inactive', updated_at = now()
         WHERE product = v_prod AND funded_by = 'employer'
           AND subscriber_id IN (SELECT id FROM public.subscribers WHERE employer_id = v_employer_id);
      END IF;
    END LOOP;

  ELSIF p_insurance_enabled IS NOT NULL THEN
    -- Legacy single flat group life (back-compat with the 0056 two-param call).
    v_cover  := CASE WHEN p_insurance_enabled THEN round(COALESCE(p_group_cover, 0)) ELSE 0 END;
    v_status := CASE WHEN v_cover > 0 THEN 'active' ELSE 'inactive' END;
    INSERT INTO public.insurance_policies (subscriber_id, cover, premium_monthly, status, funded_by, updated_at)
    SELECT id, v_cover, 0, v_status, 'employer', now()
      FROM public.subscribers WHERE employer_id = v_employer_id
    ON CONFLICT (subscriber_id) DO UPDATE SET
      cover = EXCLUDED.cover, premium_monthly = 0, status = EXCLUDED.status,
      funded_by = 'employer', updated_at = now();
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_employer_profile(jsonb, numeric, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_employer_profile(jsonb, numeric, boolean) TO authenticated;

-- ── (d) run insurance leg now charges the multi-product sum ─────────────────
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
  v_insurance_leg    numeric;
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
  v_insurance_total  numeric := 0;
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

  v_basis            := COALESCE(v_config ->> 'employerBasis', 'fixed');
  v_employee_pct     := COALESCE(NULLIF(v_config ->> 'employeePct', '')::numeric, 0);
  v_match_pct        := COALESCE(NULLIF(v_config ->> 'employerMatchPct', '')::numeric, 0);
  v_employer_pct     := COALESCE(NULLIF(v_config ->> 'employerPct', '')::numeric, 0);
  v_employer_amount  := COALESCE(NULLIF(v_config ->> 'employerAmount', '')::numeric, 0);

  -- Employer-funded group insurance premium per covered member = Σ products.
  v_insurance_leg := public.group_insurance_premium_per_member(v_config);

  v_run_id := 'run-' || replace(gen_random_uuid()::text, '-', '');
  v_tx_ref := 'EMP-' || substr(v_run_id, 5, 8);
  INSERT INTO public.contribution_runs (
    id, employer_id, period_label, status, employer_total, employee_total, insurance_total, grand_total, run_at
  ) VALUES (
    v_run_id, v_employer_id, p_period_label, 'completed', 0, 0, 0, 0, now()
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
    ELSE
      v_employee_leg := 0;
      IF v_basis = 'percent' THEN
        v_employer_leg := round(v_comp * v_employer_pct / 100);
      ELSE
        v_employer_leg := round(v_employer_amount);
      END IF;
    END IF;

    IF COALESCE(v_employee_leg, 0) <= 0 AND COALESCE(v_employer_leg, 0) <= 0 AND COALESCE(v_insurance_leg, 0) <= 0 THEN
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

    IF COALESCE(v_insurance_leg, 0) > 0 THEN
      INSERT INTO public.transactions (
        id, subscriber_id, agent_id, type, amount, date, status, method,
        txn_ref, split_retirement, split_emergency, source, contribution_run_id
      ) VALUES (
        't-' || replace(gen_random_uuid()::text, '-', ''), v_sub.id, NULL, 'insurance_premium',
        v_insurance_leg, now(), 'settled', p_method, v_tx_ref, NULL, NULL, 'employer', v_run_id
      );
      v_insurance_total := v_insurance_total + v_insurance_leg;
      v_funded := true;
    END IF;

    IF v_funded THEN
      v_members_funded := v_members_funded + 1;
    END IF;
  END LOOP;

  IF v_members_funded > 0 THEN
    UPDATE public.contribution_runs
       SET employer_total  = v_employer_total,
           employee_total  = v_employee_total,
           insurance_total = v_insurance_total,
           grand_total     = v_employer_total + v_employee_total + v_insurance_total
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
    'insuranceTotal', v_insurance_total,
    'grandTotal',    v_employer_total + v_employee_total + v_insurance_total,
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
