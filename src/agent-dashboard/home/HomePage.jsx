import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import HomeDesktop from './HomeDesktop';
import PulseCard from './widgets/PulseCard';
import MonthlyDataCard from './widgets/MonthlyDataCard';
import QuickActions from './widgets/QuickActions';
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
  const { agentId } = useAgentScope();
  const reduceMotion = useReducedMotion();
  const itemVariants = reduceMotion ? undefined : item;

  const isDesktop = useIsDesktop();
  if (isDesktop) return <HomeDesktop />;

  return (
    <motion.div
      className={styles.page}
      variants={reduceMotion ? undefined : stagger}
      initial={reduceMotion ? false : 'initial'}
      animate={reduceMotion ? false : 'animate'}
    >
      <motion.div variants={itemVariants} className={styles.slotPulse}>
        <PulseCard agentId={agentId} />
      </motion.div>
      <motion.div variants={itemVariants} className={styles.slotMonthly}>
        <MonthlyDataCard agentId={agentId} />
      </motion.div>
      <motion.div variants={itemVariants} className={styles.slotActions}>
        <QuickActions />
      </motion.div>
      <motion.div variants={itemVariants} className={styles.slotCopilot}>
        <CoPilotWidget agentId={agentId} />
      </motion.div>
    </motion.div>
  );
}
