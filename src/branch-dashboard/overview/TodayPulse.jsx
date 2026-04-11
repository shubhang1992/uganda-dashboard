import { motion } from 'framer-motion';
import { formatUGX, EASE_OUT_EXPO } from '../../utils/finance';
import styles from './TodayPulse.module.css';

export default function TodayPulse({ metrics, topAgent }) {
  const newToday = metrics.newSubscribersToday || 0;
  const collected = metrics.dailyContributions || 0;
  const topName = topAgent?.name?.split(' ')[0] || '—';
  const topAmount = topAgent?.metrics?.dailyContributions || 0;

  return (
    <motion.div
      className={styles.strip}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3, ease: EASE_OUT_EXPO }}
    >
      {/* Today badge */}
      <div className={styles.badge}>
        <span className={styles.dot} />
        <span className={styles.badgeText}>Today</span>
      </div>

      {/* Metric cards */}
      <div className={styles.cards}>
        <motion.div
          className={styles.card}
          data-accent="green"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35, ease: EASE_OUT_EXPO }}
        >
          <div className={styles.cardIcon} data-accent="green">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="16" height="16">
              <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.75"/>
              <path d="M5 21v-1a7 7 0 0114 0v1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          </div>
          <div className={styles.cardData}>
            <span className={styles.cardNumber}>{newToday}</span>
            <span className={styles.cardLabel}>New Subscribers</span>
          </div>
        </motion.div>

        <motion.div
          className={styles.card}
          data-accent="indigo"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4, ease: EASE_OUT_EXPO }}
        >
          <div className={styles.cardIcon} data-accent="indigo">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="16" height="16">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className={styles.cardData}>
            <span className={styles.cardNumber}>{formatUGX(collected)}</span>
            <span className={styles.cardLabel}>Collected</span>
          </div>
        </motion.div>

        <motion.div
          className={styles.card}
          data-accent="teal"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.45, ease: EASE_OUT_EXPO }}
        >
          <div className={styles.cardIcon} data-accent="teal">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="16" height="16">
              <path d="M12 2l2.09 6.26L20 9.27l-4.91 3.82L16.18 20 12 16.77 7.82 20l1.09-6.91L4 9.27l5.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className={styles.cardData}>
            <span className={styles.cardNumber}>{topName}</span>
            <span className={styles.cardLabel}>Top Agent{topAmount > 0 ? ` · ${formatUGX(topAmount)}` : ''}</span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
