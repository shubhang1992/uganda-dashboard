-- Down: drop the branch "overdue contributions" drill-down RPC.
-- Additive + isolated function (introduced in 0069); nothing depends on it at
-- the schema level, so a plain DROP fully reverses the forward migration.

DROP FUNCTION IF EXISTS public.get_branch_pending_contributions(TEXT);
