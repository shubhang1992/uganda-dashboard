-- =============================================================================
-- Universal Pensions Uganda — 0055: set_commission_rate DEFINER RPC (audit §4a F-7)
-- =============================================================================
-- F-7: `commission_config.rate` was settable via an unvalidated direct client
-- UPDATE (`commissions.js` setCommissionRate → supabase.from('commission_config')
-- .update({rate})). The flat per-subscriber commission rate is the multiplier the
-- contribution trigger stamps onto every new first-contribution commission, so a
-- direct write with no bound check (negative / zero / absurd all passed) silently
-- changed the money stamped on all FUTURE commissions — a §7.3 direct-write on a
-- money-config table with no server-side invariant enforcement and no audit hook.
--
-- This routes that write through a SECURITY DEFINER RPC that:
--   * gates app_role='distributor' (mirrors the commission_config_update_distributor
--     RLS the direct path relied on — see 0008), reading the role via
--     (SELECT auth.jwt()) ->> 'app_role' (NEVER 'role');
--   * range-checks p_rate >= 0 AND p_rate <= the upper bound (see below);
--   * updates the single commission_config row (id='default') and stamps
--     last_updated_by / updated_at;
--   * returns the persisted rate (NUMERIC) so the frontend contract is unchanged.
--
-- UPPER BOUND: the rate-edit UI (CommissionPanel.jsx saveRate) only validates
-- `val > 0` with NO explicit max, so there is no existing UI cap constant to read.
-- We pick a generous-but-sane ceiling of 1,000,000 UGX/subscriber — comfortably
-- above any realistic per-onboarding commission (the seed default is 5,000 UGX)
-- while still rejecting the "absurd" values F-7 calls out. If the UI later adds an
-- explicit `max`, keep the two in sync.
--
-- CONVENTIONS (mirroring 0044 / 0049 / 0051):
--   * LANGUAGE plpgsql; SECURITY DEFINER + SET search_path = pg_catalog, public, pg_temp.
--   * Role read via (SELECT auth.jwt()) ->> 'app_role'.
--   * REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated (matching the role the
--     sibling commission_config UPDATE policy / settlement RPCs grant to).
--   * Forward-only; reversible via 0055_set_commission_rate.down.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- set_commission_rate(p_rate numeric)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_commission_rate(p_rate numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_role     text    := (SELECT auth.jwt()) ->> 'app_role';
  -- Generous-but-sane ceiling; see header. 1,000,000 UGX/subscriber.
  v_rate_max numeric := 1000000;
  v_rate     numeric;
BEGIN
  IF v_role IS DISTINCT FROM 'distributor' THEN
    RAISE EXCEPTION 'role % cannot set the commission rate', v_role USING ERRCODE = 'P0001';
  END IF;

  IF p_rate IS NULL THEN
    RAISE EXCEPTION 'commission rate is required' USING ERRCODE = 'P0001';
  END IF;
  IF p_rate < 0 OR p_rate > v_rate_max THEN
    RAISE EXCEPTION 'commission rate % out of range [0, %]', p_rate, v_rate_max
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.commission_config
     SET rate            = p_rate,
         last_updated_by = COALESCE((SELECT auth.jwt()) ->> 'distributorId', last_updated_by),
         updated_at      = now()
   WHERE id = 'default'
  RETURNING rate INTO v_rate;

  IF v_rate IS NULL THEN
    RAISE EXCEPTION 'commission_config default row not found' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_rate;
END;
$$;

REVOKE ALL ON FUNCTION public.set_commission_rate(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_commission_rate(numeric) TO authenticated;

-- =============================================================================
-- End of 0055_set_commission_rate.sql
-- =============================================================================
