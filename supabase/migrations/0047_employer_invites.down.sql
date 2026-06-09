-- =============================================================================
-- DOWN — 0047_employer_invites.sql
-- =============================================================================
DROP FUNCTION IF EXISTS public.cancel_employer_invite(text);
DROP FUNCTION IF EXISTS public.create_subscriber_from_employer_invite(jsonb, text, text);
DROP FUNCTION IF EXISTS public.get_employer_invite(text);
DROP FUNCTION IF EXISTS public.create_employer_invite(jsonb);
DROP TABLE IF EXISTS public.employer_invites;
-- =============================================================================
