// Policy derivation for the subscriber "Your policies" surfaces.
//
// Insurance is stored per-(subscriber, product) in `subscriber.insuranceProducts`
// (migration 0063): one row per held product — life / health / funeral. This
// module normalises those rows into the `policies` list the UI renders,
// computing active vs expired from each row's renewal date so the policies page
// can show real states and drive a renew-by-payment flow. A legacy single-life
// fallback (from `subscriber.insurance`) keeps any pre-0063 / signup-only read
// working.
//
// IMPORTANT (CLAUDE.md §4.1): this is a util, NOT a service, so it must NOT
// import from `src/data/mockData.js`. The demo clock is read by the service
// layer (`services/subscriber.js`) via `currentTime()` and passed in as `now`.

import { INSURANCE_PRODUCTS } from '../constants/savings';

// Fallback premium for a held policy whose record is missing a premium, so the
// renewal amount is never UGX 0 (the cover slider's lowest tier is 2,000/mo).
const FALLBACK_PREMIUM_MONTHLY = 2_000;

// Display name + stable ordering per product. Falls back to the
// INSURANCE_PRODUCTS label, then a generic title.
const PRODUCT_LABEL = {
  life: 'Life cover',
  health: 'Health insurance',
  funeral: 'Funeral cover',
};
const PRODUCT_ORDER = ['life', 'health', 'funeral'];

// Exported so agent-side surfaces (PolicyChips) reuse the SAME product→label map
// the subscriber policies page uses — no third copy to drift.
export function productName(product) {
  if (PRODUCT_LABEL[product]) return PRODUCT_LABEL[product];
  const cfg = INSURANCE_PRODUCTS.find((p) => p.id === product);
  return cfg?.label ?? 'Insurance cover';
}

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * A held policy (cover > 0) is `active` while its renewal date is still in the
 * future and `expired` once it has passed. The date is the dominant signal: a
 * renewal pushes the date forward a year → active; a long-lapsed policy reads
 * as expired regardless of a stale stored flag.
 */
export function derivePolicyStatus({ renewalDate }, now) {
  const renew = toDate(renewalDate);
  if (!renew) return 'active';
  return renew.getTime() >= now.getTime() ? 'active' : 'expired';
}

function buildPolicy(base, override, now) {
  // A renewal override pushes the renewal date forward and reactivates.
  const renewalDate = override?.renewalDate ?? base.renewalDate;
  const employerPaid = base.fundedBy === 'employer';
  // Employer-funded group cover: the member pays nothing (premium 0, no renewal
  // amount). Self-funded falls back to the entry premium so renewal is never 0.
  const premiumMonthly = employerPaid
    ? 0
    : (Number(base.premiumMonthly) > 0 ? Number(base.premiumMonthly) : FALLBACK_PREMIUM_MONTHLY);
  return {
    id: base.id,
    type: base.type,
    name: base.name,
    cover: Number(base.cover) || 0,
    premiumMonthly,
    policyStart: base.policyStart ?? null,
    renewalDate: renewalDate ?? null,
    status: derivePolicyStatus({ renewalDate }, now),
    renewalAmount: employerPaid ? 0 : premiumMonthly * 12,
    // 'employer' = the subscriber's employer pays this group premium (the member
    // pays nothing and can't re-buy it); 'self' = the subscriber funds it.
    fundedBy: base.fundedBy ?? 'self',
  };
}

/**
 * Build the subscriber's normalised policy list — one entry per held insurance
 * product. Pure: `now` and any `renewalOverrides` (keyed by product id) are
 * supplied by the service layer.
 *
 * @param {object} subscriber — expects `insuranceProducts` (per-product rows);
 *   falls back to the single `insurance` (life) record when that's absent/empty.
 * @param {{ now: Date, renewalOverrides?: Record<string, {renewalDate:string}> }} opts
 * @returns {Array<object>}
 */
export function derivePolicies(subscriber, { now, renewalOverrides = {} } = {}) {
  if (!subscriber || !now) return [];

  // Source rows = the per-product insurance set. Legacy fallback: if the array
  // is absent/empty but the single life record has cover, synthesise one life
  // row so older reads + signup-only accounts still render their policy.
  let rows = (Array.isArray(subscriber.insuranceProducts) ? subscriber.insuranceProducts : [])
    .filter((r) => Number(r.cover) > 0);
  if (rows.length === 0) {
    const ins = subscriber.insurance;
    if (ins && Number(ins.cover) > 0) {
      rows = [{
        product: 'life',
        cover: ins.cover,
        premiumMonthly: ins.premiumMonthly,
        policyStart: ins.policyStart,
        renewalDate: ins.renewalDate,
        status: ins.status,
        fundedBy: ins.fundedBy,
      }];
    }
  }

  return rows
    .slice()
    .sort((a, b) => PRODUCT_ORDER.indexOf(a.product) - PRODUCT_ORDER.indexOf(b.product))
    .map((r) => buildPolicy(
      {
        id: `${subscriber.id}-${r.product}`,
        type: r.product,
        name: productName(r.product),
        cover: r.cover,
        premiumMonthly: r.premiumMonthly,
        policyStart: r.policyStart,
        renewalDate: r.renewalDate,
        fundedBy: r.fundedBy,
      },
      renewalOverrides[r.product],
      now,
    ));
}
