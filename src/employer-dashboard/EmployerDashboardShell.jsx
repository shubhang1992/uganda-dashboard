// Employer dashboard shell. Cloned from BranchDashboardShell
// (branch → employer): same CSS grid + mobile hamburger/drawer, the same route
// guard, an employerId read with a missing-id fallback, and the provider nest
//   <EmployerDashboardProvider> → <EmployerScopeProvider> → <ShellInner/>.
//
// Panels mount as SIBLINGS of <main> (not nested), each with `splitMode`, so a
// panel can reflow main content beside an open panel: ViewEmployees (which hosts
// its own member list↔detail view in-place), ContributionRuns, InsuranceBenefits,
// PendingKyc, EmployerReports, EmployerSettings, EmployerTickets, and
// OnboardStaffPanel (the invite-a-member flow — creates a tokenized KYC invite
// that onboards an employer-tagged subscriber).

import { useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../utils/motion';
import { EmployerDashboardProvider, useEmployerPanel } from '../contexts/EmployerPanelContext';
import { EmployerScopeProvider } from '../contexts/EmployerScopeContext';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.png';
import EmployerSidebar from './sidebar/EmployerSidebar';
import EmployerOverview from './overview/EmployerOverview';
import ViewEmployees from './employees/ViewEmployees';
import OnboardStaffPanel from './employees/OnboardStaffPanel';
import ContributionRuns from './runs/ContributionRuns';
import InsuranceBenefits from './insurance/InsuranceBenefits';
import PendingKyc from './kyc/PendingKyc';
import EmployerReports from './reports/EmployerReports';
import EmployerTickets from './tickets/EmployerTickets';
import EmployerSettings from './settings/EmployerSettings';
import styles from './EmployerDashboardShell.module.css';

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
        aria-controls="employer-mobile-drawer"
      >
        <span className={styles.hamburgerLine} data-open={menuOpen || undefined} />
        <span className={styles.hamburgerLine} data-open={menuOpen || undefined} />
        <span className={styles.hamburgerLine} data-open={menuOpen || undefined} />
      </button>
    </div>
  );
}

function MobileDrawer({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;

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
            id="employer-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Employer dashboard menu"
            className={styles.drawer}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
          >
            <EmployerSidebar mode="drawer" onNavigate={onClose} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function DashboardContent({ menuOpen, onMenuToggle, onMenuClose }) {
  // Gate each panel on its open flag so its data hooks don't fire on shell cold
  // load. Mounting all panels unconditionally fired ~12-15 Supabase requests at
  // first paint for panels the user hadn't opened (5b.10) — mirrors the gated
  // distributor (DashboardShell) and admin (AdminDashboardShell) shells.
  const {
    employeesOpen,
    runsOpen,
    insuranceOpen,
    kycOpen,
    reportsOpen,
    settingsOpen,
    supportOpen,
    onboardOpen,
  } = useEmployerPanel();
  return (
    <>
      <MobileHeader onMenuToggle={onMenuToggle} menuOpen={menuOpen} />
      <MobileDrawer open={menuOpen} onClose={onMenuClose} />
      <main className={styles.main} id="main">
        <EmployerOverview />
      </main>
      {employeesOpen && <ViewEmployees splitMode />}
      {runsOpen && <ContributionRuns splitMode />}
      {insuranceOpen && <InsuranceBenefits splitMode />}
      {kycOpen && <PendingKyc splitMode />}
      {reportsOpen && <EmployerReports splitMode />}
      {settingsOpen && <EmployerSettings splitMode />}
      {supportOpen && <EmployerTickets splitMode />}
      {onboardOpen && <OnboardStaffPanel splitMode />}
    </>
  );
}

/* Close the drawer automatically on route change (safety net — the sidebar
   already calls `onNavigate` on every leaf click, but a real URL navigation
   should also collapse the drawer). Mirrors BranchDashboardShell. */
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
      <EmployerSidebar />
      <DashboardContent
        menuOpen={menuOpen}
        onMenuToggle={toggleMenu}
        onMenuClose={closeMenu}
      />
    </div>
  );
}

function MissingEmployerIdScreen({ onLogout }) {
  return (
    <div className={styles.missingEmployer}>
      <div className={styles.missingEmployerInner}>
        <h1 className={styles.missingEmployerTitle}>Employer not assigned</h1>
        <p className={styles.missingEmployerText}>
          Your account doesn&apos;t have an employer on file. Please contact an
          administrator to link your account to an employer before signing in again.
        </p>
        <button type="button" className={styles.missingEmployerBtn} onClick={onLogout}>
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function EmployerDashboardShell() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  if (role !== 'employer') return <Navigate to="/coming-soon" replace />;
  const employerId = user?.employerId;
  if (!employerId) {
    return <MissingEmployerIdScreen onLogout={() => { logout(); navigate('/'); }} />;
  }
  return (
    <EmployerDashboardProvider>
      <EmployerScopeProvider employerId={employerId}>
        <ShellInner />
      </EmployerScopeProvider>
    </EmployerDashboardProvider>
  );
}
