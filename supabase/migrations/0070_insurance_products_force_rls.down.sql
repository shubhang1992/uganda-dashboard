-- Down: revert subscriber_insurance_products to ENABLE-only RLS (0064 state).
-- RLS stays enabled; only the owner-bypass-prevention FORCE flag is dropped.

ALTER TABLE public.subscriber_insurance_products NO FORCE ROW LEVEL SECURITY;
