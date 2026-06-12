-- =============================================================================
-- Universal Pensions Uganda — 0059: employer-channel activity rollup (admin)
-- =============================================================================
-- NEW admin-only RPC powering the admin Platform Overview "Employers" scope
-- Today/Week/Month activity strip (New Members / Contributions / Withdrawals /
-- Top Employer).
--
-- WHY a SEPARATE rpc (not a p_scope param on get_entity_metrics_rollup):
--   Employers are OUTSIDE the agent→branch→district→region tree, so the country
--   rollup (0057) structurally excludes them. get_employer_geo_rollup (0058) is
--   already a separate admin-only employer function for exactly this reason; this
--   follows that pattern. It also keeps the rollup's byte-for-byte, multi-role
--   output contract (locked by ~1100 mocked tests) untouched.
--
-- CONTRACT: returns the SAME trend keys the country branch of
-- get_entity_metrics_rollup returns (so the frontend TimePeriodCard consumes it
-- unchanged) — filtered to subscribers.employer_id IS NOT NULL — PLUS
-- `topEmployer {name, contribution}` (the employer with the highest CURRENT-MONTH
-- contribution total; mirrors get_top_branch's window + shape, 0022).
--
-- ANCHOR: every date window uses public._demo_now() (= '2026-05-18'), IDENTICAL
-- to get_entity_metrics_rollup / get_top_branch, so the employer card and the
-- distributor card agree on what "today / this week / this month" mean.
--
-- CONVENTIONS (mirror 0049 / 0050 / 0057 / 0058):
--   LANGUAGE plpgsql; STABLE; SECURITY DEFINER; SET search_path = public, pg_temp
--   Admin gate: (SELECT auth.jwt()) ->> 'app_role' = 'admin' (RAISE otherwise)
--   REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated
-- Forward-only; reversible via 0059_employer_activity.down.sql.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_employer_activity_rollup()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role         text        := (SELECT auth.jwt()) ->> 'app_role';
  v_result       jsonb;
  v_now          timestamptz := public._demo_now();
  v_today_start  timestamptz := date_trunc('day',   v_now);
  v_today_end    timestamptz := v_today_start + interval '1 day';
  v_yest_start   timestamptz := v_today_start - interval '1 day';
  v_yest_end     timestamptz := v_today_start;
  v_week_start   timestamptz := date_trunc('week',  v_now);
  v_week_end     timestamptz := v_week_start  + interval '7 days';
  v_lastw_start  timestamptz := v_week_start  - interval '7 days';
  v_lastw_end    timestamptz := v_week_start;
  v_month_start  timestamptz := date_trunc('month', v_now);
  v_month_end    timestamptz := v_month_start + interval '1 month';
  v_lastm_start  timestamptz := v_month_start - interval '1 month';
  v_lastm_end    timestamptz := v_month_start;
  v_arr_start    timestamptz := v_month_start - interval '11 months';
BEGIN
  -- Admin-only (employers are a platform-wide concern). Reads `app_role` per the
  -- canonical JWT contract — NEVER `'role'` (that is 'authenticated' under
  -- PostgREST's SET ROLE; see CLAUDE.md §5.7 / the 0018→0020 incident history).
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'role % cannot read the employer activity rollup', v_role
      USING ERRCODE = 'P0001';
  END IF;

  WITH txn AS (
    -- Employer-channel contributions / withdrawals, time-bucketed. The JOIN to
    -- subscribers + employer_id filter is the ONLY difference vs the country
    -- branch of get_entity_metrics_rollup (0057). Withdrawals stored negative →
    -- SUM(ABS(amount)).
    SELECT
      COALESCE(SUM(t.amount)      FILTER (WHERE t.type='contribution' AND t.date >= v_today_start AND t.date < v_today_end), 0) AS daily_contrib,
      COALESCE(SUM(t.amount)      FILTER (WHERE t.type='contribution' AND t.date >= v_yest_start  AND t.date < v_yest_end),  0) AS prev_daily_contrib,
      COALESCE(SUM(t.amount)      FILTER (WHERE t.type='contribution' AND t.date >= v_week_start  AND t.date < v_week_end),  0) AS weekly_contrib,
      COALESCE(SUM(t.amount)      FILTER (WHERE t.type='contribution' AND t.date >= v_lastw_start AND t.date < v_lastw_end), 0) AS prev_weekly_contrib,
      COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.type='withdrawal'   AND t.date >= v_today_start AND t.date < v_today_end), 0) AS daily_withdraw,
      COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.type='withdrawal'   AND t.date >= v_yest_start  AND t.date < v_yest_end),  0) AS prev_daily_withdraw,
      COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.type='withdrawal'   AND t.date >= v_week_start  AND t.date < v_week_end),  0) AS weekly_withdraw,
      COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.type='withdrawal'   AND t.date >= v_lastw_start AND t.date < v_lastw_end), 0) AS prev_weekly_withdraw,
      COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.type='withdrawal'   AND t.date >= v_month_start AND t.date < v_month_end), 0) AS monthly_withdraw,
      COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.type='withdrawal'   AND t.date >= v_lastm_start AND t.date < v_lastm_end), 0) AS prev_monthly_withdraw
    FROM public.transactions t
    JOIN public.subscribers s ON s.id = t.subscriber_id
    WHERE s.employer_id IS NOT NULL
  ),
  monthly_arr AS (
    -- 12-element employer-channel contribution array (oldest→newest); the card
    -- reads [11] = current month and [10] = prev month for the month delta.
    SELECT jsonb_agg(amt ORDER BY bucket_idx) AS month_array
      FROM (
        SELECT gs.idx AS bucket_idx, COALESCE(SUM(t.amount), 0) AS amt
          FROM generate_series(0, 11) AS gs(idx)
          LEFT JOIN public.transactions t
            ON t.type = 'contribution'
           AND t.date >= v_arr_start + (gs.idx * interval '1 month')
           AND t.date <  v_arr_start + ((gs.idx + 1) * interval '1 month')
           AND t.subscriber_id IN (SELECT id FROM public.subscribers WHERE employer_id IS NOT NULL)
         GROUP BY gs.idx
      ) m
  ),
  subs_buckets AS (
    -- Employer-channel new members by registered_date.
    SELECT
      COUNT(*) FILTER (WHERE registered_date >= v_today_start::date AND registered_date < v_today_end::date)::bigint  AS new_today,
      COUNT(*) FILTER (WHERE registered_date >= v_yest_start::date  AND registered_date < v_yest_end::date)::bigint   AS prev_new_today,
      COUNT(*) FILTER (WHERE registered_date >= v_week_start::date  AND registered_date < v_week_end::date)::bigint   AS new_week,
      COUNT(*) FILTER (WHERE registered_date >= v_lastw_start::date AND registered_date < v_lastw_end::date)::bigint  AS prev_new_week,
      COUNT(*) FILTER (WHERE registered_date >= v_month_start::date AND registered_date < v_month_end::date)::bigint  AS new_month,
      COUNT(*) FILTER (WHERE registered_date >= v_lastm_start::date AND registered_date < v_lastm_end::date)::bigint  AS prev_new_month
    FROM public.subscribers
    WHERE employer_id IS NOT NULL
  ),
  top_emp AS (
    -- Highest CURRENT-MONTH employer-channel contribution total (mirrors
    -- get_top_branch's window + {name, contribution} shape).
    SELECT e.name, COALESCE(SUM(t.amount), 0) AS contribution
      FROM public.employers e
      LEFT JOIN public.subscribers s ON s.employer_id = e.id
      LEFT JOIN public.transactions t
        ON t.subscriber_id = s.id
       AND t.type = 'contribution'
       AND t.date >= v_month_start
       AND t.date <  v_month_end
     GROUP BY e.id, e.name
     ORDER BY contribution DESC, e.name ASC
     LIMIT 1
  )
  SELECT jsonb_build_object(
    'dailyContributions',          t.daily_contrib,
    'prevDailyContributions',      t.prev_daily_contrib,
    'weeklyContributions',         t.weekly_contrib,
    'prevWeeklyContributions',     t.prev_weekly_contrib,
    'monthlyContributions',        COALESCE(ma.month_array, '[0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb),
    'dailyWithdrawals',            t.daily_withdraw,
    'prevDailyWithdrawals',        t.prev_daily_withdraw,
    'weeklyWithdrawals',           t.weekly_withdraw,
    'prevWeeklyWithdrawals',       t.prev_weekly_withdraw,
    'monthlyWithdrawals',          t.monthly_withdraw,
    'prevMonthlyWithdrawals',      t.prev_monthly_withdraw,
    'newSubscribersToday',         sb.new_today,
    'prevNewSubscribersToday',     sb.prev_new_today,
    'newSubscribersThisWeek',      sb.new_week,
    'prevNewSubscribersThisWeek',  sb.prev_new_week,
    'newSubscribersThisMonth',     sb.new_month,
    'prevNewSubscribersThisMonth', sb.prev_new_month,
    'topEmployer', (SELECT jsonb_build_object('name', te.name, 'contribution', te.contribution) FROM top_emp te)
  )
    INTO v_result
    FROM txn t, monthly_arr ma, subs_buckets sb;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL     ON FUNCTION public.get_employer_activity_rollup() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_employer_activity_rollup() TO authenticated;

COMMENT ON FUNCTION public.get_employer_activity_rollup() IS
  'Admin-only employer-channel Today/Week/Month activity rollup (new members, '
  'contributions, withdrawals) + topEmployer. Same trend-key contract as the '
  'country branch of get_entity_metrics_rollup, filtered to employer-tagged '
  'subscribers, anchored on _demo_now(). Added 0059.';

-- =============================================================================
-- End of 0059_employer_activity.sql
-- =============================================================================
