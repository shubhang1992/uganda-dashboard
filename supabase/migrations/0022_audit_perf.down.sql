-- 0022_audit_perf.down.sql — rollback recipe for 0022_audit_perf.sql.
--
-- Per docs/audit/rollback-playbook.md "PR-1" section. Tested on Supabase branch
-- before production deploy.
--
-- Order matters:
--   (1) Restore the old get_top_branch body (pre-AUDIT-1-1 STABLE implementation).
--   (2) Drop the new indexes (CONCURRENTLY — no lock).
--
-- Step (1) must run in a transaction (DDL is transactional); step (2) must NOT
-- — handled by the same split-application protocol as the UP migration.

-- =============================================================================
-- (1) Restore the pre-migration get_top_branch (STABLE, not SECURITY DEFINER)
-- =============================================================================
-- Body captured from pg_get_functiondef on 2026-05-22 19:08 local, BEFORE the
-- migration was applied.

CREATE OR REPLACE FUNCTION public.get_top_branch(p_level text, p_parent_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_level NOT IN ('country', 'region', 'district') THEN
    RETURN NULL;
  END IF;

  WITH scoped_branches AS (
    SELECT b.id, b.name
      FROM public.branches b
     WHERE p_level = 'country'
        OR (p_level = 'district' AND b.district_id = p_parent_id)
        OR (p_level = 'region' AND b.district_id IN (
              SELECT d.id FROM public.districts d
               WHERE d.region_id = p_parent_id
           ))
  ),
  -- Constrain the lookup to the most recent calendar month present in the
  -- transactions table — keeps the metric stable when seeded data lags real
  -- "today".
  last_month AS (
    SELECT date_trunc('month', MAX(date))::date AS month_start
      FROM public.transactions
     WHERE type = 'contribution'
  ),
  contribs AS (
    SELECT t.agent_id, t.amount
      FROM public.transactions t, last_month lm
     WHERE t.type = 'contribution'
       AND t.date >= lm.month_start
       AND t.date <  (lm.month_start + INTERVAL '1 month')
  ),
  by_branch AS (
    SELECT sb.id, sb.name, COALESCE(SUM(c.amount), 0) AS contribution
      FROM scoped_branches sb
      LEFT JOIN public.agents a ON a.branch_id = sb.id
      LEFT JOIN contribs c       ON c.agent_id = a.id
     GROUP BY sb.id, sb.name
  )
  SELECT jsonb_build_object(
    'name',         name,
    'contribution', contribution
  )
    INTO v_result
    FROM by_branch
   ORDER BY contribution DESC, name ASC
   LIMIT 1;

  RETURN v_result;
END;
$function$;

-- =============================================================================
-- (2) Drop the new indexes
-- =============================================================================
-- CONCURRENTLY = no lock; safe on production.

DROP INDEX CONCURRENTLY IF EXISTS public.idx_transactions_type_date;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_commissions_status;

-- =============================================================================
-- Verification queries (run after this DOWN to confirm restoration):
--   SELECT prosecdef FROM pg_proc WHERE proname = 'get_top_branch';
--   -- Expect: 'f' (back to STABLE non-SECURITY-DEFINER)
--
--   SELECT count(*) FROM pg_indexes
--    WHERE tablename = 'transactions' AND indexname = 'idx_transactions_type_date';
--   -- Expect: 0
--
--   SELECT count(*) FROM pg_indexes
--    WHERE tablename = 'commissions' AND indexname = 'idx_commissions_status';
--   -- Expect: 0
-- =============================================================================
