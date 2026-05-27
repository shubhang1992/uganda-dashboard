-- =============================================================================
-- Universal Pensions Uganda — 0019: fix metrics rollup `app_role` (hotfix)
-- =============================================================================
-- Captures the remote-only `fix_metrics_rollup_app_role` hotfix that was
-- applied directly to the production Supabase instance after 0018 shipped
-- but before 0020 superseded the rollup body. The repo never received this
-- file at the time, so local-vs-remote migration history drifted (audit D5).
--
-- WHY THE HOTFIX EXISTED:
--   0018 introduced `get_entity_metrics_rollup(p_level, p_entity_ids)` with a
--   role gate that read `auth.jwt() ->> 'role'`. For our custom HS256 JWTs
--   (api/_lib/jwt.ts) that claim is hardcoded to `'authenticated'` (the
--   Postgres role PostgREST uses for SET ROLE). The application role lives in
--   `app_role`. Every drill-down call therefore raised `role_not_permitted`,
--   the frontend silently fell back to EMPTY_METRICS, and the map rendered
--   zero subscribers / em-dash AUM at every level. The hotfix patched the
--   role-claim read and the ACL grant; 0020 then folded the full body fix in.
--
-- WHAT THIS MIGRATION DOES:
--   Defensive, idempotent ACL adjustments only. The function body itself is
--   guaranteed to exist in one of two states by the time this runs:
--     * If 0020 has already been applied, the function is the v3 body with the
--       correct `app_role` claim; these grants are no-ops on top of 0020's own.
--     * If only 0018 has been applied (replay between 0018 and 0020), the
--       function is the 0018 body and the ACL discipline is what matters most
--       — `authenticated` should be the only role that can invoke it.
--
--   We deliberately do NOT redefine the function here. 0020 is the canonical
--   body; redefining it in 0019 would re-introduce the broken role gate during
--   a forward replay (0018 → 0019 → 0020) and create a confusing diff.
--
-- Forward-only per BACKEND.md §7. Replay-safe (IF EXISTS guards).
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'get_entity_metrics_rollup'
  ) THEN
    -- Lock the function down to `authenticated` only. PUBLIC must never hold
    -- EXECUTE on a SECURITY DEFINER function that touches cross-tenant data.
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_entity_metrics_rollup(TEXT, TEXT[]) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_entity_metrics_rollup(TEXT, TEXT[]) TO authenticated';
  END IF;
END $$;

-- =============================================================================
-- End of 0019_fix_metrics_rollup_app_role.sql
-- =============================================================================
