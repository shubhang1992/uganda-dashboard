import { useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import Settings from '../../dashboard/settings/Settings';
import SideNav from './SideNav';
import SubscriberTopBar from './SubscriberTopBar';
import styles from './SubscriberDesktopShell.module.css';

// The Home tab-root (HomeDesktop) lays out a wide KPI row + 2-up widget grid, so
// it gets the full content canvas. Every other subscriber route is a focused
// flow / list / detail view whose mobile layout reads best in a comfortable
// centred reading column — keeping those un-migrated pages from stretching their
// cards (and their now-flattened hero heading) edge-to-edge.
function isHomeRoute(pathname) {
  return pathname === '/dashboard' || pathname === '/dashboard/';
}

/**
 * SubscriberDesktopShell — the >=1024px subscriber dashboard chrome. Mirrors
 * AgentDesktopShell: a CSS-grid [240px sidebar][1fr] layout with the routed
 * content scrolling in the right column beneath a slim SubscriberTopBar.
 *
 * Reuses the shipped SideNav rail (already styled for desktop) rather than a
 * bespoke desktop nav — the subscriber rail needs no notification bell (the
 * dashboard has no in-app notifications), so SideNav already carries everything
 * the desktop rail needs.
 *
 * The content column width is route-aware: wide for Home (the dashboard
 * overview), a centred reading column everywhere else.
 */
export default function SubscriberDesktopShell() {
  const location = useLocation();
  const viewportRef = useRef(null);

  // The actual scroll container is .viewport (overflow-y: auto), not <body>.
  // Reset its scrollTop on route change before paint so each page lands at top.
  useLayoutEffect(() => {
    viewportRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  const wide = isHomeRoute(location.pathname);

  return (
    <div className={styles.shell}>
      <SideNav />
      <main ref={viewportRef} className={styles.viewport} id="main">
        <SubscriberTopBar />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            className={`${styles.page} ${wide ? styles.pageWide : ''}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      {/* Shared slide-in Settings panel — same component as the mobile subscriber
          shell. Opens whenever settingsOpen flips true in DashboardPanelContext.
          Mounted exactly once at the shell root. */}
      <Settings />
    </div>
  );
}
