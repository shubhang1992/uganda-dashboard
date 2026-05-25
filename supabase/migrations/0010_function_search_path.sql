-- =============================================================================
-- Universal Pensions Uganda — 0010: set search_path on SECURITY INVOKER fns
-- =============================================================================
-- Supabase security lint 0011 (function_search_path_mutable) flagged 11
-- SECURITY INVOKER plpgsql functions whose search_path was unset (NULL in
-- pg_proc.proconfig). Without an explicit search_path, a malicious caller
-- could prepend a schema to their search_path and shadow built-ins.
--
-- All SECURITY DEFINER functions in the database already had search_path
-- set in 0002 / 0004 / 0005. This migration brings the INVOKER side in line.
--
-- Matches the convention used by trg_subscribers_after_insert and the
-- transactions triggers: `search_path = public, pg_temp`.
-- =============================================================================

ALTER FUNCTION public._insert_subscriber_chain(jsonb, text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public._validate_signup_payload(jsonb)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.get_agent_commission_detail(text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.get_breadcrumb(text, jsonb)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.get_commission_summary(text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.get_entity_commission_summary(text, text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.get_run_branch_breakdown(text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.get_top_branch(text, text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.search_entities(text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.trg_commissions_before_update()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.trg_subscribers_enforce_editable_cols()
  SET search_path = public, pg_temp;
