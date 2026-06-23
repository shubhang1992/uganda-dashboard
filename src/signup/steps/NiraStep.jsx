import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { useSignup } from '../SignupContext';
import { useOnboardAudience } from '../OnboardAudienceContext';
import { verifyNira } from '../../services/kyc';
import EducationalLoader from '../EducationalLoader';
import styles from './Step.module.css';
import own from './NiraStep.module.css';

const FIELD_LABELS = {
  dob: 'Date of birth',
  fullName: 'Full name',
  nin: 'National ID number',
  cardNumber: 'Card number',
};

export default function NiraStep({ onNext, onEdit, onAgentFallback }) {
  const signup = useSignup();
  const isAgent = useOnboardAudience() === 'agent';
  const [state, setState] = useState(() => {
    if (!signup.niraResult) return 'running';
    if (signup.niraResult === 'partial') return 'partial';
    if (signup.niraResult === 'match') return 'done';
    return 'done';
  });

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
          sessionId: signup.onboardingSessionId,
        });
        if (cancelled) return;
        signup.patch({
          niraResult: res.result,
          niraMismatchedFields: res.mismatchedFields || [],
          niraTrackingId: res.trackingId,
        });
        if (res.result === 'match') {
          // Show a confirmation beat so the user sees the verdict before
          // the flow advances — prevents the "did something just happen?"
          // confusion of a silent auto-advance.
          setState('verified');
          setTimeout(() => { if (!cancelled) onNext(); }, 1100);
        } else if (res.result === 'partial') {
          // Don't auto-advance on a partial match — surface the mismatch so
          // the user can decide to fix it or proceed flagged-for-review.
          setState('partial');
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
        <h2 className={`${styles.heading} textCenter`}>Identity verified</h2>
        <p className={`${styles.subtext} textCenter`} role="status">
          {isAgent
            ? "The subscriber's details match NIRA records. Moving on…"
            : 'Your details match NIRA records. Taking you to the next step…'}
        </p>
      </div>
    );
  }

  /* ── Running: use the wait to educate about pension benefits ────────── */
  if (state === 'running' || !result) {
    return (
      <div className={styles.card}>
        <span className={styles.eyebrow}>Step 3 · Verification</span>
        <h2 className={styles.heading}>
          {isAgent ? 'Verifying with NIRA' : 'Verifying your identity with NIRA'}
        </h2>
        <EducationalLoader
          title="Checking NIRA records"
          subtitle="While we verify your details, here's something worth knowing."
        />
      </div>
    );
  }

  /* ── Partial: surface mismatched fields, let user choose next step ───── */
  if (state === 'partial') {
    const mismatched = signup.niraMismatchedFields || [];
    return (
      <div className={styles.card}>
        <motion.div
          className={own.resultIcon}
          data-kind="warn"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
        >
          <svg viewBox="0 0 56 56" width="56" height="56" fill="none" aria-hidden="true">
            <circle cx="28" cy="28" r="26" stroke="currentColor" strokeWidth="2.5"/>
            <path d="M28 16v14M28 38v2" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
          </svg>
        </motion.div>

        <h2 className={`${styles.heading} textCenter`}>
          We need to double-check one thing
        </h2>
        <p className={`${styles.subtext} textCenter`}>
          {isAgent
            ? 'NIRA found their record but flagged a small difference:'
            : 'NIRA found your record but flagged a small difference:'}
        </p>

        {mismatched.length > 0 && (
          <ul className={own.mismatchList}>
            {mismatched.map((f) => (
              <li key={f}>{FIELD_LABELS[f] || f}</li>
            ))}
          </ul>
        )}

        <p className={`${styles.subtext} textCenter`}>
          You can correct the field and re-verify, or continue — your application will be flagged for a quick back-office review.
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.submit}
            onClick={() => {
              signup.patch({ niraResult: null, niraMismatchedFields: [] });
              onEdit();
            }}
          >
            Fix and re-verify
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={onNext}>
            Continue (flagged for review)
          </button>
        </div>
      </div>
    );
  }

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

      <h2 className={`${styles.heading} textCenter`}>
        {isAgent ? 'Couldn’t verify the subscriber' : 'We couldn’t verify you'}
      </h2>
      <p className={`${styles.subtext} textCenter`}>
        {isAgent
          ? 'Their details didn’t match an existing record. Check the NIN and date of birth, then try again. If the problem continues, an agent can help in person.'
          : 'Your details didn’t match an existing record. Check your NIN and date of birth, then try again. If the problem continues, an agent can help in person.'}
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
