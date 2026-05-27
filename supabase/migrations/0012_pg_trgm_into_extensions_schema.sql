-- =============================================================================
-- Universal Pensions Uganda — 0012: relocate pg_trgm to `extensions` schema
-- =============================================================================
-- Supabase security lint 0014 (extension_in_public) flagged pg_trgm being
-- installed in the public schema. Convention is to keep extension objects
-- in a dedicated `extensions` schema (where pgcrypto / uuid-ossp /
-- pg_stat_statements already live in this project).
--
-- Pre-flight check (run before authoring this migration):
--   * No user index uses gin_trgm_ops / gist_trgm_ops (pre-existing seq scans
--     only — the % operator is used in search_entities but unindexed).
--   * Only public.search_entities references pg_trgm artifacts (similarity()
--     and the `%` operator). Its search_path is updated below.
--
-- Strategy:
--   1. DROP EXTENSION pg_trgm — no CASCADE needed (no external dependents).
--   2. CREATE EXTENSION pg_trgm SCHEMA extensions — recreates type, ops, fns
--      in the new namespace.
--   3. ALTER FUNCTION search_entities search_path to include `extensions`.
--      The function body uses `similarity()` and `%` unqualified; without
--      this it would resolve neither.
-- =============================================================================

DROP EXTENSION IF EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;

ALTER FUNCTION public.search_entities(text)
  SET search_path = public, extensions, pg_temp;
