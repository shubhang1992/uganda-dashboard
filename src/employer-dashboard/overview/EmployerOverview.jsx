// Employer overview — the real hero + operations row (Phase 2).
//
// Cloned from `branch-dashboard/overview/BranchOverview.jsx`: the indigo
// EmployerHealthScore hero, then the operations row (recent runs + roster
// snapshot). Carries over the PANEL_PADDING map keyed by the employer panels +
// the `data-split` padding-right reflow animation so the overview squishes just
// enough to make room for whichever slide-in panel is open. Reads everything
// through the employer hooks (never `employerSeed` directly — CLAUDE.md §4.1).

import { useAuth } from '../../contexts/AuthContext';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  useEmployer,
  useEmployerMetrics,
  useEmployees,
  useContributionRuns,
} from '../../hooks/useEmployer';
import EmployerHealthScore from './EmployerHealthScore';
import EmployerOperations from './EmployerOperations';
import styles from './EmployerOverview.module.css';

// Panel widths in split mode → used to compute the overview's right padding so
// the dashboard reflows just enough to make space for the active panel. 24px
// gap on either side of the panel: padding = width + 48. (Mirrors
// BranchOverview's PANEL_PADDING; sized for the Phase-2+ panels.)
const PANEL_PADDING = {
  employees: 640 + 48,
  employeeDetail: 560 + 48,
  runs: 680 + 48,
  insurance: 600 + 48,
  reports: 680 + 48,
  support: 560 + 48,
  settings: 480 + 48,
  onboard: 480 + 48,
};

export default function EmployerOverview() {
  const { user } = useAuth();
  const { employerId } = useEmployerScope();
  const {
    employeesOpen,
    employeeDetailOpen,
    runsOpen,
    insuranceOpen,
    reportsOpen,
    supportOpen,
    settingsOpen,
    onboardOpen,
  } = useEmployerPanel();
  const { data: employer } = useEmployer(employerId);
  const { data: metrics } = useEmployerMetrics(employerId);
  const { data: employees = [] } = useEmployees(employerId);
  const { data: runs = [] } = useContributionRuns(employerId);
  const isMobile = useIsMobile();

  // Which panel (if any) is currently driving split view.
  const activePanel = employeesOpen
    ? 'employees'
    : employeeDetailOpen
    ? 'employeeDetail'
    : runsOpen
    ? 'runs'
    : insuranceOpen
    ? 'insurance'
    : reportsOpen
    ? 'reports'
    : supportOpen
    ? 'support'
    : settingsOpen
    ? 'settings'
    : onboardOpen
    ? 'onboard'
    : null;

  const splitState = activePanel !== null;
  // On mobile, panels go full-screen — no need to squish the overview.
  const targetPaddingRight = splitState && !isMobile ? PANEL_PADDING[activePanel] : 24;

  if (!employer) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    );
  }

  return (
    <div
      className={styles.overview}
      data-split={splitState || undefined}
      style={{ paddingRight: targetPaddingRight }}
    >
      <EmployerHealthScore
        metrics={metrics ?? {}}
        employees={employees}
        runs={runs}
        employer={employer}
        user={user}
        split={splitState}
      />

      <div className={styles.opsWrap}>
        <EmployerOperations runs={runs} metrics={metrics ?? {}} />
      </div>
    </div>
  );
}
