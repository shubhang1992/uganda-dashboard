import { motion } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGXExact, normalizeFrequency } from '../../utils/finance';
import styles from './OnboardingComplete.module.css';

const FREQUENCY_LABEL = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'half-yearly': 'Half-yearly',
  annually: 'Annually',
};

function formatSchedule(schedule) {
  if (!schedule || !schedule.amount) return null;
  const freq = FREQUENCY_LABEL[normalizeFrequency(schedule.frequency)] || 'Monthly';
  const split = `${schedule.retirementPct ?? 80}% retirement / ${100 - (schedule.retirementPct ?? 80)}% emergency`;
  return `${freq} · ${formatUGXExact(schedule.amount)} · ${split}`;
}

export default function OnboardingComplete({ subscriberName, awareness, schedule, onAnother, onClose }) {
  const correctCount = Object.values(awareness?.answers || {}).filter((v) => v === true).length;
  const firstName = subscriberName.trim().split(/\s+/)[0] || 'New subscriber';
  const scheduleSummary = formatSchedule(schedule);

  return (
    <div className={styles.wrap}>
      <motion.div
        className={styles.successIcon}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 56 56" width="56" height="56" fill="none">
          <motion.circle
            cx="28" cy="28" r="26"
            stroke="currentColor" strokeWidth="2"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
            fill="none"
          />
          <motion.path
            d="M16 29l8 8 16-18"
            stroke="currentColor" strokeWidth="3"
            strokeLinecap="round" strokeLinejoin="round"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.5, ease: EASE_OUT_EXPO }}
          />
        </svg>
      </motion.div>

      <motion.h3
        className={styles.title}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5, ease: EASE_OUT_EXPO }}
      >
        {firstName} is enrolled
      </motion.h3>

      <motion.p
        className={styles.lead}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6, ease: EASE_OUT_EXPO }}
      >
        The subscriber&apos;s record is created and KYC has been submitted. They&apos;ll receive a welcome SMS with their member ID and next steps shortly.
      </motion.p>

      <motion.dl
        className={styles.summary}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.7, ease: EASE_OUT_EXPO }}
      >
        <div className={styles.summaryRow}>
          <dt>Subscriber</dt>
          <dd>{subscriberName || 'New Subscriber'}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt>Awareness check</dt>
          <dd>{correctCount}/5 answered correctly</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt>KYC status</dt>
          <dd>
            <span className={styles.kycPill}>Submitted</span>
          </dd>
        </div>
        {scheduleSummary && (
          <div className={styles.summaryRow}>
            <dt>Contribution schedule</dt>
            <dd>{scheduleSummary}</dd>
          </div>
        )}
      </motion.dl>

      <motion.div
        className={styles.actions}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.85, ease: EASE_OUT_EXPO }}
      >
        <button type="button" className={styles.primaryBtn} onClick={onAnother}>
          Onboard another subscriber
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={onClose}>
          Close
        </button>
      </motion.div>
    </div>
  );
}
