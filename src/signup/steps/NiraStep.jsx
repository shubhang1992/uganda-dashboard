import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useSignup } from '../SignupContext';
import { verifyNira } from '../../services/kyc';
import EducationalLoader from '../EducationalLoader';
import styles from './Step.module.css';
import own from './NiraStep.module.css';

export default function NiraStep({ onNext, onEdit, onAgentFallback }) {
  const signup = useSignup();
  const [state, setState] = useState(signup.niraResult ? 'done' : 'running');

  useEffect(() => {
    if (signup.niraResult) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await verifyNira({
          fullName: signup.fullName,
          nin: signup.nin,
          cardNumber: signup.cardNumber,
          dob: signup.dob,
        });
        if (cancelled) return;
        signup.patch({
          niraResult: res.result,
          niraMismatchedFields: res.mismatchedFields || [],
          niraTrackingId: res.trackingId,
        });
        if (res.result === 'match' || res.result === 'partial') {
          // Show a confirmation beat so the user sees the verdict before
          // the flow advances — prevents the "did something just happen?"
          // confusion of a silent auto-advance.
          setState('verified');
          setTimeout(() => { if (!cancelled) onNext(); }, 1100);
        } else {
          setState('done');
        }
      } catch (err) {
        if (cancelled) return;
        signup.patch({ niraResult: 'no-match' });
        setState('done');
        void err;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result = signup.niraResult;

  /* ── Verified: brief confirmation before auto-advance ───────────────── */
  if (state === 'verified') {
    return (
      <div className={styles.card}>
        <motion.div
          className={own.resultIcon}
          data-kind="success"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
        >
          <svg viewBox="0 0 56 56" width="56" height="56" fill="none" aria-hidden="true">
            <circle cx="28" cy="28" r="26" stroke="currentColor" strokeWidth="2.5"/>
            <motion.path
              d="M17 28l7 7 15-16"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.45, delay: 0.15, ease: EASE_OUT_EXPO }}
            />
          </svg>
        </motion.div>
        <h2 className={styles.heading} style={{ textAlign: 'center' }}>Identity verified</h2>
        <p className={styles.subtext} style={{ textAlign: 'center' }} role="status">
          Your details match NIRA records. Taking you to the next step…
        </p>
      </div>
    );
  }

  /* ── Running: use the wait to educate about pension benefits ────────── */
  if (state === 'running' || !result) {
    return (
      <div className={styles.card}>
        <span className={styles.eyebrow}>Step 3 · Verification</span>
        <h2 className={styles.heading}>Verifying your identity with NIRA</h2>
        <EducationalLoader
          title="Checking NIRA records"
          subtitle="While we verify your details, here's something worth knowing."
        />
      </div>
    );
  }

  /* ── Partial: handled silently — orchestrator auto-advances. Shouldn't render this branch. ── */

  /* ── No match: block + retry + agent fallback ───────────────────────── */
  return (
    <div className={styles.card}>
      <motion.div
        className={own.resultIcon}
        data-kind="error"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
      >
        <svg viewBox="0 0 56 56" width="56" height="56" fill="none" aria-hidden="true">
          <circle cx="28" cy="28" r="26" stroke="currentColor" strokeWidth="2.5"/>
          <path d="M19 19l18 18M37 19L19 37" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
        </svg>
      </motion.div>

      <h2 className={styles.heading} style={{ textAlign: 'center' }}>We couldn’t verify you</h2>
      <p className={styles.subtext} style={{ textAlign: 'center' }}>
        Your details didn’t match an existing record. Check your NIN and date of birth, then try again. If the problem continues, an agent can help in person.
      </p>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.submit}
          onClick={() => {
            signup.patch({ niraResult: null });
            onEdit();
          }}
        >
          Check my details
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={onAgentFallback}>
          Get help from an agent
        </button>
      </div>
    </div>
  );
}
