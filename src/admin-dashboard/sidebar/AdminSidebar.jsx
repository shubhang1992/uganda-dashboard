import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { formatNumber } from '../../utils/currency';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboard } from '../../contexts/DashboardContext';
import { useAdminPanel } from '../../contexts/AdminPanelContext';
import { usePlatformOverview } from '../../hooks/useEntity';
// Reuse the distributor sidebar's styles verbatim so the admin rail is pixel-
// identical to the map-theme it mirrors.
import styles from '../../dashboard/sidebar/Sidebar.module.css';

function formatCount(n) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  return formatNumber(n);
}

// Admin-exclusive rail items (platform-wide managers). Rendered before the
// reused entity views so the admin's primary actions lead.
const ADMIN_NAV = [
  {
    id: 'distributors',
    label: 'Distributors',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75"/>
        <circle cx="12" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="12" cy="21" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="3" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="21" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M12 4.5v4.5M12 15v4.5M4.5 12H9M15 12h4.5" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    id: 'employers',
    label: 'Employers',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M3 10h18" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="1.75"/>
      </svg>
    ),
  },
];

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
  ...ADMIN_NAV,
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
    id: 'tickets',
    label: 'Support',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <path d="M4 5a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2H9l-5 4V5z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
        <path d="M8 8h8M8 11.5h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
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

// Admin does NOT create branches — branches.INSERT is RLS-gated to the
// distributor role (branches_insert_distributor); admin's create path is
// distributors + employers (via SECURITY DEFINER RPCs). So the admin Branches
// submenu is view-only (no "Create New Branch", which would RLS-fail).
const BRANCH_SUB = [
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

const SUBSCRIBER_SUB = [
  {
    id: 'view-subscribers',
    label: 'View Existing Subscribers',
    desc: 'Browse and manage all subscribers',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.75" />
        <path d="M5 21v-1a7 7 0 0114 0v1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function AdminSidebar() {
  const [hovered, setHovered] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const {
    reset,
    branchMenuOpen, setBranchMenuOpen, createBranchOpen, setCreateBranchOpen,
    viewBranchesOpen, setViewBranchesOpen, agentMenuOpen, setAgentMenuOpen,
    viewAgentsOpen, setViewAgentsOpen, subscriberMenuOpen, setSubscriberMenuOpen,
    viewSubscribersOpen, setViewSubscribersOpen, setDrillTargetBranchId,
    setDrillTargetAgentId, viewReportsOpen, setViewReportsOpen, commissionsOpen,
    setCommissionsOpen, settingsOpen, setSettingsOpen, viewTicketsOpen, setViewTicketsOpen,
  } = useDashboard();
  const {
    viewDistributorsOpen, setViewDistributorsOpen, createDistributorOpen, setCreateDistributorOpen,
    viewEmployersOpen, setViewEmployersOpen, createEmployerOpen, setCreateEmployerOpen,
    closeAllPanels: adminCloseAllPanels,
  } = useAdminPanel();

  // True platform totals power the submenu count labels (single RPC call,
  // 5-min staleTime). Uses get_platform_overview so the subscriber count is the
  // platform total (incl. employer-onboarded), not the agent-tree-only rollup.
  const { data: platform } = usePlatformOverview();
  const branchCount = formatCount(platform?.branches ?? 0);
  const agentCount = formatCount(platform?.agents ?? 0);
  const subscriberCount = formatCount(platform?.totalSubscribers ?? 0);

  const active = useMemo(() => {
    if (viewDistributorsOpen || createDistributorOpen) return 'distributors';
    if (viewEmployersOpen || createEmployerOpen) return 'employers';
    if (viewTicketsOpen) return 'tickets';
    if (viewReportsOpen) return 'reports';
    if (commissionsOpen) return 'commissions';
    if (settingsOpen) return 'settings';
    if (branchMenuOpen) return 'branches';
    if (agentMenuOpen) return 'agents';
    if (subscriberMenuOpen) return 'subscribers';
    return 'overview';
  }, [
    viewDistributorsOpen, createDistributorOpen, viewEmployersOpen, createEmployerOpen,
    viewTicketsOpen, viewReportsOpen, commissionsOpen, settingsOpen,
    branchMenuOpen, agentMenuOpen, subscriberMenuOpen,
  ]);

  const closeMore = useCallback(() => setMoreOpen(false), []);

  const panelClosedAt = useRef(0);
  const prevBranchPanel = useRef(false);
  const prevAgentPanel = useRef(false);
  const prevSubscriberPanel = useRef(false);

  useEffect(() => {
    const wasBranchOpen = prevBranchPanel.current;
    const wasAgentOpen = prevAgentPanel.current;
    const wasSubscriberOpen = prevSubscriberPanel.current;
    const isBranchOpen = createBranchOpen || viewBranchesOpen;
    const isAgentOpen = viewAgentsOpen;
    const isSubscriberOpen = viewSubscribersOpen;
    prevBranchPanel.current = isBranchOpen;
    prevAgentPanel.current = isAgentOpen;
    prevSubscriberPanel.current = isSubscriberOpen;
    if ((wasBranchOpen && !isBranchOpen) || (wasAgentOpen && !isAgentOpen) || (wasSubscriberOpen && !isSubscriberOpen)) {
      panelClosedAt.current = Date.now();
    }
  }, [createBranchOpen, viewBranchesOpen, viewAgentsOpen, viewSubscribersOpen]);

  const anyMenuOpen = branchMenuOpen || agentMenuOpen || subscriberMenuOpen || moreOpen;
  useEffect(() => {
    if (!anyMenuOpen) return;
    const handler = () => {
      if (moreOpen) closeMore();
      if (Date.now() - panelClosedAt.current >= 500) {
        if (branchMenuOpen && !createBranchOpen && !viewBranchesOpen) setBranchMenuOpen(false);
        if (agentMenuOpen && !viewAgentsOpen) setAgentMenuOpen(false);
        if (subscriberMenuOpen && !viewSubscribersOpen) setSubscriberMenuOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [anyMenuOpen, moreOpen, closeMore, branchMenuOpen, agentMenuOpen, subscriberMenuOpen, createBranchOpen, viewBranchesOpen, viewAgentsOpen, viewSubscribersOpen, setBranchMenuOpen, setAgentMenuOpen, setSubscriberMenuOpen]);

  function handleClick(id) {
    setMoreOpen(false);

    // Admin-exclusive panels (Distributors / Employers). Collapse the reused
    // distributor-shell panels + submenus so only one slide-in shows at a time.
    if (id === 'distributors' || id === 'employers') {
      setBranchMenuOpen(false);
      setAgentMenuOpen(false);
      setSubscriberMenuOpen(false);
      setViewReportsOpen(false);
      setCommissionsOpen(false);
      setViewTicketsOpen(false);
      setSettingsOpen(false);
      if (id === 'distributors') {
        setViewEmployersOpen(false);
        setCreateEmployerOpen(false);
        setViewDistributorsOpen(true);
      } else {
        setViewDistributorsOpen(false);
        setCreateDistributorOpen(false);
        setViewEmployersOpen(true);
      }
      return;
    }

    // Any reused-shell action closes the admin panels first.
    adminCloseAllPanels();

    if (id === 'branches') {
      setAgentMenuOpen(false);
      setSubscriberMenuOpen(false);
      setViewReportsOpen(false);
      setCommissionsOpen(false);
      setViewTicketsOpen(false);
      setBranchMenuOpen((prev) => !prev);
      return;
    }
    if (id === 'agents') {
      setBranchMenuOpen(false);
      setSubscriberMenuOpen(false);
      setViewReportsOpen(false);
      setCommissionsOpen(false);
      setViewTicketsOpen(false);
      setAgentMenuOpen((prev) => !prev);
      return;
    }
    if (id === 'subscribers') {
      setBranchMenuOpen(false);
      setAgentMenuOpen(false);
      setViewReportsOpen(false);
      setCommissionsOpen(false);
      setViewTicketsOpen(false);
      setSubscriberMenuOpen((prev) => !prev);
      return;
    }
    setBranchMenuOpen(false);
    setAgentMenuOpen(false);
    setSubscriberMenuOpen(false);
    if (id === 'settings') {
      setViewReportsOpen(false);
      setCommissionsOpen(false);
      setViewTicketsOpen(false);
      setSettingsOpen(true);
      return;
    }
    if (id === 'logout') {
      logout();
      navigate('/');
      return;
    }
    if (id === 'overview') {
      setViewReportsOpen(false);
      setViewTicketsOpen(false);
      reset();
    }
    if (id === 'commissions') {
      setViewReportsOpen(false);
      setViewTicketsOpen(false);
      setCommissionsOpen(true);
      return;
    }
    if (id === 'reports') {
      setCommissionsOpen(false);
      setViewTicketsOpen(false);
      setViewReportsOpen(true);
      return;
    }
    if (id === 'tickets') {
      setViewReportsOpen(false);
      setCommissionsOpen(false);
      setViewTicketsOpen(true);
      return;
    }
    setViewReportsOpen(false);
    setCommissionsOpen(false);
    setViewTicketsOpen(false);
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

  function handleSubscriberSub(subId) {
    if (subId === 'view-subscribers') {
      setViewSubscribersOpen(true);
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
              onClick={(e) => { if (item.id === 'branches' || item.id === 'agents' || item.id === 'subscribers') e.stopPropagation(); handleClick(item.id); }}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered(null)}
              title={item.label}
              aria-label={item.label}
              {...(item.id === 'branches' ? { 'aria-expanded': branchMenuOpen } : {})}
              {...(item.id === 'agents' ? { 'aria-expanded': agentMenuOpen } : {})}
              {...(item.id === 'subscribers' ? { 'aria-expanded': subscriberMenuOpen } : {})}
            >
              <span className={styles.iconWrap}>{item.icon}</span>
              {hovered === item.id && !branchMenuOpen && !agentMenuOpen && !subscriberMenuOpen && (
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
                      <span className={styles.subMenuCount}>{branchCount}</span>
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
                      <span className={styles.subMenuCount}>{agentCount}</span>
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

            {/* Subscriber submenu flyout */}
            {item.id === 'subscribers' && (
              <AnimatePresence>
                {subscriberMenuOpen && (
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
                      <span className={styles.subMenuTitle}>Subscribers</span>
                      <span className={styles.subMenuCount}>{subscriberCount}</span>
                    </div>
                    <div className={styles.subMenuDivider} />
                    {SUBSCRIBER_SUB.map((sub, i) => {
                      const isActive = sub.id === 'view-subscribers' && viewSubscribersOpen;
                      return (
                        <motion.button
                          key={sub.id}
                          className={styles.subMenuItem}
                          data-active={isActive}
                          onClick={() => handleSubscriberSub(sub.id)}
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
