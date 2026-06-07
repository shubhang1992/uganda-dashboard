// Shared helper: a one-line description of the employer's single company-wide
// funding model (Issue 2). Kept in its own module (not a component file) so
// fast-refresh stays component-only. Consumed by ViewEmployees / EmployeeDetail
// / ContributionRuns / OnboardStaffPanel.

import { formatUGX } from '../../utils/currency';

export function companyFundingLabel(config) {
  if (!config) return 'Company funding: not set';
  if (config.mode === 'co-contribution') {
    const cap =
      config.maxContribution != null && config.maxContribution !== ''
        ? ` (cap ${formatUGX(config.maxContribution, { compact: false })})`
        : '';
    return `Co-contribution — matches ${Number(config.matchPct ?? 0)}% of each member's saving${cap}`;
  }
  return `Employer-only — ${formatUGX(config.employerAmount ?? 0, { compact: false })} per member / month`;
}
