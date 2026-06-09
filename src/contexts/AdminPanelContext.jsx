import { createContext, useContext, useState, useMemo, useCallback } from 'react';

/**
 * Net-new panel context for the Admin dashboard. The admin shell reuses the
 * distributor's map drill-down (`DashboardNavContext`) and its shared slide-in
 * panels (`DashboardPanelContext` — branches/agents/subscribers/commissions/
 * reports/support/settings). THIS context adds only the admin-exclusive panels:
 * the platform-wide Distributors and Employers managers, each with a list view
 * and a create form. Mirrors `EmployerPanelContext` — one boolean per panel
 * with an open/close setter, plus `closeAllPanels()` so panels never stack.
 *
 * @typedef {Object} AdminPanelContextValue
 * @property {boolean} viewDistributorsOpen
 * @property {(open: boolean) => void} setViewDistributorsOpen
 * @property {boolean} createDistributorOpen
 * @property {(open: boolean) => void} setCreateDistributorOpen
 * @property {boolean} viewEmployersOpen
 * @property {(open: boolean) => void} setViewEmployersOpen
 * @property {boolean} createEmployerOpen
 * @property {(open: boolean) => void} setCreateEmployerOpen
 * @property {() => void} closeAllPanels
 */

const AdminPanelContext = createContext(null);

export function AdminPanelProvider({ children }) {
  const [viewDistributorsOpen, setViewDistributorsOpen] = useState(false);
  const [createDistributorOpen, setCreateDistributorOpen] = useState(false);
  const [viewEmployersOpen, setViewEmployersOpen] = useState(false);
  const [createEmployerOpen, setCreateEmployerOpen] = useState(false);

  /* Close every admin slide-in panel. The create panels deliberately stay
     independent of their list panels so "Create" can open over the list. */
  const closeAllPanels = useCallback(() => {
    setViewDistributorsOpen(false);
    setCreateDistributorOpen(false);
    setViewEmployersOpen(false);
    setCreateEmployerOpen(false);
  }, []);

  const value = useMemo(() => ({
    viewDistributorsOpen, setViewDistributorsOpen,
    createDistributorOpen, setCreateDistributorOpen,
    viewEmployersOpen, setViewEmployersOpen,
    createEmployerOpen, setCreateEmployerOpen,
    closeAllPanels,
  }), [
    viewDistributorsOpen, createDistributorOpen,
    viewEmployersOpen, createEmployerOpen,
    closeAllPanels,
  ]);

  return (
    <AdminPanelContext value={value}>
      {children}
    </AdminPanelContext>
  );
}

/**
 * Access the admin panel UI state (open/close the Distributors / Employers
 * slide-in panels).
 * @returns {AdminPanelContextValue}
 */
export function useAdminPanel() {
  const ctx = useContext(AdminPanelContext);
  if (!ctx) throw new Error('useAdminPanel must be used within AdminPanelProvider');
  return ctx;
}
