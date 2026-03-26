import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../utils/finance';
import { DashboardProvider } from '../contexts/DashboardContext';
import { useApp } from '../contexts/AppContext';
import logo from '../assets/logo.png';
import Sidebar from './sidebar/Sidebar';
import UgandaMap from './map/UgandaMap';
import OverlayPanel from './overlay/OverlayPanel';
import Breadcrumb from './overlay/Breadcrumb';
import MetricsRow from './cards/MetricsRow';
import TopBar from './overlay/TopBar';
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
  return (
    <div className={styles.mobileHeader}>
      <div className={styles.mobileHeaderLeft}>
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
  const { exitDashboard } = useApp();
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
              onClick={() => { onClose(); exitDashboard(); }}
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
      </div>
    </DashboardProvider>
  );
}
