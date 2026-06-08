-- =============================================================================
-- Universal Pensions Uganda — 0056 DOWN (manual-only rollback)
-- =============================================================================
-- Undoes 0056_atomic_employer_config.sql. NOT part of the forward-only chain;
-- for manual/emergency use:
--
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/0056_atomic_employer_config.down.sql
--
-- Reverses the atomic config+insurance fold: drops the 3-arg overload and
-- restores the prior 0035 one-arg update_employer_profile(jsonb) — the HARDENED
-- definition (SECURITY DEFINER + `SET search_path = public, pg_temp`, the
-- post-login REVOKE/GRANT). It restores ONLY the profile UPDATE; the separate
-- apply_group_insurance RPC (0044, left in place by 0056) again carries the
-- insurance leg, so the frontend must revert to the two-call save path in step.
-- Safe to re-run (DROP … IF EXISTS + CREATE OR REPLACE).
-- =============================================================================

DROP FUNCTION IF EXISTS public.update_employer_profile(jsonb, numeric, boolean);

-- Restore the prior 0035 one-arg definition (hardened).
CREATE OR REPLACE FUNCTION public.update_employer_profile(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role        text := (SELECT auth.jwt()) ->> 'app_role';
  v_employer_id text := (SELECT auth.jwt()) ->> 'employerId';
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

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_employer_profile(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_employer_profile(jsonb) TO authenticated;

-- =============================================================================
-- End of 0056_atomic_employer_config.down.sql
-- =============================================================================
