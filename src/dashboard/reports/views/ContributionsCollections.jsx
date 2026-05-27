import { useState, useMemo } from 'react';
import { useAllEntities, useAllEntitiesMap, useChildren, useAllEntitiesMetrics, useChildrenMetrics } from '../../../hooks/useEntity';
import { useBranchScope } from '../../../contexts/BranchScopeContext';
import { formatUGX } from '../../../utils/finance';
import ReportView from '../ReportView';
import ReportTable from '../ReportTable';
import FilterSelect from '../FilterSelect';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function TrendIndicator({ current, previous }) {
  if (!previous) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  const isUp = pct > 0;
  return (
    <span style={{
      fontSize: 'var(--text-xs)',
      fontWeight: 600,
      color: isUp ? 'var(--color-status-good)' : 'var(--color-status-poor)',
      fontVariantNumeric: 'tabular-nums',
    }}>
      {isUp ? '+' : ''}{pct}%
    </span>
  );
}

function MiniSparkline({ data }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 20 }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            width: 4,
            height: `${Math.max((v / max) * 100, 8)}%`,
            borderRadius: 1,
            background: i === data.length - 1 ? 'var(--color-indigo)' : 'var(--color-lavender)',
          }}
          title={`${MONTHS[i]}: ${formatUGX(v)}`}
        />
      ))}
    </div>
  );
}

export default function ContributionsCollections({ onBack }) {
  const { branchId } = useBranchScope();
  const isBranch = !!branchId;
  const { data: districtsRaw = [], isLoading: loadingDistricts } = useAllEntities('district');
  const { data: branchAgentsRaw = [], isLoading: loadingAgents } = useChildren('branch', branchId);
  const { data: regionsMap = {} } = useAllEntitiesMap('region');
  const { data: districtMetricsMap = {} } = useAllEntitiesMetrics('district');
  const { data: branchAgentMetricsMap = {} } = useChildrenMetrics('branch', branchId);
  const [regionFilter, setRegionFilter] = useState('');

  const regionOptions = useMemo(
    () => Object.values(regionsMap).map((r) => ({ value: r.id, label: r.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [regionsMap]
  );

  const districts = useMemo(
    () => districtsRaw.map(d => ({ ...d, metrics: districtMetricsMap[d.id] ?? d.metrics })),
    [districtsRaw, districtMetricsMap],
  );
  const branchAgents = useMemo(
    () => branchAgentsRaw.map(a => ({ ...a, metrics: branchAgentMetricsMap[a.id] ?? a.metrics })),
    [branchAgentsRaw, branchAgentMetricsMap],
  );

  const rows = isBranch ? branchAgents : districts;

  const enriched = useMemo(() => rows.map((row) => {
    const m = row.metrics || {};
    const region = isBranch ? null : regionsMap[row.parentId];
    return {
      ...row,
      regionName: region?.name || '',
      regionId: region?.id || '',
      avgContribution: m.totalSubscribers ? Math.round(m.totalContributions / m.totalSubscribers) : 0,
      latestMonthly: m.monthlyContributions?.[11] || 0,
      prevMonthly: m.monthlyContributions?.[10] || 0,
    };
  }), [rows, regionsMap, isBranch]);

  const filtered = useMemo(() => {
    if (isBranch || !regionFilter) return enriched;
    return enriched.filter((d) => d.regionId === regionFilter);
  }, [enriched, regionFilter, isBranch]);

  // CSV serialiser walks `row[col.key]` flatly — project nested metrics up.
  // `sparkline` is a chart-only column and exports its underlying array as
  // a comma-joined string, which is more useful than an empty cell.
  const exportRows = useMemo(() => filtered.map((r) => ({
    ...r,
    totalContributions: r.metrics?.totalContributions ?? 0,
    dailyContributions: r.metrics?.dailyContributions ?? 0,
    weeklyContributions: r.metrics?.weeklyContributions ?? 0,
    monthlyTrend: r.prevMonthly
      ? `${Math.round(((r.latestMonthly - r.prevMonthly) / r.prevMonthly) * 100)}%`
      : '',
    sparkline: (r.metrics?.monthlyContributions || []).join('|'),
  })), [filtered]);

  const columns = [
    { key: 'name', label: isBranch ? 'Agent' : 'District', sortable: true, width: '160px' },
    !isBranch && { key: 'regionName', label: 'Region', sortable: true },
    {
      key: 'totalContributions',
      label: 'Total Contributions',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.totalContributions || 0,
      render: (row) => formatUGX(row.metrics?.totalContributions || 0),
    },
    {
      key: 'latestMonthly',
      label: 'This Month',
      align: 'right',
      sortable: true,
      render: (row) => formatUGX(row.latestMonthly),
    },
    {
      key: 'monthlyTrend',
      label: 'MoM',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.prevMonthly ? ((row.latestMonthly - row.prevMonthly) / row.prevMonthly) : 0,
      render: (row) => <TrendIndicator current={row.latestMonthly} previous={row.prevMonthly} />,
    },
    {
      key: 'dailyContributions',
      label: 'Daily',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.dailyContributions || 0,
      render: (row) => formatUGX(row.metrics?.dailyContributions || 0),
    },
    {
      key: 'weeklyContributions',
      label: 'Weekly',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.weeklyContributions || 0,
      render: (row) => formatUGX(row.metrics?.weeklyContributions || 0),
    },
    {
      key: 'avgContribution',
      label: 'Avg / Subscriber',
      align: 'right',
      sortable: true,
      render: (row) => formatUGX(row.avgContribution),
    },
    {
      key: 'sparkline',
      label: '12-Month Trend',
      sortable: false,
      width: '80px',
      render: (row) => <MiniSparkline data={row.metrics?.monthlyContributions || []} />,
    },
  ].filter(Boolean);

  return (
    <ReportView
      onBack={onBack}
      title="Contributions & Collections"
      description={isBranch
        ? 'Contribution inflows by agent with period breakdowns and trends'
        : 'Contribution inflows by district with period breakdowns and trends'}
      exportRows={exportRows}
      exportColumns={columns}
      exportFilename="contributions-collections"
      filters={isBranch ? null : (
        <FilterSelect label="Region" value={regionFilter} onChange={setRegionFilter} options={regionOptions} />
      )}
    >
      <ReportTable columns={columns} data={filtered} defaultSort="totalContributions" loading={isBranch ? loadingAgents : loadingDistricts} />
    </ReportView>
  );
}
