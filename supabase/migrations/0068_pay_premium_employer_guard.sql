-- 0068_pay_premium_employer_guard.sql
--
-- Server-side "no double-buy": a subscriber can't pay for an insurance product
-- their EMPLOYER already funds (migration 0067 added insurance_policies.funded_by
-- + subscriber_insurance_products.funded_by = 'employer'). The UI already hides
-- the buy/renew controls for employer-funded products; this is the authoritative
-- guard so a direct RPC call can't create duplicate (member-paid) cover.
--
-- Re-emits pay_insurance_premium (from the 0064 body) with the guard added after
-- the nonce replay check — a replayed nonce still returns its cached result; a
-- fresh attempt on an employer-funded product raises.

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

  -- No double-buy: a product the employer funds can't be re-bought by the member.
  IF p_product = 'life' THEN
    IF EXISTS (
      SELECT 1 FROM public.insurance_policies
       WHERE subscriber_id = v_subscriber_id AND funded_by = 'employer' AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'life cover is provided and paid for by your employer' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.subscriber_insurance_products
       WHERE subscriber_id = v_subscriber_id AND product = p_product AND funded_by = 'employer' AND status = 'active'
    ) THEN
      RAISE EXCEPTION '% cover is provided and paid for by your employer', p_product USING ERRCODE = 'P0001';
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
