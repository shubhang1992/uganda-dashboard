import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useSignup } from '../SignupContext';
import styles from './Step.module.css';
import own from './ActivatedStep.module.css';

export default function ActivatedStep({ onFinish }) {
  const { fullName, phone } = useSignup();
  const firstName = fullName.trim().split(/\s+/)[0] || 'there';
  const maskedPhone = phone
    ? `+256 ${phone.slice(0, 1)}XX XXX ${phone.slice(6)}`
    : '';

  return (
    <div className={styles.card}>
      <motion.div
        className={own.successIcon}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.55, ease: EASE_OUT_EXPO }}
      >
        <svg viewBox="0 0 72 72" width="72" height="72" fill="none" aria-hidden="true">
          <motion.circle
            cx="36" cy="36" r="34"
            stroke="currentColor" strokeWidth="2.5"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
            fill="none"
          />
          <motion.path
            d="M22 37l10 10 19-21"
            stroke="currentColor" strokeWidth="3.5"
            strokeLinecap="round" strokeLinejoin="round"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.6 }}
          />
        </svg>
      </motion.div>

      <motion.h2
        className={styles.heading}
        style={{ textAlign: 'center' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5, ease: EASE_OUT_EXPO }}
      >
        You’re all set, {firstName}
      </motion.h2>
      <motion.p
        className={styles.subtext}
        style={{ textAlign: 'center' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.65, ease: EASE_OUT_EXPO }}
      >
        Your account is active at <strong>Tier 1</strong>. You can upgrade to Tier 2 anytime by uploading additional documents.
      </motion.p>

      <motion.div
        className={own.summary}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.85, ease: EASE_OUT_EXPO }}
      >
        <div className={own.summaryRow}>
          <span className={own.summaryLabel}>Name</span>
          <span className={own.summaryValue}>{fullName || '—'}</span>
        </div>
        <div className={own.summaryRow}>
          <span className={own.summaryLabel}>Mobile money</span>
          <span className={own.summaryValue}>{maskedPhone || '—'}</span>
        </div>
        <div className={own.summaryRow}>
          <span className={own.summaryLabel}>Status</span>
          <span className={own.tierBadge}>Tier 1 · Active</span>
        </div>
      </motion.div>

      <motion.div
        className={own.nextBox}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 1.0, ease: EASE_OUT_EXPO }}
      >
        <span className={own.nextEyebrow}>Next up</span>
        <strong className={own.nextTitle}>Make your first contribution</strong>
        <p className={own.nextBody}>
          Top up from your mobile money wallet to start earning. You can contribute any amount — small and regular works best.
        </p>
      </motion.div>

      <motion.div
        className={styles.actions}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 1.15 }}
      >
        <button type="button" className={styles.submit} onClick={onFinish}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
            <rect x="2" y="6" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.75"/>
            <path d="M2 10h20" stroke="currentColor" strokeWidth="1.75"/>
            <circle cx="17" cy="15" r="1.5" fill="currentColor"/>
          </svg>
          Make first contribution
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={onFinish}>
          I’ll do this later
        </button>
      </motion.div>
    </div>
  );
}
