import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useSignup } from '../SignupContext';
import { verifyNira } from '../../services/kyc';
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
          // Partial match silently flags for back-office review but continues.
          setTimeout(() => { if (!cancelled) onNext(); }, 500);
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

  /* ── Running: silent loader, no technical detail ────────────────────── */
  if (state === 'running' || !result) {
    return (
      <div className={styles.card}>
        <span className={styles.eyebrow}>Step 3 · Verification</span>
        <h2 className={styles.heading}>Verifying your details</h2>
        <p className={styles.subtext}>
          This takes a few seconds. Please keep this page open.
        </p>

        <div className={own.loader}>
          <motion.div
            className={own.pulse}
            animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.55, 0.3] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className={own.core}
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <svg aria-hidden="true" viewBox="0 0 32 32" width="32" height="32" fill="none">
              <path d="M16 3l12 5v7c0 7.4-5.1 14.3-12 16-6.9-1.7-12-8.6-12-16V8l12-5z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
              <path d="M11 16l4 4 7-8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </motion.div>
        </div>
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
