-- 0024_upsert_nominees.down.sql — rollback

-- (2) Drop the RPC
DROP FUNCTION IF EXISTS public.upsert_nominees(TEXT, JSONB, JSONB);

-- (1) Drop the CHECK constraint
ALTER TABLE public.nominees DROP CONSTRAINT IF EXISTS nominees_share_range_chk;
