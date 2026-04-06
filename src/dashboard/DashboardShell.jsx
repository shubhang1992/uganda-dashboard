import { useState } from 'react';
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
import styles from './DashboardShell.module.css';

const DRAWER_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'branches', label: 'Branches' },
  { id: 'agents', label: 'Agents' },
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
            <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
              <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
        <img src={logo} alt="Universal Pensions" className={styles.mobileHeaderLogo} />
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
                <button key={item.id} className={styles.drawerItem} onClick={onClose}>
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

export default function DashboardShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <DashboardProvider>
      <div className={styles.shell}>
        <Sidebar />
        <MobileHeader onMenuToggle={() => setMenuOpen(!menuOpen)} menuOpen={menuOpen} />
        <MobileDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
        <div className={styles.main}>
          <UgandaMap />
          <Breadcrumb />
          <OverlayPanel />
          <TopBar />
          <MetricsRow />
        </div>
        <CreateBranch />
        <ViewBranches />
        <ViewAgents />
      </div>
    </DashboardProvider>
  );
}
