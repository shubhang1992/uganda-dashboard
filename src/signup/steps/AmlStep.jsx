import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSignup } from '../SignupContext';
import { screenAml } from '../../services/kyc';
import styles from './Step.module.css';
import own from './AmlStep.module.css';

export default function AmlStep({ onNext, onFlagged }) {
  const signup = useSignup();

  useEffect(() => {
    if (signup.amlResult === 'clear') {
      onNext();
      return;
    }
    if (signup.amlResult === 'flagged') {
      onFlagged();
      return;
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
          setTimeout(() => { if (!cancelled) onNext(); }, 500);
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

  return (
    <div className={styles.card}>
      <span className={styles.eyebrow}>Step 6 · Background check</span>
      <h2 className={styles.heading}>Running a quick check</h2>
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
            <circle cx="14" cy="14" r="8" stroke="currentColor" strokeWidth="1.75"/>
            <path d="M20 20l6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
        </motion.div>
      </div>
    </div>
  );
}
