/**
 * Build a credit-card-style member ID from the phone number.
 * Format: UPU 2026 · 1234 5678  (year + last 8 digits, grouped 4-4).
 *
 * Shared by the signup ActivatedStep member card and the subscriber-dashboard
 * PoliciesWidget so the ID rendered on the policy certificate matches the one
 * shown on the member card.
 */
export function formatMemberId(phone) {
  const year = new Date().getFullYear();
  const tail = (phone || '').slice(-8).padStart(8, '0');
  const grouped = `${tail.slice(0, 4)} ${tail.slice(4)}`;
  return `UPU ${year} · ${grouped}`;
}
