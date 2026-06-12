import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { useIsDesktop } from '../../hooks/useIsDesktop';
import { useCurrentSubscriber } from '../../hooks/useSubscriber';
import ErrorCard from '../../components/feedback/ErrorCard';
import HomeDesktop from './HomeDesktop';
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
  const isDesktop = useIsDesktop();
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

  // >=1024px renders the dedicated wide desktop overview (KPI row + 2-up widget
  // grid). The mobile stacked layout below is left exactly as shipped. Gated
  // here (not in the shell) so the loading / error / no-account guards above run
  // once for both layouts and HomeDesktop always receives a resolved subscriber.
  if (isDesktop) return <HomeDesktop subscriber={sub} />;

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
