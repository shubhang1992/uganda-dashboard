// Savings & contribution constants — shared across signup, subscriber dashboard, and projections.

/** Retirement age — when the retirement bucket unlocks. */
export const RETIREMENT_AGE = 60;

/** Working-life start — used for life-progress arc on the home pulse card. */
export const START_AGE = 25;

/** Minimum contribution / withdrawal in UGX. */
export const MIN_CONTRIBUTION = 5_000;
export const MIN_WITHDRAW = 5_000;

/** Default insurance cover and monthly premium for the entry tier (life). */
export const INSURANCE_PREMIUM_MONTHLY = 2_000;
export const INSURANCE_COVER = 1_000_000;

/**
 * Insurance products a subscriber can add to their contribution schedule.
 *
 * Configurable: add, remove, or reprice an entry here and the contribution
 * form (selection list, premium maths, and live summary) picks it up
 * automatically — no component edits needed. `id` is the stable key carried in
 * the schedule's `insuranceTypes` selection; `icon` maps to an inline glyph in
 * ContributionSettingsForm. Premiums/cover are demo values in UGX.
 *
 * `life` deliberately mirrors INSURANCE_PREMIUM_MONTHLY / INSURANCE_COVER so the
 * legacy single-product path (signup, agent onboard) stays consistent.
 */
export const INSURANCE_PRODUCTS = [
  {
    id: 'health',
    label: 'Health insurance',
    blurb: 'Hospital & clinic cover',
    icon: 'health',
    premiumMonthly: 5_000,
    cover: 3_000_000,
  },
  {
    id: 'funeral',
    label: 'Funeral insurance',
    blurb: 'Eases funeral & burial costs',
    icon: 'funeral',
    premiumMonthly: 1_500,
    cover: 2_000_000,
  },
  {
    id: 'life',
    label: 'Life insurance',
    blurb: 'Lump sum for your beneficiaries',
    icon: 'life',
    premiumMonthly: INSURANCE_PREMIUM_MONTHLY,
    cover: INSURANCE_COVER,
  },
];

/** Quick-pick contribution amounts shown on Save / Schedule pages. */
export const QUICK_CONTRIBUTION_AMOUNTS = [10_000, 25_000, 50_000, 100_000, 250_000];

/**
 * Quick-pick contribution amounts for the subscriber mobile Save (top-up) page.
 * Laid out as a 2×3 grid of PillChips. Distinct from the signup/schedule set
 * above so the mobile redesign can tune its own presets independently.
 */
export const MOBILE_QUICK_CONTRIBUTION_AMOUNTS = [5_000, 10_000, 25_000, 50_000, 100_000, 200_000];
