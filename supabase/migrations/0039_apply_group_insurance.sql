-- =============================================================================
-- Universal Pensions Uganda — 0039: roster-wide group life insurance
-- =============================================================================
-- Employer redesign (Phase 7). Adds ONE SECURITY DEFINER RPC,
-- `apply_group_insurance`, the roster-wide analogue of the per-employee
-- `update_employee_insurance` RPC (0035). When an employer saves an
-- EMPLOYER-ONLY default config with a group cover amount, the settings tab
-- calls this RPC to activate group life cover for EVERY one of their employees
-- at a single flat amount (NOT salary-based). The existing per-employee
-- insurance editor still applies individual overrides afterwards.
--
-- The cover is a flat employer-included group benefit, so the monthly premium
-- is zeroed (the employer bundles the cost into employer-only funding — there
-- is no per-employee premium to charge). insurance_status derives from the
-- cover the same way the per-employee RPC does (>0 → 'active', else
-- 'inactive'), which lets a cover of 0 act as a "switch the group cover off"
-- toggle.
--
-- CONVENTIONS (CLAUDE.md / BACKEND.md, mirroring 0035 / 0036 / 0038):
--   * LANGUAGE plpgsql; SECURITY DEFINER + `SET search_path = public, pg_temp`.
--   * Role read via (SELECT auth.jwt()) ->> 'app_role' (NEVER 'role').
--   * Scoped to the caller's (SELECT auth.jwt()) ->> 'employerId' (NEVER
--     auth.uid() — it is NULL for our custom HS256 JWTs).
--   * `updated_at` set inline (no shared trigger in this repo).
--   * REVOKE EXECUTE FROM PUBLIC, anon; GRANT EXECUTE TO authenticated,
--     service_role — matching the 0036 write-RPC grant restriction (this is a
--     mutation reached only post-login).
--   * Forward-only; reversible via 0039_apply_group_insurance.down.sql.
--   * Part of the 0001→0042 baseline applied in order at the restore cutover.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- apply_group_insurance(p_cover numeric) RETURNS jsonb
-- -----------------------------------------------------------------------------
-- Employer-only. Sets a FLAT group cover on every employee owned by the caller:
-- insurance_cover = round(p_cover), insurance_status derived from the cover,
-- insurance_premium_monthly = 0 (employer-included group benefit). Returns a
-- small summary { updated, cover }.
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
  v_updated     integer := 0;
BEGIN
  IF v_role IS DISTINCT FROM 'employer' THEN
    RAISE EXCEPTION 'role % cannot apply group insurance', v_role
      USING ERRCODE = 'P0001';
  END IF;

  IF v_employer_id IS NULL OR v_employer_id = '' THEN
    RAISE EXCEPTION 'missing employerId claim'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.employees
     SET insurance_cover           = round(COALESCE(p_cover, 0)),
         insurance_status          = CASE WHEN COALESCE(p_cover, 0) > 0
                                          THEN 'active' ELSE 'inactive' END,
         insurance_premium_monthly = 0,  -- group cover is employer-included
         updated_at                = now()
   WHERE employer_id = v_employer_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'updated', v_updated,
    'cover',   COALESCE(p_cover, 0)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_group_insurance(numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.apply_group_insurance(numeric) TO authenticated, service_role;

-- =============================================================================
-- End of 0039_apply_group_insurance.sql
-- =============================================================================
