import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../../utils/motion';
import { formatUGX } from '../../../utils/currency';

import styles from './TopUpWidget.module.css';

export default function TopUpWidget({ subscriber }) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const tap = reduceMotion ? undefined : { scale: 0.99 };
  const schedule = subscriber?.contributionSchedule;
  const hasSchedule = Boolean(schedule?.amount);

  function payScheduled() {
    if (!hasSchedule) return;
    navigate('/dashboard/save', { state: { prefillAmount: schedule.amount } });
  }
  function topUpExtra() {
    navigate('/dashboard/save');
  }
  function setUpSchedule() {
    navigate('/dashboard/save/schedule');
  }

  return (
    <div className={styles.pair}>
      {hasSchedule ? (
        <motion.button
          type="button"
          className={styles.pay}
          onClick={payScheduled}
          whileTap={tap}
          transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none" className={styles.payIcon}>
            <rect x="2.5" y="5" width="15" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M2.5 8.5h15" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          Pay {formatUGX(schedule.amount, { compact: false })}
        </motion.button>
      ) : (
        <motion.button
          type="button"
          className={styles.pay}
          onClick={setUpSchedule}
          whileTap={tap}
          transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" className={styles.payIcon}>
            <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2 6h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Set a schedule
        </motion.button>
      )}

      <motion.button
        type="button"
        className={styles.topUp}
        onClick={topUpExtra}
        whileTap={tap}
        transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" className={styles.topUpIcon}>
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
        Top up extra
      </motion.button>
    </div>
  );
}
