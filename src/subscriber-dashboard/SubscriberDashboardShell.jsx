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
const ProjectionPage = lazy(() => import('./pages/ProjectionPage'));
// ActivityPage was a lighter parallel of the AllTransactions report (no date
// range, no search, no export). Rather than maintain two views of the same
// data, /dashboard/activity now redirects users to the full report view.
// Keep the import commented out for future revival rather than deleted.
// const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));
const AgentPage = lazy(() => import('./pages/AgentPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const NomineesPage = lazy(() => import('./pages/NomineesPage'));
const InsurancePage = lazy(() => import('./pages/InsurancePage'));
const StubPage = lazy(() => import('./pages/StubPage'));

function PageFallback() {
  return (
    <div className={styles.fallback}>
      <div className={styles.spinner} />
    </div>
  );
}

export default function SubscriberDashboardShell() {
  const { role } = useAuth();
  if (role !== 'subscriber') return <Navigate to="/dashboard" replace />;
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
            <Route path="projection" element={<Suspense fallback={<PageFallback />}><ProjectionPage /></Suspense>} />
            <Route path="activity" element={<Navigate to="/dashboard/reports/all-transactions" replace />} />
            <Route path="reports" element={<Suspense fallback={<PageFallback />}><ReportsPage /></Suspense>} />
            <Route path="reports/:reportId" element={<Suspense fallback={<PageFallback />}><ReportsPage /></Suspense>} />
            <Route path="help" element={<Suspense fallback={<PageFallback />}><HelpPage /></Suspense>} />
            <Route path="agent" element={<Suspense fallback={<PageFallback />}><AgentPage /></Suspense>} />
            <Route path="settings" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />
            <Route path="settings/profile" element={<Suspense fallback={<PageFallback />}><ProfilePage /></Suspense>} />
            <Route path="settings/nominees" element={<Suspense fallback={<PageFallback />}><NomineesPage /></Suspense>} />
            <Route path="settings/insurance" element={<Suspense fallback={<PageFallback />}><InsurancePage /></Suspense>} />
            <Route path="settings/notifications" element={<Suspense fallback={<PageFallback />}><StubPage title="Notifications" /></Suspense>} />
            <Route path="settings/security" element={<Suspense fallback={<PageFallback />}><StubPage title="Security" /></Suspense>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </SubscriberPanelProvider>
    </DashboardNavProvider>
  );
}
