import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import styles from './YourGoalCard.module.css';

export default function YourGoalCard() {
  const { setYourGoalOpen, closeAllPanels } = useDashboard();

  function openPlanner() {
    closeAllPanels();
    setYourGoalOpen(true);
  }

  return (
    <motion.button
      type="button"
      className={styles.card}
      onClick={openPlanner}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2, ease: EASE_OUT_EXPO }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.995 }}
    >
      {/* Decorative trajectory visual */}
      <svg
        aria-hidden="true"
        className={styles.trajectory}
        viewBox="0 0 320 120"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="goal-traj" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#A5B4FC" stopOpacity="0" />
            <stop offset="50%" stopColor="#A5B4FC" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#5EEAD4" stopOpacity="0.7" />
          </linearGradient>
          <linearGradient id="goal-traj-fill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(165, 180, 252, 0.14)" />
            <stop offset="100%" stopColor="rgba(165, 180, 252, 0)" />
          </linearGradient>
        </defs>
        <path
          d="M0 110 C 80 110 120 80 160 58 S 260 18 320 6 L 320 120 L 0 120 Z"
          fill="url(#goal-traj-fill)"
        />
        <path
          d="M0 110 C 80 110 120 80 160 58 S 260 18 320 6"
          stroke="url(#goal-traj)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="320" cy="6" r="5" fill="#5EEAD4" />
        <circle cx="320" cy="6" r="10" fill="#5EEAD4" opacity="0.25" />
      </svg>

      <div className={styles.content}>
        <div className={styles.textCol}>
          <span className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden="true" />
            Plan ahead
          </span>
          <h3 className={styles.title}>What are you saving for?</h3>
          <p className={styles.subtitle}>
            Pick a goal and see whether your current pace will get you there — or how much more to contribute if it won&apos;t.
          </p>
        </div>

        <div className={styles.cta}>
          <span className={styles.ctaLabel}>Plan my goal</span>
          <span className={styles.ctaArrow} aria-hidden="true">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>
    </motion.button>
  );
}
