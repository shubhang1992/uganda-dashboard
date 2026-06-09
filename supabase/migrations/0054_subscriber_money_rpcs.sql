-- =============================================================================
-- Universal Pensions Uganda — 0054: subscriber money RPCs (idempotent + atomic)
-- =============================================================================
-- Closes audit §4a F-1 / F-2 / F-3 / F-5. The subscriber Save (top-up) and
-- Withdraw flows previously wrote `transactions` (and, for withdrawal, a second
-- `withdrawals` row) DIRECTLY from the client — no idempotency nonce, and the
-- withdrawal was TWO unwrapped inserts (a partial failure left an orphaned
-- debit). This migration routes both through SECURITY DEFINER RPCs that:
--   * gate app_role='subscriber' and derive the subscriber from the verified
--     JWT `subscriberId` claim (NEVER trust a client-supplied id);
--   * de-duplicate on a client-minted nonce via a new `money_nonces` ledger —
--     a replay with the SAME nonce returns the prior result WITHOUT
--     double-crediting / double-debiting (F-1);
--   * fold the withdrawal's two writes into one atomic function body so the
--     ledger row + the history row commit together or not at all (F-2);
--   * RAISE when a withdrawal exceeds the available total balance (F-5);
--   * decrement `units` on withdrawal, which the withdrawal trigger never did
--     (F-3) — keeping `units ≈ total_balance / 1000` after a runtime withdrawal.
--
-- The existing AFTER INSERT triggers still do the balance math:
--   * `trg_transactions_contribution` (0043, DEFINER) credits balances + units
--     and stamps the first-contribution commission. The RPC just inserts the
--     `transactions` row exactly as the direct client write did, so the
--     1000 UGX/unit accounting + the retirement/emergency split are unchanged.
--   * `trg_transactions_withdrawal` (0002/0006, DEFINER) debits the buckets.
--     This RPC additionally decrements `units` (F-3) after the insert.
--
-- DEMO-SCOPE: the 1000 UGX/unit constant lives in the contribution trigger and
-- is NOT re-declared here; nothing about the demo unit price changes.
--
-- CONVENTIONS (mirroring 0042 / 0044):
--   * LANGUAGE plpgsql; SECURITY DEFINER + SET search_path = public, pg_temp.
--   * Role read via (SELECT auth.jwt()) ->> 'app_role' (NEVER 'role'); subscriber
--     scoped to (SELECT auth.jwt()) ->> 'subscriberId' (per subscribers_select_self).
--   * Nonce ledger mirrors subscriber_signup_uploads / settlement_uploads: RLS
--     ENABLED + FORCED, no permissive policy, no GRANT — only these DEFINER RPCs
--     touch it. `result` stores the inserted row's shape so a replay returns it.
--   * Forward-only; reversible via 0054_subscriber_money_rpcs.down.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schema: per-subscriber money idempotency ledger
-- -----------------------------------------------------------------------------
-- One row per applied contribution/withdrawal, keyed by the client-minted nonce
-- (a crypto.randomUUID() string, stored as TEXT to match the sibling ledgers and
-- the RPCs' `p_nonce text` params). `kind` distinguishes 'contribution' vs
-- 'withdrawal'; `result` is the inserted row in the legacy mock shape so a
-- replay returns it without re-running the side-effects.
CREATE TABLE IF NOT EXISTS public.money_nonces (
  nonce          TEXT PRIMARY KEY,
  subscriber_id  TEXT NOT NULL REFERENCES public.subscribers(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,                  -- 'contribution' | 'withdrawal'
  result         JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.money_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_nonces FORCE  ROW LEVEL SECURITY;

-- No direct policies — only the SECURITY DEFINER make_contribution /
-- request_withdrawal RPCs read or write this ledger (mirrors the locked stance
-- of subscriber_signup_uploads / settlement_uploads). No GRANT to
-- anon/authenticated: the table is RPC-internal.


-- -----------------------------------------------------------------------------
-- make_contribution(p_nonce, p_amount, p_retirement_pct, p_method) → jsonb
-- -----------------------------------------------------------------------------
-- Idempotent ad-hoc (one-off) contribution. Inserts a 'contribution'
-- `transactions` row; the AFTER INSERT trigger credits subscriber_balances +
-- units and (on the first contribution) stamps the commission. A replay with
-- the same nonce returns the prior inserted row WITHOUT double-crediting.
-- Mirrors the prior direct client insert byte-for-byte on the split math
-- (retirement = round(amount * pct/100); emergency = complement).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.make_contribution(
  p_nonce          text,
  p_amount         numeric,
  p_retirement_pct numeric DEFAULT 80,
  p_method         text    DEFAULT 'MTN Mobile Money'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role          text := (SELECT auth.jwt()) ->> 'app_role';
  v_subscriber_id text := (SELECT auth.jwt()) ->> 'subscriberId';
  v_ret_pct       numeric;
  v_retirement    numeric;
  v_emergency     numeric;
  v_ref           text;
  v_tx_id         text;
  v_prior         jsonb;
  v_result        jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'subscriber' THEN
    RAISE EXCEPTION 'role % cannot make a contribution', v_role USING ERRCODE = 'P0001';
  END IF;
  IF v_subscriber_id IS NULL OR v_subscriber_id = '' THEN
    RAISE EXCEPTION 'missing subscriberId claim' USING ERRCODE = 'P0001';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotency short-circuit: a replay of the same nonce returns the prior
  -- inserted row without re-crediting the balance.
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    SELECT result INTO v_prior FROM public.money_nonces WHERE nonce = p_nonce;
    IF v_prior IS NOT NULL THEN
      RETURN v_prior;
    END IF;
  END IF;

  -- Re-derive the split server-side (NEVER trust a client split). 80/20 default;
  -- emergency = complement so the two never independently round-drift (matches
  -- trg_transactions_contribution + the JS makeAdHocContribution).
  v_ret_pct := COALESCE(p_retirement_pct, 80);
  IF v_ret_pct < 0 OR v_ret_pct > 100 THEN
    v_ret_pct := 80;
  END IF;
  v_retirement := round(p_amount * v_ret_pct / 100);
  v_emergency  := p_amount - v_retirement;

  v_ref   := 'CT-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0');
  v_tx_id := 'tx-' || v_subscriber_id || '-adhoc-' || replace(gen_random_uuid()::text, '-', '');

  -- Real ledger row → AFTER INSERT trigger credits subscriber_balances + units.
  INSERT INTO public.transactions (
    id, subscriber_id, type, amount, date, status, method,
    txn_ref, split_retirement, split_emergency, source
  ) VALUES (
    v_tx_id, v_subscriber_id, 'contribution', p_amount, now(), 'settled', p_method,
    v_ref, v_retirement, v_emergency, 'own'
  );

  -- Return shape matches mapTransactionRow's camelCase contract.
  v_result := jsonb_build_object(
    'id',              v_tx_id,
    'subscriberId',    v_subscriber_id,
    'type',            'contribution',
    'source',          'own',
    'amount',          p_amount,
    'date',            to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'),
    'status',          'settled',
    'method',          p_method,
    'reference',       v_ref,
    'splitRetirement', v_retirement,
    'splitEmergency',  v_emergency
  );

  -- Record the result against the nonce so a sequential replay short-circuits.
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    INSERT INTO public.money_nonces (nonce, subscriber_id, kind, result)
    VALUES (p_nonce, v_subscriber_id, 'contribution', v_result)
    ON CONFLICT (nonce) DO NOTHING;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.make_contribution(text, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.make_contribution(text, numeric, numeric, text) TO authenticated;


-- -----------------------------------------------------------------------------
-- request_withdrawal(p_nonce, p_amount, p_bucket, p_reason, p_method,
--                    p_split_retirement, p_split_emergency) → jsonb
-- -----------------------------------------------------------------------------
-- Idempotent + ATOMIC withdrawal (F-2). Inserts ONE 'withdrawal' `transactions`
-- row (the AFTER INSERT trigger debits the buckets) AND ONE `withdrawals`
-- history row in a single function body → both commit together or not at all,
-- closing the orphaned-debit gap. Adds a server-side balance check (F-5) and
-- decrements `units` (F-3). A replay with the same nonce returns the prior
-- withdrawal row WITHOUT double-debiting.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_nonce            text,
  p_amount           numeric,
  p_bucket           text    DEFAULT NULL,   -- 'retirement' | 'emergency' | NULL
  p_reason           text    DEFAULT NULL,
  p_method           text    DEFAULT 'MTN Mobile Money',
  p_split_retirement numeric DEFAULT NULL,
  p_split_emergency  numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role          text := (SELECT auth.jwt()) ->> 'app_role';
  v_subscriber_id text := (SELECT auth.jwt()) ->> 'subscriberId';
  v_total_balance numeric;
  v_unit_price    numeric := 1000;            -- demo-scope (matches contribution trigger)
  v_split_ret     numeric := p_split_retirement;
  v_split_emg     numeric := p_split_emergency;
  v_ref           text;
  v_tx_id         text;
  v_wd_id         text;
  v_bucket        text;
  v_prior         jsonb;
  v_result        jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'subscriber' THEN
    RAISE EXCEPTION 'role % cannot request a withdrawal', v_role USING ERRCODE = 'P0001';
  END IF;
  IF v_subscriber_id IS NULL OR v_subscriber_id = '' THEN
    RAISE EXCEPTION 'missing subscriberId claim' USING ERRCODE = 'P0001';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotency short-circuit: a replay of the same nonce returns the prior
  -- withdrawal row without re-debiting the balance.
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    SELECT result INTO v_prior FROM public.money_nonces WHERE nonce = p_nonce;
    IF v_prior IS NOT NULL THEN
      RETURN v_prior;
    END IF;
  END IF;

  -- F-5: server-side "withdraw ≤ available balance" guard. Lock the balance row
  -- so a concurrent withdrawal can't over-draw past the check.
  SELECT total_balance INTO v_total_balance
    FROM public.subscriber_balances
   WHERE subscriber_id = v_subscriber_id
   FOR UPDATE;
  v_total_balance := COALESCE(v_total_balance, 0);

  IF p_amount > v_total_balance THEN
    RAISE EXCEPTION 'withdrawal of % exceeds available balance %', p_amount, v_total_balance
      USING ERRCODE = 'P0001';
  END IF;

  -- Resolve the split: explicit splits win; else a bucket routes the whole
  -- amount; else NULL (the trigger falls back to emergency-first). Mirrors the
  -- prior JS requestWithdrawal resolution.
  IF v_split_ret IS NULL AND v_split_emg IS NULL AND p_bucket IS NOT NULL THEN
    IF p_bucket = 'retirement' THEN
      v_split_ret := p_amount; v_split_emg := 0;
    ELSE
      v_split_ret := 0; v_split_emg := p_amount;
    END IF;
  END IF;

  -- F-5 (cont.): if both splits are supplied, they must sum to the amount so the
  -- per-bucket debits can't desync from the total (the trigger debits total by
  -- ABS(amount) but buckets by their own splits).
  IF v_split_ret IS NOT NULL AND v_split_emg IS NOT NULL
     AND (v_split_ret + v_split_emg) <> p_amount THEN
    RAISE EXCEPTION 'split_retirement + split_emergency (%) must equal amount %',
      v_split_ret + v_split_emg, p_amount USING ERRCODE = 'P0001';
  END IF;

  v_bucket := COALESCE(p_bucket, 'emergency');
  v_ref    := 'WD-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0');
  v_tx_id  := 'tx-' || v_subscriber_id || '-wd-' || replace(gen_random_uuid()::text, '-', '');
  v_wd_id  := 'wd-' || v_subscriber_id || '-'    || replace(gen_random_uuid()::text, '-', '');

  -- 1. Ledger row → AFTER INSERT trigger debits subscriber_balances buckets.
  INSERT INTO public.transactions (
    id, subscriber_id, type, amount, date, status, method,
    txn_ref, bucket, split_retirement, split_emergency, source
  ) VALUES (
    v_tx_id, v_subscriber_id, 'withdrawal', p_amount, now(), 'processing', p_method,
    v_ref, p_bucket, v_split_ret, v_split_emg, 'own'
  );

  -- F-3: decrement units, which the withdrawal trigger never touched, so
  -- units ≈ total_balance / 1000 holds after a runtime withdrawal. Floor at 0.
  UPDATE public.subscriber_balances
     SET units      = GREATEST(0, units - (p_amount / v_unit_price)),
         updated_at = now()
   WHERE subscriber_id = v_subscriber_id;

  -- 2. History row → the WithdrawalsHistory report consumes this (same txn).
  INSERT INTO public.withdrawals (
    id, subscriber_id, amount, bucket, reason, method, status, date, reference
  ) VALUES (
    v_wd_id, v_subscriber_id, p_amount, v_bucket, p_reason, p_method, 'processing',
    (now())::date, v_ref
  );

  -- Return shape matches mapWithdrawalRow's camelCase contract (the legacy
  -- requestWithdrawal return object).
  v_result := jsonb_build_object(
    'id',        v_wd_id,
    'amount',    p_amount,
    'bucket',    v_bucket,
    'reason',    p_reason,
    'method',    p_method,
    'status',    'processing',
    'date',      to_char(now(), 'YYYY-MM-DD'),
    'reference', v_ref
  );

  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    INSERT INTO public.money_nonces (nonce, subscriber_id, kind, result)
    VALUES (p_nonce, v_subscriber_id, 'withdrawal', v_result)
    ON CONFLICT (nonce) DO NOTHING;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.request_withdrawal(text, numeric, text, text, text, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(text, numeric, text, text, text, numeric, numeric) TO authenticated;

-- =============================================================================
-- End of 0054_subscriber_money_rpcs.sql
-- Frontend (src/services/subscriber.js) calls these; the RPCs are DORMANT
-- (PGRST202/404 on live) until this migration is applied at the G-DB gate.
-- =============================================================================
