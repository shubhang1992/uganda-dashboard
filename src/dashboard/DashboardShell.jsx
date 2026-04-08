import { useState, useEffect, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO } from '../utils/finance';
import { DashboardProvider, useDashboard } from '../contexts/DashboardContext';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.png';
import Sidebar from './sidebar/Sidebar';
import UgandaMap from './map/UgandaMap';
import OverlayPanel from './overlay/OverlayPanel';
import Breadcrumb from './overlay/Breadcrumb';
import MetricsRow from './cards/MetricsRow';
import TopBar from './overlay/TopBar';
import CreateBranch from './branch/CreateBranch';
import ViewBranches from './branch/ViewBranches';
import ViewAgents from './agent/ViewAgents';
import ViewReports from './reports/ViewReports';
import styles from './DashboardShell.module.css';

const MQ = '(max-width: 768px)';
function subscribeMQ(cb) {
  const mql = window.matchMedia(MQ);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}
function getIsMobile() { return window.matchMedia(MQ).matches; }
function useIsMobile() { return useSyncExternalStore(subscribeMQ, getIsMobile); }

const DRAWER_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'branches', label: 'View Branches' },
  { id: 'agents', label: 'View Agents' },
  { id: 'subscribers', label: 'Subscribers' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
];

function MobileHeader({ onMenuToggle, menuOpen }) {
  const { level, drillUp, reset } = useDashboard();
  const isDeep = level !== 'country';

  function handleBack() {
    if (level === 'region') reset();
    else drillUp(level);
  }

  return (
    <div className={styles.mobileHeader}>
      <div className={styles.mobileHeaderLeft}>
        {isDeep && (
          <button className={styles.backBtn} onClick={handleBack} aria-label="Go back">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
              <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
        <img src={logo} alt="Universal Pensions" className={styles.mobileHeaderLogo} width={120} height={36} />
      </div>
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
    reset,
    setBranchMenuOpen, setCreateBranchOpen, setViewBranchesOpen,
    setAgentMenuOpen, setViewAgentsOpen,
    setViewReportsOpen,
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
    // Close all panels first
    setBranchMenuOpen(false);
    setAgentMenuOpen(false);
    setViewBranchesOpen(false);
    setViewAgentsOpen(false);
    setCreateBranchOpen(false);
    setViewReportsOpen(false);

    switch (id) {
      case 'overview':
        reset();
        break;
      case 'branches':
        setViewBranchesOpen(true);
        break;
      case 'agents':
        setViewAgentsOpen(true);
        break;
      case 'reports':
        setViewReportsOpen(true);
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
  const isMobile = useIsMobile();
  return (
    <>
      <div className={styles.main}>
        {!isMobile && <UgandaMap />}
        <Breadcrumb />
        <OverlayPanel />
        <TopBar />
        <MetricsRow />
      </div>
      <CreateBranch />
      <ViewBranches />
      <ViewAgents />
      <ViewReports />
    </>
  );
}

export default function DashboardShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <DashboardProvider>
      <div className={styles.shell}>
        <Sidebar />
        <MobileHeader onMenuToggle={() => setMenuOpen(!menuOpen)} menuOpen={menuOpen} />
        <MobileDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
        <DashboardContent />
      </div>
    </DashboardProvider>
  );
}
