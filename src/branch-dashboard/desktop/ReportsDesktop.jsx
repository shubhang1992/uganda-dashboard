import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import {
  ResponsiveContainer,
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useEntityMetrics, useChildren, useChildrenMetrics } from '../../hooks/useEntity';
import { formatUGX, formatUGXShort, formatNumber } from '../../utils/currency';
import { downloadSheet } from '../../utils/xlsx';
import { useToast } from '../../contexts/ToastContext';
import { PALETTE, GENDER_COLORS, axisTick, chartTooltip } from '../../employer-dashboard/reports/chartConfig';
import { PageHead, MetricRow, Tile, Card, SectionHead, Btn } from '../../employer-dashboard/desktop/ui';
import { employeesIcon, checkIcon, pendingIcon, downloadIcon } from '../../employer-dashboard/desktop/icons';
import ui from '../../employer-dashboard/desktop/ui.module.css';
import styles from './ReportsDesktop.module.css';

const AGE_KEYS = ['18-25', '26-35', '36-45', '46-55', '56+'];

const PILLS = [
  { key: 'all', label: 'All subscribers' },
  { key: 'contributions', label: 'Contributions' },
  { key: 'kyc', label: 'KYC compliance' },
];

// Map a needs-attention reportId (passed via route state) to a pill.
function pillFromReportId(reportId) {
  if (reportId === 'kyc-compliance') return 'kyc';
  if (reportId === 'contributions-collections') return 'contributions';
  return 'all';
}

export default function ReportsDesktop() {
  const reduceMotion = useReducedMotion();
  const location = useLocation();
  const { addToast } = useToast();
  const { branchId } = useBranchScope();
  const { data: metrics = {} } = useEntityMetrics('branch', branchId);
  const { data: agentsRaw = [] } = useChildren('branch', branchId);
  const { data: agentMetricsMap = {} } = useChildrenMetrics('branch', branchId);

  const agents = useMemo(
    () => agentsRaw.map((a) => ({ ...a, metrics: agentMetricsMap[a.id] ?? a.metrics })),
    [agentsRaw, agentMetricsMap],
  );

  const [view, setView] = useState(() => pillFromReportId(location.state?.reportId));

  const demographics = useMemo(() => {
    let male = 0, female = 0;
    const age = [0, 0, 0, 0, 0];
    agents.forEach((a) => {
      const gr = a.metrics?.genderRatio || {};
      male += gr.male || 0;
      female += gr.female || 0;
      const ad = a.metrics?.ageDistribution || {};
      AGE_KEYS.forEach((k, i) => { age[i] += ad[k] || 0; });
    });
    const total = male + female || 1;
    return {
      gender: [
        { name: 'Male', value: male },
        { name: 'Female', value: female },
      ],
      malePct: Math.round((male / total) * 100),
      femalePct: Math.round((female / total) * 100),
      age: AGE_KEYS.map((band, i) => ({ band, value: age[i] })),
    };
  }, [agents]);

  const contributions = useMemo(() => {
    const series = (metrics.monthlyContributions || []).filter((v) => typeof v === 'number');
    const now = new Date();
    return series.map((v, i) => {
      const m = new Date(now.getFullYear(), now.getMonth() - (series.length - 1 - i), 1);
      return { label: m.toLocaleString('en-US', { month: 'short' }), total: v };
    });
  }, [metrics.monthlyContributions]);

  const totalSubs = metrics.totalSubscribers || 0;
  const pending = metrics.kycPending || 0;
  const incomplete = metrics.kycIncomplete || 0;
  const verified = Math.max(0, totalSubs - pending - incomplete);

  async function exportCurrent() {
    let rows, columns, filename;
    if (view === 'contributions') {
      rows = contributions.map((c) => ({ month: c.label, total: c.total }));
      columns = [{ key: 'month', label: 'Month' }, { key: 'total', label: 'UGX collected' }];
      filename = 'branch-contributions';
    } else if (view === 'kyc') {
      rows = [
        { status: 'Verified', count: verified },
        { status: 'Pending', count: pending },
        { status: 'Incomplete', count: incomplete },
      ];
      columns = [{ key: 'status', label: 'KYC status' }, { key: 'count', label: 'Subscribers' }];
      filename = 'branch-kyc-compliance';
    } else {
      rows = [
        { segment: 'Male', value: demographics.gender[0].value },
        { segment: 'Female', value: demographics.gender[1].value },
        ...demographics.age.map((a) => ({ segment: `Age ${a.band}`, value: a.value })),
      ];
      columns = [{ key: 'segment', label: 'Segment' }, { key: 'value', label: 'Subscribers' }];
      filename = 'branch-demographics';
    }
    try {
      await downloadSheet({ rows, columns, filename, sheetName: 'Report' });
      addToast('success', 'Report exported to Excel.');
    } catch (e) {
      addToast('error', e?.message || 'Could not export the report.');
    }
  }

  return (
    <div className={ui.stack}>
      <PageHead
        eyebrow="Analytics"
        title="Reports"
        sub="Branch demographics, contributions and KYC compliance"
      />

      <div className={styles.toolbar}>
        <div className={styles.pills} role="tablist" aria-label="Report type">
          {PILLS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={view === p.key}
              className={`${styles.pill} ${view === p.key ? styles.pillOn : ''}`}
              onClick={() => setView(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Btn variant="secondary" onClick={exportCurrent}>{downloadIcon(16)} Export to Excel</Btn>
      </div>

      {view === 'all' && (
        <div className={styles.grid2}>
          <Card>
            <SectionHead title="Gender split" tag={`${formatNumber(totalSubs)} subscribers`} />
            <div className={styles.donutWrap}>
              <div className={styles.donutChart}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={demographics.gender} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" stroke="#FFFFFF" strokeWidth={2} isAnimationActive={!reduceMotion}>
                      {demographics.gender.map((e, i) => <Cell key={e.name} fill={GENDER_COLORS[i]} />)}
                    </Pie>
                    <Tooltip cursor={false} content={(p) => chartTooltip({ ...p, valueFormatter: (v) => `${formatNumber(v)} subscribers` })} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className={styles.legend}>
                <div className={styles.lg}><span className={styles.sw} style={{ background: GENDER_COLORS[0] }} />Male<span className={styles.lgVal}>{demographics.malePct}%</span></div>
                <div className={styles.lg}><span className={styles.sw} style={{ background: GENDER_COLORS[1] }} />Female<span className={styles.lgVal}>{demographics.femalePct}%</span></div>
                <div className={styles.lgNote}>{formatNumber(demographics.gender[0].value + demographics.gender[1].value)} subscribers with a recorded gender</div>
              </div>
            </div>
          </Card>

          <Card>
            <SectionHead title="Age distribution" tag="Working-age skew" />
            <div className={styles.chartBox}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={demographics.age} margin={{ top: 8, right: 12, left: -16, bottom: 4 }}>
                  <CartesianGrid stroke={PALETTE.gridLine} vertical={false} />
                  <XAxis dataKey="band" tick={axisTick} tickLine={false} axisLine={{ stroke: PALETTE.gridLine }} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: PALETTE.lavender, opacity: 0.4 }} content={(p) => chartTooltip({ ...p, valueFormatter: (v) => `${formatNumber(v)} subscribers` })} />
                  <Bar dataKey="value" name="Subscribers" fill={PALETTE.indigo} radius={[6, 6, 0, 0]} isAnimationActive={!reduceMotion} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {view === 'contributions' && (
        <Card>
          <SectionHead title="Contributions — last 12 months" tag="UGX collected" />
          {contributions.length === 0 ? (
            <p className={styles.empty}>No contribution history yet for this branch.</p>
          ) : (
            <div className={styles.chartBox} style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={contributions} margin={{ top: 12, right: 12, left: -8, bottom: 4 }}>
                  <defs>
                    <linearGradient id="branchContribFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PALETTE.indigo} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={PALETTE.indigo} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={PALETTE.gridLine} vertical={false} />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: PALETTE.gridLine }} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={formatUGXShort} width={52} />
                  <Tooltip cursor={{ stroke: PALETTE.lavender }} content={(p) => chartTooltip({ ...p, valueFormatter: (v) => formatUGX(v) })} />
                  <Area type="monotone" dataKey="total" name="Collected" stroke={PALETTE.indigo} strokeWidth={2.5} fill="url(#branchContribFill)" isAnimationActive={!reduceMotion} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      )}

      {view === 'kyc' && (
        <>
          <MetricRow cols={3}>
            <Tile accent="green" icon={checkIcon(18)} label="Verified" value={formatNumber(verified)} sub={totalSubs ? `${Math.round((verified / totalSubs) * 100)}% of subscribers` : 'No subscribers yet'} />
            <Tile accent="amber" icon={pendingIcon(18)} label="Pending" value={formatNumber(pending)} sub="Awaiting verification" />
            <Tile accent="indigoSoft" icon={employeesIcon(18)} label="Incomplete" value={formatNumber(incomplete)} sub="Missing documents" />
          </MetricRow>
          <Card>
            <SectionHead title="KYC compliance" tag={`${formatNumber(totalSubs)} subscribers`} />
            <p className={styles.kycNote}>
              {pending + incomplete === 0
                ? 'Every subscriber at this branch is fully verified — no outstanding KYC.'
                : `${formatNumber(pending + incomplete)} subscribers need attention: ${formatNumber(pending)} pending verification and ${formatNumber(incomplete)} with incomplete documents. Agents can resume these from each subscriber's profile.`}
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
