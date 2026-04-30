import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboard } from '../../contexts/DashboardContext';
import logoWhite from '../../assets/logo-white.png';
import styles from './BranchSidebar.module.css';

const NAV_ITEMS = [
  {
    id: 'overview',
    label: 'Overview',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.75"/>
        <rect x="13" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.75"/>
        <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.75"/>
        <rect x="13" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.75"/>
      </svg>
    ),
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <circle cx="18" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M21 21v-1.5a3 3 0 00-3-3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'commissions',
    label: 'Commissions',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M2 10h20" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M6 15h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <path d="M14 15h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <path d="M3 3v18h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M7 14l4-4 4 4 5-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

const BOTTOM_ITEMS = [
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'logout',
    label: 'Log out',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <polyline points="16,17 21,12 16,7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
];

const MOBILE_NAV = NAV_ITEMS.slice(0, 3);

const MORE_ITEMS = [
  {
    id: 'reports',
    label: 'Reports',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
        <path d="M3 3v18h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M7 14l4-4 4 4 5-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'logout',
    label: 'Log out',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <polyline points="16,17 21,12 16,7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
];

export default function BranchSidebar() {
  const [hovered, setHovered] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [agentPopover, setAgentPopover] = useState(false);
  const agentPopoverRef = useRef(null);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const {
    viewAgentsOpen, setViewAgentsOpen,
    createAgentOpen, setCreateAgentOpen,
    viewReportsOpen, setViewReportsOpen,
    commissionsOpen, setCommissionsOpen,
    settingsOpen, setSettingsOpen,
    setDrillTargetAgentId,
  } = useDashboard();
  // `active` is derived from which panel is open — no setState-in-effect needed.
  const active = useMemo(() => {
    if (viewAgentsOpen || createAgentOpen) return 'agents';
    if (viewReportsOpen) return 'reports';
    if (commissionsOpen) return 'commissions';
    if (settingsOpen) return 'settings';
    return 'overview';
  }, [viewAgentsOpen, createAgentOpen, viewReportsOpen, commissionsOpen, settingsOpen]);

  const closeMore = useCallback(() => setMoreOpen(false), []);

  useEffect(() => {
    if (!moreOpen) return;
    const handler = () => closeMore();
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [moreOpen, closeMore]);

  // Close agent popover on outside click
  useEffect(() => {
    if (!agentPopover) return;
    function handler(e) {
      if (agentPopoverRef.current && !agentPopoverRef.current.contains(e.target)) {
        setAgentPopover(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [agentPopover]);

  function closeAllPanels() {
    setViewAgentsOpen(false);
    setCreateAgentOpen(false);
    setViewReportsOpen(false);
    setCommissionsOpen(false);
    setSettingsOpen(false);
  }

  function handleClick(id) {
    setMoreOpen(false);
    setAgentPopover(false);

    if (id === 'overview') {
      closeAllPanels();
      return;
    }
    if (id === 'agents') {
      setAgentPopover((prev) => !prev);
      return;
    }
    if (id === 'create-agent') {
      closeAllPanels();
      setCreateAgentOpen(true);
      return;
    }
    if (id === 'view-agents') {
      closeAllPanels();
      setDrillTargetAgentId(null);
      setViewAgentsOpen(true);
      return;
    }
    if (id === 'commissions') {
      closeAllPanels();
      setCommissionsOpen(true);
      return;
    }
    if (id === 'reports') {
      closeAllPanels();
      setViewReportsOpen(true);
      return;
    }
    if (id === 'settings') {
      closeAllPanels();
      setSettingsOpen(true);
      return;
    }
    if (id === 'logout') {
      logout();
      navigate('/');
      return;
    }
  }

  return (
    <nav className={styles.sidebar}>
      <div className={styles.logo}>
        <img src={logoWhite} alt="Universal Pensions" width="30" height="30" className={styles.logoImg} />
      </div>

      <div className={styles.navItems}>
        {NAV_ITEMS.map((item) => (
          <div key={item.id} style={{ position: 'relative' }} ref={item.id === 'agents' ? agentPopoverRef : undefined}>
            <button
              className={styles.navBtn}
              data-active={active === item.id}
              onClick={() => handleClick(item.id)}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered(null)}
              aria-label={item.label}
            >
              <span className={styles.iconWrap}>{item.icon}</span>
              {hovered === item.id && !agentPopover && (
                <motion.span
                  className={styles.tooltip}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {item.label}
                </motion.span>
              )}
            </button>
            {item.id === 'agents' && (
              <AnimatePresence>
                {agentPopover && (
                  <motion.div
                    className={styles.agentPopover}
                    initial={{ opacity: 0, x: -6, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -6, scale: 0.96 }}
                    transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
                  >
                    <button className={styles.popoverItem} onClick={() => handleClick('create-agent')}>
                      <span className={styles.popoverIcon}>
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                          <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.75"/>
                          <path d="M5 21v-1a7 7 0 0114 0v1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                          <path d="M19 4v4M17 6h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                        </svg>
                      </span>
                      Create New Agent
                    </button>
                    <button className={styles.popoverItem} onClick={() => handleClick('view-agents')}>
                      <span className={styles.popoverIcon}>
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                          <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.75"/>
                          <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                          <circle cx="18" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.75"/>
                          <path d="M21 21v-1.5a3 3 0 00-3-3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                        </svg>
                      </span>
                      View Existing Agents
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        ))}
      </div>

      <div className={styles.bottomItems}>
        {BOTTOM_ITEMS.map((item) => (
          <button
            key={item.id}
            className={styles.navBtn}
            data-active={active === item.id}
            onClick={() => handleClick(item.id)}
            onMouseEnter={() => setHovered(item.id)}
            onMouseLeave={() => setHovered(null)}
            aria-label={item.label}
          >
            <span className={styles.iconWrap}>{item.icon}</span>
            {hovered === item.id && (
              <motion.span
                className={styles.tooltip}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
              >
                {item.label}
              </motion.span>
            )}
          </button>
        ))}
      </div>

      {/* Mobile tab bar */}
      <div className={styles.mobileBar}>
        {MOBILE_NAV.map((item) => (
          <div key={item.id} style={{ position: 'relative', flex: 1, display: 'flex' }} ref={item.id === 'agents' ? agentPopoverRef : undefined}>
            <button
              className={styles.mobileBtn}
              data-active={active === item.id}
              onClick={() => handleClick(item.id)}
              aria-label={item.label}
            >
              <span className={styles.iconWrap}>{item.icon}</span>
              <span className={styles.mobileLabel}>{item.label}</span>
            </button>
            {item.id === 'agents' && (
              <AnimatePresence>
                {agentPopover && (
                  <motion.div
                    className={styles.agentPopoverMobile}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                  >
                    <button className={styles.popoverItem} onClick={() => handleClick('create-agent')}>
                      <span className={styles.popoverIcon}>
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                          <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.75"/>
                          <path d="M5 21v-1a7 7 0 0114 0v1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                          <path d="M19 4v4M17 6h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                        </svg>
                      </span>
                      Create New Agent
                    </button>
                    <button className={styles.popoverItem} onClick={() => handleClick('view-agents')}>
                      <span className={styles.popoverIcon}>
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                          <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.75"/>
                          <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                          <circle cx="18" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.75"/>
                          <path d="M21 21v-1.5a3 3 0 00-3-3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                        </svg>
                      </span>
                      View Existing Agents
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        ))}
        <div className={styles.moreWrap}>
          <button
            className={styles.mobileBtn}
            data-active={moreOpen}
            onClick={(e) => { e.stopPropagation(); setMoreOpen(!moreOpen); }}
            aria-label="More options"
          >
            <span className={styles.iconWrap}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
                <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
                <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
              </svg>
            </span>
            <span className={styles.mobileLabel}>More</span>
          </button>
          <AnimatePresence>
            {moreOpen && (
              <motion.div
                className={styles.moreMenu}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                onClick={(e) => e.stopPropagation()}
              >
                {MORE_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    className={styles.moreItem}
                    onClick={() => handleClick(item.id)}
                  >
                    <span className={styles.moreIcon}>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </nav>
  );
}
