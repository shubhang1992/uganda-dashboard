// Centralised Uganda phone helpers. Single source of truth across signup,
// signin, profile, nominees, beneficiaries, branch admin, agent admin.
//
// Canonical storage: 9-digit local string (e.g. '701234567'). Display always
// adds the +256 prefix. Validation accepts either form on input.

/** Valid Ugandan mobile carrier prefixes (first two digits of the local number). */
const VALID_PREFIXES = ['70', '71', '74', '75', '76', '77', '78'];

/**
 * Strip everything except digits, then drop a leading '256' or '0' so callers
 * can pass display-formatted strings like '+256 701 234 567' or '0701234567'.
 * Returns the 9-digit local part, or whatever digits remain (could be shorter
 * during typing — callers should validate before persisting).
 */
export function parseUGPhoneLocal(raw) {
  if (raw == null) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('256')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 9);
}

/**
 * @returns {boolean} true iff the input is a complete, valid 9-digit Uganda
 *   mobile number with a known carrier prefix.
 */
export function isValidUGPhone(raw) {
  const local = parseUGPhoneLocal(raw);
  if (local.length !== 9) return false;
  return VALID_PREFIXES.includes(local.slice(0, 2));
}

/**
 * Format a 9-digit local number as `+256 7XX XXX XXX` for display.
 * Returns the input unchanged if it isn't a valid 9-digit local number.
 */
export function formatUGPhone(raw) {
  const local = parseUGPhoneLocal(raw);
  if (local.length !== 9) return raw == null ? '' : String(raw);
  return `+256 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/** Return the canonical storage form: `+256XXXXXXXXX` (12 chars) or empty. */
export function toCanonicalUGPhone(raw) {
  const local = parseUGPhoneLocal(raw);
  if (local.length !== 9) return '';
  return `+256${local}`;
}
