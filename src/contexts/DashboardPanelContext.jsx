import { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { useDashboardNav } from './DashboardNavContext';

/**
 * @typedef {Object} DashboardPanelContextValue
 * @property {boolean} branchMenuOpen
 * @property {(open: boolean) => void} setBranchMenuOpen
 * @property {boolean} createBranchOpen
 * @property {(open: boolean) => void} setCreateBranchOpen
 * @property {boolean} viewBranchesOpen
 * @property {(open: boolean) => void} setViewBranchesOpen
 * @property {boolean} agentMenuOpen
 * @property {(open: boolean) => void} setAgentMenuOpen
 * @property {boolean} createAgentOpen
 * @property {(open: boolean) => void} setCreateAgentOpen
 * @property {boolean} viewAgentsOpen
 * @property {(open: boolean) => void} setViewAgentsOpen
 * @property {boolean} subscriberMenuOpen
 * @property {(open: boolean) => void} setSubscriberMenuOpen
 * @property {boolean} viewSubscribersOpen
 * @property {(open: boolean) => void} setViewSubscribersOpen
 * @property {boolean} viewReportsOpen
 * @property {(open: boolean) => void} setViewReportsOpen
 * @property {boolean} commissionsOpen
 * @property {(open: boolean) => void} setCommissionsOpen
 * @property {boolean} settingsOpen
 * @property {(open: boolean) => void} setSettingsOpen
 * @property {string|null} reportContext - Report ID for auto-navigation
 * @property {(id: string|null) => void} setReportContext
 * @property {() => void} closeAllPanels - Close every slide-in panel
 */

const DashboardPanelContext = createContext(null);

export function DashboardPanelProvider({ children }) {
  // UI-only state (not URL-based)
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [viewBranchesOpen, setViewBranchesOpen] = useState(false);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [createAgentOpen, setCreateAgentOpen] = useState(false);
  const [viewAgentsOpen, setViewAgentsOpen] = useState(false);
  const [subscriberMenuOpen, setSubscriberMenuOpen] = useState(false);
  const [viewSubscribersOpen, setViewSubscribersOpen] = useState(false);
  const [viewReportsOpen, setViewReportsOpen] = useState(false);
  const [commissionsOpen, setCommissionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportContext, setReportContext] = useState(null);

  // Subscriber dashboard panels
  const [contributeOpen, setContributeOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [insuranceOpen, setInsuranceOpen] = useState(false);
  const [insuranceTab, setInsuranceTab] = useState('coverage'); // 'coverage' | 'claims' | 'beneficiaries'
  const [nomineesOpen, setNomineesOpen] = useState(false);
  const [nomineesTab, setNomineesTab] = useState('pension'); // 'pension' | 'insurance'
  const [helpOpen, setHelpOpen] = useState(false);
  const [subscriberReportsOpen, setSubscriberReportsOpen] = useState(false);
  const [contributionSettingsOpen, setContributionSettingsOpen] = useState(false);
  const [yourGoalOpen, setYourGoalOpen] = useState(false);

  // Register panel setters into the nav context's onPanelAction ref so
  // nav-driven effects (auto-open on drill-down) can call them.
  const { onPanelAction } = useDashboardNav();

  useEffect(() => {
    onPanelAction.current = {
      setViewBranchesOpen,
      setViewAgentsOpen,
      setViewReportsOpen,
      setBranchMenuOpen,
      setAgentMenuOpen,
    };
    return () => { onPanelAction.current = null; };
  }, []); // setters from useState are stable — no deps needed

  /* Close every slide-in panel — used by single-panel layouts (e.g. branch
     dashboard) to guarantee panels never stack on top of each other. */
  const closeAllPanels = useCallback(() => {
    setCreateBranchOpen(false);
    setViewBranchesOpen(false);
    setCreateAgentOpen(false);
    setViewAgentsOpen(false);
    setViewSubscribersOpen(false);
    setViewReportsOpen(false);
    setCommissionsOpen(false);
    setSettingsOpen(false);
    setContributeOpen(false);
    setWithdrawOpen(false);
    setInsuranceOpen(false);
    setNomineesOpen(false);
    setHelpOpen(false);
    setSubscriberReportsOpen(false);
    setContributionSettingsOpen(false);
    setYourGoalOpen(false);
  }, []);

  const value = useMemo(() => ({
    branchMenuOpen, setBranchMenuOpen,
    createBranchOpen, setCreateBranchOpen,
    viewBranchesOpen, setViewBranchesOpen,
    agentMenuOpen, setAgentMenuOpen,
    createAgentOpen, setCreateAgentOpen,
    viewAgentsOpen, setViewAgentsOpen,
    subscriberMenuOpen, setSubscriberMenuOpen,
    viewSubscribersOpen, setViewSubscribersOpen,
    viewReportsOpen, setViewReportsOpen,
    commissionsOpen, setCommissionsOpen,
    settingsOpen, setSettingsOpen,
    reportContext, setReportContext,
    // Subscriber
    contributeOpen, setContributeOpen,
    withdrawOpen, setWithdrawOpen,
    insuranceOpen, setInsuranceOpen,
    insuranceTab, setInsuranceTab,
    nomineesOpen, setNomineesOpen,
    nomineesTab, setNomineesTab,
    helpOpen, setHelpOpen,
    subscriberReportsOpen, setSubscriberReportsOpen,
    contributionSettingsOpen, setContributionSettingsOpen,
    yourGoalOpen, setYourGoalOpen,
    closeAllPanels,
  }), [
    branchMenuOpen, createBranchOpen, viewBranchesOpen,
    agentMenuOpen, createAgentOpen, viewAgentsOpen,
    subscriberMenuOpen, viewSubscribersOpen, viewReportsOpen,
    commissionsOpen, settingsOpen, reportContext,
    contributeOpen, withdrawOpen, insuranceOpen, insuranceTab,
    nomineesOpen, nomineesTab, helpOpen, subscriberReportsOpen,
    contributionSettingsOpen,
    yourGoalOpen,
    closeAllPanels,
  ]);

  return (
    <DashboardPanelContext value={value}>
      {children}
    </DashboardPanelContext>
  );
}

/**
 * Access the dashboard panel UI state (open/close slide-in panels).
 * @returns {DashboardPanelContextValue}
 */
export function useDashboardPanel() {
  const ctx = useContext(DashboardPanelContext);
  if (!ctx) throw new Error('useDashboardPanel must be used within DashboardPanelProvider');
  return ctx;
}
