// Policy derivation for the subscriber "Your policies" surfaces.
//
// The platform stores a single life-cover record per subscriber
// (`subscriber.insurance`); there is no health product in the data model and
// nothing computes expiry. This module derives a normalised `policies` list:
//   - Life cover, from the real insurance record (held when cover > 0).
//   - Health insurance, synthesised deterministically per subscriber so
//     different demo logins show active / expired / none.
// Active vs expired is computed from the renewal date so the policies page can
// show real states and drive a renew-by-payment flow — all client-side, no
// backend changes.
//
// IMPORTANT (CLAUDE.md §4.1): this is a util, NOT a service, so it must NOT
// import from `src/data/mockData.js`. The demo clock is read by the service
// layer (`services/subscriber.js`) via `currentTime()` and passed in as `now`.

const MS_PER_DAY = 86_400_000;

const HEALTH_COVER_TIERS = [3_000_000, 5_000_000];
const HEALTH_PREMIUM_MONTHLY = 5_000;
// Fallback premium for a held policy whose record is missing a premium, so the
// renewal amount is never UGX 0 (the cover slider's lowest tier is 2,000/mo).
const FALLBACK_PREMIUM_MONTHLY = 2_000;

/** Deterministic 32-bit string hash (FNV-1a). Stable across sessions. */
export function hashId(str) {
  let h = 2166136261 >>> 0;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * MS_PER_DAY);
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

/**
 * Deterministically synthesise a health-insurance policy for a subscriber so
 * the demo shows varied states. Keyed off the phone (the rep logs in by phone,
 * so this spreads the seeded demo accounts across buckets):
 *   bucket 0 → null (no health policy) · 1 → active · 2 → expired.
 * Amounts are stable per subscriber. Returns the raw policy fields (status is
 * computed downstream by `derivePolicies`).
 *
 * @param {object} subscriber
 * @param {Date} now
 * @returns {object|null}
 */
export function synthesizeHealthPolicy(subscriber, now) {
  const seed = hashId(subscriber?.phone || subscriber?.id || '');
  const bucket = seed % 3;
  if (bucket === 0) return null;

  const cover = HEALTH_COVER_TIERS[(seed >>> 2) & 1];
  const active = bucket === 1;
  const start = active ? addDays(now, -200) : addDays(now, -500);
  const renewal = active ? addDays(now, 165) : addDays(now, -135);
  return {
    cover,
    premiumMonthly: HEALTH_PREMIUM_MONTHLY,
    policyStart: isoOf(start),
    renewalDate: isoOf(renewal),
  };
}

function buildPolicy(base, override, now) {
  // A renewal override pushes the renewal date forward and reactivates.
  const renewalDate = override?.renewalDate ?? base.renewalDate;
  const premiumMonthly = Number(base.premiumMonthly) > 0
    ? Number(base.premiumMonthly)
    : FALLBACK_PREMIUM_MONTHLY;
  return {
    id: base.id,
    type: base.type,
    name: base.name,
    cover: Number(base.cover) || 0,
    premiumMonthly,
    policyStart: base.policyStart ?? null,
    renewalDate: renewalDate ?? null,
    status: derivePolicyStatus({ renewalDate }, now),
    renewalAmount: premiumMonthly * 12,
  };
}

/**
 * Build the subscriber's normalised policy list. Pure: `now` and any
 * `renewalOverrides` (keyed by policy type) are supplied by the service layer.
 *
 * @param {object} subscriber
 * @param {{ now: Date, renewalOverrides?: Record<string, {renewalDate:string}> }} opts
 * @returns {Array<object>}
 */
export function derivePolicies(subscriber, { now, renewalOverrides = {} } = {}) {
  if (!subscriber || !now) return [];
  const policies = [];

  const ins = subscriber.insurance;
  if (ins && Number(ins.cover) > 0) {
    policies.push(buildPolicy(
      {
        id: `${subscriber.id}-life`,
        type: 'life',
        name: 'Life cover',
        cover: ins.cover,
        premiumMonthly: ins.premiumMonthly,
        policyStart: ins.policyStart,
        renewalDate: ins.renewalDate,
      },
      renewalOverrides.life,
      now,
    ));
  }

  const health = synthesizeHealthPolicy(subscriber, now);
  if (health) {
    policies.push(buildPolicy(
      {
        id: `${subscriber.id}-health`,
        type: 'health',
        name: 'Health insurance',
        cover: health.cover,
        premiumMonthly: health.premiumMonthly,
        policyStart: health.policyStart,
        renewalDate: health.renewalDate,
      },
      renewalOverrides.health,
      now,
    ));
  }

  return policies;
}
