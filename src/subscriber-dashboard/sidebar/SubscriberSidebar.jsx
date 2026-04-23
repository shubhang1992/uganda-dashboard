import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboard } from '../../contexts/DashboardContext';
import logoWhite from '../../assets/logo-white.png';
import styles from './SubscriberSidebar.module.css';

const NAV_ITEMS = [
  {
    id: 'overview',
    label: 'Home',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <path d="M3 11l9-7 9 7v9a2 2 0 01-2 2h-4v-6h-6v6H5a2 2 0 01-2-2v-9z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'save',
    label: 'Save',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <rect x="2" y="6" width="20" height="13" rx="2" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M2 10h20" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M17 15v-2M16 14h2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'withdraw',
    label: 'Withdraw',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <path d="M12 3v12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <path d="M7 8l5-5 5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'insurance',
    label: 'Insurance',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
        <path d="M9 12l2.2 2 3.8-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
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
  {
    id: 'help',
    label: 'Help',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <path d="M4 14v-3a8 8 0 1116 0v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <rect x="2.5" y="14" width="4.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.75"/>
        <rect x="17" y="14" width="4.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M17 19.5h-1.5a2 2 0 01-2 2H12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
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

/* Mobile bottom-bar items: Home · Save · Reports · More */
const MOBILE_NAV = [NAV_ITEMS[0], NAV_ITEMS[1], NAV_ITEMS[4]];

const MORE_ITEMS = [
  {
    id: 'withdraw',
    label: 'Withdraw',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
        <path d="M12 3v12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <path d="M7 8l5-5 5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'insurance',
    label: 'Insurance',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
        <path d="M9 12l2.2 2 3.8-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'help',
    label: 'Help',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
        <path d="M4 14v-3a8 8 0 1116 0v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <rect x="2.5" y="14" width="4.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.75"/>
        <rect x="17" y="14" width="4.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.75"/>
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
      </svg>
    ),
  },
];

export default function SubscriberSidebar() {
  const [hovered, setHovered] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [savePopover, setSavePopover] = useState(false);
  const savePopoverRef = useRef(null);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const {
    contributeOpen, setContributeOpen,
    withdrawOpen, setWithdrawOpen,
    insuranceOpen, setInsuranceOpen,
    nomineesOpen, setNomineesOpen,
    subscriberReportsOpen, setSubscriberReportsOpen,
    helpOpen, setHelpOpen,
    settingsOpen, setSettingsOpen,
    contributionSettingsOpen, setContributionSettingsOpen,
    closeAllPanels,
  } = useDashboard();
  const [active, setActive] = useState('overview');

  useEffect(() => {
    if (contributeOpen || contributionSettingsOpen) setActive('save');
    else if (active === 'save') setActive('overview');
  }, [contributeOpen, contributionSettingsOpen]);

  useEffect(() => {
    if (withdrawOpen) setActive('withdraw');
    else if (active === 'withdraw') setActive('overview');
  }, [withdrawOpen]);

  useEffect(() => {
    if (insuranceOpen) setActive('insurance');
    else if (active === 'insurance') setActive('overview');
  }, [insuranceOpen]);

  useEffect(() => {
    if (nomineesOpen) setActive('nominees');
    else if (active === 'nominees') setActive('overview');
  }, [nomineesOpen]);

  useEffect(() => {
    if (subscriberReportsOpen) setActive('reports');
    else if (active === 'reports') setActive('overview');
  }, [subscriberReportsOpen]);

  useEffect(() => {
    if (helpOpen) setActive('help');
    else if (active === 'help') setActive('overview');
  }, [helpOpen]);

  useEffect(() => {
    if (settingsOpen) setActive('settings');
    else if (active === 'settings') setActive('overview');
  }, [settingsOpen]);

  const closeMore = useCallback(() => setMoreOpen(false), []);

  useEffect(() => {
    if (!moreOpen) return;
    const handler = () => closeMore();
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [moreOpen, closeMore]);

  // Close save popover on outside click
  useEffect(() => {
    if (!savePopover) return;
    function handler(e) {
      if (savePopoverRef.current && !savePopoverRef.current.contains(e.target)) {
        setSavePopover(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [savePopover]);

  function handleClick(id) {
    setMoreOpen(false);
    setSavePopover(false);

    if (id === 'overview') {
      closeAllPanels();
      setActive('overview');
      return;
    }
    if (id === 'save') {
      setSavePopover((prev) => !prev);
      return;
    }
    if (id === 'contribute') {
      closeAllPanels();
      setContributeOpen(true);
      setActive('save');
      return;
    }
    if (id === 'schedule') {
      closeAllPanels();
      setContributionSettingsOpen(true);
      setActive('save');
      return;
    }
    if (id === 'withdraw') {
      closeAllPanels();
      setWithdrawOpen(true);
      setActive('withdraw');
      return;
    }
    if (id === 'insurance') {
      closeAllPanels();
      setInsuranceOpen(true);
      setActive('insurance');
      return;
    }
    if (id === 'nominees') {
      closeAllPanels();
      setNomineesOpen(true);
      setActive('nominees');
      return;
    }
    if (id === 'reports') {
      closeAllPanels();
      setSubscriberReportsOpen(true);
      setActive('reports');
      return;
    }
    if (id === 'help') {
      closeAllPanels();
      setHelpOpen(true);
      setActive('help');
      return;
    }
    if (id === 'settings') {
      closeAllPanels();
      setSettingsOpen(true);
      setActive('settings');
      return;
    }
    if (id === 'logout') {
      logout();
      navigate('/');
      return;
    }
  }

  return (
    <nav className={styles.sidebar} aria-label="Subscriber navigation">
      <div className={styles.logo}>
        <img src={logoWhite} alt="Universal Pensions" width="30" height="30" className={styles.logoImg} />
      </div>

      <div className={styles.navItems}>
        {NAV_ITEMS.map((item) => (
          <div key={item.id} style={{ position: 'relative' }} ref={item.id === 'save' ? savePopoverRef : undefined}>
            <button
              className={styles.navBtn}
              data-active={active === item.id}
              onClick={() => handleClick(item.id)}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered(null)}
              aria-label={item.label}
            >
              <span className={styles.iconWrap}>{item.icon}</span>
              {hovered === item.id && !savePopover && (
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
            {item.id === 'save' && (
              <AnimatePresence>
                {savePopover && (
                  <motion.div
                    className={styles.savePopover}
                    initial={{ opacity: 0, x: -6, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -6, scale: 0.96 }}
                    transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
                  >
                    <button className={styles.popoverItem} onClick={() => handleClick('contribute')}>
                      <span className={styles.popoverIcon}>
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                          <rect x="2" y="6" width="20" height="13" rx="2" stroke="currentColor" strokeWidth="1.75"/>
                          <path d="M2 10h20" stroke="currentColor" strokeWidth="1.75"/>
                          <path d="M12 16v-4M10 14h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                        </svg>
                      </span>
                      Make a Contribution
                    </button>
                    <button className={styles.popoverItem} onClick={() => handleClick('schedule')}>
                      <span className={styles.popoverIcon}>
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                          <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.75"/>
                          <path d="M3 9h18" stroke="currentColor" strokeWidth="1.75"/>
                          <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                        </svg>
                      </span>
                      Update Schedule
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

      {/* Mobile tab bar — Home · Save · Reports · More */}
      <div className={styles.mobileBar}>
        {MOBILE_NAV.map((item) => (
          <div key={item.id} style={{ position: 'relative', flex: 1, display: 'flex' }} ref={item.id === 'save' ? savePopoverRef : undefined}>
            <button
              className={styles.mobileBtn}
              data-active={active === item.id}
              onClick={() => handleClick(item.id)}
              aria-label={item.label}
            >
              <span className={styles.iconWrap}>{item.icon}</span>
              <span className={styles.mobileLabel}>{item.label}</span>
            </button>
            {item.id === 'save' && (
              <AnimatePresence>
                {savePopover && (
                  <motion.div
                    className={styles.savePopoverMobile}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                  >
                    <button className={styles.popoverItem} onClick={() => handleClick('contribute')}>
                      <span className={styles.popoverIcon}>
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                          <rect x="2" y="6" width="20" height="13" rx="2" stroke="currentColor" strokeWidth="1.75"/>
                          <path d="M2 10h20" stroke="currentColor" strokeWidth="1.75"/>
                          <path d="M12 16v-4M10 14h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                        </svg>
                      </span>
                      Make a Contribution
                    </button>
                    <button className={styles.popoverItem} onClick={() => handleClick('schedule')}>
                      <span className={styles.popoverIcon}>
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                          <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.75"/>
                          <path d="M3 9h18" stroke="currentColor" strokeWidth="1.75"/>
                          <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                        </svg>
                      </span>
                      Update Schedule
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
