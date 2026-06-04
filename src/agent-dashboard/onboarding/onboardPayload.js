// Pure payload builder for the agent-onboard write (create_subscriber_from_agent_onboard).
//
// Kept in its own module (not OnboardingComplete.jsx) so the component file only
// exports a component — exporting a helper alongside it trips react-refresh.

import { toCanonicalUGPhone } from '../../utils/phone';
import { INSURANCE_COVER, INSURANCE_PREMIUM_MONTHLY } from '../../constants/savings';

/**
 * Build the payload `create_subscriber_from_agent_onboard` expects from the
 * SignupContext snapshot + the locally-collected contribution schedule. Same
 * shape as the self-signup path — the RPC distinguishes by validating
 * `calling_agent_id` against the auth JWT.
 */
export function buildPayload(signup) {
  const schedule = signup.contributionSchedule || {};
  const includeInsurance = schedule.includeInsurance ?? false;
  return {
    phone: toCanonicalUGPhone(signup.phone) || signup.phone,
    fullName: signup.fullName,
    dob: signup.dob,
    gender: signup.gender,
    nin: signup.nin,
    email: signup.email?.trim() ? signup.email.trim() : null,
    occupation: signup.occupation || null,
    districtId: signup.districtId,
    consent: !!signup.consent,
    consentTimestamp: signup.consentTimestamp,
    contributionSchedule: {
      frequency: schedule.frequency,
      amount: schedule.amount,
      retirementPct: schedule.retirementPct,
      emergencyPct: schedule.emergencyPct,
      includeInsurance,
    },
    pensionBeneficiaries: signup.pensionBeneficiaries ?? [],
    insuranceBeneficiaries: signup.insuranceBeneficiaries ?? [],
    insuranceSameAsPension: !!signup.insuranceSameAsPension,
    insuranceChoiceMade: !!signup.insuranceChoiceMade,
    paymentMethod: schedule.paymentMethod,
    // Persist the insurance policy when the subscriber opted in (parity with the
    // self-signup path; 0042 _insert_subscriber_chain reads payload.insurancePolicy).
    // The agent schedule form (ContributionSettingsForm) only emits
    // includeInsurance — NOT cover/premium — so derive them from the same
    // constants the self-signup path uses. Omitted when insurance was declined.
    ...(includeInsurance
      ? { insurancePolicy: { cover: INSURANCE_COVER, premiumMonthly: INSURANCE_PREMIUM_MONTHLY } }
      : {}),
  };
}
