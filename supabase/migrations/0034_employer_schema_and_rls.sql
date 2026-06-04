-- =============================================================================
-- Universal Pensions Uganda — 0034: employer schema + RLS
-- =============================================================================
-- First half of the Employer role backend (Phase 0). Adds the five employer
-- tables + their RLS, mirroring the 0001 CREATE TABLE conventions and the
-- branch/agent RLS structure. The employer-write RPCs land in the partner
-- migration 0035_employer_rpcs.sql.
--
-- The Employer is a B2B account: an organisation that enrols its own staff
-- (`employees`, a STANDALONE roster OUTSIDE the agent→subscriber hierarchy —
-- so employees are NOT in `subscribers` and generate NO agent commissions),
-- funds their contributions via "contribution runs", and watches the
-- aggregate. See /Users/shubhang/Desktop/employerplan.md.
--
-- CONVENTIONS (mirroring 0001 / 0032):
--   * TEXT primary keys (emp-001, empe-NNN, run-NNN) — never UUID/serial.
--   * snake_case columns; the service layer maps to camelCase on the frontend.
--   * `updated_at` columns are maintained INLINE by the 0035 RPCs (this repo
--     has no shared set_updated_at trigger — subscriber_balances /
--     contribution_schedules set updated_at = now() inside their writers; we
--     follow that established pattern rather than introduce a new trigger).
--   * ENABLE + FORCE ROW LEVEL SECURITY on every table.
--   * RLS HARD RULE (CLAUDE.md §5.7): read `auth.jwt() ->> 'app_role'`
--     (NEVER 'role' — that returns the Postgres role 'authenticated'). The
--     role-scoped claim uses camelCase `employerId`, mirroring the existing
--     `branchId` / `distributorId` / `agentId` / `subscriberId` claims (see
--     0007_rls_use_app_role.sql + api/auth/_lib/claims.ts).
--   * One SELECT policy per table, scoped by the employer claim. WRITES go
--     through SECURITY DEFINER RPCs only — no client INSERT/UPDATE/DELETE
--     policies (same stance as commissions / settlement_runs in 0003).
--   * service-role (api/_lib/supabase-admin.ts + the seed) has bypassrls, so
--     seeding writes these tables directly despite FORCE.
--   * Forward-only; reversible via 0034_employer_schema_and_rls.down.sql.
--   * Applied to live (employer ship 2026-06-03); part of the 0001→0042 restore baseline.
-- =============================================================================

-- =============================================================================
-- Tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- employers — one row per B2B account (emp-001 in the demo seed)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employers (
  id                            TEXT PRIMARY KEY,                  -- emp-001
  name                          TEXT NOT NULL,
  sector                        TEXT,
  registration_no               TEXT,
  contact_name                  TEXT,
  contact_phone                 TEXT,
  contact_email                 TEXT,
  district                      TEXT,
  payroll_cadence               TEXT,                              -- 'monthly' | 'weekly' | …
  -- The company-level default a new contribution run starts from:
  --   { mode, employerPct, employeePct, employerAmount, employeeAmount }
  default_contribution_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- employees — the employer's standalone staff roster (empe-NNN)
-- -----------------------------------------------------------------------------
-- These rows are NOT subscribers. Their balances live HERE (not in
-- subscriber_balances) and are bumped INLINE by submit_contribution_run (0035).
-- There is intentionally NO contribution trigger on this table — see plan §A.5.
CREATE TABLE IF NOT EXISTS public.employees (
  id                        TEXT PRIMARY KEY,                      -- empe-001
  employer_id               TEXT NOT NULL
                              REFERENCES public.employers(id) ON DELETE CASCADE,
  name                      TEXT NOT NULL,
  phone                     TEXT,
  email                     TEXT,
  gender                    TEXT,                                  -- 'male' | 'female' | 'other'
  age                       INTEGER,
  nin                       TEXT,
  job_title                 TEXT,
  salary                    NUMERIC NOT NULL DEFAULT 0,            -- monthly gross UGX
  status                    TEXT NOT NULL DEFAULT 'active',        -- 'active' | 'suspended'
  joined_date               DATE,
  -- { mode: 'co-contribution' | 'employer-only', employerPct, employeePct,
  --   employerAmount, employeeAmount }. Re-derived server-side per run.
  contribution_config       JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Pension balances (employer-roster ledger; NOT subscriber_balances).
  retirement_balance        NUMERIC NOT NULL DEFAULT 0,
  emergency_balance         NUMERIC NOT NULL DEFAULT 0,
  net_balance               NUMERIC NOT NULL DEFAULT 0,
  units_held                NUMERIC NOT NULL DEFAULT 0,            -- net_balance / 1000
  total_contributions       NUMERIC NOT NULL DEFAULT 0,           -- lifetime gross funded
  -- Per-employee retirement/emergency split for the run math:
  --   { retirementPct, emergencyPct } (r+e = 100). Mirrors
  --   contribution_schedules.retirement_pct/emergency_pct (default 80/20).
  contribution_schedule     JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Insurance (oversight only; editable via update_employee_insurance).
  insurance_cover           NUMERIC NOT NULL DEFAULT 0,
  insurance_premium_monthly NUMERIC NOT NULL DEFAULT 0,
  insurance_status          TEXT NOT NULL DEFAULT 'inactive',     -- 'active' | 'inactive'
  insurance_renewal_date    DATE,
  nominees                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- employees(employer_id) — the RLS predicate + every roster read filters on it.
CREATE INDEX IF NOT EXISTS employees_employer_id_idx
  ON public.employees (employer_id);

-- -----------------------------------------------------------------------------
-- contribution_runs — one row per funding batch (run-NNN)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contribution_runs (
  id              TEXT PRIMARY KEY,                                -- run-001
  employer_id     TEXT NOT NULL
                    REFERENCES public.employers(id) ON DELETE CASCADE,
  period_label    TEXT,                                            -- 'May 2026', 'Q2 2026', …
  status          TEXT NOT NULL DEFAULT 'completed',               -- 'draft' | 'completed'
  employer_total  NUMERIC NOT NULL DEFAULT 0,
  employee_total  NUMERIC NOT NULL DEFAULT 0,
  grand_total     NUMERIC NOT NULL DEFAULT 0,
  run_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- contribution_runs(employer_id) — the RLS predicate + history reads.
CREATE INDEX IF NOT EXISTS contribution_runs_employer_id_idx
  ON public.contribution_runs (employer_id);

-- -----------------------------------------------------------------------------
-- contribution_run_lines — per-employee line item inside a run
-- -----------------------------------------------------------------------------
-- These lines double as the per-employee contribution ledger (employees are
-- NOT in `transactions`).
CREATE TABLE IF NOT EXISTS public.contribution_run_lines (
  id                TEXT PRIMARY KEY,                              -- crl-...
  run_id            TEXT NOT NULL
                      REFERENCES public.contribution_runs(id) ON DELETE CASCADE,
  employee_id       TEXT NOT NULL
                      REFERENCES public.employees(id) ON DELETE CASCADE,
  employer_amount   NUMERIC NOT NULL DEFAULT 0,
  employee_amount   NUMERIC NOT NULL DEFAULT 0,
  retirement_amount NUMERIC NOT NULL DEFAULT 0,
  emergency_amount  NUMERIC NOT NULL DEFAULT 0,
  method            TEXT,                                          -- 'Bank transfer' | 'MTN Mobile Money' | …
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- contribution_run_lines(run_id) — the RLS subquery + run-detail reads.
CREATE INDEX IF NOT EXISTS contribution_run_lines_run_id_idx
  ON public.contribution_run_lines (run_id);

-- contribution_run_lines(employee_id) — per-employee ledger reads.
CREATE INDEX IF NOT EXISTS contribution_run_lines_employee_id_idx
  ON public.contribution_run_lines (employee_id);

-- -----------------------------------------------------------------------------
-- contribution_run_uploads — idempotency ledger for submit_contribution_run
-- -----------------------------------------------------------------------------
-- Parallel to settlement_uploads (0032). A double-submitted run (reload /
-- retry / second tab) keyed by the same nonce returns the prior result instead
-- of double-funding. RPC-internal: no GRANT, no SELECT policy (mirrors the
-- settlement_uploads stance).
CREATE TABLE IF NOT EXISTS public.contribution_run_uploads (
  nonce       TEXT PRIMARY KEY,
  result      JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Row-Level Security
-- =============================================================================
-- ENABLE + FORCE on every table (matches the 21-table convention in 0003).

ALTER TABLE public.employers                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employers                FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.employees                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees                FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.contribution_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_runs        FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.contribution_run_lines   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_run_lines   FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.contribution_run_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_run_uploads FORCE  ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- SELECT policies — one per table, scoped by the employer claim.
-- -----------------------------------------------------------------------------
-- Casing mirrors the branch policies: `auth.jwt() ->> 'app_role' = 'employer'`
-- AND a camelCase `employerId` claim (parallel to branchId/distributorId).
-- DROP-then-CREATE so a replay converges (CREATE POLICY is not idempotent).

DROP POLICY IF EXISTS employer_self_select ON public.employers;
CREATE POLICY employer_self_select ON public.employers
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'employer'
    AND id = auth.jwt() ->> 'employerId'
  );

DROP POLICY IF EXISTS employees_by_employer_select ON public.employees;
CREATE POLICY employees_by_employer_select ON public.employees
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'employer'
    AND employer_id = auth.jwt() ->> 'employerId'
  );

DROP POLICY IF EXISTS contribution_runs_by_employer_select ON public.contribution_runs;
CREATE POLICY contribution_runs_by_employer_select ON public.contribution_runs
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'employer'
    AND employer_id = auth.jwt() ->> 'employerId'
  );

-- run_lines have no employer_id column — scope via the parent run, restricted
-- to the caller's runs (mirrors the settlement_runs_select_agent EXISTS join).
DROP POLICY IF EXISTS contribution_run_lines_by_employer_select ON public.contribution_run_lines;
CREATE POLICY contribution_run_lines_by_employer_select ON public.contribution_run_lines
  FOR SELECT
  USING (
    auth.jwt() ->> 'app_role' = 'employer'
    AND EXISTS (
      SELECT 1 FROM public.contribution_runs r
      WHERE r.id = contribution_run_lines.run_id
        AND r.employer_id = auth.jwt() ->> 'employerId'
    )
  );

-- contribution_run_uploads: no policy — RPC-internal idempotency ledger, read
-- and written only by the SECURITY DEFINER submit_contribution_run RPC (0035),
-- exactly like settlement_uploads. No GRANT to authenticated.

-- =============================================================================
-- End of 0034_employer_schema_and_rls.sql
-- Partner: 0035_employer_rpcs.sql (employer write/read RPCs).
-- =============================================================================
