import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useSignup } from '../SignupContext';
import * as subscriberService from '../../services/subscriber';
import { verifyOtp } from '../../services/auth';
import { toCanonicalUGPhone } from '../../utils/phone';
import ContributionSettings from './ContributionSettings';

/**
 * Route wrapper for `/signup/contribution`.
 *
 * Reads the existing schedule (if any) from the signup context so editing
 * pre-fills. On payment confirm, calls the atomic
 * `create_subscriber_from_signup` RPC (via `subscriber.createFromSignup`) to
 * persist the subscriber + balance + schedule + nominees + first transaction
 * in one transaction, then mints the real JWT via `/api/auth/verify-otp` and
 * routes to the subscriber dashboard at `/dashboard`. Cancel returns to the
 * activation step without saving.
 */
export default function ContributionRoute() {
  const navigate = useNavigate();
  const signup = useSignup();
  const { login } = useAuth();
  const { addToast } = useToast();

  /**
   * Build the payload the RPC expects from the SignupContext snapshot + the
   * schedule the user just confirmed. The RPC is forgiving about missing
   * optional fields (it defaults paymentMethod, includeInsurance, etc.) but
   * the required fields must be present.
   */
  function buildPayload(schedule, phone) {
    return {
      phone,
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
        includeInsurance: schedule.includeInsurance ?? false,
        insurancePremium: schedule.insurancePremium ?? 0,
        insuranceCover:   schedule.insuranceCover   ?? 0,
      },
      pensionBeneficiaries: signup.pensionBeneficiaries ?? [],
      insuranceBeneficiaries: signup.insuranceBeneficiaries ?? [],
      insuranceSameAsPension: !!signup.insuranceSameAsPension,
      insuranceChoiceMade: !!signup.insuranceChoiceMade,
      paymentMethod: schedule.paymentMethod,
    };
  }

  async function handleConfirm(schedule) {
    const canonicalPhone = toCanonicalUGPhone(signup.phone) || signup.phone;
    signup.patch({ contributionSchedule: schedule });

    const payload = buildPayload(schedule, canonicalPhone);

    // 1. Atomic write: subscriber + schedule + nominees + first transaction +
    //    optional insurance policy. Trigger chain populates subscriber_balances
    //    and commissions. RPC rolls back on any validation failure, so no
    //    orphan rows are possible.
    let subscriberId = null;
    try {
      const result = await subscriberService.createFromSignup(payload);
      subscriberId = result?.subscriberId;
    } catch (err) {
      addToast(
        'error',
        err?.message || "Couldn't create your account. Please try again.",
      );
      return;
    }

    // 2. Mint the real JWT via the dev-bypass verify-otp route. The subscriber
    //    row now exists, so the route's phone lookup succeeds and the JWT
    //    carries the correct subscriberId claim.
    try {
      const { token, user } = await verifyOtp(canonicalPhone, '123456', 'subscriber');
      await login({ token, user });
    } catch (err) {
      addToast(
        'error',
        err?.message || 'Account created, but sign-in failed. Please sign in to continue.',
      );
      return;
    }

    // 3. Clear the persisted signup state — the dashboard is now the source of
    //    truth for this subscriber. Land on the live dashboard. `subscriberId`
    //    is referenced for diagnostics; the auth-context JWT already carries it.
    void subscriberId;
    signup.reset();
    navigate('/dashboard', { replace: true });
  }

  function handleCancel() {
    navigate('/signup');
  }

  return (
    <ContributionSettings
      initial={signup.contributionSchedule}
      dob={signup.dob}
      phone={signup.phone}
      onClose={handleCancel}
      onConfirm={handleConfirm}
    />
  );
}
