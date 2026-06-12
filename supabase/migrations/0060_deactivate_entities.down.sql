-- =============================================================================
-- 0060 DOWN: drop enforcement triggers + status RPCs, restore the 0057
-- get_all_employers_metrics (no status), drop the added columns/index.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_block_inactive_employer_run ON public.contribution_runs;
DROP FUNCTION IF EXISTS public.block_inactive_employer_run();
DROP TRIGGER IF EXISTS trg_block_inactive_employer_subscriber ON public.subscribers;
DROP FUNCTION IF EXISTS public.block_inactive_employer_subscriber();

DROP FUNCTION IF EXISTS public.set_employer_status(text, text);
DROP FUNCTION IF EXISTS public.set_distributor_status(text, text);

-- Restore the 0057 rollup body (without the `status` key).
CREATE OR REPLACE FUNCTION public.get_all_employers_metrics()
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
    RAISE EXCEPTION 'role % cannot read all employer metrics', v_role USING ERRCODE = 'P0001';
  END IF;

  WITH subs AS (
    SELECT s.employer_id, count(*) AS headcount, count(*) FILTER (WHERE s.is_active) AS active_count
    FROM public.subscribers s WHERE s.employer_id IS NOT NULL GROUP BY s.employer_id
  ),
  bal AS (
    SELECT s.employer_id, COALESCE(sum(b.total_balance), 0) AS total_balance
    FROM public.subscriber_balances b JOIN public.subscribers s ON s.id = b.subscriber_id
    WHERE s.employer_id IS NOT NULL GROUP BY s.employer_id
  ),
  txn AS (
    SELECT s.employer_id, COALESCE(sum(t.amount), 0) AS total_contributions,
           COALESCE(sum(t.amount) FILTER (WHERE t.source = 'employer'), 0) AS employer_contributions
    FROM public.transactions t JOIN public.subscribers s ON s.id = t.subscriber_id
    WHERE s.employer_id IS NOT NULL AND t.type = 'contribution' GROUP BY s.employer_id
  ),
  ins AS (
    SELECT s.employer_id, count(*) AS insured_count
    FROM public.insurance_policies ip JOIN public.subscribers s ON s.id = ip.subscriber_id
    WHERE s.employer_id IS NOT NULL AND ip.status = 'active' GROUP BY s.employer_id
  )
  SELECT COALESCE(jsonb_agg(m ORDER BY m.name), '[]'::jsonb) INTO v_result
  FROM (
    SELECT e.id, e.name, e.sector, e.district,
      e.payroll_cadence AS "payrollCadence", e.created_at AS "createdAt",
      COALESCE(subs.headcount, 0) AS headcount,
      COALESCE(subs.active_count, 0) AS "activeCount",
      COALESCE(bal.total_balance, 0) AS "totalBalance",
      COALESCE(txn.total_contributions, 0) AS "totalContributions",
      COALESCE(txn.employer_contributions, 0) AS "employerContributions",
      COALESCE(ins.insured_count, 0) AS "insuredCount"
    FROM public.employers e
    LEFT JOIN subs ON subs.employer_id = e.id
    LEFT JOIN bal  ON bal.employer_id  = e.id
    LEFT JOIN txn  ON txn.employer_id  = e.id
    LEFT JOIN ins  ON ins.employer_id  = e.id
  ) m;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_all_employers_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_employers_metrics() TO authenticated;

DROP INDEX IF EXISTS public.branches_distributor_id_idx;
ALTER TABLE public.employers DROP COLUMN IF EXISTS status;
ALTER TABLE public.branches  DROP COLUMN IF EXISTS distributor_id;

-- =============================================================================
-- End of 0060_deactivate_entities.down.sql
-- =============================================================================
