// Shared finance utilities — single source of truth.
//
// NOTE: Currency formatting lives in `src/utils/currency.js`, date formatting
// in `src/utils/date.js`, and motion curves in `src/utils/motion.js`. Import
// money/date/animation helpers directly from those modules — this file owns
// only the finance-domain logic (frequencies, projections, money parsing).

/** @type {number} Monthly interest rate (annual / 12) */
export const MONTHLY_RATE = 0.10 / 12;
/** @type {number} Annual interest rate (10%) */
export const ANNUAL_RATE  = 0.10;

/**
 * Canonical contribution frequencies. Signup writes these IDs into
 * `subscriber.contributionSchedule.frequency` — every consumer must read
 * them via these helpers, never via inline switch statements.
 */
export const FREQUENCY = {
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  HALF_YEARLY: 'half-yearly',
  ANNUALLY: 'annually',
};

/**
 * Display labels for canonical frequency IDs. Use this for any user-facing
 * frequency rendering (subscriber detail, analytics, onboarding complete,
 * pulse cards, etc.) so the prose stays consistent across the app.
 */
export const FREQUENCY_LABEL = {
  [FREQUENCY.WEEKLY]: 'Weekly',
  [FREQUENCY.MONTHLY]: 'Monthly',
  [FREQUENCY.QUARTERLY]: 'Quarterly',
  [FREQUENCY.HALF_YEARLY]: 'Half-yearly',
  [FREQUENCY.ANNUALLY]: 'Annually',
};

/** Periods per year for each canonical frequency. */
const PERIODS_PER_YEAR = {
  [FREQUENCY.WEEKLY]: 52,
  [FREQUENCY.MONTHLY]: 12,
  [FREQUENCY.QUARTERLY]: 4,
  [FREQUENCY.HALF_YEARLY]: 2,
  [FREQUENCY.ANNUALLY]: 1,
};

/**
 * Resolve any historical or alternate frequency key (e.g. 'halfYearly',
 * 'semi-annually') to the canonical one. Defensive — old data may use
 * different shapes; new writes always go through FREQUENCY.
 */
export function normalizeFrequency(value) {
  if (!value) return FREQUENCY.MONTHLY;
  const v = String(value).toLowerCase();
  if (v === 'weekly') return FREQUENCY.WEEKLY;
  if (v === 'monthly') return FREQUENCY.MONTHLY;
  if (v === 'quarterly') return FREQUENCY.QUARTERLY;
  if (v === 'half-yearly' || v === 'halfyearly' || v === 'semi-annually' || v === 'semiannually') {
    return FREQUENCY.HALF_YEARLY;
  }
  if (v === 'annually' || v === 'yearly') return FREQUENCY.ANNUALLY;
  return FREQUENCY.MONTHLY;
}

/**
 * Number of periods per year for a frequency (handles aliases).
 * @param {string} frequency
 * @returns {number}
 */
export function periodsPerYear(frequency) {
  return PERIODS_PER_YEAR[normalizeFrequency(frequency)] ?? 12;
}

/**
 * Convert a contribution schedule { amount, frequency } into a monthly
 * equivalent value. Used by projections and the home pulse card.
 * @param {{amount?: number, frequency?: string} | null | undefined} schedule
 * @returns {number}
 */
export function monthlyEquivalent(schedule) {
  const amount = Number(schedule?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return (amount * periodsPerYear(schedule?.frequency)) / 12;
}

/**
 * Canonical UGX money parser — the single source of truth for turning a
 * user/upload-entered amount into a whole-shilling integer.
 *
 * UGX is a zero-decimal currency: the platform never stores sub-shilling
 * amounts. Accepts plain numbers and formatted strings ("12,500", "12500",
 * "UGX 12,500", "12,500.50") and returns a non-negative **integer** (rounded
 * to the nearest whole UGX) or `null` for blank / non-finite / non-positive
 * input.
 *
 * Decimals are preserved through parsing and then rounded — the old
 * implementation stripped the decimal point outright (`"12,500.50"` → 1250050,
 * off by 100×). The settlement upload path imports this same parser so there
 * is exactly one money-parsing rule across contributions, withdrawals, claims,
 * and settlement (see `src/utils/settlement.js`, BL-8 / M-C1).
 *
 * @param {string | number} str
 * @returns {number | null}
 */
export function parseAmount(str) {
  if (typeof str === 'number') {
    if (!Number.isFinite(str) || str <= 0) return null;
    return Math.round(str);
  }
  // Strip everything except digits, the decimal point, and a leading sign so a
  // fractional cell ("45000.50") parses, then round to whole UGX.
  const cleaned = String(str ?? '').replace(/[^\d.-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/**
 * Future value of regular monthly contributions.
 * @param {number} pmt - Monthly payment amount
 * @param {number} years - Number of years
 * @returns {number} Future value
 */
export function calcFV(pmt, years) {
  const n = years * 12;
  return n > 0 ? pmt * ((Math.pow(1 + MONTHLY_RATE, n) - 1) / MONTHLY_RATE) : 0;
}

/**
 * Convert slider position (0-100) to amount using log scale.
 * @param {number} v - Slider value (0-100)
 * @param {number} min - Minimum amount
 * @param {number} max - Maximum amount
 * @returns {number} Corresponding amount
 */
export function sliderToAmt(v, min, max) {
  const lo = Math.log(min), hi = Math.log(max);
  return Math.round(Math.exp(lo + (v / 100) * (hi - lo)) / 1000) * 1000;
}
/**
 * Convert amount to slider position (0-100) using log scale.
 * @param {number} a - Amount
 * @param {number} min - Minimum amount
 * @param {number} max - Maximum amount
 * @returns {number} Slider value (0-100)
 */
export function amtToSlider(a, min, max) {
  const lo = Math.log(min), hi = Math.log(max);
  return ((Math.log(Math.max(a, min)) - lo) / (hi - lo)) * 100;
}
