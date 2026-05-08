import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AgentScopeProvider } from '../contexts/AgentScopeContext';
import { useAuth } from '../contexts/AuthContext';
import AgentShell from './shell/AgentShell';
import HomePage from './home/HomePage';
import styles from './AgentDashboardShell.module.css';

// Secondary routes are lazy-loaded so the home page doesn't pay for their
// JS on first paint. The shell itself is already lazy-loaded one level up.
const OnboardPage = lazy(() => import('./pages/OnboardPage'));
const SubscribersPage = lazy(() => import('./pages/SubscribersPage'));
const SubscriberDetailPage = lazy(() => import('./pages/SubscriberDetailPage'));
const SubscriberSchedulePage = lazy(() => import('./pages/SubscriberSchedulePage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const CommissionsPage = lazy(() => import('./pages/CommissionsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function PageFallback() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-8) var(--space-4)',
      minHeight: '40vh',
    }}>
      <div style={{
        width: 28,
        height: 28,
        border: '2.5px solid var(--color-lavender)',
        borderTopColor: 'var(--color-indigo)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
    </div>
  );
}

function MissingAgentIdScreen({ onLogout }) {
  return (
    <div className={styles.missingAgent}>
      <div className={styles.missingAgentInner}>
        <h1 className={styles.missingAgentTitle}>Agent profile not found</h1>
        <p className={styles.missingAgentText}>
          Your account isn&apos;t linked to an agent record yet. Please ask your Branch Admin to
          finish setting up your profile before signing in again.
        </p>
        <button type="button" className={styles.missingAgentBtn} onClick={onLogout}>
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function AgentDashboardShell() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  if (role !== 'agent') return <Navigate to="/coming-soon" replace />;
  const agentId = user?.agentId;
  if (!agentId) {
    return <MissingAgentIdScreen onLogout={() => { logout(); navigate('/'); }} />;
  }
  return (
    <AgentScopeProvider agentId={agentId}>
      <Routes>
        <Route element={<AgentShell />}>
          <Route index element={<HomePage />} />
          <Route path="onboard" element={<Suspense fallback={<PageFallback />}><OnboardPage /></Suspense>} />
          <Route path="subscribers" element={<Suspense fallback={<PageFallback />}><SubscribersPage /></Suspense>} />
          <Route path="subscribers/:id" element={<Suspense fallback={<PageFallback />}><SubscriberDetailPage /></Suspense>} />
          <Route path="subscribers/:id/schedule" element={<Suspense fallback={<PageFallback />}><SubscriberSchedulePage /></Suspense>} />
          <Route path="analytics" element={<Suspense fallback={<PageFallback />}><AnalyticsPage /></Suspense>} />
          <Route path="commissions" element={<Suspense fallback={<PageFallback />}><CommissionsPage /></Suspense>} />
          <Route path="commissions/:view" element={<Suspense fallback={<PageFallback />}><CommissionsPage /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </AgentScopeProvider>
  );
}
