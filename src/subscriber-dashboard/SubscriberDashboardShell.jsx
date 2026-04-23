import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navigate, useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO } from '../utils/finance';
import { DashboardProvider, useDashboard } from '../contexts/DashboardContext';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.png';
import SubscriberSidebar from './sidebar/SubscriberSidebar';
import SubscriberOverview from './overview/SubscriberOverview';
import ContributePanel from './panels/ContributePanel';
import WithdrawPanel from './panels/WithdrawPanel';
import InsurancePanel from './panels/InsurancePanel';
import NomineesPanel from './panels/NomineesPanel';
import HelpDeskPanel from './panels/HelpDeskPanel';
import ContributionSettingsPanel from './panels/ContributionSettingsPanel';
import GoalPlannerPanel from './panels/GoalPlannerPanel';
import SubscriberReports from './reports/SubscriberReports';
import Settings from '../dashboard/settings/Settings';
import styles from './SubscriberDashboardShell.module.css';

const DRAWER_ITEMS = [
  { id: 'overview', label: 'Home' },
  { id: 'contribute', label: 'Make a Contribution' },
  { id: 'withdraw', label: 'Withdraw' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'nominees', label: 'Nominees' },
  { id: 'reports', label: 'Reports' },
  { id: 'help', label: 'Help Desk' },
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
    setContributeOpen,
    setWithdrawOpen,
    setInsuranceOpen,
    setNomineesOpen,
    setHelpOpen,
    setSubscriberReportsOpen,
    setSettingsOpen,
    closeAllPanels,
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

  function handleItem(id) {
    onClose();
    closeAllPanels();

    switch (id) {
      case 'contribute':
        setContributeOpen(true);
        break;
      case 'withdraw':
        setWithdrawOpen(true);
        break;
      case 'insurance':
        setInsuranceOpen(true);
        break;
      case 'nominees':
        setNomineesOpen(true);
        break;
      case 'reports':
        setSubscriberReportsOpen(true);
        break;
      case 'help':
        setHelpOpen(true);
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
        <SubscriberOverview />
      </main>
      <ContributePanel splitMode />
      <WithdrawPanel splitMode />
      <InsurancePanel splitMode />
      <NomineesPanel splitMode />
      <SubscriberReports splitMode />
      <HelpDeskPanel splitMode />
      <ContributionSettingsPanel splitMode />
      <GoalPlannerPanel splitMode />
      <Settings splitMode />
    </>
  );
}

export default function SubscriberDashboardShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { role } = useAuth();
  if (role !== 'subscriber') return <Navigate to="/dashboard" replace />;
  return (
    <DashboardProvider>
      <div className={styles.shell}>
        <SubscriberSidebar />
        <MobileHeader onMenuToggle={() => setMenuOpen(!menuOpen)} menuOpen={menuOpen} />
        <MobileDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
        <DashboardContent />
      </div>
    </DashboardProvider>
  );
}
