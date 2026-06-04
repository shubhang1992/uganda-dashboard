import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { DashboardNavProvider } from '../contexts/DashboardNavContext';
import { SubscriberPanelProvider } from './SubscriberPanelContext';
import SubscriberShell from './shell/SubscriberShell';
import HomePage from './home/HomePage';
import styles from './SubscriberDashboardShell.module.css';

// Secondary routes are lazy-loaded so the home page doesn't pay for their
// JS on first paint. The shell itself is already lazy-loaded one level up.
const SavePage = lazy(() => import('./pages/SavePage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const WithdrawalsHubPage = lazy(() => import('./pages/WithdrawalsHubPage'));
const WithdrawPage = lazy(() => import('./pages/WithdrawPage'));
const ClaimPage = lazy(() => import('./pages/ClaimPage'));
const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const PoliciesPage = lazy(() => import('./pages/PoliciesPage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));
const AgentPage = lazy(() => import('./pages/AgentPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const NomineesPage = lazy(() => import('./pages/NomineesPage'));
const InsurancePage = lazy(() => import('./pages/InsurancePage'));

function PageFallback() {
  return (
    <div className={styles.fallback}>
      <div className={styles.spinner} />
    </div>
  );
}

export default function SubscriberDashboardShell() {
  const { role } = useAuth();
  // Wrong-role access is sent to /coming-soon — the same convention the agent,
  // branch, and employer shells use (App.jsx also routes role-less users there).
  if (role !== 'subscriber') return <Navigate to="/coming-soon" replace />;
  // Mount the subscriber-scoped panel provider (wraps the generic
  // DashboardPanelProvider). The shared <Settings /> slide-in panel inside
  // SubscriberShell continues to read settingsOpen / setSettingsOpen via
  // useDashboard() against the generic layer; the wrapper keeps a seam open
  // for future subscriber-only panel state (F5 — DASHBOARD_AUDIT.md #27).
  // DashboardNavProvider stays mounted because DashboardPanelProvider depends
  // on it (drill-target refs, onPanelActionRef registration).
  return (
    <DashboardNavProvider>
      <SubscriberPanelProvider>
        <Routes>
          <Route element={<SubscriberShell />}>
            <Route index element={<HomePage />} />
            <Route path="save" element={<Suspense fallback={<PageFallback />}><SavePage /></Suspense>} />
            <Route path="save/schedule" element={<Suspense fallback={<PageFallback />}><SchedulePage /></Suspense>} />
            <Route path="withdraw" element={<Suspense fallback={<PageFallback />}><WithdrawalsHubPage /></Suspense>} />
            <Route path="withdraw/savings" element={<Suspense fallback={<PageFallback />}><WithdrawPage /></Suspense>} />
            <Route path="withdraw/claim" element={<Suspense fallback={<PageFallback />}><ClaimPage /></Suspense>} />
            <Route path="claim" element={<Navigate to="/dashboard/withdraw/claim" replace />} />
            <Route path="activity" element={<Suspense fallback={<PageFallback />}><ActivityPage /></Suspense>} />
            <Route path="reports" element={<Suspense fallback={<PageFallback />}><ReportsPage /></Suspense>} />
            <Route path="reports/:reportId" element={<Suspense fallback={<PageFallback />}><ReportsPage /></Suspense>} />
            <Route path="policies" element={<Suspense fallback={<PageFallback />}><PoliciesPage /></Suspense>} />
            <Route path="help" element={<Suspense fallback={<PageFallback />}><HelpPage /></Suspense>} />
            <Route path="agent" element={<Suspense fallback={<PageFallback />}><AgentPage /></Suspense>} />
            <Route path="settings" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />
            <Route path="settings/profile" element={<Suspense fallback={<PageFallback />}><ProfilePage /></Suspense>} />
            <Route path="settings/nominees" element={<Suspense fallback={<PageFallback />}><NomineesPage /></Suspense>} />
            <Route path="settings/insurance" element={<Suspense fallback={<PageFallback />}><InsurancePage /></Suspense>} />
            {/* settings/notifications was an orphaned StubPage URL (no nav links
                here — the Notifications row on the Settings page is "Soon" and
                disabled). Redirect it back to the Settings page rather than
                stranding visitors on a dead stub. */}
            <Route path="settings/notifications" element={<Navigate to="/dashboard/settings" replace />} />
            {/* settings/security: password change actually works via the shared
                <Settings /> slide-in panel, which the Settings page opens from
                its "Password & security" row (setSettingsOpen). This URL has no
                dedicated surface, so redirect to the real Settings page. */}
            <Route path="settings/security" element={<Navigate to="/dashboard/settings" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </SubscriberPanelProvider>
    </DashboardNavProvider>
  );
}
