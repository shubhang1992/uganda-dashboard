-- 0023_rls_initplan_fixes.sql
--
-- Closes the three small Phase 2 audit findings that don't need the full
-- 11-table RLS-policy flatten:
--
--   AUDIT-2-9: duplicate index subscribers(agent_id)
--   AUDIT-2-* (auth_rls_initplan): distributors_update_self lacking InitPlan wrap
--   AUDIT-2-11: _demo_now() with mutable search_path
--
-- The full RLS flatten (55 multiple_permissive_policies warnings across 11
-- tables) is intentionally deferred to a follow-up PR-6b. See
-- docs/audit/REPORT.md §3 PR-6 + remediation-plan §"Deferred backlog".

-- =============================================================================
-- (1) Drop the duplicate subscribers(agent_id) index
--     Two identical indexes existed: subscribers_agent_id_idx (728 KB) and
--     idx_subscribers_agent_id (264 KB). We keep the smaller/newer one.
-- =============================================================================
DROP INDEX CONCURRENTLY IF EXISTS public.subscribers_agent_id_idx;

-- =============================================================================
-- (2) Wrap distributors_update_self in (SELECT auth.jwt() ...)
--     Per Supabase advisor 0003_auth_rls_initplan: re-evaluating auth.jwt()
--     per row is suboptimal. The (SELECT) wrap hoists it into an InitPlan.
-- =============================================================================
DROP POLICY IF EXISTS distributors_update_self ON public.distributors;
CREATE POLICY distributors_update_self ON public.distributors
  FOR UPDATE
  USING ((SELECT auth.jwt() ->> 'distributorId') = id);

-- =============================================================================
-- (3) Lock _demo_now() search_path
--     Migration 0010 set search_path on every PL/pgSQL function except this
--     one. Mutable search_path is a known supply-chain attack surface.
-- =============================================================================
ALTER FUNCTION public._demo_now() SET search_path = pg_catalog, public;

-- =============================================================================
-- Verification:
--   SELECT count(*) FROM pg_indexes
--    WHERE tablename = 'subscribers' AND indexname = 'subscribers_agent_id_idx';
--   -- Expect: 0
--
--   SELECT pg_get_expr(polqual, polrelid)
--     FROM pg_policy WHERE polname = 'distributors_update_self';
--   -- Expect: ((SELECT (auth.jwt() ->> 'distributorId'::text)) = id)
--
--   SELECT proconfig FROM pg_proc
--    WHERE proname = '_demo_now' AND pronamespace = 'public'::regnamespace;
--   -- Expect: {search_path=pg_catalog, public}
-- =============================================================================
