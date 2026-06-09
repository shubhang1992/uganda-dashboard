-- =============================================================================
-- DOWN — 0051_admin_apply_settlement.sql
-- =============================================================================
-- Restore the distributor-only gate on apply_settlement (body-faithful swap-back).
-- =============================================================================

DO $migration$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.apply_settlement(jsonb, text)'::regprocedure);
  v_def := replace(
    v_def,
    'v_role NOT IN (''distributor'', ''admin'')',
    'v_role IS DISTINCT FROM ''distributor'''
  );
  EXECUTE v_def;
END
$migration$;

-- =============================================================================
-- End of 0051_admin_apply_settlement.down.sql
-- =============================================================================
