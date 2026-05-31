-- =============================================================================
-- Universal Pensions Uganda — 0029 DOWN (best-effort / partial)
-- =============================================================================
-- WARNING: 0029 is a DESTRUCTIVE, fundamentally IRREVERSIBLE migration.
--
-- The forward migration collapsed `commission_status` from 7 labels to 2 and
-- remapped every existing row (released/confirmed → paid; in_run/held/disputed/
-- rejected → due). That remap is LOSSY: once a row is 'due' there is no way to
-- know whether it was originally in_run, held, disputed, or rejected; once a
-- row is 'paid' we cannot tell released from confirmed. It also DROPPED the
-- dispute/hold/confirm columns (their data is gone) and DROPPED the
-- settlement_runs / settlement_run_branch_reviews tables (their rows are gone).
--
-- This DOWN therefore makes NO attempt to restore data — only to re-create
-- empty structural shells so a subsequent re-apply of the legacy migrations
-- (0001/0002/0004/0014/0021) does not collide. It is intended for manual,
-- emergency use only and must NOT be added to the supabase_migrations history.
--
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/0029_commission_simplify.down.sql
--
-- After running this, the run/dispute/hold RPCs and the read RPCs would still
-- need to be re-created by re-applying 0021 / 0014 / 0002.
-- =============================================================================

-- Re-create the settlement enums (empty-shell, original labels from 0001).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_run_state') THEN
    CREATE TYPE public.settlement_run_state AS ENUM (
      'draft', 'branch_review', 'released', 'cancelled'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_run_branch_review_state') THEN
    CREATE TYPE public.settlement_run_branch_review_state AS ENUM (
      'pending', 'approved', 'released'
    );
  END IF;
END $$;

-- Re-create the settlement tables (empty shells, structure per 0001).
CREATE TABLE IF NOT EXISTS public.settlement_runs (
  id                TEXT PRIMARY KEY,
  cadence           TEXT NOT NULL,
  opened_at         TIMESTAMPTZ NOT NULL,
  closes_at         TIMESTAMPTZ,
  state             settlement_run_state NOT NULL DEFAULT 'draft',
  total_amount      NUMERIC NOT NULL DEFAULT 0,
  commission_count  INTEGER NOT NULL DEFAULT 0,
  released_at       TIMESTAMPTZ,
  released_by       TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.settlement_run_branch_reviews (
  run_id        TEXT NOT NULL REFERENCES public.settlement_runs(id) ON DELETE CASCADE,
  branch_id     TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  state         settlement_run_branch_review_state NOT NULL DEFAULT 'pending',
  reviewed_by   TEXT,
  reviewed_at   TIMESTAMPTZ,
  released_at   TIMESTAMPTZ,
  PRIMARY KEY (run_id, branch_id)
);

-- Re-add the structural columns 0029 dropped from commissions (data NOT
-- restored). The status enum is intentionally NOT re-expanded — re-applying
-- 0001's CREATE TYPE on a fresh DB is the supported path; expanding a live
-- 2-label enum back to 7 is not safely scriptable here.
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS run_id          TEXT REFERENCES public.settlement_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agent_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS previous_status TEXT,
  ADD COLUMN IF NOT EXISTS dispute_reason  TEXT,
  ADD COLUMN IF NOT EXISTS disputed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disputed_by     TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by     TEXT,
  ADD COLUMN IF NOT EXISTS outcome_reason  TEXT;

ALTER TABLE public.commissions DROP COLUMN IF EXISTS paid_amount;

CREATE INDEX IF NOT EXISTS commissions_run_id_idx ON public.commissions (run_id);

-- =============================================================================
-- End of 0029_commission_simplify.down.sql
-- =============================================================================
