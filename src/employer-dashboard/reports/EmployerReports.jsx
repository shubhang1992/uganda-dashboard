// Reports panel (Phase 6) — the printable / exportable employer report hub.
//
// Clones the ViewReports hub/lazy-view idiom (the generic one is
// branch/distributor-scoped) onto the employer `EmployerSlidePanel` (width 680).
// One panel hosts a `view` state ('hub' | a report key); the hub lists the four
// reports as cards, and each report view renders a semantic table (+ totals,
// + a pure-SVG chart where useful) with Export CSV + Print actions wired into
// the panel `headerActions`, plus loading / empty / error states throughout.
//
// Reports (per employerplan.md module #5):
//   1. staff-roster        — every employee: title · salary · funding · status · balance
//   2. runs-summary        — every run: period · date · lines · employer/employee/grand
//   3. funding-breakdown   — employer-vs-employee split (YTD + per-run) + SVG donut
//   4. balance-growth      — cumulative grand total over run dates + SVG line trend
//
// Export reuses the shared `downloadCsv` helper (src/utils/csvDownload.js — the
// same pipeline ReportView uses); Print uses `window.print()`. This component
// never imports `employerSeed` / `mockData`; all data arrives via the employer
// hooks (CLAUDE.md §4.1).

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import {
  useEmployees,
  useContributionRuns,
  useEmployerMetrics,
} from '../../hooks/useEmployer';
import { useToast } from '../../contexts/ToastContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formatUGX, formatNumber } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { downloadCsv } from '../../utils/csvDownload';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import ErrorCard from '../../components/feedback/ErrorCard';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import styles from './EmployerReports.module.css';

// =============================================================================
// Report registry — drives the hub cards + the header titles/eyebrows.
// =============================================================================

const REPORTS = [
  {
    key: 'staff-roster',
    title: 'Staff roster',
    description: 'Every employee with job title, salary, funding mode, status and balance.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.75" />
        <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13A4 4 0 0116 11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'runs-summary',
    title: 'Contribution runs',
    description: 'Every run by period: line count, employer total, employee total, grand total.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
        <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'funding-breakdown',
    title: 'Funding breakdown',
    description: 'How funding splits between employer-funded and employee-funded contributions.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
        <path d="M21.21 15.89A10 10 0 118 2.83" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22 12A10 10 0 0012 2v10z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'balance-growth',
    title: 'Balance growth',
    description: 'Cumulative staff balances over time, built from your run history.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
        <path d="M3 3v18h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 15l4-5 3 3 5-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const REPORT_BY_KEY = Object.fromEntries(REPORTS.map((r) => [r.key, r]));

/** Human label for an employee's funding mode. */
function fundingModeLabel(emp) {
  const mode = emp?.contributionConfig?.mode ?? 'employer-only';
  return mode === 'co-contribution' ? 'Co-contribution' : 'Employer-only';
}

/** Title-case an employee status string for display. */
function statusLabel(status) {
  if (!status) return '—';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// =============================================================================
// Shell — hub ↔ report view switching inside one EmployerSlidePanel.
// =============================================================================

export default function EmployerReports({ splitMode = false }) {
  const { reportsOpen, setReportsOpen } = useEmployerPanel();
  const { employerId } = useEmployerScope();

  // 'hub' | one of REPORTS[].key
  const [view, setView] = useState('hub');

  // The report views publish their export config (rows/columns/filename) up to
  // the shell so the Export + Print actions can live in the panel header. The
  // config carries its own `view` key so the actions never act on stale data
  // from a report we've just navigated away from (avoids a reset effect).
  const [exportConfig, setExportConfig] = useState(null);

  // Navigating clears the previous report's config synchronously.
  const navigate = useCallback((next) => {
    setExportConfig(null);
    setView(next);
  }, []);
  const backToHub = useCallback(() => navigate('hub'), [navigate]);

  // Reset to the hub a moment after the panel closes so re-opening starts clean.
  useEffect(() => {
    if (reportsOpen) return undefined;
    const t = setTimeout(() => {
      setView('hub');
      setExportConfig(null);
    }, 400);
    return () => clearTimeout(t);
  }, [reportsOpen]);

  const activeReport = view === 'hub' ? null : REPORT_BY_KEY[view];
  const eyebrow = activeReport ? 'Report' : 'Reports';
  const title = activeReport ? activeReport.title : 'Reports';

  // Only expose config to the actions when it belongs to the current report.
  const liveConfig = exportConfig?.view === view ? exportConfig : null;

  const headerActions = activeReport ? (
    <div className={styles.headerActions}>
      <ReportActions config={liveConfig} />
      <button type="button" className={styles.backBtn} onClick={backToHub}>
        <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to reports
      </button>
    </div>
  ) : null;

  return (
    <EmployerSlidePanel
      open={reportsOpen}
      onClose={() => setReportsOpen(false)}
      title={title}
      eyebrow={eyebrow}
      width={680}
      splitMode={splitMode}
      headerActions={headerActions}
    >
      {view === 'hub' && <ReportsHub onSelect={navigate} />}
      {view === 'staff-roster' && (
        <StaffRosterReport employerId={employerId} onReady={setExportConfig} />
      )}
      {view === 'runs-summary' && (
        <RunsSummaryReport employerId={employerId} onReady={setExportConfig} />
      )}
      {view === 'funding-breakdown' && (
        <FundingBreakdownReport employerId={employerId} onReady={setExportConfig} />
      )}
      {view === 'balance-growth' && (
        <BalanceGrowthReport employerId={employerId} onReady={setExportConfig} />
      )}
    </EmployerSlidePanel>
  );
}

// =============================================================================
// Header actions — Export CSV (shared downloadCsv pipeline) + Print.
// =============================================================================

function ReportActions({ config }) {
  const { addToast } = useToast();
  const isMobile = useIsMobile();
  const [exporting, setExporting] = useState(false);

  const canExport =
    !!config &&
    Array.isArray(config.rows) &&
    config.rows.length > 0 &&
    Array.isArray(config.columns) &&
    config.columns.length > 0;

  const handleExport = useCallback(async () => {
    if (exporting || !canExport) return;
    setExporting(true);
    try {
      await downloadCsv({
        rows: config.rows,
        columns: config.columns,
        filename: config.filename || 'employer-report',
        isMobile,
        onCapNotice: ({ capped, total }) =>
          addToast(
            'warning',
            `Showing first ${formatNumber(capped)} rows in export — ${formatNumber(total)} total.`,
          ),
      });
    } catch (err) {
      addToast('error', err?.message || 'Could not export this report.');
    } finally {
      setExporting(false);
    }
  }, [exporting, canExport, config, isMobile, addToast]);

  // Print the whole document — the panel's print stylesheet (see the module
  // CSS) hides the dashboard chrome so only the report body prints.
  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined') window.print();
  }, []);

  return (
    <>
      <button
        type="button"
        className={styles.actionBtn}
        onClick={handleExport}
        disabled={!canExport || exporting}
        aria-label="Export report as CSV"
      >
        <svg viewBox="0 0 24 24" fill="none" width="15" height="15" aria-hidden="true">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="7,10 12,15 17,10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
        <span>{exporting ? 'Exporting…' : 'CSV'}</span>
      </button>
      <button
        type="button"
        className={styles.actionBtn}
        onClick={handlePrint}
        disabled={!canExport}
        aria-label="Print report"
      >
        <svg viewBox="0 0 24 24" fill="none" width="15" height="15" aria-hidden="true">
          <polyline points="6,9 6,2 18,2 18,9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="6" y="14" width="12" height="8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Print</span>
      </button>
    </>
  );
}

// =============================================================================
// Hub — the four report cards.
// =============================================================================

function ReportsHub({ onSelect }) {
  return (
    <div className={styles.hub}>
      <p className={styles.hubIntro}>
        Printable, exportable summaries of your staff, contribution runs and
        funding. Open a report to view it, then export to CSV or print.
      </p>
      <ul className={styles.hubGrid}>
        {REPORTS.map((report) => (
          <li key={report.key}>
            <button
              type="button"
              className={styles.hubCard}
              onClick={() => onSelect(report.key)}
              aria-label={`Open ${report.title} report`}
            >
              <span className={styles.hubCardIcon} aria-hidden="true">{report.icon}</span>
              <span className={styles.hubCardText}>
                <span className={styles.hubCardTitle}>{report.title}</span>
                <span className={styles.hubCardDesc}>{report.description}</span>
              </span>
              <svg className={styles.hubCardChevron} viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden="true">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// =============================================================================
// Shared report scaffolding — loading / error / empty guards + a print frame.
// =============================================================================

/**
 * Renders the standard async triad around a report body. `query` is the React
 * Query result for the report's primary read; `isEmpty` decides the empty
 * branch; `children` is the loaded body.
 */
function ReportFrame({ query, isEmpty, emptyTitle, emptyBody, loadingLabel, children }) {
  const { isLoading, isError, error, refetch, data } = query;
  const isCold = isLoading && (data == null || (Array.isArray(data) && data.length === 0));

  if (isCold) {
    return <SkeletonRow count={6} variant="compact" label={loadingLabel} />;
  }
  if (isError) {
    return <ErrorCard title="We couldn't load this report" message={error} onRetry={refetch} />;
  }
  if (isEmpty) {
    return <EmptyState kind="no-data" title={emptyTitle} body={emptyBody} />;
  }
  return <div className={styles.report}>{children}</div>;
}

/** Caption shown under each report heading inside the print frame. */
function ReportHeading({ title, summary }) {
  return (
    <div className={styles.reportHead}>
      <h3 className={styles.reportTitle}>{title}</h3>
      {summary && <p className={styles.reportSummary}>{summary}</p>}
    </div>
  );
}

// =============================================================================
// Report 1 — Staff roster
// =============================================================================

const ROSTER_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'jobTitle', label: 'Job title' },
  { key: 'salary', label: 'Salary (UGX)' },
  { key: 'fundingMode', label: 'Funding mode' },
  { key: 'status', label: 'Status' },
  { key: 'netBalance', label: 'Net balance (UGX)' },
];

function StaffRosterReport({ employerId, onReady }) {
  const query = useEmployees(employerId);
  const { data: employees = [] } = query;

  const rows = useMemo(
    () =>
      employees.map((e) => ({
        name: e.name,
        jobTitle: e.jobTitle || '—',
        salary: Math.round(e.salary || 0),
        fundingMode: fundingModeLabel(e),
        status: statusLabel(e.status),
        netBalance: Math.round(e.netBalance || 0),
      })),
    [employees],
  );

  const totals = useMemo(
    () => ({
      salary: rows.reduce((s, r) => s + r.salary, 0),
      netBalance: rows.reduce((s, r) => s + r.netBalance, 0),
    }),
    [rows],
  );

  // Publish export config (CSV rows are already flat / display-ready).
  useEffect(() => {
    if (rows.length === 0) return;
    onReady({ view: 'staff-roster', rows, columns: ROSTER_COLUMNS, filename: 'staff-roster' });
  }, [rows, onReady]);

  return (
    <ReportFrame
      query={query}
      isEmpty={employees.length === 0}
      emptyTitle="No staff yet"
      emptyBody="Onboard staff to see them in this report."
      loadingLabel="Loading staff roster"
    >
      <ReportHeading
        title="Staff roster"
        summary={`${formatNumber(rows.length)} ${rows.length === 1 ? 'employee' : 'employees'}`}
      />
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Job title</th>
              <th scope="col" className={styles.num}>Salary</th>
              <th scope="col">Funding</th>
              <th scope="col">Status</th>
              <th scope="col" className={styles.num}>Net balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.name}-${i}`}>
                <th scope="row" className={styles.rowHead}>{r.name}</th>
                <td>{r.jobTitle}</td>
                <td className={styles.num}>{formatUGX(r.salary, { compact: false })}</td>
                <td>{r.fundingMode}</td>
                <td>
                  <span className={styles.statusTag} data-status={r.status.toLowerCase()}>{r.status}</span>
                </td>
                <td className={styles.num}>{formatUGX(r.netBalance, { compact: false })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>Totals</th>
              <td className={styles.num}>{formatUGX(totals.salary, { compact: false })}</td>
              <td colSpan={2} aria-hidden="true" />
              <td className={styles.num}>{formatUGX(totals.netBalance, { compact: false })}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportFrame>
  );
}

// =============================================================================
// Report 2 — Contribution-runs summary
// =============================================================================

const RUNS_COLUMNS = [
  { key: 'period', label: 'Period' },
  { key: 'date', label: 'Date' },
  { key: 'lineCount', label: 'Lines' },
  { key: 'employerTotal', label: 'Employer total (UGX)' },
  { key: 'employeeTotal', label: 'Employee total (UGX)' },
  { key: 'grandTotal', label: 'Grand total (UGX)' },
];

function RunsSummaryReport({ employerId, onReady }) {
  const query = useContributionRuns(employerId);
  const { data: runs = [] } = query;

  const rows = useMemo(
    () =>
      runs.map((run) => ({
        period: run.periodLabel || 'Untitled run',
        date: formatDate(run.runAt),
        lineCount: Number.isFinite(Number(run.lineCount)) ? Number(run.lineCount) : '',
        employerTotal: Math.round(run.employerTotal || 0),
        employeeTotal: Math.round(run.employeeTotal || 0),
        grandTotal: Math.round(run.grandTotal || 0),
      })),
    [runs],
  );

  const totals = useMemo(
    () => ({
      employerTotal: rows.reduce((s, r) => s + r.employerTotal, 0),
      employeeTotal: rows.reduce((s, r) => s + r.employeeTotal, 0),
      grandTotal: rows.reduce((s, r) => s + r.grandTotal, 0),
    }),
    [rows],
  );

  useEffect(() => {
    if (rows.length === 0) return;
    onReady({ view: 'runs-summary', rows, columns: RUNS_COLUMNS, filename: 'contribution-runs-summary' });
  }, [rows, onReady]);

  return (
    <ReportFrame
      query={query}
      isEmpty={runs.length === 0}
      emptyTitle="No contribution runs yet"
      emptyBody="Record a contribution run to see it summarised here."
      loadingLabel="Loading contribution-runs summary"
    >
      <ReportHeading
        title="Contribution-runs summary"
        summary={`${formatNumber(rows.length)} ${rows.length === 1 ? 'run' : 'runs'} · ${formatUGX(totals.grandTotal)} funded`}
      />
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Date</th>
              <th scope="col" className={styles.num}>Lines</th>
              <th scope="col" className={styles.num}>Employer</th>
              <th scope="col" className={styles.num}>Employee</th>
              <th scope="col" className={styles.num}>Grand total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.period}-${i}`}>
                <th scope="row" className={styles.rowHead}>{r.period}</th>
                <td>{r.date}</td>
                <td className={styles.num}>{r.lineCount === '' ? '—' : formatNumber(r.lineCount)}</td>
                <td className={styles.num}>{formatUGX(r.employerTotal, { compact: false })}</td>
                <td className={styles.num}>{r.employeeTotal > 0 ? formatUGX(r.employeeTotal, { compact: false }) : '—'}</td>
                <td className={`${styles.num} ${styles.strong}`}>{formatUGX(r.grandTotal, { compact: false })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>Totals</th>
              <td className={styles.num}>{formatUGX(totals.employerTotal, { compact: false })}</td>
              <td className={styles.num}>{formatUGX(totals.employeeTotal, { compact: false })}</td>
              <td className={`${styles.num} ${styles.strong}`}>{formatUGX(totals.grandTotal, { compact: false })}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportFrame>
  );
}

// =============================================================================
// Report 3 — Employer-vs-employee funding breakdown
// =============================================================================

const FUNDING_COLUMNS = [
  { key: 'period', label: 'Period' },
  { key: 'date', label: 'Date' },
  { key: 'employerTotal', label: 'Employer-funded (UGX)' },
  { key: 'employeeTotal', label: 'Employee-funded (UGX)' },
  { key: 'employerShare', label: 'Employer share (%)' },
];

function FundingBreakdownReport({ employerId, onReady }) {
  const runsQuery = useContributionRuns(employerId);
  const { data: metrics } = useEmployerMetrics(employerId);
  const { data: runs = [] } = runsQuery;

  // Lifetime split from the run history (the metrics YTD figures cover only the
  // current year; the per-run table + totals here cover all recorded runs).
  const lifetime = useMemo(() => {
    const employer = runs.reduce((s, r) => s + (r.employerTotal || 0), 0);
    const employee = runs.reduce((s, r) => s + (r.employeeTotal || 0), 0);
    return { employer, employee, total: employer + employee };
  }, [runs]);

  const employerYtd = Math.round(metrics?.employerYtd || 0);
  const employeeYtd = Math.round(metrics?.employeeYtd || 0);

  const rows = useMemo(
    () =>
      runs.map((run) => {
        const employer = Math.round(run.employerTotal || 0);
        const employee = Math.round(run.employeeTotal || 0);
        const grand = employer + employee;
        return {
          period: run.periodLabel || 'Untitled run',
          date: formatDate(run.runAt),
          employerTotal: employer,
          employeeTotal: employee,
          employerShare: grand > 0 ? Math.round((employer / grand) * 100) : 0,
        };
      }),
    [runs],
  );

  useEffect(() => {
    if (rows.length === 0) return;
    onReady({ view: 'funding-breakdown', rows, columns: FUNDING_COLUMNS, filename: 'funding-breakdown' });
  }, [rows, onReady]);

  const employerPct = lifetime.total > 0 ? Math.round((lifetime.employer / lifetime.total) * 100) : 0;
  const employeePct = lifetime.total > 0 ? 100 - employerPct : 0;

  return (
    <ReportFrame
      query={runsQuery}
      isEmpty={lifetime.total === 0}
      emptyTitle="No funding recorded yet"
      emptyBody="Record a contribution run to see the employer-vs-employee split."
      loadingLabel="Loading funding breakdown"
    >
      <ReportHeading
        title="Funding breakdown"
        summary={`${formatUGX(lifetime.total)} funded across ${formatNumber(rows.length)} ${rows.length === 1 ? 'run' : 'runs'}`}
      />

      <div className={styles.fundingTop}>
        <FundingDonut employerPct={employerPct} employeePct={employeePct} />
        <dl className={styles.fundingLegend}>
          <FundingLegendItem
            swatch="employer"
            label="Employer-funded"
            value={formatUGX(lifetime.employer, { compact: false })}
            pct={employerPct}
          />
          <FundingLegendItem
            swatch="employee"
            label="Employee-funded"
            value={formatUGX(lifetime.employee, { compact: false })}
            pct={employeePct}
          />
          <div className={styles.fundingYtd}>
            <span className={styles.fundingYtdLabel}>This year (YTD)</span>
            <span className={styles.fundingYtdValue}>
              {formatUGX(employerYtd)} employer · {formatUGX(employeeYtd)} employee
            </span>
          </div>
        </dl>
      </div>

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Date</th>
              <th scope="col" className={styles.num}>Employer</th>
              <th scope="col" className={styles.num}>Employee</th>
              <th scope="col" className={styles.num}>Employer %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.period}-${i}`}>
                <th scope="row" className={styles.rowHead}>{r.period}</th>
                <td>{r.date}</td>
                <td className={styles.num}>{formatUGX(r.employerTotal, { compact: false })}</td>
                <td className={styles.num}>{r.employeeTotal > 0 ? formatUGX(r.employeeTotal, { compact: false }) : '—'}</td>
                <td className={styles.num}>{r.employerShare}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>Totals</th>
              <td className={styles.num}>{formatUGX(lifetime.employer, { compact: false })}</td>
              <td className={styles.num}>{formatUGX(lifetime.employee, { compact: false })}</td>
              <td className={`${styles.num} ${styles.strong}`}>{employerPct}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportFrame>
  );
}

/** Pure-SVG donut: employer (indigo) vs employee (lavender) share. */
function FundingDonut({ employerPct, employeePct }) {
  const size = 132;
  const stroke = 20;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const employerLen = (employerPct / 100) * circumference;

  return (
    <svg
      className={styles.donut}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Employer-funded ${employerPct}%, employee-funded ${employeePct}%`}
    >
      {/* Track = employee share (full ring underneath). */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-lavender)" strokeWidth={stroke} />
      {/* Employer arc on top. */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="var(--color-indigo)"
        strokeWidth={stroke}
        strokeDasharray={`${employerLen} ${circumference - employerLen}`}
        strokeDashoffset={circumference / 4}
        strokeLinecap="butt"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy - 2} textAnchor="middle" className={styles.donutValue}>{employerPct}%</text>
      <text x={cx} y={cy + 16} textAnchor="middle" className={styles.donutCaption}>employer</text>
    </svg>
  );
}

function FundingLegendItem({ swatch, label, value, pct }) {
  return (
    <div className={styles.legendItem}>
      <span className={styles.legendSwatch} data-swatch={swatch} aria-hidden="true" />
      <dt className={styles.legendLabel}>{label}</dt>
      <dd className={styles.legendValue}>
        {value} <span className={styles.legendPct}>· {pct}%</span>
      </dd>
    </div>
  );
}

// =============================================================================
// Report 4 — Staff balance growth (cumulative grand total over run dates)
// =============================================================================

const GROWTH_COLUMNS = [
  { key: 'period', label: 'Period' },
  { key: 'date', label: 'Date' },
  { key: 'runTotal', label: 'Run total (UGX)' },
  { key: 'cumulative', label: 'Cumulative balance (UGX)' },
];

function BalanceGrowthReport({ employerId, onReady }) {
  const query = useContributionRuns(employerId);
  const { data: runs = [] } = query;

  // Runs arrive newest-first; growth reads oldest→newest so the cumulative
  // line climbs left-to-right. `reduce` carries the running total without
  // reassigning an outer binding after render.
  const series = useMemo(() => {
    const ordered = [...runs].sort((a, b) =>
      String(a.runAt ?? '').localeCompare(String(b.runAt ?? '')),
    );
    return ordered.reduce((acc, run) => {
      const runTotal = Math.round(run.grandTotal || 0);
      const cumulative = (acc.length ? acc[acc.length - 1].cumulative : 0) + runTotal;
      acc.push({
        period: run.periodLabel || 'Untitled run',
        date: formatDate(run.runAt),
        runTotal,
        cumulative,
      });
      return acc;
    }, []);
  }, [runs]);

  useEffect(() => {
    if (series.length === 0) return;
    onReady({ view: 'balance-growth', rows: series, columns: GROWTH_COLUMNS, filename: 'staff-balance-growth' });
  }, [series, onReady]);

  const peak = series.length ? series[series.length - 1].cumulative : 0;

  return (
    <ReportFrame
      query={query}
      isEmpty={runs.length === 0}
      emptyTitle="No balance history yet"
      emptyBody="Record contribution runs to chart how staff balances grow over time."
      loadingLabel="Loading balance growth"
    >
      <ReportHeading
        title="Staff balance growth"
        summary={`${formatUGX(peak)} cumulative across ${formatNumber(series.length)} ${series.length === 1 ? 'run' : 'runs'}`}
      />

      <BalanceGrowthChart series={series} />

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Date</th>
              <th scope="col" className={styles.num}>Run total</th>
              <th scope="col" className={styles.num}>Cumulative</th>
            </tr>
          </thead>
          <tbody>
            {series.map((r, i) => (
              <tr key={`${r.period}-${i}`}>
                <th scope="row" className={styles.rowHead}>{r.period}</th>
                <td>{r.date}</td>
                <td className={styles.num}>{formatUGX(r.runTotal, { compact: false })}</td>
                <td className={`${styles.num} ${styles.strong}`}>{formatUGX(r.cumulative, { compact: false })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportFrame>
  );
}

/**
 * Pure-SVG cumulative-balance line + area. Single data point degrades to a
 * lone marker (no line). The viewBox is unitless so the SVG scales fluidly.
 */
function BalanceGrowthChart({ series }) {
  const W = 600;
  const H = 180;
  const padX = 8;
  const padY = 16;
  const max = Math.max(...series.map((s) => s.cumulative), 1);
  const n = series.length;

  const xFor = (i) => (n <= 1 ? W / 2 : padX + (i / (n - 1)) * (W - padX * 2));
  const yFor = (v) => H - padY - (v / max) * (H - padY * 2);

  const points = series.map((s, i) => ({ x: xFor(i), y: yFor(s.cumulative) }));
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath =
    points.length > 1
      ? `${linePath} L${points[points.length - 1].x.toFixed(1)} ${H - padY} L${points[0].x.toFixed(1)} ${H - padY} Z`
      : '';

  return (
    <svg
      className={styles.growthChart}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Cumulative balance growth across ${n} ${n === 1 ? 'run' : 'runs'}, peaking at ${formatUGX(max)}`}
    >
      <line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} stroke="var(--color-lavender)" strokeWidth="1" />
      {areaPath && <path d={areaPath} fill="url(#empGrowthFill)" />}
      <defs>
        <linearGradient id="empGrowthFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-indigo)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--color-indigo)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {points.length > 1 && (
        <path d={linePath} fill="none" stroke="var(--color-indigo)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--color-indigo)" />
      ))}
    </svg>
  );
}
