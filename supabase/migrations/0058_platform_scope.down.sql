-- =============================================================================
-- Universal Pensions Uganda — 0058 DOWN: revert platform data-scope additions
-- =============================================================================
-- Restores the 0057 get_platform_overview() body (13 keys, no byChannel) verbatim
-- and drops the new get_employer_geo_rollup() RPC.
-- =============================================================================

-- 1) Restore get_platform_overview() to the 0057 definition (no byChannel split).
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

  WITH subs AS (
    SELECT
      count(*)                                                                  AS total_subscribers,
      count(*) FILTER (WHERE agent_id IS NOT NULL)                              AS subscribers_via_distributor,
      count(*) FILTER (WHERE employer_id IS NOT NULL)                           AS subscribers_via_employer,
      count(*) FILTER (WHERE agent_id IS NULL AND employer_id IS NULL)          AS subscribers_direct,
      count(*) FILTER (WHERE is_active IS TRUE)                                 AS active_subscribers,
      count(*) FILTER (WHERE is_active IS DISTINCT FROM TRUE)                   AS inactive_subscribers
    FROM public.subscribers
  ),
  txn AS (
    SELECT
      COALESCE(sum(amount)      FILTER (WHERE type = 'contribution'), 0) AS total_contributions,
      COALESCE(sum(ABS(amount)) FILTER (WHERE type = 'withdrawal'),   0) AS total_withdrawals
    FROM public.transactions
  )
  SELECT jsonb_build_object(
    'totalSubscribers',          s.total_subscribers,
    'subscribersViaDistributor', s.subscribers_via_distributor,
    'subscribersViaEmployer',    s.subscribers_via_employer,
    'subscribersDirect',         s.subscribers_direct,
    'activeSubscribers',         s.active_subscribers,
    'inactiveSubscribers',       s.inactive_subscribers,
    'distributors',              (SELECT count(*) FROM public.distributors),
    'employers',                 (SELECT count(*) FROM public.employers),
    'branches',                  (SELECT count(*) FROM public.branches),
    'agents',                    (SELECT count(*) FROM public.agents),
    'aum',                       (SELECT COALESCE(sum(total_balance), 0) FROM public.subscriber_balances),
    'totalContributions',        t.total_contributions,
    'totalWithdrawals',          t.total_withdrawals
  )
  INTO v_result
  FROM subs s, txn t;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_overview() TO authenticated;

-- 2) Drop the new employer geo rollup RPC.
DROP FUNCTION IF EXISTS public.get_employer_geo_rollup();
