import { Navigate, useNavigate } from 'react-router-dom';
import { DashboardProvider } from '../contexts/DashboardContext';
import { BranchScopeProvider } from '../contexts/BranchScopeContext';
import { useAuth } from '../contexts/AuthContext';
import BranchSidebar from './sidebar/BranchSidebar';
import BranchOverview from './overview/BranchOverview';
import CreateAgent from './agent/CreateAgent';
import ViewAgents from '../dashboard/agent/ViewAgents';
import ViewReports from '../dashboard/reports/ViewReports';
import CommissionPanel from '../dashboard/commissions/CommissionPanel';
import Settings from '../dashboard/settings/Settings';
import styles from './BranchDashboardShell.module.css';

function DashboardContent() {
  return (
    <>
      <main className={styles.main} id="main">
        <BranchOverview />
      </main>
      <CreateAgent splitMode />
      <ViewAgents splitMode />
      <ViewReports splitMode />
      <CommissionPanel splitMode />
      <Settings splitMode />
    </>
  );
}

function MissingBranchIdScreen({ onLogout }) {
  return (
    <div className={styles.missingBranch}>
      <div className={styles.missingBranchInner}>
        <h1 className={styles.missingBranchTitle}>Branch not assigned</h1>
        <p className={styles.missingBranchText}>
          Your account doesn&apos;t have a branch on file. Please contact a Distributor Admin to
          assign you to a branch before signing in again.
        </p>
        <button type="button" className={styles.missingBranchBtn} onClick={onLogout}>
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function BranchDashboardShell() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  if (role !== 'branch') return <Navigate to="/coming-soon" replace />;
  const branchId = user?.branchId;
  if (!branchId) {
    return <MissingBranchIdScreen onLogout={() => { logout(); navigate('/'); }} />;
  }
  return (
    <DashboardProvider>
      <BranchScopeProvider branchId={branchId}>
        <div className={styles.shell}>
          <BranchSidebar />
          <DashboardContent />
        </div>
      </BranchScopeProvider>
    </DashboardProvider>
  );
}
