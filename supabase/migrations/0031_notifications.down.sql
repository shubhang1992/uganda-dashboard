-- =============================================================================
-- Universal Pensions Uganda — 0031 DOWN (manual-only rollback)
-- =============================================================================
-- Undoes 0031_notifications.sql. NOT part of the forward-only chain; for
-- manual/emergency use:
--
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/0031_notifications.down.sql
--
-- Dropping the table discards every notification.
-- =============================================================================

DROP FUNCTION IF EXISTS public.mark_notifications_read(text[]);
DROP FUNCTION IF EXISTS public.apply_settlement(jsonb);

DROP POLICY IF EXISTS notifications_select_distributor ON public.notifications;
DROP POLICY IF EXISTS notifications_select_branch      ON public.notifications;
DROP POLICY IF EXISTS notifications_select_agent       ON public.notifications;
DROP TABLE IF EXISTS public.notifications;

-- =============================================================================
-- End of 0031_notifications.down.sql
-- =============================================================================
