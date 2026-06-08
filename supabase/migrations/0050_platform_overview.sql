-- =============================================================================
-- Universal Pensions Uganda — 0050: get_platform_overview() (admin true totals)
-- =============================================================================
-- The Admin dashboard's country "Summary" card originally reused
-- get_entity_metrics_rollup('country','ug') (0020). That RPC counts subscribers
-- by walking the agent tree (per_agent CTE: agents LEFT JOIN subscribers ON
-- s.agent_id = a.id) -> 5,000, which STRUCTURALLY excludes employer-onboarded
-- subscribers (employer_id NOT NULL, agent_id NULL) — 17 in the current seed.
-- Yet its AUM/contributions/withdrawals CTEs sum ALL rows (platform-wide). Net:
-- platform money but tree-only headcount — internally inconsistent, and wrong
-- for an admin who must see EVERY subscriber regardless of acquisition channel.
--
-- This RPC is a NEW, money-AND-headcount-consistent platform overview computed
-- directly over the base tables (no agent-tree walk), so all three acquisition
-- channels are included in the headcount:
--   * subscribersViaDistributor = agent_id   IS NOT NULL  (agent -> branch tree)
--   * subscribersViaEmployer    = employer_id IS NOT NULL  (employer-tagged)
--   * subscribersDirect         = both NULL                (self-signup, unaffiliated)
-- These three partition `subscribers` exactly (verified: 5000+17+0 = 5017 total,
-- 0 rows with both agent_id AND employer_id).
--
-- Per-distributor rollups are intentionally ABSENT: distributors hang off 'ug'
-- as a flat catalog (parent_id='ug', siblings of regions) and branches/agents/
-- subscribers carry NO distributor_id, so the network is not partitioned per
-- distributor. The only honest platform-wide distributor metric is the count.
--
-- It does NOT modify get_entity_metrics_rollup — the geographic map drill-down
-- (region/district/branch/agent) keeps using that (correct: employer subs belong
-- to no region/branch). This RPC powers ONLY the admin platform Summary.
--
-- CONVENTIONS (mirroring 0049 get_all_employers_metrics):
--   * LANGUAGE plpgsql; STABLE; SECURITY DEFINER; SET search_path = public, pg_temp
--   * REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated
--   * Gate on (SELECT auth.jwt()) ->> 'app_role' = 'admin' (CLAUDE.md §5.7 — read
--     'app_role', NEVER 'role'; (SELECT ...) wrapper = 0008 initplan opt).
--   * Scalar subqueries (one independent aggregate per metric) so no fan-out.
-- Forward-only; reversible via 0050_platform_overview.down.sql.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_platform_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role   text := (SELECT auth.jwt()) ->> 'app_role';
  v_result jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'role % cannot read the platform overview', v_role USING ERRCODE = 'P0001';
  END IF;

  SELECT jsonb_build_object(
    -- Subscriber headcount — platform-wide, ALL acquisition channels.
    'totalSubscribers',          (SELECT count(*) FROM public.subscribers),
    'subscribersViaDistributor', (SELECT count(*) FROM public.subscribers WHERE agent_id IS NOT NULL),
    'subscribersViaEmployer',    (SELECT count(*) FROM public.subscribers WHERE employer_id IS NOT NULL),
    'subscribersDirect',         (SELECT count(*) FROM public.subscribers WHERE agent_id IS NULL AND employer_id IS NULL),
    'activeSubscribers',         (SELECT count(*) FROM public.subscribers WHERE is_active IS TRUE),
    'inactiveSubscribers',       (SELECT count(*) FROM public.subscribers WHERE is_active IS DISTINCT FROM TRUE),
    -- Network entities (flat catalogs + tree nodes).
    'distributors',              (SELECT count(*) FROM public.distributors),
    'employers',                 (SELECT count(*) FROM public.employers),
    'branches',                  (SELECT count(*) FROM public.branches),
    'agents',                    (SELECT count(*) FROM public.agents),
    -- Money — platform-wide; every balance / every transaction row.
    'aum',                       (SELECT COALESCE(sum(total_balance), 0) FROM public.subscriber_balances),
    'totalContributions',        (SELECT COALESCE(sum(amount), 0)      FROM public.transactions WHERE type = 'contribution'),
    'totalWithdrawals',          (SELECT COALESCE(sum(ABS(amount)), 0) FROM public.transactions WHERE type = 'withdrawal')
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_overview() TO authenticated;

-- =============================================================================
-- End of 0050_platform_overview.sql
-- =============================================================================
