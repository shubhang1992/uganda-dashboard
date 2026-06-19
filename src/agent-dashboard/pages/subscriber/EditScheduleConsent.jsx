import OtpVerify from '../../../components/signin/OtpVerify';
import { formatUGPhone } from '../../../utils/phone';
import styles from './EditScheduleConsent.module.css';

/**
 * Consent gate for editing an EXISTING subscriber's contribution schedule.
 * The subscriber must approve the change with a one-time code before the agent
 * can edit — so the agent can't alter a member's plan without their consent.
 *
 * Demo scope: any 6-digit code is accepted (OtpVerify enforces the length); no
 * real SMS is sent, matching the platform's demo OTP behaviour. New-schedule
 * setup and onboarding don't use this gate (the subscriber is present).
 */
export default function EditScheduleConsent({ phone, subscriberName, onVerified, onCancel }) {
  const first = (subscriberName || 'the subscriber').trim().split(/\s+/)[0] || 'the subscriber';

  async function handleVerify() {
    // Demo verification — a short delay so the spinner reads as a real check.
    await new Promise((resolve) => setTimeout(resolve, 450));
    onVerified?.();
  }

  return (
    <div className={styles.gate}>
      <OtpVerify
        phone={phone}
        heading="Confirm with the subscriber"
        subtext={
          <>
            We sent a 6-digit code to <strong>{formatUGPhone(phone)}</strong>. Ask {first} to read it
            back so they approve this change to their schedule.
          </>
        }
        submitLabel="Verify & edit schedule"
        onVerify={handleVerify}
        onResend={async () => {}}
        onBack={onCancel}
      />
    </div>
  );
}
