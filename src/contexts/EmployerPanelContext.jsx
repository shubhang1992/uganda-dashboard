import { createContext, useContext, useState, useMemo, useCallback } from 'react';

/**
 * Net-new panel context for the Employer dashboard. The shared
 * `DashboardPanelContext` is hardcoded to branch/agent keys (and wired to
 * `DashboardNavContext`'s drill-down refs), so the employer role gets its own
 * lightweight slide-in panel state instead.
 *
 * Each panel is a single boolean (`<name>Open`) with an open/close setter. The
 * employee-detail panel additionally tracks the `activeEmployeeId` it was
 * opened for. `closeAllPanels()` resets every panel so single-panel layouts
 * never stack two on top of each other.
 *
 * @typedef {Object} EmployerPanelContextValue
 * @property {boolean} employeesOpen
 * @property {(open: boolean) => void} setEmployeesOpen
 * @property {boolean} employeeDetailOpen
 * @property {(open: boolean) => void} setEmployeeDetailOpen
 * @property {string|null} activeEmployeeId
 * @property {(id: string|null) => void} setActiveEmployeeId
 * @property {(employeeId: string) => void} openEmployeeDetail
 * @property {boolean} runsOpen
 * @property {(open: boolean) => void} setRunsOpen
 * @property {boolean} insuranceOpen
 * @property {(open: boolean) => void} setInsuranceOpen
 * @property {boolean} reportsOpen
 * @property {(open: boolean) => void} setReportsOpen
 * @property {boolean} supportOpen
 * @property {(open: boolean) => void} setSupportOpen
 * @property {boolean} settingsOpen
 * @property {(open: boolean) => void} setSettingsOpen
 * @property {boolean} onboardOpen
 * @property {(open: boolean) => void} setOnboardOpen
 * @property {() => void} closeAllPanels
 */

const EmployerPanelContext = createContext(null);

export function EmployerPanelProvider({ children }) {
  const [employeesOpen, setEmployeesOpen] = useState(false);
  const [employeeDetailOpen, setEmployeeDetailOpen] = useState(false);
  const [activeEmployeeId, setActiveEmployeeId] = useState(null);
  const [runsOpen, setRunsOpen] = useState(false);
  const [insuranceOpen, setInsuranceOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardOpen, setOnboardOpen] = useState(false);

  /* Open the employee-detail panel for a specific employee. Sets the active id
     first so the panel reads the right record as it animates in. */
  const openEmployeeDetail = useCallback((employeeId) => {
    setActiveEmployeeId(employeeId);
    setEmployeeDetailOpen(true);
  }, []);

  /* Close every slide-in panel — guarantees panels never stack on top of each
     other (single-panel layout, mirroring DashboardPanelContext). */
  const closeAllPanels = useCallback(() => {
    setEmployeesOpen(false);
    setEmployeeDetailOpen(false);
    setRunsOpen(false);
    setInsuranceOpen(false);
    setReportsOpen(false);
    setSupportOpen(false);
    setSettingsOpen(false);
    setOnboardOpen(false);
  }, []);

  const value = useMemo(() => ({
    employeesOpen, setEmployeesOpen,
    employeeDetailOpen, setEmployeeDetailOpen,
    activeEmployeeId, setActiveEmployeeId,
    openEmployeeDetail,
    runsOpen, setRunsOpen,
    insuranceOpen, setInsuranceOpen,
    reportsOpen, setReportsOpen,
    supportOpen, setSupportOpen,
    settingsOpen, setSettingsOpen,
    onboardOpen, setOnboardOpen,
    closeAllPanels,
  }), [
    employeesOpen, employeeDetailOpen, activeEmployeeId, openEmployeeDetail,
    runsOpen, insuranceOpen, reportsOpen, supportOpen, settingsOpen, onboardOpen,
    closeAllPanels,
  ]);

  return (
    <EmployerPanelContext value={value}>
      {children}
    </EmployerPanelContext>
  );
}

/**
 * Access the employer panel UI state (open/close slide-in panels).
 * @returns {EmployerPanelContextValue}
 */
export function useEmployerPanel() {
  const ctx = useContext(EmployerPanelContext);
  if (!ctx) throw new Error('useEmployerPanel must be used within EmployerPanelProvider');
  return ctx;
}

/**
 * Wrapper provider analogous to `DashboardProvider` — nests the panel context
 * so the shell can wrap with a single component. Kept as its own export so
 * future employer-scoped contexts (nav, etc.) can be nested here without
 * touching the shell.
 */
export function EmployerDashboardProvider({ children }) {
  return (
    <EmployerPanelProvider>
      {children}
    </EmployerPanelProvider>
  );
}
