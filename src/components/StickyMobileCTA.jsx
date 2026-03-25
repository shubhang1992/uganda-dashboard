import { useState } from 'react';
import { motion, useScroll, useMotionValueEvent, AnimatePresence } from 'framer-motion';
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
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <a href="#start" className={styles.cta}>Start saving today</a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
