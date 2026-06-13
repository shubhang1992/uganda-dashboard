// Shared helper: a one-line description of the employer's single company-wide
// funding model (Issue 2). Kept in its own module (not a component file) so
// fast-refresh stays component-only. Consumed by ViewEmployees / MemberDetailBody
// / ContributionRuns / OnboardStaffPanel / EmployerHealthScore.

import { formatUGX } from '../../utils/currency';

export function companyFundingLabel(config) {
  if (!config) return 'Company funding: not set';
  if (config.mode === 'co-contribution') {
    return `Co-contribution — ${Number(config.employeePct ?? 0)}% of pay + ${Number(config.employerMatchPct ?? 0)}% employer match`;
  }
  // employer-only (the default mode)
  if (config.employerBasis === 'percent') {
    return `Employer-only — ${Number(config.employerPct ?? 0)}% of compensation`;
  }
  return `Employer-only — ${formatUGX(config.employerAmount ?? 0, { compact: false })} per member / month`;
}
