-- =============================================================================
-- Universal Pensions Uganda — 0018: Entity metrics rollup
-- =============================================================================
-- One SECURITY DEFINER RPC that returns aggregated metrics for many entities
-- at one level in a single round-trip. Replaces the per-entity EMPTY_METRICS
-- placeholder that mapRegion/mapDistrict/mapBranch/mapAgent return today.
--
-- Phase 1 ships 8 fields per entity. Time-period buckets + demographics +
-- KYC counts are reserved for a future 0019 _v2 migration.
--
-- Prerequisite: `agents.coverage_rate` did not exist in the live DB. This
-- migration adds it and backfills deterministically from the active-rate
-- proxy used in `src/data/mockData.js:610` (active * 0.4 + 60, clamped 0..100).
-- The seed script (scripts/seed-supabase.mjs) writes the column on re-runs.
--
-- Idempotent — `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`.
-- Forward-only per BACKEND.md §7.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- (1) Schema: agents.coverage_rate
-- -----------------------------------------------------------------------------
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS coverage_rate INTEGER NOT NULL DEFAULT 0;

-- Backfill from current is_active distribution. Re-runnable: any subsequent
-- ALTER … DEFAULT or reseed will overwrite via this same formula.
WITH agent_active AS (
  SELECT a.id,
         ROUND(COUNT(*) FILTER (WHERE s.is_active)::numeric
                 / NULLIF(COUNT(s.id), 0) * 100, 0) AS active_pct
    FROM public.agents a
    LEFT JOIN public.subscribers s ON s.agent_id = a.id
   GROUP BY a.id
)
UPDATE public.agents a
   SET coverage_rate = LEAST(100, GREATEST(0,
         (COALESCE(aa.active_pct, 0) * 0.4 + 60)::integer))
  FROM agent_active aa
 WHERE a.id = aa.id;

-- -----------------------------------------------------------------------------
-- (2) RPC: get_entity_metrics_rollup(p_level, p_entity_ids)
-- -----------------------------------------------------------------------------
-- Returns a jsonb object keyed by entity_id whose value is the metrics block.
-- One round-trip serves all OverlayPanel child lists, report-view tables, and
-- the country-level hero card.
--
-- SECURITY DEFINER because the function joins five tables that each carry
-- role-specific RLS. The function self-enforces scope (see role gate below)
-- so a branch-role caller can't request region/country aggregates.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_entity_metrics_rollup(
  p_level      TEXT,
  p_entity_ids TEXT[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role   TEXT := auth.jwt() ->> 'role';
  v_result jsonb;
BEGIN
  -- Role gate -----------------------------------------------------------------
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = 'P0001';
  END IF;

  IF v_role NOT IN ('distributor', 'admin', 'branch', 'agent') THEN
    RAISE EXCEPTION 'role_not_permitted' USING ERRCODE = 'P0002';
  END IF;

  -- Branch role: refuse upward escalation. Branch may aggregate its own
  -- branch or agents under that branch, never districts/regions/country.
  IF v_role = 'branch' AND p_level IN ('country', 'region', 'district') THEN
    RAISE EXCEPTION 'out_of_scope' USING ERRCODE = 'P0003';
  END IF;

  -- Agent role: only its own agent-level rollup.
  IF v_role = 'agent' AND p_level <> 'agent' THEN
    RAISE EXCEPTION 'out_of_scope' USING ERRCODE = 'P0003';
  END IF;

  -- Empty input is a no-op.
  IF p_entity_ids IS NULL OR array_length(p_entity_ids, 1) IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  -- =========================================================================
  -- COUNTRY level (singleton — only 'ug')
  -- =========================================================================
  IF p_level = 'country' THEN
    WITH per_agent AS (
      SELECT a.id          AS agent_id,
             a.coverage_rate,
             COUNT(s.id)                                       AS total_subs,
             COUNT(s.id) FILTER (WHERE s.is_active)            AS active_subs
        FROM public.agents a
        LEFT JOIN public.subscribers s ON s.agent_id = a.id
       GROUP BY a.id, a.coverage_rate
    ),
    counts AS (
      SELECT 'ug'::text AS id,
             SUM(total_subs)::bigint                           AS total_subscribers,
             SUM(active_subs)::bigint                          AS active_subscribers,
             (SELECT COUNT(*) FROM public.agents)::bigint      AS total_agents,
             (SELECT COUNT(*) FROM public.branches)::bigint    AS total_branches,
             CASE WHEN SUM(total_subs) > 0
                  THEN ROUND(SUM(coverage_rate * total_subs)::numeric
                               / NULLIF(SUM(total_subs), 0))
                  ELSE 0
             END                                               AS coverage_rate
        FROM per_agent
    ),
    aum AS (
      SELECT COALESCE(SUM(sb.total_balance), 0) AS aum
        FROM public.subscriber_balances sb
    ),
    txn AS (
      SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'contribution'), 0) AS contributions,
             COALESCE(SUM(ABS(amount)) FILTER (WHERE type = 'withdrawal'), 0) AS withdrawals
        FROM public.transactions
    )
    SELECT jsonb_build_object(
      c.id,
      jsonb_build_object(
        'totalSubscribers',   c.total_subscribers,
        'totalAgents',        c.total_agents,
        'totalBranches',      c.total_branches,
        'totalContributions', t.contributions,
        'totalWithdrawals',   t.withdrawals,
        'aum',                a.aum,
        'activeRate',         CASE WHEN c.total_subscribers > 0
                                   THEN ROUND((c.active_subscribers::numeric / c.total_subscribers) * 100)
                                   ELSE 0 END,
        'coverageRate',       c.coverage_rate
      )
    )
      INTO v_result
      FROM counts c, aum a, txn t;

    RETURN COALESCE(v_result, '{}'::jsonb);
  END IF;

  -- =========================================================================
  -- REGION level — group through districts → branches → agents → subscribers
  -- =========================================================================
  IF p_level = 'region' THEN
    WITH scope_agent AS (
      SELECT d.region_id, a.id AS agent_id, a.coverage_rate
        FROM public.districts d
        JOIN public.branches  b ON b.district_id = d.id
        JOIN public.agents    a ON a.branch_id   = b.id
       WHERE d.region_id = ANY(p_entity_ids)
    ),
    sub_count AS (
      SELECT sa.region_id, sa.agent_id, sa.coverage_rate,
             COUNT(s.id)                                       AS total_subs,
             COUNT(s.id) FILTER (WHERE s.is_active)            AS active_subs
        FROM scope_agent sa
        LEFT JOIN public.subscribers s ON s.agent_id = sa.agent_id
       GROUP BY sa.region_id, sa.agent_id, sa.coverage_rate
    ),
    counts AS (
      SELECT region_id,
             SUM(total_subs)::bigint                           AS total_subscribers,
             SUM(active_subs)::bigint                          AS active_subscribers,
             COUNT(DISTINCT agent_id)::bigint                  AS total_agents,
             CASE WHEN SUM(total_subs) > 0
                  THEN ROUND(SUM(coverage_rate * total_subs)::numeric
                               / NULLIF(SUM(total_subs), 0))
                  ELSE 0
             END                                               AS coverage_rate
        FROM sub_count
       GROUP BY region_id
    ),
    branch_count AS (
      SELECT d.region_id, COUNT(b.id)::bigint AS total_branches
        FROM public.districts d
        JOIN public.branches  b ON b.district_id = d.id
       WHERE d.region_id = ANY(p_entity_ids)
       GROUP BY d.region_id
    ),
    aum AS (
      SELECT d.region_id, COALESCE(SUM(sb.total_balance), 0) AS aum
        FROM public.districts d
        JOIN public.branches  b ON b.district_id = d.id
        JOIN public.agents    a ON a.branch_id   = b.id
        JOIN public.subscribers s ON s.agent_id  = a.id
        JOIN public.subscriber_balances sb ON sb.subscriber_id = s.id
       WHERE d.region_id = ANY(p_entity_ids)
       GROUP BY d.region_id
    ),
    txn AS (
      SELECT d.region_id,
             COALESCE(SUM(t.amount)      FILTER (WHERE t.type = 'contribution'), 0) AS contributions,
             COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.type = 'withdrawal'),   0) AS withdrawals
        FROM public.districts d
        JOIN public.branches  b ON b.district_id = d.id
        JOIN public.agents    a ON a.branch_id   = b.id
        JOIN public.subscribers s ON s.agent_id  = a.id
        JOIN public.transactions t ON t.subscriber_id = s.id
       WHERE d.region_id = ANY(p_entity_ids)
       GROUP BY d.region_id
    )
    SELECT jsonb_object_agg(
      c.region_id,
      jsonb_build_object(
        'totalSubscribers',   c.total_subscribers,
        'totalAgents',        c.total_agents,
        'totalBranches',      COALESCE(bc.total_branches, 0),
        'totalContributions', COALESCE(t.contributions, 0),
        'totalWithdrawals',   COALESCE(t.withdrawals, 0),
        'aum',                COALESCE(a.aum, 0),
        'activeRate',         CASE WHEN c.total_subscribers > 0
                                   THEN ROUND((c.active_subscribers::numeric / c.total_subscribers) * 100)
                                   ELSE 0 END,
        'coverageRate',       c.coverage_rate
      )
    )
      INTO v_result
      FROM counts c
      LEFT JOIN branch_count bc ON bc.region_id = c.region_id
      LEFT JOIN aum          a  ON a.region_id  = c.region_id
      LEFT JOIN txn          t  ON t.region_id  = c.region_id;

    RETURN COALESCE(v_result, '{}'::jsonb);
  END IF;

  -- =========================================================================
  -- DISTRICT level — group through branches → agents → subscribers
  -- =========================================================================
  IF p_level = 'district' THEN
    WITH scope_agent AS (
      SELECT b.district_id, a.id AS agent_id, a.coverage_rate
        FROM public.branches b
        JOIN public.agents   a ON a.branch_id = b.id
       WHERE b.district_id = ANY(p_entity_ids)
    ),
    sub_count AS (
      SELECT sa.district_id, sa.agent_id, sa.coverage_rate,
             COUNT(s.id)                                       AS total_subs,
             COUNT(s.id) FILTER (WHERE s.is_active)            AS active_subs
        FROM scope_agent sa
        LEFT JOIN public.subscribers s ON s.agent_id = sa.agent_id
       GROUP BY sa.district_id, sa.agent_id, sa.coverage_rate
    ),
    counts AS (
      SELECT district_id,
             SUM(total_subs)::bigint                           AS total_subscribers,
             SUM(active_subs)::bigint                          AS active_subscribers,
             COUNT(DISTINCT agent_id)::bigint                  AS total_agents,
             CASE WHEN SUM(total_subs) > 0
                  THEN ROUND(SUM(coverage_rate * total_subs)::numeric
                               / NULLIF(SUM(total_subs), 0))
                  ELSE 0
             END                                               AS coverage_rate
        FROM sub_count
       GROUP BY district_id
    ),
    branch_count AS (
      SELECT b.district_id, COUNT(*)::bigint AS total_branches
        FROM public.branches b
       WHERE b.district_id = ANY(p_entity_ids)
       GROUP BY b.district_id
    ),
    aum AS (
      SELECT b.district_id, COALESCE(SUM(sb.total_balance), 0) AS aum
        FROM public.branches b
        JOIN public.agents    a ON a.branch_id = b.id
        JOIN public.subscribers s ON s.agent_id = a.id
        JOIN public.subscriber_balances sb ON sb.subscriber_id = s.id
       WHERE b.district_id = ANY(p_entity_ids)
       GROUP BY b.district_id
    ),
    txn AS (
      SELECT b.district_id,
             COALESCE(SUM(t.amount)      FILTER (WHERE t.type = 'contribution'), 0) AS contributions,
             COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.type = 'withdrawal'),   0) AS withdrawals
        FROM public.branches b
        JOIN public.agents    a ON a.branch_id = b.id
        JOIN public.subscribers s ON s.agent_id = a.id
        JOIN public.transactions t ON t.subscriber_id = s.id
       WHERE b.district_id = ANY(p_entity_ids)
       GROUP BY b.district_id
    )
    SELECT jsonb_object_agg(
      c.district_id,
      jsonb_build_object(
        'totalSubscribers',   c.total_subscribers,
        'totalAgents',        c.total_agents,
        'totalBranches',      COALESCE(bc.total_branches, 0),
        'totalContributions', COALESCE(t.contributions, 0),
        'totalWithdrawals',   COALESCE(t.withdrawals, 0),
        'aum',                COALESCE(a.aum, 0),
        'activeRate',         CASE WHEN c.total_subscribers > 0
                                   THEN ROUND((c.active_subscribers::numeric / c.total_subscribers) * 100)
                                   ELSE 0 END,
        'coverageRate',       c.coverage_rate
      )
    )
      INTO v_result
      FROM counts c
      LEFT JOIN branch_count bc ON bc.district_id = c.district_id
      LEFT JOIN aum          a  ON a.district_id  = c.district_id
      LEFT JOIN txn          t  ON t.district_id  = c.district_id;

    RETURN COALESCE(v_result, '{}'::jsonb);
  END IF;

  -- =========================================================================
  -- BRANCH level — group through agents → subscribers
  -- =========================================================================
  IF p_level = 'branch' THEN
    -- Branch role: enforce that the caller can only request its own branch.
    IF v_role = 'branch' THEN
      IF EXISTS (
        SELECT 1 FROM unnest(p_entity_ids) AS bid
         WHERE bid <> (auth.jwt() ->> 'branchId')
      ) THEN
        RAISE EXCEPTION 'out_of_scope' USING ERRCODE = 'P0003';
      END IF;
    END IF;

    WITH scope_agent AS (
      SELECT a.branch_id, a.id AS agent_id, a.coverage_rate
        FROM public.agents a
       WHERE a.branch_id = ANY(p_entity_ids)
    ),
    sub_count AS (
      SELECT sa.branch_id, sa.agent_id, sa.coverage_rate,
             COUNT(s.id)                                       AS total_subs,
             COUNT(s.id) FILTER (WHERE s.is_active)            AS active_subs
        FROM scope_agent sa
        LEFT JOIN public.subscribers s ON s.agent_id = sa.agent_id
       GROUP BY sa.branch_id, sa.agent_id, sa.coverage_rate
    ),
    counts AS (
      SELECT branch_id,
             SUM(total_subs)::bigint                           AS total_subscribers,
             SUM(active_subs)::bigint                          AS active_subscribers,
             COUNT(DISTINCT agent_id)::bigint                  AS total_agents,
             CASE WHEN SUM(total_subs) > 0
                  THEN ROUND(SUM(coverage_rate * total_subs)::numeric
                               / NULLIF(SUM(total_subs), 0))
                  ELSE 0
             END                                               AS coverage_rate
        FROM sub_count
       GROUP BY branch_id
    ),
    aum AS (
      SELECT a.branch_id, COALESCE(SUM(sb.total_balance), 0) AS aum
        FROM public.agents a
        JOIN public.subscribers s ON s.agent_id = a.id
        JOIN public.subscriber_balances sb ON sb.subscriber_id = s.id
       WHERE a.branch_id = ANY(p_entity_ids)
       GROUP BY a.branch_id
    ),
    txn AS (
      SELECT a.branch_id,
             COALESCE(SUM(t.amount)      FILTER (WHERE t.type = 'contribution'), 0) AS contributions,
             COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.type = 'withdrawal'),   0) AS withdrawals
        FROM public.agents a
        JOIN public.subscribers s ON s.agent_id = a.id
        JOIN public.transactions t ON t.subscriber_id = s.id
       WHERE a.branch_id = ANY(p_entity_ids)
       GROUP BY a.branch_id
    )
    SELECT jsonb_object_agg(
      c.branch_id,
      jsonb_build_object(
        'totalSubscribers',   c.total_subscribers,
        'totalAgents',        c.total_agents,
        'totalBranches',      1,  -- a branch is itself one branch
        'totalContributions', COALESCE(t.contributions, 0),
        'totalWithdrawals',   COALESCE(t.withdrawals, 0),
        'aum',                COALESCE(a.aum, 0),
        'activeRate',         CASE WHEN c.total_subscribers > 0
                                   THEN ROUND((c.active_subscribers::numeric / c.total_subscribers) * 100)
                                   ELSE 0 END,
        'coverageRate',       c.coverage_rate
      )
    )
      INTO v_result
      FROM counts c
      LEFT JOIN aum a ON a.branch_id = c.branch_id
      LEFT JOIN txn t ON t.branch_id = c.branch_id;

    RETURN COALESCE(v_result, '{}'::jsonb);
  END IF;

  -- =========================================================================
  -- AGENT level — direct subscriber rollup
  -- =========================================================================
  IF p_level = 'agent' THEN
    -- Agent role: enforce caller's own ID only.
    IF v_role = 'agent' THEN
      IF EXISTS (
        SELECT 1 FROM unnest(p_entity_ids) AS aid
         WHERE aid <> (auth.jwt() ->> 'agentId')
      ) THEN
        RAISE EXCEPTION 'out_of_scope' USING ERRCODE = 'P0003';
      END IF;
    END IF;

    WITH counts AS (
      SELECT a.id AS agent_id,
             a.coverage_rate,
             COUNT(s.id)::bigint                               AS total_subscribers,
             COUNT(s.id) FILTER (WHERE s.is_active)::bigint    AS active_subscribers
        FROM public.agents a
        LEFT JOIN public.subscribers s ON s.agent_id = a.id
       WHERE a.id = ANY(p_entity_ids)
       GROUP BY a.id, a.coverage_rate
    ),
    aum AS (
      SELECT s.agent_id, COALESCE(SUM(sb.total_balance), 0) AS aum
        FROM public.subscribers s
        JOIN public.subscriber_balances sb ON sb.subscriber_id = s.id
       WHERE s.agent_id = ANY(p_entity_ids)
       GROUP BY s.agent_id
    ),
    txn AS (
      SELECT s.agent_id,
             COALESCE(SUM(t.amount)      FILTER (WHERE t.type = 'contribution'), 0) AS contributions,
             COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.type = 'withdrawal'),   0) AS withdrawals
        FROM public.subscribers s
        JOIN public.transactions t ON t.subscriber_id = s.id
       WHERE s.agent_id = ANY(p_entity_ids)
       GROUP BY s.agent_id
    )
    SELECT jsonb_object_agg(
      c.agent_id,
      jsonb_build_object(
        'totalSubscribers',   c.total_subscribers,
        'totalAgents',        1,
        'totalBranches',      0,
        'totalContributions', COALESCE(t.contributions, 0),
        'totalWithdrawals',   COALESCE(t.withdrawals, 0),
        'aum',                COALESCE(a.aum, 0),
        'activeRate',         CASE WHEN c.total_subscribers > 0
                                   THEN ROUND((c.active_subscribers::numeric / c.total_subscribers) * 100)
                                   ELSE 0 END,
        'coverageRate',       c.coverage_rate
      )
    )
      INTO v_result
      FROM counts c
      LEFT JOIN aum a ON a.agent_id = c.agent_id
      LEFT JOIN txn t ON t.agent_id = c.agent_id;

    RETURN COALESCE(v_result, '{}'::jsonb);
  END IF;

  RAISE EXCEPTION 'unknown_level: %', p_level USING ERRCODE = 'P0004';
END;
$$;

REVOKE ALL ON FUNCTION public.get_entity_metrics_rollup(TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_entity_metrics_rollup(TEXT, TEXT[]) TO authenticated;

-- =============================================================================
-- End of 0018_entity_metrics_rollup.sql
-- =============================================================================
