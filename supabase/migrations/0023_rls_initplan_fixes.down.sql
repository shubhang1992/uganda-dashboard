-- 0023_rls_initplan_fixes.down.sql — rollback recipe.

-- =============================================================================
-- (3) Reset _demo_now() search_path to its pre-migration state.
-- =============================================================================
ALTER FUNCTION public._demo_now() RESET search_path;

-- =============================================================================
-- (2) Restore distributors_update_self WITHOUT the InitPlan wrap (re-creates
--     the auth.jwt() per-row evaluation; only reverse if a regression appears).
-- =============================================================================
DROP POLICY IF EXISTS distributors_update_self ON public.distributors;
CREATE POLICY distributors_update_self ON public.distributors
  FOR UPDATE
  USING ((auth.jwt() ->> 'distributorId'::text) = id);

-- =============================================================================
-- (1) Recreate the duplicate subscribers(agent_id) index.
-- =============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS subscribers_agent_id_idx
  ON public.subscribers (agent_id);
