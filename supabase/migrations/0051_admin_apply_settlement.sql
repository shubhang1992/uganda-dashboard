-- =============================================================================
-- Universal Pensions Uganda — 0051: allow admin to apply commission settlements
-- =============================================================================
-- The admin dashboard reuses the distributor CommissionPanel, whose settlement
-- "Upload" calls apply_settlement(jsonb, text). That RPC (0032) gates on
-- `v_role IS DISTINCT FROM 'distributor'` and RAISEs for any other role — so an
-- `app_role='admin'` caller hit `role admin cannot apply a settlement`. A
-- head-office admin with global rights should be able to settle, so widen the
-- gate to (distributor, admin).
--
-- Body-faithful re-emit (mirrors the 0007 pattern): pull the CURRENT definition
-- via pg_get_functiondef and swap ONLY the role-gate predicate, leaving all the
-- settlement logic byte-identical to whatever 0032 last installed. CREATE OR
-- REPLACE preserves the existing GRANTs (0036), so no re-GRANT is needed.
-- Idempotent: after the swap the old predicate is gone, so a re-run is a no-op.
-- Forward-only; reversible via 0051_admin_apply_settlement.down.sql.
-- =============================================================================

DO $migration$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.apply_settlement(jsonb, text)'::regprocedure);
  v_def := replace(
    v_def,
    'v_role IS DISTINCT FROM ''distributor''',
    'v_role NOT IN (''distributor'', ''admin'')'
  );
  EXECUTE v_def;
END
$migration$;

-- =============================================================================
-- End of 0051_admin_apply_settlement.sql
-- =============================================================================
