-- 0070_insurance_products_force_rls.sql
-- Hardening: add FORCE ROW LEVEL SECURITY to subscriber_insurance_products.
--
-- 0064 created the table with only `ENABLE ROW LEVEL SECURITY` (0064:58). Every
-- other RPC-written tenant/ledger table in the schema also FORCEs RLS
-- (employer_invites, money_nonces, notifications, the employer schema, signup
-- uploads) per the 0003 defence-in-depth decision: ENABLE alone still lets the
-- table-owner role bypass policies, so a future migration running DML under the
-- owner (or an interactive psql session that forgot `SET ROLE`) would not be
-- policy-scoped. Not exploitable via PostgREST today (it connects as
-- anon/authenticated, never the owner), but it breaks the hardening invariant.
--
-- Additive + idempotent (ALTER ... FORCE is safe to re-run). Does NOT edit the
-- applied 0064 file. Audit S2.

ALTER TABLE public.subscriber_insurance_products FORCE ROW LEVEL SECURITY;
