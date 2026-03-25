// Shared finance utilities — single source of truth

export const MONTHLY_RATE = 0.10 / 12;
export const ANNUAL_RATE  = 0.10;

/** Future value of regular contributions */
export function calcFV(pmt, years) {
  const n = years * 12;
  return n > 0 ? pmt * ((Math.pow(1 + MONTHLY_RATE, n) - 1) / MONTHLY_RATE) : 0;
}

/** Format a UGX number to short form with prefix */
export function formatUGX(n) {
  if (n <= 0)    return '—';
  if (n >= 1e9)  return `UGX ${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `UGX ${(n / 1e6).toFixed(1)}M`;
  return `UGX ${(n / 1e3).toFixed(0)}K`;
}

/** Short form without "UGX" prefix */
export function fmtShort(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  return `${(n / 1e3).toFixed(0)}K`;
}

/** Slider ↔ amount conversions (log scale for better UX) */
export function sliderToAmt(v, min, max) {
  const lo = Math.log(min), hi = Math.log(max);
  return Math.round(Math.exp(lo + (v / 100) * (hi - lo)) / 1000) * 1000;
}
export function amtToSlider(a, min, max) {
  const lo = Math.log(min), hi = Math.log(max);
  return ((Math.log(Math.max(a, min)) - lo) / (hi - lo)) * 100;
}

/** Shared easing curve */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1];
