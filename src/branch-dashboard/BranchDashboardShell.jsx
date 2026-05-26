import { useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../utils/motion';
import { DashboardProvider } from '../contexts/DashboardContext';
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

function MobileHeader({ onMenuToggle, menuOpen }) {
  return (
    <div className={styles.mobileHeader}>
      <img
        src={logo}
        alt="Universal Pensions"
        className={styles.mobileHeaderLogo}
        width={120}
        height={36}
      />
      <button
        type="button"
        className={styles.hamburger}
        onClick={onMenuToggle}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
        aria-controls="branch-mobile-drawer"
      >
        <span className={styles.hamburgerLine} data-open={menuOpen || undefined} />
        <span className={styles.hamburgerLine} data-open={menuOpen || undefined} />
        <span className={styles.hamburgerLine} data-open={menuOpen || undefined} />
      </button>
    </div>
  );
}

function MobileDrawer({ open, onClose }) {
  // Lock body scroll + listen for Escape while the drawer is open.
  // Cleanup restores the previous `body.style.overflow` value so we don't
  // permanently change page behavior if some other code set it.
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={styles.drawerOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.aside
            id="branch-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Branch dashboard menu"
            className={styles.drawer}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
          >
            <BranchSidebar mode="drawer" onNavigate={onClose} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function DashboardContent({ menuOpen, onMenuToggle, onMenuClose }) {
  return (
    <>
      <MobileHeader onMenuToggle={onMenuToggle} menuOpen={menuOpen} />
      <MobileDrawer open={menuOpen} onClose={onMenuClose} />
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

/* Close the drawer automatically on route change (safety net — the
   BranchSidebar already calls `onNavigate` on every leaf click, but a
   real URL navigation should also collapse the drawer no matter how
   it was triggered). Pattern mirrors `src/dashboard/DashboardShell.jsx`. */
function useAutoCloseOnRouteChange(open, onClose) {
  const location = useLocation();
  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
}

function ShellInner() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const toggleMenu = useCallback(() => setMenuOpen((prev) => !prev), []);

  useAutoCloseOnRouteChange(menuOpen, closeMenu);

  return (
    <div className={styles.shell}>
      <BranchSidebar />
      <DashboardContent
        menuOpen={menuOpen}
        onMenuToggle={toggleMenu}
        onMenuClose={closeMenu}
      />
    </div>
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
        <ShellInner />
      </BranchScopeProvider>
    </DashboardProvider>
  );
}
