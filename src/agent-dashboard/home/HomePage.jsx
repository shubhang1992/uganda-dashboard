import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import PortfolioPulseCard from './widgets/PortfolioPulseCard';
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

  return (
    <motion.div className={styles.page} variants={stagger} initial="initial" animate="animate">
      <motion.div variants={item} className={styles.slotPulse}>
        <PortfolioPulseCard agentId={agentId} />
      </motion.div>
      <motion.div variants={item} className={styles.slotCopilot}>
        <CoPilotWidget agentId={agentId} />
      </motion.div>
    </motion.div>
  );
}
