// Employer group-life insurance pricing.
//
// The employer provides ONE flat group-life cover amount to every staff member
// (all-or-nothing). The premium for that cover is paid by the EMPLOYER — staff
// pay nothing. To keep the demo internally consistent, the group premium is
// priced at the SAME monthly rate as the individual subscriber "life" product
// (INSURANCE_PREMIUM_MONTHLY per INSURANCE_COVER of cover), so group and
// individual life cover share one actuarial rate.
//
// Example: the life product is 2,000/mo for 1,000,000 cover → 0.2%/mo. A 15M
// group cover therefore costs the employer 30,000/mo per member.
//
// This is a notional monthly cost surfaced in the employer UI; it is not posted
// to the contribution ledger in the demo (employees' insurance_premium_monthly
// stays 0 — that is the *member's* charge, which is genuinely nil).

import { INSURANCE_PREMIUM_MONTHLY, INSURANCE_COVER } from '../constants/savings';

/** Monthly group-life premium rate as a fraction of cover (≈ 0.002 = 0.2%/mo). */
export const GROUP_LIFE_MONTHLY_RATE = INSURANCE_PREMIUM_MONTHLY / INSURANCE_COVER;

/** Monthly group-life premium the employer funds per covered member, for a flat cover amount. */
export function groupPremiumPerMember(cover) {
  return Math.round((Number(cover) || 0) * GROUP_LIFE_MONTHLY_RATE);
}

/** Total monthly group-life premium the employer funds across a covered headcount. */
export function groupPremiumTotal(cover, coveredCount) {
  return groupPremiumPerMember(cover) * (Number(coveredCount) || 0);
}
