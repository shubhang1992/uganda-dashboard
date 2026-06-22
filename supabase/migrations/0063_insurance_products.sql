-- =============================================================================
-- Universal Pensions Uganda — 0063: per-product insurance + premium RPC
-- =============================================================================
-- Evolves insurance_policies from one-row-per-subscriber (life only) to one row
-- per (subscriber, product) so a subscriber can hold Health / Funeral / Life
-- cover independently — the products the contribution-schedule insurance picker
-- offers (INSURANCE_PRODUCTS in src/constants/savings.js). Existing rows are
-- backfilled as product='life'.
--
-- Adds pay_insurance_premium(): a SECURITY DEFINER RPC that upserts the
-- (subscriber, product) policy row to active AND records a type='premium'
-- transaction, idempotent on the existing money_nonces ledger (0054).
--
-- LEDGER SAFETY (the property the whole change preserves): premiums are
-- type='premium'. The balance trigger trg_transactions_contribution (0043,
-- re-pinned 0052) fires only WHEN (NEW.type='contribution'), so a premium row
-- NEVER touches subscriber_balances / units / AUM. Cover changes and premium
-- payments therefore leave AUM exactly unchanged.
--
-- CONVENTIONS (mirror 0054 / 0060 / 0062): plpgsql; SECURITY DEFINER +
-- SET search_path = public, pg_temp; role via (SELECT auth.jwt()) ->> 'app_role'
-- (NEVER 'role'); subscriber via 'subscriberId'; RAISE ... ERRCODE='P0001';
-- REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO authenticated. Forward-only;
-- reversible via 0063_insurance_products.down.sql (lossy for non-life rows).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schema: per-product insurance_policies
-- -----------------------------------------------------------------------------
-- 1. Add the product discriminator. DEFAULT 'life' backfills the existing
--    single-row policies; the default is then dropped so future inserts are
--    explicit about which product they create.
ALTER TABLE public.insurance_policies
  ADD COLUMN IF NOT EXISTS product TEXT NOT NULL DEFAULT 'life';

ALTER TABLE public.insurance_policies
  ALTER COLUMN product DROP DEFAULT;

-- 2. Repoint the primary key to the composite (subscriber_id, product). The old
--    PK is the column-level default name `insurance_policies_pkey`. All
--    insurance_policies RLS policies key on subscriber_id only (0007:177-216 /
--    :594-614, 0043, 0049) and are unaffected. The composite PK still indexes
--    subscriber_id as its leading column, so existing subscriber_id-only reads
--    and the getCurrentSubscriber embed keep their index — no extra index needed.
ALTER TABLE public.insurance_policies
  DROP CONSTRAINT insurance_policies_pkey;

ALTER TABLE public.insurance_policies
  ADD CONSTRAINT insurance_policies_pkey PRIMARY KEY (subscriber_id, product);


-- -----------------------------------------------------------------------------
-- pay_insurance_premium(p_nonce, p_product, p_cover, p_premium, p_method) → jsonb
-- -----------------------------------------------------------------------------
-- Idempotent self-serve insurance payment. Upserts the (subscriber, product)
-- policy row to active (cover / premium / renewal = now + 1 year) AND inserts a
-- type='premium' transactions row. The premium does NOT affect balances (the
-- contribution trigger ignores non-contribution rows). A replay with the SAME
-- nonce returns the prior result without a second policy mutation / txn.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_insurance_premium(
  p_nonce   text,
  p_product text,
  p_cover   numeric,
  p_premium numeric,
  p_method  text DEFAULT 'MTN Mobile Money'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role          text := (SELECT auth.jwt()) ->> 'app_role';
  v_subscriber_id text := (SELECT auth.jwt()) ->> 'subscriberId';
  v_renewal       date := (now() + interval '1 year')::date;
  v_ref           text;
  v_tx_id         text;
  v_prior         jsonb;
  v_result        jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'subscriber' THEN
    RAISE EXCEPTION 'role % cannot pay an insurance premium', v_role USING ERRCODE = 'P0001';
  END IF;
  IF v_subscriber_id IS NULL OR v_subscriber_id = '' THEN
    RAISE EXCEPTION 'missing subscriberId claim' USING ERRCODE = 'P0001';
  END IF;
  IF p_product IS NULL OR p_product NOT IN ('health', 'funeral', 'life') THEN
    RAISE EXCEPTION 'unknown insurance product %', p_product USING ERRCODE = 'P0001';
  END IF;
  IF p_premium IS NULL OR p_premium < 0 OR p_cover IS NULL OR p_cover < 0 THEN
    RAISE EXCEPTION 'cover and premium must be non-negative' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotency short-circuit: a replay of the same nonce returns the prior
  -- result without a second policy upsert / premium txn.
  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    SELECT result INTO v_prior FROM public.money_nonces WHERE nonce = p_nonce;
    IF v_prior IS NOT NULL THEN
      RETURN v_prior;
    END IF;
  END IF;

  -- Upsert the per-product policy row → active.
  INSERT INTO public.insurance_policies (
    subscriber_id, product, cover, premium_monthly, policy_start, renewal_date, status, updated_at
  ) VALUES (
    v_subscriber_id, p_product, p_cover, p_premium, now()::date, v_renewal, 'active', now()
  )
  ON CONFLICT (subscriber_id, product) DO UPDATE SET
    cover           = EXCLUDED.cover,
    premium_monthly = EXCLUDED.premium_monthly,
    renewal_date    = EXCLUDED.renewal_date,
    status          = 'active',
    updated_at      = now();

  -- type='premium' → the contribution trigger does NOT fire → balances untouched.
  v_ref   := 'PR-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0');
  v_tx_id := 'tx-' || v_subscriber_id || '-prem-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.transactions (
    id, subscriber_id, type, amount, date, status, method, txn_ref, source
  ) VALUES (
    v_tx_id, v_subscriber_id, 'premium', p_premium, now(), 'settled', p_method, v_ref, 'own'
  );

  -- Result shape: superset of mapTransactionRow (so the service can read the txn)
  -- plus the policy fields the UI needs to reflect the new cover immediately.
  v_result := jsonb_build_object(
    'product',        p_product,
    'cover',          p_cover,
    'premiumMonthly', p_premium,
    'policyStart',    to_char(now(), 'YYYY-MM-DD'),
    'renewalDate',    to_char(v_renewal, 'YYYY-MM-DD'),
    'status',         'active',
    'transactionId',  v_tx_id,
    'reference',      v_ref,
    'method',         p_method,
    'amount',         p_premium,
    'date',           to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')
  );

  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    INSERT INTO public.money_nonces (nonce, subscriber_id, kind, result)
    VALUES (p_nonce, v_subscriber_id, 'premium', v_result)
    ON CONFLICT (nonce) DO NOTHING;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.pay_insurance_premium(text, text, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_insurance_premium(text, text, numeric, numeric, text) TO authenticated;
