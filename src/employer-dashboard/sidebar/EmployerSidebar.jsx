// Employer icon-rail sidebar — cloned from BranchSidebar.
//
// 64px indigo-deep rail, teal left active indicator (via the CSS `::before`),
// hover tooltips (desktop), a mobile bottom bar with a "More" overflow, and a
// drawer mode reused by EmployerDashboardShell's mobile slide-in. Active item
// is DERIVED from which panel is open (no setState-in-effect). "Employees" is a
// single entry that opens a small menu → "View employees" / "Onboard an
// employee" (rail: right-flyout popover; drawer: inline accordion).
//
// The repo's sidebars use inline SVG icons (not lucide-react) — see
// BranchSidebar — so this mirrors that convention for visual consistency.

import { useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO } from '../../utils/motion';
import { useAuth } from '../../contexts/AuthContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import { useOutsideClick } from '../../hooks/useOutsideClick';
import logoWhite from '../../assets/logo-white.png';
import styles from './EmployerSidebar.module.css';

const ICONS = {
  overview: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
      <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <rect x="13" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <rect x="13" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  ),
  employees: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
      <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="18" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M21 21v-1.5a3 3 0 00-3-3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  ),
  runs: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
      <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M2 10h20" stroke="currentColor" strokeWidth="1.75" />
      <path d="M6 15h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M14 15h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  ),
  insurance: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  reports: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
      <path d="M3 3v18h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 14l4-4 4 4 5-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  support: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
      <path d="M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H9l-4 4v-4H4a1 1 0 01-1-1V6a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10h8M8 13h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  ),
  onboard: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5 21v-1a7 7 0 0114 0v1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M19 3v4M17 5h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  ),
  settings: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  ),
  logout: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <polyline points="16,17 21,12 16,7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  ),
};

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: ICONS.overview },
  { id: 'employees', label: 'Employees', icon: ICONS.employees },
  { id: 'runs', label: 'Contribution Runs', icon: ICONS.runs },
  { id: 'insurance', label: 'Insurance', icon: ICONS.insurance },
  { id: 'reports', label: 'Analytics', icon: ICONS.reports },
  { id: 'support', label: 'Support', icon: ICONS.support },
];

// The "Employees" entry fans out to these two actions (view vs onboard).
const STAFF_OPTIONS = [
  { id: 'employees', label: 'View employees', icon: ICONS.employees },
  { id: 'onboard', label: 'Onboard an employee', icon: ICONS.onboard },
];

const CHEVRON = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="16" height="16">
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BOTTOM_ITEMS = [
  { id: 'settings', label: 'Settings', icon: ICONS.settings },
  { id: 'logout', label: 'Log out', icon: ICONS.logout },
];

const MOBILE_NAV = NAV_ITEMS.slice(0, 3);

const MORE_ITEMS = [
  { id: 'insurance', label: 'Insurance', icon: ICONS.insurance },
  { id: 'reports', label: 'Analytics', icon: ICONS.reports },
  { id: 'support', label: 'Support', icon: ICONS.support },
  { id: 'onboard', label: 'Onboard member', icon: ICONS.onboard },
  { id: 'settings', label: 'Settings', icon: ICONS.settings },
  { id: 'logout', label: 'Log out', icon: ICONS.logout },
];

export default function EmployerSidebar({ mode = 'desktop', onNavigate }) {
  const [hovered, setHovered] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [staffMenuOpen, setStaffMenuOpen] = useState(false);
  const moreWrapRef = useRef(null);
  const staffWrapRef = useRef(null);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const {
    employeesOpen, setEmployeesOpen,
    runsOpen, setRunsOpen,
    insuranceOpen, setInsuranceOpen,
    reportsOpen, setReportsOpen,
    supportOpen, setSupportOpen,
    settingsOpen, setSettingsOpen,
    onboardOpen, setOnboardOpen,
    closeAllPanels,
  } = useEmployerPanel();
  const isDrawer = mode === 'drawer';

  // `active` is derived from which panel is open — no setState-in-effect.
  const active = useMemo(() => {
    if (employeesOpen) return 'employees';
    if (runsOpen) return 'runs';
    if (insuranceOpen) return 'insurance';
    if (reportsOpen) return 'reports';
    if (supportOpen) return 'support';
    if (onboardOpen) return 'onboard';
    if (settingsOpen) return 'settings';
    return 'overview';
  }, [employeesOpen, runsOpen, insuranceOpen, reportsOpen, supportOpen, onboardOpen, settingsOpen]);

  const closeMore = useCallback(() => setMoreOpen(false), []);
  const moreOutsideRefs = useMemo(() => [moreWrapRef], []);
  useOutsideClick(moreOpen, closeMore, moreOutsideRefs);

  // Staff fly-out (rail only — the drawer uses an inline accordion, which
  // shouldn't dismiss on outside click; the drawer itself closes on navigate).
  const closeStaff = useCallback(() => setStaffMenuOpen(false), []);
  const staffOutsideRefs = useMemo(() => [staffWrapRef], []);
  useOutsideClick(staffMenuOpen && !isDrawer, closeStaff, staffOutsideRefs);

  // The "Employees" entry is highlighted whenever either of its panels is open.
  const staffActive = active === 'employees' || active === 'onboard';

  function handleClick(id) {
    setMoreOpen(false);
    setStaffMenuOpen(false);

    if (id === 'overview') {
      closeAllPanels();
      onNavigate?.();
      return;
    }
    if (id === 'logout') {
      onNavigate?.();
      logout();
      navigate('/');
      return;
    }

    // Every other item is a single slide-in panel. Close any open panel first
    // so panels never stack, then open the target.
    closeAllPanels();
    const opener = {
      employees: setEmployeesOpen,
      runs: setRunsOpen,
      insurance: setInsuranceOpen,
      reports: setReportsOpen,
      support: setSupportOpen,
      onboard: setOnboardOpen,
      settings: setSettingsOpen,
    }[id];
    opener?.(true);
    onNavigate?.();
  }

  /* ── Drawer mode (mobile slide-in) ───────────────────────────── */
  if (isDrawer) {
    return (
      <nav className={styles.drawer} aria-label="Employer navigation">
        <div className={styles.drawerHeader}>
          <img src={logoWhite} alt="Universal Pensions" width="140" height="32" className={styles.drawerLogo} />
        </div>

        <div className={styles.drawerSection}>
          {NAV_ITEMS.map((item) => {
            if (item.id === 'employees') {
              // Consolidated "Employees" — taps expand an inline accordion with
              // "View employees" + "Onboard an employee".
              return (
                <div key="employees" className={styles.drawerGroup}>
                  <button
                    type="button"
                    className={styles.drawerRow}
                    data-active={staffActive}
                    onClick={() => setStaffMenuOpen((prev) => !prev)}
                    aria-expanded={staffMenuOpen}
                  >
                    <span className={styles.drawerRowIcon}>{ICONS.employees}</span>
                    <span className={styles.drawerRowLabel}>Employees</span>
                    <span className={styles.drawerChevron} data-open={staffMenuOpen || undefined} aria-hidden="true">
                      {CHEVRON}
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {staffMenuOpen && (
                      <motion.div
                        className={styles.drawerSub}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                      >
                        {STAFF_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            className={styles.drawerSubRow}
                            data-active={active === opt.id}
                            onClick={() => handleClick(opt.id)}
                          >
                            <span className={styles.drawerRowIcon}>{opt.icon}</span>
                            <span className={styles.drawerRowLabel}>{opt.label}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            }
            return (
              <button
                key={item.id}
                type="button"
                className={styles.drawerRow}
                data-active={active === item.id}
                onClick={() => handleClick(item.id)}
              >
                <span className={styles.drawerRowIcon}>{item.icon}</span>
                <span className={styles.drawerRowLabel}>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.drawerSpacer} />

        <div className={styles.drawerSection}>
          {BOTTOM_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.drawerRow}
              data-active={active === item.id}
              data-variant={item.id === 'logout' ? 'logout' : undefined}
              onClick={() => handleClick(item.id)}
            >
              <span className={styles.drawerRowIcon}>{item.icon}</span>
              <span className={styles.drawerRowLabel}>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    );
  }

  /* ── Desktop sidebar (default) ───────────────────────────────── */
  return (
    <nav className={styles.sidebar}>
      <div className={styles.logo}>
        <img src={logoWhite} alt="Universal Pensions" width="30" height="30" className={styles.logoImg} />
      </div>

      <div className={styles.navItems}>
        {NAV_ITEMS.map((item) => {
          if (item.id === 'employees') {
            // Consolidated "Employees" — opens a fly-out with "View employees"
            // + "Onboard an employee".
            return (
              <div key="employees" className={styles.staffWrap} ref={staffWrapRef}>
                <button
                  className={styles.navBtn}
                  data-active={staffActive}
                  onClick={() => setStaffMenuOpen((prev) => !prev)}
                  onMouseEnter={() => setHovered('employees')}
                  onMouseLeave={() => setHovered(null)}
                  aria-haspopup="menu"
                  aria-expanded={staffMenuOpen}
                  aria-label="Employees"
                >
                  <span className={styles.iconWrap}>{ICONS.employees}</span>
                  {hovered === 'employees' && !staffMenuOpen && (
                    <motion.span
                      className={styles.tooltip}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      Employees
                    </motion.span>
                  )}
                </button>
                <AnimatePresence>
                  {staffMenuOpen && (
                    <motion.div
                      role="menu"
                      aria-label="Employees"
                      className={styles.staffMenu}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -4 }}
                      transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
                    >
                      {STAFF_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          role="menuitem"
                          className={styles.staffItem}
                          onClick={() => handleClick(opt.id)}
                        >
                          <span className={styles.staffItemIcon}>{opt.icon}</span>
                          <span>{opt.label}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          }
          return (
            <div key={item.id} style={{ position: 'relative' }}>
              <button
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
            </div>
          );
        })}
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
          <div key={item.id} style={{ position: 'relative', flex: 1, display: 'flex' }}>
            <button
              className={styles.mobileBtn}
              data-active={active === item.id}
              onClick={() => handleClick(item.id)}
              aria-label={item.label}
            >
              <span className={styles.iconWrap}>{item.icon}</span>
              <span className={styles.mobileLabel}>{item.label}</span>
            </button>
          </div>
        ))}
        <div className={styles.moreWrap} ref={moreWrapRef}>
          <button
            className={styles.mobileBtn}
            data-active={moreOpen}
            onClick={() => setMoreOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-label="More options"
          >
            <span className={styles.iconWrap}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
                <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                <circle cx="12" cy="19" r="1.5" fill="currentColor" />
              </svg>
            </span>
            <span className={styles.mobileLabel}>More</span>
          </button>
          <AnimatePresence>
            {moreOpen && (
              <motion.div
                role="menu"
                className={styles.moreMenu}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
              >
                {MORE_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    role="menuitem"
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
