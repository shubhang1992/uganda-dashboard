import { Navigate, useNavigate } from 'react-router-dom';
import { DashboardProvider } from '../contexts/DashboardContext';
import { BranchScopeProvider } from '../contexts/BranchScopeContext';
import { useAuth } from '../contexts/AuthContext';
import { useIsDesktop } from '../hooks/useIsDesktop';
import BranchDesktopShell from './shell/BranchDesktopShell';
import BranchMobileShell from './shell/BranchMobileShell';
import styles from './BranchDashboardShell.module.css';

/* Desktop (>=1024px) gets the routed 3-column rail/content/Copilot shell; mobile
   (<1024px) gets the routed phone shell — persistent app bar + bottom nav + bottom
   sheets. Both own a nested <Routes> over the same /dashboard/* sub-paths
   (overview · agents · agents/:id · commissions · analytics · support · settings),
   so a deep link resolves in either form factor. The pre-redesign hamburger-drawer
   + slide-in-panel mobile experience was replaced by BranchMobileShell. */
function ShellInner() {
  const isDesktop = useIsDesktop();
  return isDesktop ? <BranchDesktopShell /> : <BranchMobileShell />;
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
        <ShellInner />
      </BranchScopeProvider>
    </DashboardProvider>
  );
}
