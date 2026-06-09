-- =============================================================================
-- Universal Pensions Uganda — 0037: employees.monthly_contribution
-- =============================================================================
-- Purely additive data-foundation migration for the funder-redesign (Phase 4).
-- Adds a single per-employee column capturing the employee's OWN monthly
-- saving — the base the co-contribution employer match is computed against.
-- No RPC body, table, policy, or grant changes; the column is read-only today
-- (surfaced via the employer service map) and not yet written by any RPC.
--
-- CONVENTIONS (mirroring 0034 / 0036):
--   * snake_case column; the service layer maps to camelCase on the frontend.
--   * NUMERIC NOT NULL DEFAULT 0 — same shape/default as the sibling money
--     columns on this table (salary, retirement_balance, …).
--   * No backfill needed: the seed sets per-row values directly; existing live
--     rows default to 0 (the column does not drive any run-line derivation, so
--     a 0 default keeps every prior run total identical).
--   * Forward-only; reversible via 0037_employee_monthly_contribution.down.sql.
--   * Part of the 0001→0042 baseline applied in order at the restore cutover.
-- =============================================================================

ALTER TABLE public.employees
  ADD COLUMN monthly_contribution NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.employees.monthly_contribution IS
  'The employee''s own monthly saving (UGX) — the base the co-contribution '
  'employer match is computed against. Added for the funder-redesign '
  '(0037). NUMERIC NOT NULL DEFAULT 0; does not drive run-line derivation.';

-- =============================================================================
-- End of 0037_employee_monthly_contribution.sql
-- =============================================================================
