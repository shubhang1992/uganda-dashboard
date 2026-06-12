-- Down: 0061_block_inactive_employer_retag
-- Removes the BEFORE UPDATE re-tag guard. Reverting leaves the 0060
-- BEFORE-INSERT triggers in place (the UPDATE-re-tag gap re-opens, as it was
-- immediately after 0060).
DROP TRIGGER IF EXISTS trg_block_inactive_employer_subscriber_update ON public.subscribers;
DROP FUNCTION IF EXISTS public.block_inactive_employer_subscriber_update();
