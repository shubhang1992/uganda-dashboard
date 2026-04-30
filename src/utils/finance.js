// Shared finance utilities — single source of truth

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
 * Parse a UGX amount string ("12,500", "12500", "UGX 12,500") into a
 * positive integer or null. Used by every contribution / withdrawal form.
 * @param {string} str
 * @returns {number | null}
 */
export function parseAmount(str) {
  const cleaned = String(str ?? '').replace(/[^\d]/g, '');
  if (!cleaned) return null;
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
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
 * Format a UGX number to short form with prefix (e.g. "UGX 1.2M").
 * @param {number} n - Amount in UGX
 * @returns {string} Formatted string
 */
export function formatUGX(n) {
  if (n <= 0)    return '—';
  if (n >= 1e9)  return `UGX ${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `UGX ${(n / 1e6).toFixed(1)}M`;
  return `UGX ${(n / 1e3).toFixed(0)}K`;
}

/**
 * Format a UGX number with full precision (e.g. "UGX 50,000").
 * Use when exact amounts matter — e.g., contribution schedules, receipts.
 * @param {number} n - Amount in UGX
 * @returns {string} Formatted string
 */
export function formatUGXExact(n) {
  if (!Number.isFinite(n) || n <= 0) return 'UGX 0';
  return `UGX ${Math.round(n).toLocaleString('en-UG')}`;
}

/**
 * Short form without "UGX" prefix (e.g. "1.2M").
 * @param {number} n - Amount in UGX
 * @returns {string} Formatted string
 */
export function fmtShort(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  return `${(n / 1e3).toFixed(0)}K`;
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

/** Shared easing curve */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1];
