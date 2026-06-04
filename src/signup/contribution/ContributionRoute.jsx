import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useSignup } from '../SignupContext';
import * as subscriberService from '../../services/subscriber';
import { verifyOtp } from '../../services/auth';
import { toCanonicalUGPhone } from '../../utils/phone';
import ContributionSettings from './ContributionSettings';
import SignupShell from '../SignupShell';
import ActivatedStep from '../steps/ActivatedStep';

/**
 * Route wrapper for `/signup/contribution`.
 *
 * Reads the existing schedule (if any) from the signup context so editing
 * pre-fills. On payment confirm, calls the atomic
 * `create_subscriber_from_signup` RPC (via `subscriber.createFromSignup`) to
 * persist the subscriber + balance + schedule + nominees + first transaction
 * in one transaction, then mints the real JWT via `/api/auth/verify-otp`.
 * Once the JWT is set, the route captures a `completionSnapshot` of the
 * fields the All-Set view needs and flips into the `'activated'` phase.
 * `ActivatedStep` reads from the snapshot rather than the live signup
 * context, so it stays renderable even after `signup.reset()` fires on
 * Continue — that ordering matters because the activated branch is checked
 * BEFORE the direct-entry consent guard, preventing a redirect race that
 * would otherwise bounce the user back to ConsentStep.
 */
export default function ContributionRoute() {
  const navigate = useNavigate();
  const signup = useSignup();
  const { login } = useAuth();
  const { addToast } = useToast();
  const [phase, setPhase] = useState('setup');
  const [completionSnapshot, setCompletionSnapshot] = useState(null);

  // Activated branch runs FIRST — independent of signup context so the
  // Continue click (which resets signup) can't trigger the guard below
  // during the brief window before route unmount.
  if (phase === 'activated' && completionSnapshot) {
    return (
      <SignupShell stepId="done" canBack={false}>
        <ActivatedStep snapshot={completionSnapshot} onFinish={handleContinue} />
      </SignupShell>
    );
  }

  if (!signup.consent || !signup.consentTimestamp || !signup.fullName) {
    return <Navigate to="/signup" replace />;
  }

  /**
   * Build the payload the RPC expects from the SignupContext snapshot + the
   * schedule the user just confirmed. The RPC is forgiving about missing
   * optional fields (it defaults paymentMethod, includeInsurance, etc.) but
   * the required fields must be present.
   */
  function buildPayload(schedule, phone) {
    const includeInsurance = schedule.includeInsurance ?? false;
    const insuranceCover = schedule.insuranceCover ?? 0;
    const insurancePremium = schedule.insurancePremium ?? 0;
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
        includeInsurance,
        insurancePremium,
        insuranceCover,
      },
      pensionBeneficiaries: signup.pensionBeneficiaries ?? [],
      insuranceBeneficiaries: signup.insuranceBeneficiaries ?? [],
      insuranceSameAsPension: !!signup.insuranceSameAsPension,
      insuranceChoiceMade: !!signup.insuranceChoiceMade,
      paymentMethod: schedule.paymentMethod,
      // Persist the insurance policy at signup when the subscriber opted in.
      // create_subscriber_from_signup (0042 _insert_subscriber_chain) reads
      // payload.insurancePolicy → insurance_policies; omitting it (no opt-in)
      // means no policy row is created. Without this, insurance never persisted.
      ...(includeInsurance && insuranceCover > 0
        ? { insurancePolicy: { cover: insuranceCover, premiumMonthly: insurancePremium } }
        : {}),
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
      // Pass the stable per-attempt nonce so a double-submit / reload / retry
      // replays idempotently (0042) rather than minting a duplicate subscriber.
      const result = await subscriberService.createFromSignup(payload, signup.signupNonce);
      subscriberId = result?.subscriberId;
    } catch (err) {
      // Log so the actual RPC error is visible during demos — Supabase RPC
      // errors often carry useful detail in `err.details` / `err.hint` /
      // `err.code` that the toast's top-level message hides.
      console.error('[signup] createFromSignup failed', err);
      addToast(
        'error',
        err?.message || "Couldn't create your account. Please try again.",
      );
      // Re-throw so PaymentStep's `await onComplete(...)` rejects and resets
      // its `processing` state — otherwise the Pay button stays stuck on
      // "Processing…" with no way to retry.
      throw err;
    }

    // 2. Mint the real JWT via the dev-bypass verify-otp route. The subscriber
    //    row now exists, so the route's phone lookup succeeds and the JWT
    //    carries the correct subscriberId claim. We also ship the chosen
    //    password (captured at ReviewStep, held in memory only) so the backend
    //    stamps `users.password_hash` on the same upsert — the returned user
    //    object carries `hasPassword: true` for the persisted auth state.
    try {
      const { token, user } = await verifyOtp(
        canonicalPhone,
        '123456',
        'subscriber',
        signup.password,
      );
      await login({ token, user });
      // Create + verify both succeeded → the nonce is spent. Rotate it now (not
      // only on the Finish→reset path) so that if the user closes the tab before
      // clicking Continue, a later signup on the same browser can't replay this
      // nonce and idempotently return THIS subscriber's id. Safe here because no
      // further createFromSignup runs in this flow; a verify-only retry never
      // reaches this line.
      signup.rotateSignupNonce();
    } catch (err) {
      console.error('[signup] verifyOtp / login failed', err);
      addToast(
        'error',
        err?.message || 'Account created, but sign-in failed. Please sign in to continue.',
      );
      throw err;
    }

    // 3. Capture a snapshot of the fields the All-Set view needs (so the view
    //    survives `signup.reset()` on Continue), then flip into the
    //    `'activated'` phase. `subscriberId` is referenced for diagnostics;
    //    the auth-context JWT already carries it.
    void subscriberId;
    setCompletionSnapshot({
      fullName: signup.fullName,
      phone: canonicalPhone,
      dob: signup.dob,
      gender: signup.gender,
      contributionSchedule: schedule,
      insuranceBeneficiaries: signup.insuranceBeneficiaries ?? [],
    });
    setPhase('activated');
  }

  function handleCancel() {
    navigate('/signup');
  }

  function handleContinue() {
    signup.reset();
    navigate('/dashboard', { replace: true });
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
