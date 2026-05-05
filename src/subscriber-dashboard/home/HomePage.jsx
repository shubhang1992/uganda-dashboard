import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useCurrentSubscriber } from '../../hooks/useSubscriber';
import { useAuth } from '../../contexts/AuthContext';
import PulseCard from './widgets/PulseCard';
import TopUpWidget from './widgets/TopUpWidget';
import ProjectionWidget from './widgets/ProjectionWidget';
import IfYouNeedItWidget from './widgets/IfYouNeedItWidget';
import ActivityWidget from './widgets/ActivityWidget';
import CoPilotWidget from './widgets/CoPilotWidget';
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
  const { user } = useAuth();
  const { data: sub, isLoading } = useCurrentSubscriber();

  if (isLoading || !sub) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    );
  }

  return (
    <motion.div
      className={styles.page}
      variants={stagger}
      initial="initial"
      animate="animate"
    >
      <motion.div variants={item} className={styles.slotPulse}>
        <PulseCard subscriber={sub} user={user} />
      </motion.div>
      <motion.div variants={item} className={styles.slotContrib}>
        <TopUpWidget subscriber={sub} />
      </motion.div>
      <motion.div variants={item} className={styles.slotProjection}>
        <ProjectionWidget subscriber={sub} />
      </motion.div>
      <motion.div variants={item} className={`${styles.slotSafety} ${styles.phoneHide}`}>
        <IfYouNeedItWidget subscriber={sub} />
      </motion.div>
      <motion.div variants={item} className={styles.slotActivity}>
        <ActivityWidget subscriber={sub} />
      </motion.div>
      <motion.div variants={item} className={styles.slotCopilot}>
        <CoPilotWidget />
      </motion.div>
    </motion.div>
  );
}
