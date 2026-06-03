-- =============================================================================
-- DOWN — 0037_employee_monthly_contribution.down.sql
-- =============================================================================
-- Reverses 0037: drops the additive employees.monthly_contribution column.
-- Idempotent (IF EXISTS guard) so a replay converges.
-- =============================================================================

ALTER TABLE public.employees
  DROP COLUMN IF EXISTS monthly_contribution;

-- =============================================================================
-- End of 0037_employee_monthly_contribution.down.sql
-- =============================================================================
