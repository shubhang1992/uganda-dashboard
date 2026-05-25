-- 0025_drop_realtime_publication.sql
--
-- Closes AUDIT-2-4. Realtime publication was ON for commissions /
-- settlement_runs / settlement_run_branch_reviews, but Phase 1 + Phase 2
-- audits confirmed ZERO `.channel()` subscribers across src/ and api/.
-- WAL replication overhead for zero consumers — drop until a feature
-- needs it.
--
-- Reversible via 0025_drop_realtime_publication.down.sql.

-- ALTER PUBLICATION ... DROP TABLE does not accept IF EXISTS; sequential
-- drops are safer (one failure won't cascade — but if the publication
-- doesn't include a table, the ALTER raises and the remaining drops still
-- apply via separate statements).
ALTER PUBLICATION supabase_realtime DROP TABLE public.commissions;
ALTER PUBLICATION supabase_realtime DROP TABLE public.settlement_runs;
ALTER PUBLICATION supabase_realtime DROP TABLE public.settlement_run_branch_reviews;
