import { useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import Settings from '../../dashboard/settings/Settings';
import AgentSideNavDesktop from './AgentSideNavDesktop';
import AgentTopBar from './AgentTopBar';
import styles from './AgentDesktopShell.module.css';

export default function AgentDesktopShell() {
  const location = useLocation();
  const viewportRef = useRef(null);

  // The actual scroll container is .viewport (overflow-y: auto), not <body>.
  // Reset its scrollTop on route change before paint so each page lands at top.
  useLayoutEffect(() => {
    viewportRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className={styles.shell}>
      <AgentSideNavDesktop />
      <main ref={viewportRef} className={styles.viewport} id="main">
        <AgentTopBar />
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
      {/* Shared slide-in Settings panel — same component as the mobile agent
          shell. Opens whenever settingsOpen flips true in
          DashboardPanelContext. Mounted exactly once at the shell root. */}
      <Settings />
    </div>
  );
}
