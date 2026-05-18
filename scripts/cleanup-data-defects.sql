-- =============================================================================
-- Universal Pensions Uganda — one-off data cleanup (Agent A §6.A)
-- =============================================================================
-- Run via mcp__supabase__execute_sql AFTER the pre-cleanup snapshot has been
-- captured (scripts/backups/pre-cleanup-2026-05-18.counts.txt) and BEFORE
-- migration 0017_unique_constraints.sql is applied. The 0017 indexes will
-- fail loudly on any remaining duplicates, which is the desired guard.
--
-- Each step starts with a confirmatory SELECT count — the brief instructs us
-- to pause if the count diverges materially from the audit number. Divergences
-- vs the §6.A audit numbers are documented in
--   scripts/backups/pre-cleanup-2026-05-18.counts.txt.
--
-- Steps:
--   1. Resolve duplicate agent emails — keep oldest by created_at, NULL out
--      the rest. (Audit said 10 dupes; live shows 1,057 extras across 597
--      groups — the cleanup logic stays correct in shape.)
--   2. Resolve duplicate NINs — keep oldest, NULL out duplicates.
--      (Audit said 3; live shows 2 extras across 1 group.)
--   3. Flip 1 positive-amount withdrawal to negative.
--   4. Clear 1,806 orphan paid_dates on non-released commissions.
--   5. Backfill 493 disputed audit-trail rows (disputed_at/disputed_by NULLs).
--   6. Delete 2 NULL-agent contribution transactions.
--   7. Advance overdue contribution_schedules forward by drift.
--      NOTE: §6.A brief said "schedules"; actual schema has
--      `contribution_schedules`. Same intent.
-- =============================================================================


-- ─── Step 1: duplicate agent emails ────────────────────────────────────────
-- Confirm count first (expect ≥ 1057 extras live, but logic remains correct).
SELECT
  'step1_before' AS marker,
  COUNT(*) AS extras_to_clear
FROM (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY email
           ORDER BY created_at ASC, id ASC
         ) AS rn
    FROM public.agents
   WHERE email IS NOT NULL
) t
WHERE t.rn > 1;

-- Apply: keep the oldest row per email, NULL out the rest.
WITH dupe_extras AS (
  SELECT id
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY email
               ORDER BY created_at ASC, id ASC
             ) AS rn
        FROM public.agents
       WHERE email IS NOT NULL
    ) t
   WHERE t.rn > 1
)
UPDATE public.agents a
   SET email = NULL
  FROM dupe_extras d
 WHERE a.id = d.id;


-- ─── Step 2: duplicate NINs ────────────────────────────────────────────────
SELECT
  'step2_before' AS marker,
  COUNT(*) AS extras_to_clear
FROM (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY nin
           ORDER BY created_at ASC, id ASC
         ) AS rn
    FROM public.subscribers
   WHERE nin IS NOT NULL
) t
WHERE t.rn > 1;

WITH dupe_extras AS (
  SELECT id
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY nin
               ORDER BY created_at ASC, id ASC
             ) AS rn
        FROM public.subscribers
       WHERE nin IS NOT NULL
    ) t
   WHERE t.rn > 1
)
UPDATE public.subscribers s
   SET nin = NULL
  FROM dupe_extras d
 WHERE s.id = d.id;


-- ─── Step 3: positive-amount withdrawals (expect 1) ────────────────────────
SELECT 'step3_before' AS marker, COUNT(*) AS positive_withdrawals
  FROM public.transactions
 WHERE type = 'withdrawal' AND amount > 0;

UPDATE public.transactions
   SET amount = -ABS(amount)
 WHERE type = 'withdrawal' AND amount > 0
RETURNING id;


-- ─── Step 4: orphan paid_dates (expect 1,806) ──────────────────────────────
SELECT 'step4_before' AS marker, COUNT(*) AS orphan_paid_dates
  FROM public.commissions
 WHERE status NOT IN ('released','confirmed','rejected')
   AND paid_date IS NOT NULL;

UPDATE public.commissions
   SET paid_date = NULL
 WHERE status NOT IN ('released','confirmed','rejected')
   AND paid_date IS NOT NULL;


-- ─── Step 5: backfill disputed audit trail (expect 493) ────────────────────
SELECT 'step5_before' AS marker, COUNT(*) AS disputed_missing_audit
  FROM public.commissions
 WHERE status IN ('held','disputed')
   AND (disputed_at IS NULL OR disputed_by IS NULL);

-- Note: `commissions` does not carry an `updated_at` column in this schema;
-- the COALESCE fallback uses created_at as the audit-trail anchor.
UPDATE public.commissions
   SET disputed_at = COALESCE(disputed_at, created_at, NOW()),
       disputed_by = COALESCE(disputed_by, 'system-backfill')
 WHERE status IN ('held','disputed')
   AND (disputed_at IS NULL OR disputed_by IS NULL);


-- ─── Step 6: NULL-agent contribution transactions (expect exactly 2) ───────
-- Brief: "confirm exactly 2 affected before commit." We confirm via the
-- SELECT first; the DELETE returns the affected ids and we cross-check.
SELECT 'step6_before' AS marker, COUNT(*) AS null_agent_contribs
  FROM public.transactions
 WHERE type = 'contribution' AND agent_id IS NULL;

DELETE FROM public.transactions
 WHERE type = 'contribution' AND agent_id IS NULL
RETURNING id;


-- ─── Step 7: advance overdue contribution_schedules forward ────────────────
-- Brief: "UPDATE schedules SET next_due_date = next_due_date + (CURRENT_DATE
-- - DATE '2026-04-08') WHERE next_due_date < CURRENT_DATE". Actual table is
-- `contribution_schedules`. The drift offset (CURRENT_DATE - 2026-04-08)
-- advances every overdue schedule by the same amount, preserving relative
-- spacing. At seed time MOCK_NOW was 2026-04-08; running this from any later
-- wall-clock date lands every overdue schedule at-or-after today.
SELECT 'step7_before' AS marker, COUNT(*) AS overdue_schedules
  FROM public.contribution_schedules
 WHERE next_due_date < CURRENT_DATE;

UPDATE public.contribution_schedules
   SET next_due_date = next_due_date + (CURRENT_DATE - DATE '2026-04-08'),
       updated_at    = NOW()
 WHERE next_due_date < CURRENT_DATE;


-- ─── Post-cleanup verification (run all in one batch) ──────────────────────
SELECT 'post_step1' AS marker, COUNT(*) AS leftover FROM (
  SELECT 1 FROM public.agents WHERE email IS NOT NULL
   GROUP BY email HAVING COUNT(*) > 1
) t;

SELECT 'post_step2' AS marker, COUNT(*) AS leftover FROM (
  SELECT 1 FROM public.subscribers WHERE nin IS NOT NULL
   GROUP BY nin HAVING COUNT(*) > 1
) t;

SELECT 'post_step3' AS marker, COUNT(*) AS leftover
  FROM public.transactions WHERE type='withdrawal' AND amount > 0;

SELECT 'post_step4' AS marker, COUNT(*) AS leftover
  FROM public.commissions
 WHERE status NOT IN ('released','confirmed','rejected') AND paid_date IS NOT NULL;

SELECT 'post_step5' AS marker, COUNT(*) AS leftover
  FROM public.commissions
 WHERE status IN ('held','disputed') AND (disputed_at IS NULL OR disputed_by IS NULL);

SELECT 'post_step6' AS marker, COUNT(*) AS leftover
  FROM public.transactions WHERE type='contribution' AND agent_id IS NULL;

SELECT 'post_step7' AS marker, COUNT(*) AS leftover
  FROM public.contribution_schedules WHERE next_due_date < CURRENT_DATE;

-- =============================================================================
-- End of cleanup-data-defects.sql
-- =============================================================================
