import { useState } from 'react';
import { motion, useScroll, useMotionValueEvent, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../utils/finance';
import styles from './StickyMobileCTA.module.css';

export default function StickyMobileCTA() {
  const [visible, setVisible] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, 'change', (latest) => {
    // Show after scrolling past the hero (~600px)
    setVisible(latest > 600);
  });

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={styles.bar}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
        >
          <a href="#start" className={styles.cta}>Start saving today</a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
