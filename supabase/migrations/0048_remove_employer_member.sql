-- =============================================================================
-- Universal Pensions Uganda — 0048: remove a member from an employer's roster
-- =============================================================================
-- Adds ONE SECURITY DEFINER RPC, `remove_employer_member`, called from the
-- employer roster ("Remove from company"). It UN-LINKS a subscriber from the
-- caller's company by clearing `subscribers.employer_id`, so the person drops
-- off the employer's roster and is no longer funded by employer contribution
-- runs (runs filter by `employer_id`).
--
-- IMPORTANT — this is NOT a suspend/deactivate. `is_active` is deliberately left
-- untouched: the subscriber's pension account stays fully active and they simply
-- continue as an individual saver after leaving the employer. (An employer must
-- not be able to disable a person's account — only end the employment link.)
--
-- CONVENTIONS (CLAUDE.md / BACKEND.md, mirroring 0035 / 0036 / 0038 / 0039):
--   * LANGUAGE plpgsql; SECURITY DEFINER + `SET search_path = public, pg_temp`.
--   * Role read via (SELECT auth.jwt()) ->> 'app_role' (NEVER 'role').
--   * Scoped to the caller's (SELECT auth.jwt()) ->> 'employerId' (NEVER
--     auth.uid() — it is NULL for our custom HS256 JWTs); the WHERE clause also
--     pins employer_id so one employer can never un-link another's member.
--   * `subscribers` has no `updated_at` column (0001) — none is set.
--   * REVOKE EXECUTE FROM PUBLIC, anon; GRANT EXECUTE TO authenticated,
--     service_role — matching the 0036/0039 write-RPC grant restriction.
--   * Forward-only; reversible via 0048_remove_employer_member.down.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- remove_employer_member(p_subscriber_id text) RETURNS jsonb
-- -----------------------------------------------------------------------------
-- Employer-only. Clears employer_id on one of the caller's own members. Errors
-- if the subscriber isn't part of the caller's roster. Returns { id, removed }.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_employer_member(p_subscriber_id text)
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
    RAISE EXCEPTION 'role % cannot remove a member', v_role
      USING ERRCODE = 'P0001';
  END IF;

  IF v_employer_id IS NULL OR v_employer_id = '' THEN
    RAISE EXCEPTION 'missing employerId claim'
      USING ERRCODE = 'P0001';
  END IF;

  -- Un-link only — is_active is intentionally NOT changed.
  UPDATE public.subscribers
     SET employer_id = NULL
   WHERE id = p_subscriber_id
     AND employer_id = v_employer_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'no member % on this employer''s roster', p_subscriber_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'id',      p_subscriber_id,
    'removed', true,
    'updated', v_updated
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.remove_employer_member(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.remove_employer_member(text) TO authenticated, service_role;

-- =============================================================================
-- End of 0048_remove_employer_member.sql
-- =============================================================================
