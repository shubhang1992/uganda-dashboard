import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import BottomTabBar from './BottomTabBar';
import SideNav from './SideNav';
import styles from './SubscriberShell.module.css';

export default function SubscriberShell() {
  const location = useLocation();
  return (
    <div className={styles.shell}>
      <SideNav />
      <main className={styles.viewport} id="main">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            className={styles.page}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      <BottomTabBar />
    </div>
  );
}
