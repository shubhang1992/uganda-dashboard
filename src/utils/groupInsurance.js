// Employer group insurance pricing + config normalisation.
//
// The employer provides group cover to every staff member (all-or-nothing). The
// premium is paid by the EMPLOYER — staff pay nothing. Each product's premium is
// priced at the SAME monthly rate as the individual subscriber "life" product
// (INSURANCE_PREMIUM_MONTHLY per INSURANCE_COVER of cover) so group and
// individual cover share one actuarial rate. Example: 15M cover → 30,000/mo.
//
// Multi-product (Life / Health / Funeral): the company config carries
//   default_contribution_config.groupInsuranceProducts = {
//     life:    { enabled, cover },
//     health:  { enabled, cover },
//     funeral: { enabled, cover },
//   }
// Legacy configs (single flat group life) carry { insuranceEnabled, groupCoverAmount }
// and are normalised to a one-product (life) list for back-compat.
//
// The per-member premium charged in the contribution run is the SUM of the
// enabled products' premiums; it is NOT posted to anyone's pension balance (it is
// a cost, not savings — see migration 0066/0067).

import { INSURANCE_PREMIUM_MONTHLY, INSURANCE_COVER } from '../constants/savings';

/** Monthly group premium rate as a fraction of cover (≈ 0.002 = 0.2%/mo). */
export const GROUP_LIFE_MONTHLY_RATE = INSURANCE_PREMIUM_MONTHLY / INSURANCE_COVER;

/** Products the employer can provide as a group benefit (mirrors the subscriber set). */
export const GROUP_INSURANCE_PRODUCTS = ['life', 'health', 'funeral'];

/** Monthly premium the employer funds per covered member, for one flat cover amount. */
export function groupPremiumPerMember(cover) {
  return Math.round((Number(cover) || 0) * GROUP_LIFE_MONTHLY_RATE);
}

/**
 * Normalise a company's group insurance config into a list of ENABLED products:
 *   [{ product, cover, premiumMonthly }]
 * New shape: config.groupInsuranceProducts = { life:{enabled,cover}, … }.
 * Legacy shape: { insuranceEnabled, groupCoverAmount } → a single life product.
 */
export function groupInsuranceProducts(config) {
  if (!config) return [];
  const gip = config.groupInsuranceProducts;
  if (gip && typeof gip === 'object') {
    return GROUP_INSURANCE_PRODUCTS
      .map((id) => {
        const p = gip[id] || {};
        const cover = Number(p.cover) || 0;
        const enabled = (p.enabled ?? cover > 0) && cover > 0;
        return enabled ? { product: id, cover, premiumMonthly: groupPremiumPerMember(cover) } : null;
      })
      .filter(Boolean);
  }
  // Legacy single flat group life.
  const cover = Number(config.groupCoverAmount) || 0;
  const on = (config.insuranceEnabled ?? cover > 0) && cover > 0;
  return on ? [{ product: 'life', cover, premiumMonthly: groupPremiumPerMember(cover) }] : [];
}

/** True when the company provides at least one group insurance product. */
export function groupInsuranceOn(config) {
  return groupInsuranceProducts(config).length > 0;
}

/** Total monthly group premium the employer funds per covered member (Σ products). */
export function groupInsurancePremiumPerMember(config) {
  return groupInsuranceProducts(config).reduce((sum, p) => sum + p.premiumMonthly, 0);
}

/** Total monthly group premium across a covered headcount. */
export function groupInsurancePremiumTotal(config, coveredCount) {
  return groupInsurancePremiumPerMember(config) * (Number(coveredCount) || 0);
}
