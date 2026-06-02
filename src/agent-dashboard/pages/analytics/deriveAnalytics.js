import { normalizeFrequency, FREQUENCY_LABEL } from '../../../utils/finance';

export const AGE_BUCKETS = [
  { key: '<26', test: (a) => a < 26 },
  { key: '26–35', test: (a) => a >= 26 && a <= 35 },
  { key: '36–45', test: (a) => a >= 36 && a <= 45 },
  { key: '46–55', test: (a) => a >= 46 && a <= 55 },
  { key: '56+', test: (a) => a >= 56 },
];

export const AMOUNT_BUCKETS = [
  { key: '< 10K', test: (a) => a < 10000 },
  { key: '10–25K', test: (a) => a >= 10000 && a < 25000 },
  { key: '25–50K', test: (a) => a >= 25000 && a < 50000 },
  { key: '50K+', test: (a) => a >= 50000 },
];

export const FREQUENCY_ORDER = ['weekly', 'monthly', 'quarterly', 'half-yearly', 'annually'];

export const MONTHS_BACK = 6;

export function pct(part, whole) {
  if (!whole) return '0%';
  return `${Math.round((part / whole) * 100)}%`;
}

export function deriveAnalytics(subscribers) {
  const gender = countByKey(subscribers, (s) => s.gender || 'other', { male: 0, female: 0, other: 0 });
  const genderData = [
    { name: 'Male', value: gender.male || 0 },
    { name: 'Female', value: gender.female || 0 },
    { name: 'Other', value: gender.other || 0 },
  ].filter((d) => d.value > 0);

  const age = AGE_BUCKETS.map((b) => ({
    key: b.key,
    value: subscribers.filter((s) => Number.isFinite(s.age) && b.test(s.age)).length,
  }));

  const freqMap = countByKey(subscribers, (s) => normalizeFrequency(s.contributionSchedule?.frequency) || 'monthly');
  const frequency = FREQUENCY_ORDER
    .map((k) => ({ key: k, label: FREQUENCY_LABEL[k], value: freqMap[k] || 0 }))
    .filter((d) => d.value > 0);

  const amount = AMOUNT_BUCKETS.map((b) => ({
    key: b.key,
    value: subscribers.filter((s) => b.test(s.contributionSchedule?.amount || 0)).length,
  }));

  const active = subscribers.filter((s) => s.isActive).length;
  const dormant = subscribers.length - active;

  const velocity = buildVelocity(subscribers, MONTHS_BACK);
  const velocityTotal = velocity.reduce((sum, v) => sum + v.value, 0);
  const lifetimeContribution = subscribers.reduce((sum, s) => sum + (s.totalContributions || 0), 0);

  return {
    gender: genderData,
    age,
    frequency,
    amount,
    active,
    dormant,
    velocity,
    velocityTotal,
    lifetimeContribution,
  };
}

export function countByKey(items, getKey, seed = {}) {
  const acc = { ...seed };
  for (const item of items) {
    const k = getKey(item);
    acc[k] = (acc[k] || 0) + 1;
  }
  return acc;
}

export function buildVelocity(subscribers, monthsBack) {
  const now = new Date();
  const buckets = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.push({
      key,
      label: d.toLocaleDateString('en-UG', { month: 'short' }),
      value: 0,
    });
  }
  const lookup = new Map(buckets.map((b) => [b.key, b]));
  for (const s of subscribers) {
    if (!s.registeredDate) continue;
    const slice = s.registeredDate.slice(0, 7);
    const bucket = lookup.get(slice);
    if (bucket) bucket.value += 1;
  }
  return buckets;
}
