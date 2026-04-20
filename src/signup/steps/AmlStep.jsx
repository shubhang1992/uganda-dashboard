import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useSignup } from '../SignupContext';
import { screenAml } from '../../services/kyc';
import EducationalLoader from '../EducationalLoader';
import styles from './Step.module.css';
import own from './AmlStep.module.css';

export default function AmlStep({ onNext, onFlagged }) {
  const signup = useSignup();
  const [state, setState] = useState('running');

  useEffect(() => {
    if (signup.amlResult === 'clear') {
      setState('cleared');
      const t = setTimeout(onNext, 1100);
      return () => clearTimeout(t);
    }
    if (signup.amlResult === 'flagged') {
      onFlagged();
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await screenAml({
          fullName: signup.fullName,
          dob: signup.dob,
          nin: signup.nin,
        });
        if (cancelled) return;
        signup.patch({
          amlResult: res.outcome,
          amlTrackingId: res.trackingId,
        });
        if (res.outcome === 'clear') {
          setState('cleared');
          setTimeout(() => { if (!cancelled) onNext(); }, 1100);
        } else {
          setTimeout(() => { if (!cancelled) onFlagged(); }, 500);
        }
      } catch {
        // Fail-safe: treat an unknown result as flagged so we don't auto-approve anyone
        if (cancelled) return;
        signup.patch({ amlResult: 'flagged' });
        setTimeout(() => { if (!cancelled) onFlagged(); }, 500);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === 'cleared') {
    return (
      <div className={styles.card}>
        <motion.div
          className={own.resultIcon}
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
        <h2 className={styles.heading} style={{ textAlign: 'center' }}>Background check passed</h2>
        <p className={styles.subtext} style={{ textAlign: 'center' }} role="status">
          You're cleared. Moving on to beneficiaries…
        </p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <span className={styles.eyebrow}>Step 6 · Background check</span>
      <h2 className={styles.heading}>Running a quick compliance check</h2>
      <EducationalLoader
        title="Screening compliance lists"
        subtitle="This usually takes a few seconds. Here's why this step matters."
      />
    </div>
  );
}
