import { useState, useMemo } from 'react';
import { useAllEntities, useAllEntitiesMap, useChildren } from '../../../hooks/useEntity';
import { useBranchScope } from '../../../contexts/BranchScopeContext';
import ReportView from '../ReportView';
import ReportTable from '../ReportTable';
import FilterSelect from '../FilterSelect';

function TrendIndicator({ current, previous }) {
  if (!previous) return <span style={{ color: 'var(--color-gray)', fontSize: 'var(--text-xs)' }}>—</span>;
  const pct = Math.round(((current - previous) / previous) * 100);
  const color = pct > 0 ? 'var(--color-status-good)' : pct < 0 ? 'var(--color-status-poor)' : 'var(--color-gray)';
  return (
    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>
      {pct > 0 ? '+' : ''}{pct}%
    </span>
  );
}

export default function SubscriberGrowth({ onBack }) {
  const { branchId } = useBranchScope();
  const isBranch = !!branchId;
  const { data: districts = [], isLoading: loadingDistricts } = useAllEntities('district');
  const { data: branchAgents = [], isLoading: loadingAgents } = useChildren('branch', branchId);
  const { data: regionsMap = {} } = useAllEntitiesMap('region');
  const [regionFilter, setRegionFilter] = useState('');

  const regionOptions = useMemo(
    () => Object.values(regionsMap).map((r) => ({ value: r.id, label: r.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [regionsMap]
  );

  const rows = isBranch ? branchAgents : districts;

  const enriched = useMemo(() => rows.map((row) => {
    const region = isBranch ? null : regionsMap[row.parentId];
    const m = row.metrics || {};
    return {
      ...row,
      regionName: region?.name || '',
      regionId: region?.id || '',
      inactiveCount: Math.round((m.totalSubscribers || 0) * (1 - (m.activeRate || 0) / 100)),
    };
  }), [rows, regionsMap, isBranch]);

  const filtered = useMemo(() => {
    if (isBranch || !regionFilter) return enriched;
    return enriched.filter((d) => d.regionId === regionFilter);
  }, [enriched, regionFilter, isBranch]);

  const columns = [
    { key: 'name', label: isBranch ? 'Agent' : 'District', sortable: true, width: '160px' },
    !isBranch && { key: 'regionName', label: 'Region', sortable: true },
    {
      key: 'totalSubscribers',
      label: 'Total',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.totalSubscribers || 0,
      render: (row) => (row.metrics?.totalSubscribers || 0).toLocaleString(),
    },
    {
      key: 'newToday',
      label: 'Today',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.newSubscribersToday || 0,
      render: (row) => `+${row.metrics?.newSubscribersToday || 0}`,
    },
    {
      key: 'todayTrend',
      label: 'vs Prev',
      align: 'right',
      sortable: false,
      render: (row) => <TrendIndicator current={row.metrics?.newSubscribersToday} previous={row.metrics?.prevNewSubscribersToday} />,
    },
    {
      key: 'newWeek',
      label: 'This Week',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.newSubscribersThisWeek || 0,
      render: (row) => `+${row.metrics?.newSubscribersThisWeek || 0}`,
    },
    {
      key: 'newMonth',
      label: 'This Month',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.newSubscribersThisMonth || 0,
      render: (row) => `+${row.metrics?.newSubscribersThisMonth || 0}`,
    },
    {
      key: 'monthTrend',
      label: 'MoM',
      align: 'right',
      sortable: false,
      render: (row) => <TrendIndicator current={row.metrics?.newSubscribersThisMonth} previous={row.metrics?.prevNewSubscribersThisMonth} />,
    },
    {
      key: 'activeRate',
      label: 'Active Rate',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.activeRate || 0,
      render: (row) => `${row.metrics?.activeRate || 0}%`,
    },
    {
      key: 'inactiveCount',
      label: 'Inactive',
      align: 'right',
      sortable: true,
      render: (row) => row.inactiveCount.toLocaleString(),
    },
  ].filter(Boolean);

  return (
    <ReportView
      onBack={onBack}
      title="Subscriber Growth"
      description={isBranch
        ? 'Enrollment trends and growth rates by agent'
        : 'Enrollment trends and growth rates by district'}
      filters={isBranch ? null : (
        <FilterSelect label="Region" value={regionFilter} onChange={setRegionFilter} options={regionOptions} />
      )}
    >
      <ReportTable columns={columns} data={filtered} defaultSort="newMonth" loading={isBranch ? loadingAgents : loadingDistricts} />
    </ReportView>
  );
}
