// OnboardingComplete.buildPayload — agent-onboard insurance persistence (P5 fix).
//
// The agent schedule form (ContributionSettingsForm) only emits `includeInsurance`
// — never insuranceCover/insurancePremium — so buildPayload must derive the
// policy from the savings constants, else insurance is silently dropped on the
// agent path (the bug the adversarial review caught: the original guard
// `includeInsurance && insuranceCover > 0` was never true for agent onboarding).

import { describe, it, expect } from 'vitest';
import { buildPayload } from './onboardPayload';
import { INSURANCE_COVER, INSURANCE_PREMIUM_MONTHLY } from '../../constants/savings';

const base = {
  phone: '+256711000001',
  fullName: 'Asha Nam; ',
  dob: '1990-01-01',
  gender: 'female',
  nin: 'CM123',
  email: '',
  occupation: '',
  districtId: 'd-1',
  consent: true,
  consentTimestamp: '2026-06-05T00:00:00Z',
  pensionBeneficiaries: [],
  insuranceBeneficiaries: [],
  insuranceSameAsPension: true,
  insuranceChoiceMade: true,
};

describe('OnboardingComplete.buildPayload', () => {
  it('emits insurancePolicy from the savings constants when includeInsurance is true', () => {
    const payload = buildPayload({
      ...base,
      contributionSchedule: {
        frequency: 'monthly', amount: 50000, retirementPct: 80, emergencyPct: 20,
        includeInsurance: true,
      },
    });
    expect(payload.insurancePolicy).toEqual({
      cover: INSURANCE_COVER,
      premiumMonthly: INSURANCE_PREMIUM_MONTHLY,
    });
    // The schedule flag is also carried (0042 now reads it from the sub-object).
    expect(payload.contributionSchedule.includeInsurance).toBe(true);
  });

  it('omits insurancePolicy when insurance was declined', () => {
    const payload = buildPayload({
      ...base,
      contributionSchedule: { frequency: 'monthly', amount: 50000, includeInsurance: false },
    });
    expect(payload).not.toHaveProperty('insurancePolicy');
  });

  it('omits insurancePolicy when there is no schedule', () => {
    const payload = buildPayload({ ...base, contributionSchedule: null });
    expect(payload).not.toHaveProperty('insurancePolicy');
  });
});
