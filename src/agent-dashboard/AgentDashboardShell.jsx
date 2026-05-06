import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AgentScopeProvider } from '../contexts/AgentScopeContext';
import { useAuth } from '../contexts/AuthContext';
import AgentShell from './shell/AgentShell';
import HomePage from './home/HomePage';
import OnboardPage from './pages/OnboardPage';
import SubscribersPage from './pages/SubscribersPage';
import SubscriberDetailPage from './pages/SubscriberDetailPage';
import SubscriberSchedulePage from './pages/SubscriberSchedulePage';
import AnalyticsPage from './pages/AnalyticsPage';
import CommissionsPage from './pages/CommissionsPage';
import SettingsPage from './pages/SettingsPage';
import styles from './AgentDashboardShell.module.css';

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
          <Route path="onboard" element={<OnboardPage />} />
          <Route path="subscribers" element={<SubscribersPage />} />
          <Route path="subscribers/:id" element={<SubscriberDetailPage />} />
          <Route path="subscribers/:id/schedule" element={<SubscriberSchedulePage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="commissions" element={<CommissionsPage />} />
          <Route path="commissions/:view" element={<CommissionsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </AgentScopeProvider>
  );
}
