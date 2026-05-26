// Phone normalization shared across API routes.
//
// Mirrors src/utils/phone.js (canonical form: `+256XXXXXXXXX`). Kept duplicated
// because api/ is compiled separately from src/ — there's no shared module
// boundary that survives Vercel's bundler split.

function parseUGPhoneLocal(raw: unknown): string {
  if (raw == null) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('256')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 9);
}

// Return canonical `+256XXXXXXXXX` (13 chars) or empty if input can't be
// normalized to a valid 9-digit local number.
export function toCanonicalUGPhone(raw: unknown): string {
  const local = parseUGPhoneLocal(raw);
  if (local.length !== 9) return '';
  return `+256${local}`;
}
