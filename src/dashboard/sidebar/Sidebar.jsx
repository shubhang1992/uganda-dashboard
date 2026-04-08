import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboard } from '../../contexts/DashboardContext';
import styles from './Sidebar.module.css';

const MOBILE_NAV = [
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
    id: 'branches',
    label: 'Branches',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <path d="M3 21h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <path d="M5 21V7l7-4 7 4v14" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
        <rect x="9" y="13" width="6" height="8" rx="1" stroke="currentColor" strokeWidth="1.75"/>
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
    id: 'subscribers',
    label: 'Subscribers',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M5 21v-1a7 7 0 0114 0v1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
];

const NAV_ITEMS = [
  ...MOBILE_NAV,
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

const BRANCH_SUB = [
  {
    id: 'create-branch',
    label: 'Create New Branch',
    desc: 'Set up a new branch location',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'view-branches',
    label: 'View Existing Branches',
    desc: 'Manage and monitor all branches',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
        <path d="M3 21h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <path d="M5 21V7l7-4 7 4v14" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
        <rect x="9" y="13" width="6" height="8" rx="1" stroke="currentColor" strokeWidth="1.75" />
      </svg>
    ),
  },
];

const AGENT_SUB = [
  {
    id: 'view-agents',
    label: 'View Existing Agents',
    desc: 'Manage and monitor all agents',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
        <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.75" />
        <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="18" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.75" />
        <path d="M21 21v-1.5a3 3 0 00-3-3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const [hovered, setHovered] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { section, reset, branchMenuOpen, setBranchMenuOpen, createBranchOpen, setCreateBranchOpen, viewBranchesOpen, setViewBranchesOpen, agentMenuOpen, setAgentMenuOpen, viewAgentsOpen, setViewAgentsOpen, setDrillTargetBranchId, setDrillTargetAgentId, viewReportsOpen, setViewReportsOpen, commissionsOpen, setCommissionsOpen } = useDashboard();
  const [active, setActive] = useState('overview');

  // Sync active state when reports panel opens/closes
  useEffect(() => {
    if (viewReportsOpen) setActive('reports');
    else if (active === 'reports') setActive('overview');
  }, [viewReportsOpen]);

  // Sync active state when commissions panel opens/closes
  useEffect(() => {
    if (commissionsOpen) setActive('commissions');
    else if (active === 'commissions') setActive('overview');
  }, [commissionsOpen]);

  // Keep branch submenu open while a branch panel is visible
  useEffect(() => {
    if (createBranchOpen || viewBranchesOpen) {
      setBranchMenuOpen(true);
      setActive('branches');
    }
  }, [createBranchOpen, viewBranchesOpen]);

  // Keep agent submenu open while agent panel is visible
  useEffect(() => {
    if (viewAgentsOpen) {
      setAgentMenuOpen(true);
      setActive('agents');
    }
  }, [viewAgentsOpen]);

  const closeMore = useCallback(() => setMoreOpen(false), []);

  // Track when a panel just closed to give the submenu a grace period
  const panelClosedAt = useRef(0);
  const prevBranchPanel = useRef(false);
  const prevAgentPanel = useRef(false);

  useEffect(() => {
    const wasBranchOpen = prevBranchPanel.current;
    const wasAgentOpen = prevAgentPanel.current;
    const isBranchOpen = createBranchOpen || viewBranchesOpen;
    const isAgentOpen = viewAgentsOpen;
    prevBranchPanel.current = isBranchOpen;
    prevAgentPanel.current = isAgentOpen;
    if ((wasBranchOpen && !isBranchOpen) || (wasAgentOpen && !isAgentOpen)) {
      panelClosedAt.current = Date.now();
    }
  }, [createBranchOpen, viewBranchesOpen, viewAgentsOpen]);

  /* Close submenus on outside click — keep open when related panel is visible or just closed */
  useEffect(() => {
    if (!branchMenuOpen && !agentMenuOpen) return;
    const handler = () => {
      // Grace period: don't close submenu within 500ms of a panel closing
      if (Date.now() - panelClosedAt.current < 500) return;
      if (branchMenuOpen && !createBranchOpen && !viewBranchesOpen) setBranchMenuOpen(false);
      if (agentMenuOpen && !viewAgentsOpen) setAgentMenuOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [branchMenuOpen, agentMenuOpen, createBranchOpen, viewBranchesOpen, viewAgentsOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    const handler = () => closeMore();
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [moreOpen, closeMore]);

  function handleClick(id) {
    setMoreOpen(false);
    if (id === 'branches') {
      setAgentMenuOpen(false);
      setViewReportsOpen(false);
      setCommissionsOpen(false);
      setBranchMenuOpen((prev) => !prev);
      setActive(id);
      return;
    }
    if (id === 'agents') {
      setBranchMenuOpen(false);
      setViewReportsOpen(false);
      setCommissionsOpen(false);
      setAgentMenuOpen((prev) => !prev);
      setActive(id);
      return;
    }
    setBranchMenuOpen(false);
    setAgentMenuOpen(false);
    if (id === 'logout') {
      logout();
      navigate('/');
      return;
    }
    if (id === 'overview') {
      setViewReportsOpen(false);
      reset();
    }
    if (id === 'commissions') {
      setViewReportsOpen(false);
      setCommissionsOpen(true);
      setActive(id);
      return;
    }
    if (id === 'reports') {
      setCommissionsOpen(false);
      setViewReportsOpen(true);
      setActive(id);
      return;
    }
    setViewReportsOpen(false);
    setCommissionsOpen(false);
    setActive(id);
  }

  function handleBranchSub(subId) {
    if (subId === 'create-branch') {
      setViewBranchesOpen(false);
      setDrillTargetBranchId(null);
      setCreateBranchOpen(true);
    } else if (subId === 'view-branches') {
      setCreateBranchOpen(false);
      setDrillTargetBranchId(null);
      setViewBranchesOpen(true);
    }
  }

  function handleAgentSub(subId) {
    if (subId === 'view-agents') {
      setDrillTargetAgentId(null);
      setViewAgentsOpen(true);
    }
  }

  return (
    <nav className={styles.sidebar}>
      <div className={styles.logo}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="24" height="24">
          <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
          <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      <div className={styles.navItems}>
        {NAV_ITEMS.map((item) => (
          <div key={item.id} className={styles.navBtnWrap}>
            <button
              className={styles.navBtn}
              data-active={active === item.id}
              onClick={(e) => { if (item.id === 'branches' || item.id === 'agents') e.stopPropagation(); handleClick(item.id); }}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered(null)}
              title={item.label}
              aria-label={item.label}
              {...(item.id === 'branches' ? { 'aria-expanded': branchMenuOpen } : {})}
              {...(item.id === 'agents' ? { 'aria-expanded': agentMenuOpen } : {})}
            >
              <span className={styles.iconWrap}>{item.icon}</span>
              {hovered === item.id && !branchMenuOpen && !agentMenuOpen && (
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

            {/* Branch submenu flyout */}
            {item.id === 'branches' && (
              <AnimatePresence>
                {branchMenuOpen && (
                  <motion.div
                    className={styles.subMenu}
                    initial={{ opacity: 0, x: -8, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -8, scale: 0.96 }}
                    transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className={styles.subMenuArrow} />
                    <div className={styles.subMenuHeader}>
                      <span className={styles.subMenuTitle}>Branches</span>
                      <span className={styles.subMenuCount}>310</span>
                    </div>
                    <div className={styles.subMenuDivider} />
                    {BRANCH_SUB.map((sub, i) => {
                      const isActive = (sub.id === 'create-branch' && createBranchOpen) || (sub.id === 'view-branches' && viewBranchesOpen);
                      return (
                        <motion.button
                          key={sub.id}
                          className={styles.subMenuItem}
                          data-active={isActive}
                          onClick={() => handleBranchSub(sub.id)}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: 0.06 * (i + 1), ease: EASE_OUT_EXPO }}
                        >
                          <span className={styles.subMenuIcon}>{sub.icon}</span>
                          <div className={styles.subMenuText}>
                            <span className={styles.subMenuLabel}>{sub.label}</span>
                            <span className={styles.subMenuDesc}>{sub.desc}</span>
                          </div>
                        </motion.button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            )}

            {/* Agent submenu flyout */}
            {item.id === 'agents' && (
              <AnimatePresence>
                {agentMenuOpen && (
                  <motion.div
                    className={styles.subMenu}
                    initial={{ opacity: 0, x: -8, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -8, scale: 0.96 }}
                    transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className={styles.subMenuArrow} />
                    <div className={styles.subMenuHeader}>
                      <span className={styles.subMenuTitle}>Agents</span>
                      <span className={styles.subMenuCount}>2,036</span>
                    </div>
                    <div className={styles.subMenuDivider} />
                    {AGENT_SUB.map((sub, i) => {
                      const isActive = sub.id === 'view-agents' && viewAgentsOpen;
                      return (
                        <motion.button
                          key={sub.id}
                          className={styles.subMenuItem}
                          data-active={isActive}
                          onClick={() => handleAgentSub(sub.id)}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: 0.06 * (i + 1), ease: EASE_OUT_EXPO }}
                        >
                          <span className={styles.subMenuIcon}>{sub.icon}</span>
                          <div className={styles.subMenuText}>
                            <span className={styles.subMenuLabel}>{sub.label}</span>
                            <span className={styles.subMenuDesc}>{sub.desc}</span>
                          </div>
                        </motion.button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        ))}
      </div>

      {/* Desktop bottom items */}
      <div className={styles.bottomItems}>
        {BOTTOM_ITEMS.map((item) => (
          <button
            key={item.id}
            className={styles.navBtn}
            data-active={active === item.id}
            onClick={() => handleClick(item.id)}
            onMouseEnter={() => setHovered(item.id)}
            onMouseLeave={() => setHovered(null)}
            title={item.label}
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
          <button
            key={item.id}
            className={styles.mobileBtn}
            data-active={active === item.id}
            onClick={() => handleClick(item.id)}
            aria-label={item.label}
          >
            <span className={styles.iconWrap}>{item.icon}</span>
            <span className={styles.mobileLabel}>{item.label}</span>
          </button>
        ))}
        {/* More button */}
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
