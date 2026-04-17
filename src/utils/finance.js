// Shared finance utilities — single source of truth

/** @type {number} Monthly interest rate (annual / 12) */
export const MONTHLY_RATE = 0.10 / 12;
/** @type {number} Annual interest rate (10%) */
export const ANNUAL_RATE  = 0.10;

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
