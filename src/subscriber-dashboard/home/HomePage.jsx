import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { useCurrentSubscriber } from '../../hooks/useSubscriber';
import ErrorCard from '../../components/feedback/ErrorCard';
import PulseCard from './widgets/PulseCard';
import EmployerBenefitsWidget from './widgets/EmployerBenefitsWidget';
import TopUpWidget from './widgets/TopUpWidget';
import CoPilotWidget from './widgets/CoPilotWidget';
import PoliciesWidget from './widgets/PoliciesWidget';
import ActivityWidget from './widgets/ActivityWidget';
import IfYouNeedItWidget from './widgets/IfYouNeedItWidget';
import styles from './HomePage.module.css';

const stagger = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const item = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT_EXPO } },
};

export default function HomePage() {
  const reduceMotion = useReducedMotion();
  const { data: sub, isLoading, isError, error, refetch } = useCurrentSubscriber();

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    );
  }
  if (isError) {
    return (
      <div className={styles.loading}>
        <ErrorCard
          title="We couldn't load your account"
          message={error}
          onRetry={refetch}
        />
      </div>
    );
  }
  if (!sub) {
    return (
      <div className={styles.loading}>
        <ErrorCard
          title="No account found"
          message="We couldn't find a subscriber profile for your sign-in. Please sign in again or contact support."
        />
      </div>
    );
  }

  const itemVariants = reduceMotion ? undefined : item;

  return (
    <motion.div
      className={styles.page}
      variants={reduceMotion ? undefined : stagger}
      initial={reduceMotion ? false : 'initial'}
      animate={reduceMotion ? false : 'animate'}
    >
      <motion.div variants={itemVariants} className={styles.slotPulse}>
        <PulseCard subscriber={sub} />
      </motion.div>
      {sub.employerId && (
        <motion.div variants={itemVariants} className={styles.slotPulse}>
          <EmployerBenefitsWidget subscriber={sub} />
        </motion.div>
      )}
      <motion.div variants={itemVariants} className={styles.slotContrib}>
        <TopUpWidget subscriber={sub} />
      </motion.div>
      <motion.div variants={itemVariants} className={styles.slotCopilot}>
        <CoPilotWidget />
      </motion.div>
      <motion.div variants={itemVariants} className={styles.slotPolicies}>
        <PoliciesWidget subscriber={sub} />
      </motion.div>
      <motion.div variants={itemVariants} className={styles.slotActivity}>
        <ActivityWidget subscriber={sub} />
      </motion.div>
      <motion.div variants={itemVariants} className={`${styles.slotSafety} ${styles.phoneHide}`}>
        <IfYouNeedItWidget subscriber={sub} />
      </motion.div>
    </motion.div>
  );
}
