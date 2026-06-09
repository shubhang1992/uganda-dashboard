// Employer Analytics panel — an at-a-glance view of the workforce (gender, age,
// status, monthly-saving and role distributions + headcount growth) with KPI
// stats and downloadable reports. Replaces the former hub-and-spoke report
// tables; the underlying data stays exportable via the Downloads section.
//
// Charts use Recharts with the employer-local chartConfig (brand palette + custom
// tooltip). Downloads reuse the shared `downloadCsv` (src/utils/csvDownload.js)
// and `downloadSheet` (src/utils/xlsx.js — lazy-loads xlsx) helpers. This
// component never imports `employerSeed` / `mockData`; data arrives via the
// employer hooks (CLAUDE.md §4.1).

import { useState, useMemo, useCallback } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar,
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import { useEmployees, useContributionRuns, useEmployer } from '../../hooks/useEmployer';
import { useToast } from '../../contexts/ToastContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formatUGX, formatNumber } from '../../utils/currency';
import { downloadCsv } from '../../utils/csvDownload';
import { downloadSheet } from '../../utils/xlsx';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import ErrorCard from '../../components/feedback/ErrorCard';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import {
  PALETTE, GENDER_COLORS, STATUS_COLORS, CATEGORY_COLORS, axisTick, chartTooltip,
} from './chartConfig';
import {
  deriveEmployeeAnalytics,
  buildRosterExport,
  buildSummaryExport,
  buildRunsExport,
} from './deriveEmployeeAnalytics';
import styles from './EmployerReports.module.css';

const LEGEND_STYLE = { fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, color: PALETTE.text, paddingTop: 4 };
const CHART_HEIGHT = 230;

const DownloadIcon = (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="15" height="15">
    <path d="M10 3v10M10 13l-3-3M10 13l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 15v2h14v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** "Male 9, Female 7" — a screen-reader description of a distribution. */
function describe(items, nameKey = 'name') {
  return items.filter((i) => i.value > 0).map((i) => `${i[nameKey] ?? i.key} ${i.value}`).join(', ') || 'no data';
}

function Kpi({ label, value, sub }) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>{value}</span>
      {sub != null && <span className={styles.kpiSub}>{sub}</span>}
    </div>
  );
}

function ChartCard({ id, title, sub, ariaLabel, hasData, children }) {
  return (
    <section className={styles.chartCard} aria-labelledby={id}>
      <header className={styles.chartHead}>
        <h3 id={id} className={styles.chartTitle}>{title}</h3>
        {sub && <span className={styles.chartSub}>{sub}</span>}
      </header>
      <div className={styles.chartBody} role="img" aria-label={ariaLabel}>
        {hasData ? children : <p className={styles.chartEmpty}>No data yet.</p>}
      </div>
    </section>
  );
}

export default function EmployerReports({ splitMode = false }) {
  const { reportsOpen, setReportsOpen } = useEmployerPanel();
  const { employerId } = useEmployerScope();
  const { addToast } = useToast();
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();

  const { data: employees = [], isLoading, isError, error, refetch } = useEmployees(employerId);
  const { data: runs = [] } = useContributionRuns(employerId);
  const { data: employer } = useEmployer(employerId);

  const a = useMemo(() => deriveEmployeeAnalytics(employees, employer?.defaultContributionConfig), [employees, employer]);
  const total = a.kpis.total;
  const pct = useCallback((v) => (total ? `${Math.round((v / total) * 100)}%` : '0%'), [total]);

  const [exporting, setExporting] = useState(false);

  const runExport = useCallback(async (label, fn) => {
    if (exporting) return;
    setExporting(true);
    try {
      await fn();
    } catch (err) {
      addToast('error', err?.message || `Could not export ${label}.`);
    } finally {
      setExporting(false);
    }
  }, [exporting, addToast]);

  const exportRoster = useCallback((format) => runExport('the roster', async () => {
    const { rows, columns } = buildRosterExport(employees);
    if (format === 'xlsx') {
      await downloadSheet({ rows, columns, filename: 'employee-roster', sheetName: 'Employees' });
    } else {
      await downloadCsv({
        rows, columns, filename: 'employee-roster', isMobile,
        onCapNotice: ({ capped }) => addToast('warning', `Showing the first ${formatNumber(capped)} rows in the export.`),
      });
    }
    addToast('success', `Exported ${formatNumber(employees.length)} ${employees.length === 1 ? 'employee' : 'employees'}.`);
  }), [runExport, employees, isMobile, addToast]);

  const exportSummary = useCallback(() => runExport('the summary', async () => {
    const { rows, columns } = buildSummaryExport(a);
    await downloadCsv({ rows, columns, filename: 'employee-demographics-summary', isMobile });
    addToast('success', 'Demographics summary exported.');
  }), [runExport, a, isMobile, addToast]);

  const exportRuns = useCallback(() => runExport('the runs', async () => {
    if (runs.length === 0) { addToast('info', 'No contribution runs to export yet.'); return; }
    const { rows, columns } = buildRunsExport(runs);
    await downloadCsv({ rows, columns, filename: 'contribution-runs', isMobile });
    addToast('success', `Exported ${formatNumber(runs.length)} ${runs.length === 1 ? 'run' : 'runs'}.`);
  }), [runExport, runs, isMobile, addToast]);

  const isCold = isLoading && employees.length === 0;

  const headerActions = (
    <button
      type="button"
      className={styles.headerExport}
      onClick={() => exportRoster('csv')}
      disabled={exporting || a.isEmpty}
    >
      {DownloadIcon}
      <span>{exporting ? 'Exporting…' : 'Export'}</span>
    </button>
  );

  return (
    <EmployerSlidePanel
      open={reportsOpen}
      onClose={() => setReportsOpen(false)}
      title="Analytics"
      eyebrow="Insights"
      width={820}
      splitMode={splitMode}
      headerActions={!isCold && !isError && !a.isEmpty ? headerActions : null}
    >
      {isCold ? (
        <SkeletonRow count={6} variant="compact" label="Loading analytics" />
      ) : isError ? (
        <ErrorCard title="We couldn't load analytics" message={error} onRetry={refetch} />
      ) : a.isEmpty ? (
        <EmptyState kind="no-data" title="No employees yet" body="Staff you onboard will appear here with demographic and contribution analytics." />
      ) : (
        <div className={styles.dash}>
          <p className={styles.intro}>
            A live snapshot of your {formatNumber(total)}-person workforce. Use the
            Download reports section below to export the underlying data.
          </p>

          {/* KPI strip */}
          <div className={styles.kpiRow}>
            <Kpi label="Employees" value={formatNumber(a.kpis.total)} />
            <Kpi label="Active" value={formatNumber(a.kpis.active)} sub={`${a.kpis.activePct}% of staff`} />
            <Kpi label="Inactive" value={formatNumber(a.kpis.suspended)} />
            <Kpi label="Avg age" value={a.kpis.avgAge ? `${a.kpis.avgAge} yrs` : '—'} />
            <Kpi label="Avg saving / mo" value={formatUGX(a.kpis.avgMonthly)} />
            <Kpi label="Monthly funding" value={formatUGX(a.kpis.totalMonthly)} />
            <Kpi label="Group cover" value={a.coverage.enabled ? formatUGX(a.coverage.cover) : 'Off'} sub={a.coverage.enabled ? 'All staff' : 'Not set up'} />
          </div>

          {/* Charts */}
          <div className={styles.chartGrid}>
            <ChartCard id="an-gender" title="Gender" sub="Staff by gender" hasData={a.gender.length > 0} ariaLabel={`Gender distribution: ${describe(a.gender)}`}>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <PieChart>
                  <Pie data={a.gender} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" stroke="#FFFFFF" strokeWidth={2} isAnimationActive={!reduceMotion}>
                    {a.gender.map((e, i) => <Cell key={e.key} fill={GENDER_COLORS[i % GENDER_COLORS.length]} />)}
                  </Pie>
                  <Tooltip cursor={false} content={(p) => chartTooltip({ ...p, valueFormatter: (v) => `${formatNumber(v)} (${pct(v)})` })} />
                  <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={LEGEND_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard id="an-age" title="Age distribution" sub="Staff by age band" hasData={a.age.some((d) => d.value > 0)} ariaLabel={`Age distribution: ${describe(a.age, 'key')}`}>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={a.age} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                  <CartesianGrid stroke={PALETTE.gridLine} vertical={false} />
                  <XAxis dataKey="key" tick={axisTick} tickLine={false} axisLine={{ stroke: PALETTE.gridLine }} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: PALETTE.lavender, opacity: 0.4 }} content={(p) => chartTooltip({ ...p, valueFormatter: (v) => `${formatNumber(v)} staff` })} />
                  <Bar dataKey="value" name="Staff" fill={PALETTE.indigo} radius={[6, 6, 0, 0]} isAnimationActive={!reduceMotion} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard id="an-status" title="Employment status" sub="Active vs inactive" hasData={a.status.some((d) => d.value > 0)} ariaLabel={`Employment status: ${describe(a.status)}`}>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <PieChart>
                  <Pie data={a.status} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" stroke="#FFFFFF" strokeWidth={2} isAnimationActive={!reduceMotion}>
                    {a.status.map((e) => <Cell key={e.key} fill={STATUS_COLORS[e.key] || PALETTE.gray} />)}
                  </Pie>
                  <Tooltip cursor={false} content={(p) => chartTooltip({ ...p, valueFormatter: (v) => `${formatNumber(v)} (${pct(v)})` })} />
                  <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={LEGEND_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard id="an-saving" title="Monthly saving" sub="Staff by monthly contribution" hasData={a.saving.some((d) => d.value > 0)} ariaLabel={`Monthly saving distribution: ${describe(a.saving, 'key')}`}>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={a.saving} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                  <CartesianGrid stroke={PALETTE.gridLine} vertical={false} />
                  <XAxis dataKey="key" tick={axisTick} tickLine={false} axisLine={{ stroke: PALETTE.gridLine }} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: PALETTE.lavender, opacity: 0.4 }} content={(p) => chartTooltip({ ...p, valueFormatter: (v) => `${formatNumber(v)} staff` })} />
                  <Bar dataKey="value" name="Staff" fill={PALETTE.teal} radius={[6, 6, 0, 0]} isAnimationActive={!reduceMotion} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard id="an-roles" title="Roles" sub="Top job titles" hasData={a.occupation.some((d) => d.value > 0) && a.occupation.some((d) => d.label !== '—')} ariaLabel={`Roles: ${describe(a.occupation, 'label')}`}>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={a.occupation} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke={PALETTE.gridLine} horizontal={false} />
                  <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={axisTick} tickLine={false} axisLine={false} width={104} />
                  <Tooltip cursor={{ fill: PALETTE.lavender, opacity: 0.4 }} content={(p) => chartTooltip({ ...p, valueFormatter: (v) => `${formatNumber(v)} staff` })} />
                  <Bar dataKey="value" name="Staff" fill={PALETTE.indigoSoft} radius={[0, 6, 6, 0]} isAnimationActive={!reduceMotion}>
                    {a.occupation.map((e, i) => <Cell key={e.key} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard id="an-growth" title="Headcount growth" sub="Cumulative staff by join month" hasData={a.growth.length > 0} ariaLabel={`Headcount growth over ${a.growth.length} months, now ${formatNumber(a.kpis.total)} staff`}>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <AreaChart data={a.growth} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                  <defs>
                    <linearGradient id="empGrowthFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PALETTE.indigo} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={PALETTE.indigo} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={PALETTE.gridLine} vertical={false} />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: PALETTE.gridLine }} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ stroke: PALETTE.lavender }} content={(p) => chartTooltip({ ...p, valueFormatter: (v) => `${formatNumber(v)} staff` })} />
                  <Area type="monotone" dataKey="total" name="Total staff" stroke={PALETTE.indigo} strokeWidth={2} fill="url(#empGrowthFill)" isAnimationActive={!reduceMotion} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Downloads */}
          <section className={styles.downloads} aria-labelledby="an-downloads">
            <h3 id="an-downloads" className={styles.downloadsTitle}>Download reports</h3>
            <p className={styles.downloadsSub}>Export the underlying data for sharing or your own records.</p>
            <div className={styles.downloadGrid}>
              <button type="button" className={styles.downloadBtn} onClick={() => exportRoster('csv')} disabled={exporting}>
                {DownloadIcon}<span>Employees<small>CSV</small></span>
              </button>
              <button type="button" className={styles.downloadBtn} onClick={() => exportRoster('xlsx')} disabled={exporting}>
                {DownloadIcon}<span>Employees<small>Excel</small></span>
              </button>
              <button type="button" className={styles.downloadBtn} onClick={exportSummary} disabled={exporting}>
                {DownloadIcon}<span>Demographics summary<small>CSV</small></span>
              </button>
              <button type="button" className={styles.downloadBtn} onClick={exportRuns} disabled={exporting || runs.length === 0}>
                {DownloadIcon}<span>Contribution runs<small>CSV</small></span>
              </button>
            </div>
          </section>
        </div>
      )}
    </EmployerSlidePanel>
  );
}
