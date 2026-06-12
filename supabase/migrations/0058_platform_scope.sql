-- =============================================================================
-- Universal Pensions Uganda — 0058: platform data-scope (admin overview filter)
-- =============================================================================
-- Adds the data layer for the admin "Platform Overview" data-scope filter
-- (All / Distributors / Employers) and its map drill-down employer bifurcation:
--
--   1) get_platform_overview()    — EXTENDED (CREATE OR REPLACE). All 13 existing
--        keys are byte-for-byte preserved (every consumer + mocked test stays
--        green); we ADD a `byChannel` object that splits subscribers / active /
--        inactive / aum / contributions / withdrawals by acquisition channel
--        (distributor = agent_id, employer = employer_id, direct = neither). The
--        three channels sum exactly to the existing totals because every split is
--        a FILTER over the same single scan, and the balance / transaction CTEs
--        now JOIN subscribers 1:1 (subscriber_balances.subscriber_id is the PK;
--        transactions.subscriber_id is NOT NULL FK) so the un-split `aum`,
--        `totalContributions`, `totalWithdrawals` are identical to 0057.
--
--   2) get_employer_geo_rollup() — NEW admin-only RPC. Employers are NOT part of
--        the agent→branch→district→region tree (they carry a free-text `district`
--        column only), so the distributor rollup (get_entity_metrics_rollup)
--        structurally excludes them below country level. This RPC places employer
--        subscribers onto the map by resolving employers.district = districts.name
--        (case-insensitive), keyed by the SAME region_id / district.id the entity
--        tree uses, plus a per-district employer leaf list for the district-level
--        "Employers" tab. Employers whose district text matches no district bucket
--        under the 'unmapped' key (defensive — future admin-created employers can
--        type an arbitrary district).
--
-- CONVENTIONS (mirroring 0049 / 0050 / 0057):
--   * LANGUAGE plpgsql; STABLE; SECURITY DEFINER; SET search_path = public, pg_temp
--   * Admin gate: (SELECT auth.jwt()) ->> 'app_role' = 'admin' (CLAUDE.md §5.7 —
--     read 'app_role', NEVER 'role'; (SELECT ...) wrapper = initplan opt).
--   * REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated.
--
-- Forward-only; reversible via 0058_platform_scope.down.sql (restores the 0057
-- 13-key get_platform_overview body and drops get_employer_geo_rollup).
-- =============================================================================

-- =============================================================================
-- 1) get_platform_overview() — existing 13 keys + new `byChannel` split
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

  WITH subs AS (
    -- ONE pass over subscribers — headcount totals + per-channel active/inactive.
    SELECT
      count(*)                                                                  AS total_subscribers,
      count(*) FILTER (WHERE agent_id IS NOT NULL)                              AS subscribers_via_distributor,
      count(*) FILTER (WHERE employer_id IS NOT NULL)                           AS subscribers_via_employer,
      count(*) FILTER (WHERE agent_id IS NULL AND employer_id IS NULL)          AS subscribers_direct,
      count(*) FILTER (WHERE is_active IS TRUE)                                 AS active_subscribers,
      count(*) FILTER (WHERE is_active IS DISTINCT FROM TRUE)                   AS inactive_subscribers,
      count(*) FILTER (WHERE agent_id IS NOT NULL AND is_active IS TRUE)                                   AS dist_active,
      count(*) FILTER (WHERE agent_id IS NOT NULL AND is_active IS DISTINCT FROM TRUE)                     AS dist_inactive,
      count(*) FILTER (WHERE employer_id IS NOT NULL AND is_active IS TRUE)                                AS emp_active,
      count(*) FILTER (WHERE employer_id IS NOT NULL AND is_active IS DISTINCT FROM TRUE)                  AS emp_inactive,
      count(*) FILTER (WHERE agent_id IS NULL AND employer_id IS NULL AND is_active IS TRUE)               AS direct_active,
      count(*) FILTER (WHERE agent_id IS NULL AND employer_id IS NULL AND is_active IS DISTINCT FROM TRUE) AS direct_inactive
    FROM public.subscribers
  ),
  bal AS (
    -- ONE pass over balances JOINed 1:1 to subscribers (PK FK) — total AUM is
    -- identical to 0057; the three channel splits partition the same scan.
    SELECT
      COALESCE(sum(b.total_balance), 0)                                                       AS aum,
      COALESCE(sum(b.total_balance) FILTER (WHERE s.agent_id IS NOT NULL), 0)                 AS aum_dist,
      COALESCE(sum(b.total_balance) FILTER (WHERE s.employer_id IS NOT NULL), 0)              AS aum_emp,
      COALESCE(sum(b.total_balance) FILTER (WHERE s.agent_id IS NULL AND s.employer_id IS NULL), 0) AS aum_direct
    FROM public.subscriber_balances b
    JOIN public.subscribers s ON s.id = b.subscriber_id
  ),
  txn AS (
    -- ONE pass over transactions JOINed 1:1 to subscribers (NOT NULL FK) — total
    -- contributions/withdrawals identical to 0057; channel splits via FILTER.
    SELECT
      COALESCE(sum(t.amount)      FILTER (WHERE t.type = 'contribution'), 0)                                 AS total_contributions,
      COALESCE(sum(ABS(t.amount)) FILTER (WHERE t.type = 'withdrawal'),   0)                                 AS total_withdrawals,
      COALESCE(sum(t.amount)      FILTER (WHERE t.type = 'contribution' AND s.agent_id IS NOT NULL), 0)      AS contrib_dist,
      COALESCE(sum(ABS(t.amount)) FILTER (WHERE t.type = 'withdrawal'   AND s.agent_id IS NOT NULL), 0)      AS withdraw_dist,
      COALESCE(sum(t.amount)      FILTER (WHERE t.type = 'contribution' AND s.employer_id IS NOT NULL), 0)   AS contrib_emp,
      COALESCE(sum(ABS(t.amount)) FILTER (WHERE t.type = 'withdrawal'   AND s.employer_id IS NOT NULL), 0)   AS withdraw_emp,
      COALESCE(sum(t.amount)      FILTER (WHERE t.type = 'contribution' AND s.agent_id IS NULL AND s.employer_id IS NULL), 0) AS contrib_direct,
      COALESCE(sum(ABS(t.amount)) FILTER (WHERE t.type = 'withdrawal'   AND s.agent_id IS NULL AND s.employer_id IS NULL), 0) AS withdraw_direct
    FROM public.transactions t
    JOIN public.subscribers s ON s.id = t.subscriber_id
  )
  SELECT jsonb_build_object(
    -- ===== existing 13 keys (unchanged contract) =====
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
    'aum',                       b.aum,
    'totalContributions',        t.total_contributions,
    'totalWithdrawals',          t.total_withdrawals,
    -- ===== NEW: per-channel split (additive — powers the admin scope filter) =====
    'byChannel', jsonb_build_object(
      'distributor', jsonb_build_object(
        'subscribers',   s.subscribers_via_distributor,
        'active',        s.dist_active,
        'inactive',      s.dist_inactive,
        'aum',           b.aum_dist,
        'contributions', t.contrib_dist,
        'withdrawals',   t.withdraw_dist
      ),
      'employer', jsonb_build_object(
        'subscribers',   s.subscribers_via_employer,
        'active',        s.emp_active,
        'inactive',      s.emp_inactive,
        'aum',           b.aum_emp,
        'contributions', t.contrib_emp,
        'withdrawals',   t.withdraw_emp
      ),
      'direct', jsonb_build_object(
        'subscribers',   s.subscribers_direct,
        'active',        s.direct_active,
        'inactive',      s.direct_inactive,
        'aum',           b.aum_direct,
        'contributions', t.contrib_direct,
        'withdrawals',   t.withdraw_direct
      )
    )
  )
  INTO v_result
  FROM subs s, bal b, txn t;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_overview() TO authenticated;

-- =============================================================================
-- 2) get_employer_geo_rollup() — employer subscribers placed on the map
-- =============================================================================
-- Resolves employers.district (free text) -> districts.name (case-insensitive) ->
-- region_id, then aggregates employer-channel subscribers keyed by region_id and
-- district.id (the SAME ids the entity tree uses, so the frontend merges by key
-- with no translation). byDistrict additionally carries a per-district employer
-- leaf list for the district drill-down "Employers" tab. Unmatched district text
-- buckets under 'unmapped'. Employers with zero subscribers are still listed
-- (LEFT JOIN) with zero counts.
CREATE OR REPLACE FUNCTION public.get_employer_geo_rollup()
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
    RAISE EXCEPTION 'role % cannot read the employer geo rollup', v_role USING ERRCODE = 'P0001';
  END IF;

  WITH emp_subs AS (
    -- per-employer subscriber aggregates (employer channel only), one pass.
    SELECT
      s.employer_id,
      count(*)                            AS subscribers,
      count(*) FILTER (WHERE s.is_active) AS active,
      COALESCE(sum(b.total_balance), 0)   AS aum
    FROM public.subscribers s
    LEFT JOIN public.subscriber_balances b ON b.subscriber_id = s.id
    WHERE s.employer_id IS NOT NULL
    GROUP BY s.employer_id
  ),
  emp_full AS (
    -- one row per employer: resolved district/region + its subscriber aggregates.
    SELECT
      e.id                          AS employer_id,
      e.name                        AS employer_name,
      d.id                          AS district_id,
      d.region_id                   AS region_id,
      COALESCE(es.subscribers, 0)   AS subscribers,
      COALESCE(es.active, 0)        AS active,
      COALESCE(es.aum, 0)           AS aum
    FROM public.employers e
    LEFT JOIN public.districts d
      ON lower(btrim(e.district)) = lower(btrim(d.name))
    LEFT JOIN emp_subs es ON es.employer_id = e.id
  )
  SELECT jsonb_build_object(
    'byRegion', COALESCE((
      SELECT jsonb_object_agg(region_key, agg)
      FROM (
        SELECT COALESCE(region_id, 'unmapped') AS region_key,
               jsonb_build_object(
                 'subscribers', sum(subscribers),
                 'active',      sum(active),
                 'aum',         sum(aum),
                 'employers',   count(*)
               ) AS agg
        FROM emp_full
        GROUP BY COALESCE(region_id, 'unmapped')
      ) r
    ), '{}'::jsonb),
    'byDistrict', COALESCE((
      SELECT jsonb_object_agg(district_key, agg)
      FROM (
        SELECT COALESCE(district_id, 'unmapped') AS district_key,
               jsonb_build_object(
                 'subscribers', sum(subscribers),
                 'active',      sum(active),
                 'aum',         sum(aum),
                 'employers',   count(*),
                 'list', jsonb_agg(jsonb_build_object(
                            'id',          employer_id,
                            'name',        employer_name,
                            'subscribers', subscribers,
                            'active',      active,
                            'aum',         aum
                          ) ORDER BY employer_name)
               ) AS agg
        FROM emp_full
        GROUP BY COALESCE(district_id, 'unmapped')
      ) d
    ), '{}'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_employer_geo_rollup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_employer_geo_rollup() TO authenticated;
