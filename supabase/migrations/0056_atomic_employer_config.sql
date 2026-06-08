-- =============================================================================
-- Universal Pensions Uganda — 0056: atomic employer config + group insurance
-- =============================================================================
-- Audit §7d-3. The employer Settings "Pension"/"Insurance" save was a NON-atomic
-- two-RPC write: update_employer_profile (persists default_contribution_config,
-- which carries `insuranceEnabled`/`groupCoverAmount`) followed by a separate
-- apply_group_insurance (UPSERTs every tagged subscriber's insurance_policies).
-- A partial failure (step 1 commits, step 2 fails — the more failure-prone call,
-- since it touches EVERY member) left the company config claiming cover is on at
-- amount X while the policy table — and therefore the hero `insuredCount` — were
-- never updated, a visible contradiction.
--
-- Fix: fold the group-cover application INTO update_employer_profile so the
-- config patch and the insurance_policies UPSERT/clear commit in the SAME
-- transaction. Backward-compatible: two OPTIONAL defaulted params are added; when
-- they are NULL the function behaves EXACTLY as the 0035 definition (existing
-- callers — the profile-tab handleSave, employer.test.js — are unaffected, and
-- the rpc args they send are unchanged: a single p_patch).
--
-- The insurance write mirrors apply_group_insurance (0044, unified model): it
-- writes public.insurance_policies (PK subscriber_id) for the caller's tagged
-- subscribers, premium zeroed (employer-included group benefit), status derived
-- from the effective cover (>0 → 'active', else 'inactive'). `apply_group_insurance`
-- itself is LEFT IN PLACE (still defined for any other caller / the service's mock
-- branch); this migration only removes the need for the Settings save to call it
-- as a second step.
--
-- CONVENTIONS (CLAUDE.md / BACKEND.md, mirroring 0035 / 0044):
--   * LANGUAGE plpgsql; SECURITY DEFINER + `SET search_path = public, pg_temp`.
--   * Role read via (SELECT auth.jwt()) ->> 'app_role' (NEVER 'role').
--   * Scoped to the caller's (SELECT auth.jwt()) ->> 'employerId' (NEVER
--     auth.uid() — it is NULL for our custom HS256 JWTs).
--   * `updated_at` set inline (no shared trigger in this repo).
--   * Signature kept ADDITIVE (the two new params default NULL) so the return
--     shape + existing 1-arg call site stay identical.
--   * GRANT unchanged from 0035 (REVOKE FROM PUBLIC; GRANT TO authenticated);
--     0036 separately tightens this to authenticated, service_role via the
--     to_regprocedure loop.
--   * Forward-only; reversible via 0056_atomic_employer_config.down.sql.
--
-- ⚠️ DORMANT until applied: the frontend (employer.js `updateEmployerProfile`,
--    EmployerSettings `saveConfig`) will start sending p_group_cover /
--    p_insurance_enabled. Against an un-applied live DB the extra named params
--    raise PGRST202 (no function with that signature). Apply this at the G-DB
--    gate before shipping the frontend change.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- update_employer_profile(p_patch jsonb,
--                         p_group_cover numeric DEFAULT NULL,
--                         p_insurance_enabled boolean DEFAULT NULL) RETURNS jsonb
-- -----------------------------------------------------------------------------
-- Employer-only. Patches the caller's own employers row (only the editable
-- profile/config columns; id / timestamps are never patched). When
-- p_insurance_enabled IS NOT NULL, ALSO applies the company-wide flat group
-- cover to every tagged subscriber's insurance_policies in the SAME transaction
-- (effective cover = enabled ? round(COALESCE(p_group_cover,0)) : 0; status
-- derived; premium zeroed). Returns the updated employers row as jsonb.
--
-- The two new params are DEFAULTed so a legacy single-arg call —
-- update_employer_profile(p_patch := …) — still resolves here (p_group_cover /
-- p_insurance_enabled fall to NULL → the insurance leg is skipped). The old
-- 0035 one-arg overload MUST be dropped first: keeping it alongside the defaulted
-- three-arg form would make a one-arg call ambiguous (42725). Dropping the
-- function also drops its old grants, which the GRANT below re-establishes.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_employer_profile(jsonb);

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
  v_cover       numeric;
  v_status      text;
  v_result      jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'employer' THEN
    RAISE EXCEPTION 'role % cannot update an employer profile', v_role
      USING ERRCODE = 'P0001';
  END IF;

  IF v_employer_id IS NULL OR v_employer_id = '' THEN
    RAISE EXCEPTION 'missing employerId claim'
      USING ERRCODE = 'P0001';
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
    RAISE EXCEPTION 'employer % not found', v_employer_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Atomic group-insurance leg: only when the caller opted in by passing the
  -- insurance flag (NULL = legacy single-patch call → behave exactly as 0035 and
  -- touch no policies). Effective cover is 0 when disabled, which clears cover
  -- and flips status to 'inactive' — same semantics as apply_group_insurance.
  IF p_insurance_enabled IS NOT NULL THEN
    v_cover  := CASE WHEN p_insurance_enabled THEN round(COALESCE(p_group_cover, 0)) ELSE 0 END;
    v_status := CASE WHEN v_cover > 0 THEN 'active' ELSE 'inactive' END;

    INSERT INTO public.insurance_policies (subscriber_id, cover, premium_monthly, status, updated_at)
    SELECT id, v_cover, 0, v_status, now()
      FROM public.subscribers
     WHERE employer_id = v_employer_id
    ON CONFLICT (subscriber_id) DO UPDATE SET
      cover           = EXCLUDED.cover,
      premium_monthly = 0,
      status          = EXCLUDED.status,
      updated_at      = now();
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_employer_profile(jsonb, numeric, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_employer_profile(jsonb, numeric, boolean) TO authenticated;

-- =============================================================================
-- End of 0056_atomic_employer_config.sql
-- =============================================================================
