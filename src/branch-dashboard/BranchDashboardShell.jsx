import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navigate, useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO } from '../utils/finance';
import { DashboardProvider, useDashboard } from '../contexts/DashboardContext';
import { BranchScopeProvider } from '../contexts/BranchScopeContext';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.png';
import BranchSidebar from './sidebar/BranchSidebar';
import BranchOverview from './overview/BranchOverview';
import CreateAgent from './agent/CreateAgent';
import ViewAgents from '../dashboard/agent/ViewAgents';
import ViewReports from '../dashboard/reports/ViewReports';
import CommissionPanel from '../dashboard/commissions/CommissionPanel';
import Settings from '../dashboard/settings/Settings';
import styles from './BranchDashboardShell.module.css';

const DRAWER_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'create-agent', label: 'Create New Agent' },
  { id: 'view-agents', label: 'View Existing Agents' },
  { id: 'commissions', label: 'Commissions' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
];

function MobileHeader({ onMenuToggle, menuOpen }) {
  return (
    <div className={styles.mobileHeader}>
      <img src={logo} alt="Universal Pensions" className={styles.mobileHeaderLogo} width={120} height={36} />
      <button
        className={styles.hamburger}
        onClick={onMenuToggle}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
      >
        <span className={styles.hamburgerLine} data-open={menuOpen} />
        <span className={styles.hamburgerLine} data-open={menuOpen} />
        <span className={styles.hamburgerLine} data-open={menuOpen} />
      </button>
    </div>
  );
}

function MobileDrawer({ open, onClose }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const {
    setViewAgentsOpen,
    setCreateAgentOpen,
    setViewReportsOpen,
    setCommissionsOpen,
    setSettingsOpen,
    setDrillTargetAgentId,
  } = useDashboard();

  useEffect(() => {
    if (!open) return;
    function handleEsc(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  function closeAllPanels() {
    setViewAgentsOpen(false);
    setCreateAgentOpen(false);
    setViewReportsOpen(false);
    setCommissionsOpen(false);
    setSettingsOpen(false);
  }

  function handleItem(id) {
    onClose();
    closeAllPanels();

    switch (id) {
      case 'create-agent':
        setCreateAgentOpen(true);
        break;
      case 'view-agents':
        setDrillTargetAgentId(null);
        setViewAgentsOpen(true);
        break;
      case 'commissions':
        setCommissionsOpen(true);
        break;
      case 'reports':
        setViewReportsOpen(true);
        break;
      case 'settings':
        setSettingsOpen(true);
        break;
      default:
        break;
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={styles.drawerOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.div
            className={styles.drawer}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
          >
            <nav className={styles.drawerNav}>
              {DRAWER_ITEMS.map((item) => (
                <button key={item.id} className={styles.drawerItem} onClick={() => handleItem(item.id)}>
                  {item.label}
                </button>
              ))}
            </nav>
            <button
              className={styles.drawerLogout}
              onClick={() => { onClose(); logout(); navigate('/'); }}
            >
              Log out
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

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
  const [menuOpen, setMenuOpen] = useState(false);
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
          <MobileHeader onMenuToggle={() => setMenuOpen(!menuOpen)} menuOpen={menuOpen} />
          <MobileDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
          <DashboardContent />
        </div>
      </BranchScopeProvider>
    </DashboardProvider>
  );
}
