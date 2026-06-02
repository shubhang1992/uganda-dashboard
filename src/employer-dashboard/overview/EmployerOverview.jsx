// Employer overview — BASIC this phase (Phase 1).
//
// Phase 2 drops the real indigo hero banner (EmployerHealthScore) in here. For
// now this renders a simple branded welcome + KPI placeholder reading
// `useEmployerMetrics`, but it ALREADY carries the structure Phase 2 needs:
//   * the PANEL_PADDING map keyed by the employer panels, and
//   * the `data-split` padding-right reflow animation
// (both cloned from BranchOverview) so the hero can slot in unchanged. Clicking
// a sidebar item opens its panel via the panel context (the sidebar owns that);
// the overview just reacts to which panel is open for the split reflow.

import { useAuth } from '../../contexts/AuthContext';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useEmployer, useEmployerMetrics } from '../../hooks/useEmployer';
import { formatUGX } from '../../utils/finance';
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

function Kpi({ label, value, hint }) {
  return (
    <div className={styles.kpiCard}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>{value}</span>
      {hint ? <span className={styles.kpiHint}>{hint}</span> : null}
    </div>
  );
}

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

  const m = metrics ?? {};
  const companyName = employer?.name ?? 'Your company';
  const contactName = employer?.contactName ?? user?.name ?? 'there';

  return (
    <div
      className={styles.overview}
      data-split={splitState || undefined}
      style={{ paddingRight: targetPaddingRight }}
    >
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Company Overview</p>
        <h1 className={styles.companyName}>{companyName}</h1>
        <p className={styles.welcome}>Welcome back, {contactName}.</p>
        <p className={styles.phaseNote}>
          The full hero banner, charts and live activity feed arrive in Phase 2.
        </p>
      </section>

      <section className={styles.kpiGrid} aria-label="Key metrics">
        <Kpi
          label="Total staff balance"
          value={formatUGX(m.totalBalance ?? 0)}
          hint="Across all employees"
        />
        <Kpi
          label="Employees"
          value={(m.headcount ?? 0).toLocaleString()}
          hint={`${(m.active ?? 0).toLocaleString()} active · ${(m.suspended ?? 0).toLocaleString()} suspended`}
        />
        <Kpi
          label="Employer-funded YTD"
          value={formatUGX(m.employerYtd ?? 0)}
          hint="This calendar year"
        />
        <Kpi
          label="Employee-funded YTD"
          value={formatUGX(m.employeeYtd ?? 0)}
          hint="Co-contribution share"
        />
        <Kpi
          label="Insured staff"
          value={(m.insuredCount ?? 0).toLocaleString()}
          hint="With active cover"
        />
        <Kpi
          label="Funding mode split"
          value={`${m.modeSplit?.coContribution ?? 0} / ${m.modeSplit?.employerOnly ?? 0}`}
          hint="Co-contribution / employer-only"
        />
      </section>
    </div>
  );
}
