import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SubscriberShell from './shell/SubscriberShell';
import HomePage from './home/HomePage';
import SavePage from './pages/SavePage';
import SchedulePage from './pages/SchedulePage';
import WithdrawalsHubPage from './pages/WithdrawalsHubPage';
import WithdrawPage from './pages/WithdrawPage';
import ClaimPage from './pages/ClaimPage';
import ProjectionPage from './pages/ProjectionPage';
import ActivityPage from './pages/ActivityPage';
import ReportsPage from './pages/ReportsPage';
import HelpPage from './pages/HelpPage';
import AgentPage from './pages/AgentPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import NomineesPage from './pages/NomineesPage';
import InsurancePage from './pages/InsurancePage';
import StubPage from './pages/StubPage';

export default function SubscriberDashboardShell() {
  const { role } = useAuth();
  if (role !== 'subscriber') return <Navigate to="/dashboard" replace />;
  return (
    <Routes>
      <Route element={<SubscriberShell />}>
        <Route index element={<HomePage />} />
        <Route path="save" element={<SavePage />} />
        <Route path="save/schedule" element={<SchedulePage />} />
        <Route path="withdraw" element={<WithdrawalsHubPage />} />
        <Route path="withdraw/savings" element={<WithdrawPage />} />
        <Route path="withdraw/claim" element={<ClaimPage />} />
        <Route path="claim" element={<Navigate to="/dashboard/withdraw/claim" replace />} />
        <Route path="projection" element={<ProjectionPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="reports/:reportId" element={<ReportsPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="agent" element={<AgentPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/profile" element={<ProfilePage />} />
        <Route path="settings/nominees" element={<NomineesPage />} />
        <Route path="settings/insurance" element={<InsurancePage />} />
        <Route path="settings/notifications" element={<StubPage title="Notifications" />} />
        <Route path="settings/security" element={<StubPage title="Security" />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
