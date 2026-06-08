-- =============================================================================
-- 0052 — re-pin _insert_subscriber_chain search_path + defensively re-assert the
--        three balance trigger functions' DEFINER + search_path pin.
-- =============================================================================
-- Audit §1b.8 (verified-live). The only surviving 0042 casualty is
-- public._insert_subscriber_chain(jsonb, text): 0042 §3.2 re-emitted it via
-- CREATE OR REPLACE WITHOUT a `SET search_path` and never re-issued the 0010/
-- 0014/0015/0028 ALTER, so the pin was dropped (live pg_proc.proconfig = NULL —
-- the sole `function_search_path_mutable` advisor hit). The contribution trigger
-- (trg_transactions_contribution) was already re-hardened by 0043 (live
-- prosecdef = true); this migration does NOT touch its body.
--
-- Strategy: re-pin via bare ALTER FUNCTION (the proven 0006/0010/0014/0015
-- pattern) — NO body re-emit, so no risk of re-introducing the drift the body
-- re-emits caused. The three balance trigger functions are then DEFENSIVELY
-- re-asserted (SECURITY DEFINER + pinned search_path) idempotently, so a future
-- stray CREATE OR REPLACE can't silently regress them, and applying 0052 on a DB
-- where 0043 has not run still converges to the hardened baseline.
--
-- Forward-only; reversible via the matching .down. Idempotent.
-- =============================================================================

-- 1) The actual regression — re-pin _insert_subscriber_chain's search_path.
ALTER FUNCTION public._insert_subscriber_chain(jsonb, text)
  SET search_path = public, pg_temp;

-- 2) Defensive re-assertion of the three balance trigger functions (idempotent).
--    Matches the 0006 hardening (these enforce system invariants — balance
--    bookkeeping + first-contribution commission — under a subscriber-role
--    direct INSERT, so they must run as the function owner with a pinned path).
ALTER FUNCTION public.trg_subscribers_after_insert()  SECURITY DEFINER;
ALTER FUNCTION public.trg_subscribers_after_insert()  SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_transactions_contribution() SECURITY DEFINER;
ALTER FUNCTION public.trg_transactions_contribution() SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_transactions_withdrawal()   SECURITY DEFINER;
ALTER FUNCTION public.trg_transactions_withdrawal()   SET search_path = public, pg_temp;

-- =============================================================================
-- End of 0052_repin_insert_chain.sql
-- =============================================================================
