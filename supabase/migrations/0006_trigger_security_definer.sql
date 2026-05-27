-- =============================================================================
-- 0006 — Make balance/commission trigger functions SECURITY DEFINER
-- =============================================================================
-- The contribution/withdrawal/subscriber-insert trigger functions in 0002
-- maintain denormalized balance + commission rows. When fired by a subscriber-
-- role direct INSERT into `transactions` (the ad-hoc-contribution path), the
-- trigger inherits the subscriber's security context — which lacks an INSERT
-- policy on `subscriber_balances` or `commissions`. RLS rejects, the whole
-- INSERT aborts.
--
-- These triggers enforce system invariants (balance bookkeeping, first-
-- contribution commission), not user-authored rows. SECURITY DEFINER lets them
-- run with the function-owner's privileges (postgres, which is BYPASSRLS),
-- so the denorm writes succeed regardless of the caller's RLS scope.
--
-- The `commissions BEFORE UPDATE` trigger sets `NEW.previous_status` only —
-- no cross-table writes — so it does not need SECURITY DEFINER.
-- =============================================================================

ALTER FUNCTION public.trg_subscribers_after_insert()        SECURITY DEFINER;
ALTER FUNCTION public.trg_transactions_contribution()       SECURITY DEFINER;
ALTER FUNCTION public.trg_transactions_withdrawal()         SECURITY DEFINER;

-- Pin search_path so the SECURITY DEFINER context can't be hijacked by a
-- caller-controlled search_path that shadows public schema objects.
ALTER FUNCTION public.trg_subscribers_after_insert()        SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_transactions_contribution()       SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_transactions_withdrawal()         SET search_path = public, pg_temp;
