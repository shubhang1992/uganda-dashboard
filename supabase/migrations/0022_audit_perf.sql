-- 0022_audit_perf.sql
--
-- Closes AUDIT-1-1 (get_top_branch 8s timeouts), AUDIT-1-2 (transactions seq-scan
-- in get_entity_metrics_rollup), AUDIT-1-8 (get_top_branch missing SECURITY DEFINER),
-- AUDIT-2-2 (commissions.status unindexed).
--
-- See docs/audit/01-distributor-metrics.md and 02-backend-hotpath.md for full
-- evidence. The remediation plan is in /Users/shubhang/.claude/plans/.
--
-- Strategy:
--   (1) Partial index on transactions(type, date) WHERE type IN ('contribution','withdrawal')
--       — Covers ~345K of 522K rows. Eliminates the seq-scan in the 8-bucket
--       FILTER predicates inside get_entity_metrics_rollup AND the per-row
--       agent join in get_top_branch.
--   (2) Index on commissions(status) — 30K rows; uses every status. Eliminates
--       the seq-scan for PostgREST `?status=eq.X` requests from CommissionPanel.
--   (3) Rewrite get_top_branch as SECURITY DEFINER with an aggregate-first body
--       that uses idx_transactions_type_date directly. Removes the 61.5 M-row
--       Join Filter that produced the 8 s statement_timeout HTTP 500s.
--
-- IMPORTANT — CONCURRENTLY:
--   CREATE INDEX CONCURRENTLY cannot run inside a transaction. Supabase's
--   `apply_migration` MCP wraps DDL in a transaction by default. To apply this
--   migration cleanly:
--     - Via Supabase CLI: `supabase migration up` (Supabase splits on -- statement
--       break comments and handles CONCURRENTLY outside transactions).
--     - Via raw MCP: run the CREATE INDEX statements via `execute_sql` (no
--       transaction wrapping), then `apply_migration` for the function rewrite.
--   The migration FILE includes everything for completeness; the *application
--   procedure* must split.

-- =============================================================================
-- (1) Partial index on transactions(type, date)
-- =============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_type_date
  ON public.transactions (type, date)
  WHERE type IN ('contribution', 'withdrawal');

COMMENT ON INDEX public.idx_transactions_type_date IS
  'AUDIT-1-1 / AUDIT-1-2 / AUDIT-1-3 fix — covers time-bucket FILTER predicates in get_entity_metrics_rollup AND the per-agent join in get_top_branch. Partial because the rollup RPCs never filter on premium/claim types.';

-- =============================================================================
-- (2) Index on commissions(status)
-- =============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commissions_status
  ON public.commissions (status);

COMMENT ON INDEX public.idx_commissions_status IS
  'AUDIT-2-2 fix — covers PostgREST commissions?status=eq.X requests from CommissionPanel preload. Non-partial because all 7 statuses are queried (confirmed for history, due/in_run/disputed/released/held/rejected for active management).';

-- =============================================================================
-- (3) Rewrite get_top_branch as SECURITY DEFINER + aggregate-first body
-- =============================================================================
-- We preserve the signature (TEXT, TEXT) → jsonb so callers do not change.

CREATE OR REPLACE FUNCTION public.get_top_branch(
  p_level     TEXT,
  p_parent_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role         TEXT := COALESCE(auth.jwt() ->> 'app_role', '');
  v_result       jsonb;
  v_now          timestamptz := public._demo_now();
  v_month_start  timestamptz := date_trunc('month', v_now);
  v_month_end    timestamptz := v_month_start + interval '1 month';
BEGIN
  -- ---------------------------------------------------------------------------
  -- Role gate — same pattern as get_entity_metrics_rollup (see 0020 migration).
  -- Reads `app_role` per the canonical JWT contract (api/_lib/jwt.ts). NEVER
  -- read `'role'` directly: PostgREST sets that claim to 'authenticated' for
  -- the SET ROLE step — see CLAUDE.md §5.7 and the 0018→0020 incident history.
  -- ---------------------------------------------------------------------------
  IF v_role = '' THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = 'P0001';
  END IF;
  IF v_role NOT IN ('distributor', 'admin', 'branch', 'agent') THEN
    RAISE EXCEPTION 'role_not_permitted' USING ERRCODE = 'P0002';
  END IF;
  IF p_level NOT IN ('country', 'region', 'district') THEN
    RETURN NULL;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Aggregate transactions FIRST via idx_transactions_type_date.
  --
  -- BEFORE this migration the body did:
  --   scoped_branches × agents × contribs (Nested Loop Left Join)
  -- which materialized the 315 K current-month contribution rows and
  -- re-scanned them for each of the 2050 agents. EXPLAIN ANALYZE showed
  -- 61.5 M rows compared as "Rows Removed by Join Filter".
  --
  -- The aggregate-first formulation lets the planner walk the new
  -- (type, date) partial index once, group by agent.branch_id during the
  -- agents-join, and emit one row per branch. The per-branch LEFT JOIN
  -- onto scoped_branches is cheap (314 outer rows).
  -- ---------------------------------------------------------------------------
  WITH contrib_by_branch AS (
    SELECT a.branch_id, COALESCE(SUM(t.amount), 0) AS contribution
      FROM public.transactions t
      JOIN public.agents a ON a.id = t.agent_id
     WHERE t.type = 'contribution'
       AND t.date >= v_month_start
       AND t.date <  v_month_end
     GROUP BY a.branch_id
  ),
  scoped AS (
    SELECT b.id, b.name, COALESCE(c.contribution, 0) AS contribution
      FROM public.branches b
      LEFT JOIN contrib_by_branch c ON c.branch_id = b.id
     WHERE p_level = 'country'
        OR (p_level = 'district' AND b.district_id = p_parent_id)
        OR (p_level = 'region'   AND b.district_id IN (
              SELECT d.id FROM public.districts d
               WHERE d.region_id = p_parent_id
           ))
  )
  SELECT jsonb_build_object('name', name, 'contribution', contribution)
    INTO v_result
    FROM scoped
   ORDER BY contribution DESC, name ASC
   LIMIT 1;

  RETURN v_result;
END;
$$;

-- Permission grant — same shape as get_entity_metrics_rollup grant in 0020.
GRANT EXECUTE ON FUNCTION public.get_top_branch(TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_top_branch(TEXT, TEXT) FROM anon;

COMMENT ON FUNCTION public.get_top_branch(TEXT, TEXT) IS
  'AUDIT-1-1 / AUDIT-1-8 fix — SECURITY DEFINER + role gate + aggregate-first body. Replaces the v1 implementation (migration 0018) whose Nested Loop Left Join produced an 8s timeout at country level.';

-- =============================================================================
-- Migration acceptance (validated on Supabase branch BEFORE production merge):
--   - get_top_branch('country','ug') mean exec time < 500 ms (was: 5252 ms)
--   - get_entity_metrics_rollup('country',['ug']) mean exec time < 300 ms
--     (was: 1573 ms — accelerated transitively by idx_transactions_type_date)
--   - get_entity_metrics_rollup('region',[4 ids]) mean exec time < 1500 ms
--     (was: 3571 ms — same index covers it; full CTE rewrite deferred to a
--     follow-up if needed)
--   - commissions?status=eq.X paginated reads drop from ~200 ms to < 50 ms
-- =============================================================================
