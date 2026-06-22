-- =============================================================================
-- Down migration for 0063_insurance_products.sql
-- =============================================================================
-- LOSSY: the single-column PK cannot represent multiple products per subscriber,
-- so any non-life product rows are dropped before the PK is restored. Life rows
-- are preserved. premium-kind money_nonces rows are left in place (harmless).
-- =============================================================================

DROP FUNCTION IF EXISTS public.pay_insurance_premium(text, text, numeric, numeric, text);

-- Collapse to one row per subscriber so (subscriber_id) is unique again.
DELETE FROM public.insurance_policies WHERE product <> 'life';

ALTER TABLE public.insurance_policies
  DROP CONSTRAINT insurance_policies_pkey;

ALTER TABLE public.insurance_policies
  ADD CONSTRAINT insurance_policies_pkey PRIMARY KEY (subscriber_id);

ALTER TABLE public.insurance_policies
  DROP COLUMN IF EXISTS product;
