-- 0025_drop_realtime_publication.down.sql — restore realtime publication.

ALTER PUBLICATION supabase_realtime
  ADD TABLE public.commissions,
            public.settlement_runs,
            public.settlement_run_branch_reviews;
