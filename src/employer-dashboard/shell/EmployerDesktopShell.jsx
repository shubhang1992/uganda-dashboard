import { lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import NotificationBell from '../../components/notifications/NotificationBell';
import EmployerSideNavDesktop from './EmployerSideNavDesktop';
import EmployerCopilotPanel from './EmployerCopilotPanel';
import OnboardStaffPanel from '../employees/OnboardStaffPanel';
import PendingKyc from '../kyc/PendingKyc';
import { sparkIcon } from '../desktop/icons';
import styles from './EmployerDesktopShell.module.css';

// Pages are lazy-loaded so the Overview doesn't pay for their JS on first paint
// (the shell itself is already lazy one level up, in EmployerDashboardShell).
const OverviewDesktop = lazy(() => import('../desktop/OverviewDesktop'));
const EmployeesDesktop = lazy(() => import('../desktop/EmployeesDesktop'));
const MemberDetailDesktop = lazy(() => import('../desktop/MemberDetailDesktop'));
const RunsDesktop = lazy(() => import('../desktop/RunsDesktop'));
const InsuranceDesktop = lazy(() => import('../desktop/InsuranceDesktop'));
const AnalyticsDesktop = lazy(() => import('../desktop/AnalyticsDesktop'));
const SupportDesktop = lazy(() => import('../desktop/SupportDesktop'));
const SettingsDesktop = lazy(() => import('../desktop/SettingsDesktop'));

const COLLAPSE_KEY = 'employerNavCollapsed';

function PageFallback() {
  return (
    <div className={styles.pageFallback}>
      <div className={styles.spinner} />
    </div>
  );
}

/**
 * DesktopLayout — the persistent chrome (left rail | scrollable content | right
 * AI panel) that wraps every routed employer desktop page via <Outlet/>.
 * Mirrors AgentDesktopShell: collapse state lifted here so the grid reflows;
 * the AI panel is the third grid column (force-collapses the rail while open);
 * "Ask AI" + the notification bell float top-right. Onboard + Pending-KYC reuse
 * their existing slide-in panels as overlays, triggered from pages via
 * useEmployerPanel — so we keep the shipped invite/KYC flows verbatim.
 */
function DesktopLayout() {
  const location = useLocation();
  const viewportRef = useRef(null);
  const askAiRef = useRef(null);
  const copilotId = useId();
  const { employerId } = useEmployerScope();
  const { onboardOpen, kycOpen } = useEmployerPanel();

  const [copilotOpen, setCopilotOpen] = useState(false);
  const toggleCopilot = useCallback(() => setCopilotOpen((prev) => !prev), []);
  const closeCopilot = useCallback(() => {
    setCopilotOpen(false);
    requestAnimationFrame(() => askAiRef.current?.focus());
  }, []);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore persistence failures (private mode, etc.) */
      }
      return next;
    });
  }, []);

  // The scroll container is .viewport, not <body>. Reset its scrollTop on route
  // change before paint so each page lands at the top.
  useLayoutEffect(() => {
    viewportRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  // Flag the document while the desktop shell is mounted so the tight ~8px
  // radius also reaches body-level portals (Onboard/Pending-KYC slide panels,
  // Modal, the NotificationBell popover). Removed on unmount → never present for
  // employer mobile. Matches AgentDesktopShell's body-class trick.
  useEffect(() => {
    document.body.classList.add('employer-desktop-shell');
    return () => document.body.classList.remove('employer-desktop-shell');
  }, []);

  const navCollapsed = collapsed || copilotOpen;

  return (
    <div
      className={`${styles.shell} ${navCollapsed ? styles.shellCollapsed : ''} ${
        copilotOpen ? styles.shellCopilotOpen : ''
      }`}
    >
      <EmployerSideNavDesktop collapsed={navCollapsed} onToggleCollapse={toggleCollapsed} />

      <main ref={viewportRef} className={styles.viewport} id="main">
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

      {employerId && (
        <EmployerCopilotPanel open={copilotOpen} onClose={closeCopilot} panelId={copilotId} />
      )}

      {employerId && (
        <div className={styles.topBar}>
          <button
            ref={askAiRef}
            type="button"
            className={`${styles.askAi} ${copilotOpen ? styles.askAiActive : ''}`}
            onClick={toggleCopilot}
            aria-expanded={copilotOpen}
            aria-controls={copilotId}
          >
            <span className={styles.askAiIcon} aria-hidden="true">{sparkIcon(18)}</span>
            Ask AI
          </button>
          <NotificationBell role="employer" entityId={employerId} align="right" portal />
        </div>
      )}

      {/* Reused slide-in flows, mounted once at the shell root and opened from
          pages via useEmployerPanel. Gated on their open flag so their data
          hooks don't fire on cold load (mirrors the mobile shell). */}
      {onboardOpen && <OnboardStaffPanel />}
      {kycOpen && <PendingKyc />}
    </div>
  );
}

/**
 * EmployerDesktopShell — the desktop (>=1024px) employer dashboard. Rendered by
 * EmployerDashboardShell's RootSwitch when useIsDesktop() is true; the mobile
 * panel shell stays untouched below the breakpoint. Owns its own nested
 * <Routes> (relative to the /dashboard/* splat) so desktop is fully routed while
 * mobile stays route-free.
 */
export default function EmployerDesktopShell() {
  return (
    <Routes>
      <Route element={<DesktopLayout />}>
        <Route index element={<Suspense fallback={<PageFallback />}><OverviewDesktop /></Suspense>} />
        <Route path="employees" element={<Suspense fallback={<PageFallback />}><EmployeesDesktop /></Suspense>} />
        <Route path="employees/:id" element={<Suspense fallback={<PageFallback />}><MemberDetailDesktop /></Suspense>} />
        <Route path="runs" element={<Suspense fallback={<PageFallback />}><RunsDesktop /></Suspense>} />
        <Route path="insurance" element={<Suspense fallback={<PageFallback />}><InsuranceDesktop /></Suspense>} />
        <Route path="analytics" element={<Suspense fallback={<PageFallback />}><AnalyticsDesktop /></Suspense>} />
        <Route path="support" element={<Suspense fallback={<PageFallback />}><SupportDesktop /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<PageFallback />}><SettingsDesktop /></Suspense>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
