-- =============================================================================
-- Universal Pensions Uganda — 0064: isolate extra insurance products in their
-- own table; restore the single-row insurance_policies contract.
-- =============================================================================
-- WHY: 0063 evolved insurance_policies to a composite (subscriber_id, product)
-- PK. But MANY existing SECURITY DEFINER RPCs upsert insurance_policies keyed on
-- subscriber_id alone — the signup/agent-onboard chain (`_insert_subscriber_chain`,
-- plain INSERT), employer group insurance (`apply_group_insurance`,
-- `update_employer_profile` — `ON CONFLICT (subscriber_id)`), and the JS cover
-- slider (`updateInsuranceCover`). Dropping the subscriber_id-unique constraint
-- broke all of them (NOT NULL on `product`, and `42P10` no-matching-constraint on
-- the conflict target). Rather than re-emit a pile of money RPCs, we RESTORE the
-- single-life-row contract every legacy path expects and move the NEW products
-- (health/funeral) into a dedicated `subscriber_insurance_products` table. Life
-- stays in insurance_policies. Net effect: zero changes to signup/employer RPCs;
-- the new per-product flow reads/writes the new table.
--
-- LEDGER SAFETY unchanged: premiums are still `type='premium'` (never fire the
-- contribution trigger). Reversible via 0064_insurance_products_table.down.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Revert insurance_policies to a subscriber_id PK (single life row).
-- -----------------------------------------------------------------------------
-- Safe: on live only product='life' rows exist (0063 backfill; no extra products
-- were ever committed). The DELETE is defensive for any replay that created some.
ALTER TABLE public.insurance_policies DROP CONSTRAINT insurance_policies_pkey;

DELETE FROM public.insurance_policies a
  USING public.insurance_policies b
  WHERE a.subscriber_id = b.subscriber_id
    AND a.product <> 'life'
    AND b.product = 'life';

ALTER TABLE public.insurance_policies ADD CONSTRAINT insurance_policies_pkey PRIMARY KEY (subscriber_id);
ALTER TABLE public.insurance_policies DROP COLUMN product;

-- -----------------------------------------------------------------------------
-- 2. New table: the extra (non-life) insurance products a subscriber holds.
-- -----------------------------------------------------------------------------
-- One row per (subscriber, product) for health/funeral. Life remains in
-- insurance_policies. PostgREST table grants are inherited from the public-schema
-- default privileges (same anon/authenticated grants insurance_policies carries);
-- RLS gates per-subscriber access; the SECURITY DEFINER pay RPC bypasses RLS for
-- writes.
CREATE TABLE public.subscriber_insurance_products (
  subscriber_id   TEXT NOT NULL REFERENCES public.subscribers(id) ON DELETE CASCADE,
  product         TEXT NOT NULL,
  cover           NUMERIC NOT NULL DEFAULT 0,
  premium_monthly NUMERIC NOT NULL DEFAULT 0,
  policy_start    DATE,
  renewal_date    DATE,
  status          TEXT NOT NULL DEFAULT 'inactive',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (subscriber_id, product)
);

ALTER TABLE public.subscriber_insurance_products ENABLE ROW LEVEL SECURITY;

-- Subscriber self access (mirrors insurance_policies_*_self; optimized
-- (SELECT auth.jwt()) form per the perf advisor). Oversight roles read insurance
-- via insurance_policies (life) today, so no agent/branch/distributor SELECT here.
CREATE POLICY sip_select_self ON public.subscriber_insurance_products
  FOR SELECT USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  );

CREATE POLICY sip_insert_self ON public.subscriber_insurance_products
  FOR INSERT WITH CHECK (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  );

CREATE POLICY sip_update_self ON public.subscriber_insurance_products
  FOR UPDATE USING (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  ) WITH CHECK (
    (SELECT auth.jwt()) ->> 'app_role' = 'subscriber'
    AND subscriber_id = (SELECT auth.jwt()) ->> 'subscriberId'
  );

-- -----------------------------------------------------------------------------
-- 3. Re-emit pay_insurance_premium to route by product:
--    life → insurance_policies (subscriber_id); health/funeral → the new table.
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

  IF p_nonce IS NOT NULL AND p_nonce <> '' THEN
    SELECT result INTO v_prior FROM public.money_nonces WHERE nonce = p_nonce;
    IF v_prior IS NOT NULL THEN
      RETURN v_prior;
    END IF;
  END IF;

  IF p_product = 'life' THEN
    INSERT INTO public.insurance_policies (
      subscriber_id, cover, premium_monthly, policy_start, renewal_date, status, updated_at
    ) VALUES (
      v_subscriber_id, p_cover, p_premium, now()::date, v_renewal, 'active', now()
    )
    ON CONFLICT (subscriber_id) DO UPDATE SET
      cover           = EXCLUDED.cover,
      premium_monthly = EXCLUDED.premium_monthly,
      renewal_date    = EXCLUDED.renewal_date,
      status          = 'active',
      updated_at      = now();
  ELSE
    INSERT INTO public.subscriber_insurance_products (
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
  END IF;

  -- type='premium' → the contribution trigger does NOT fire → balances untouched.
  v_ref   := 'PR-' || lpad(floor(random() * 900000 + 100000)::text, 6, '0');
  v_tx_id := 'tx-' || v_subscriber_id || '-prem-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.transactions (
    id, subscriber_id, type, amount, date, status, method, txn_ref, source
  ) VALUES (
    v_tx_id, v_subscriber_id, 'premium', p_premium, now(), 'settled', p_method, v_ref, 'own'
  );

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
