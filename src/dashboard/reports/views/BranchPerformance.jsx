import { useState, useMemo } from 'react';
import { useAllEntities, useAllEntitiesMap } from '../../../hooks/useEntity';
import { formatUGX } from '../../../utils/finance';
import ReportView from '../ReportView';
import ReportTable from '../ReportTable';
import FilterSelect, { SearchFilter } from '../FilterSelect';

function RankBadge({ rank, total }) {
  const pct = rank / total;
  const color = pct <= 0.1 ? 'var(--color-status-good)' : pct <= 0.25 ? 'var(--color-teal)' : pct >= 0.75 ? 'var(--color-status-poor)' : 'var(--color-slate)';
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color, fontSize: 'var(--text-xs)' }}>
      #{rank}
    </span>
  );
}

export default function BranchPerformance({ onBack }) {
  const { data: branches = [], isLoading: loadingBranches } = useAllEntities('branch');
  const { data: districtsMap = {} } = useAllEntitiesMap('district');
  const { data: regionsMap = {} } = useAllEntitiesMap('region');

  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('');

  const regionOptions = useMemo(
    () => Object.values(regionsMap).map((r) => ({ value: r.id, label: r.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [regionsMap]
  );

  const enriched = useMemo(() => {
    const sorted = [...branches].sort((a, b) => (b.metrics?.totalContributions || 0) - (a.metrics?.totalContributions || 0));
    return sorted.map((b, idx) => {
      const district = districtsMap[b.parentId];
      const region = district ? regionsMap[district.parentId] : null;
      const m = b.metrics || {};
      const prevMonth = m.monthlyContributions?.[10] || 0;
      const currMonth = m.monthlyContributions?.[11] || 0;
      const growth = prevMonth ? Math.round(((currMonth - prevMonth) / prevMonth) * 100) : 0;
      return {
        ...b,
        rank: idx + 1,
        districtName: district?.name || '',
        regionName: region?.name || '',
        regionId: region?.id || '',
        growth,
        subsPerAgent: m.totalAgents ? Math.round(m.totalSubscribers / m.totalAgents) : 0,
      };
    });
  }, [branches, districtsMap, regionsMap]);

  const filtered = useMemo(() => {
    let data = enriched;
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((b) => b.name.toLowerCase().includes(q) || b.districtName.toLowerCase().includes(q));
    }
    if (regionFilter) data = data.filter((b) => b.regionId === regionFilter);
    return data;
  }, [enriched, search, regionFilter]);

  const columns = [
    {
      key: 'rank',
      label: 'Rank',
      align: 'center',
      sortable: true,
      width: '60px',
      render: (row) => <RankBadge rank={row.rank} total={branches.length} />,
    },
    { key: 'name', label: 'Branch', sortable: true, width: '160px' },
    { key: 'regionName', label: 'Region', sortable: true },
    {
      key: 'totalContributions',
      label: 'Contributions',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.totalContributions || 0,
      render: (row) => formatUGX(row.metrics?.totalContributions || 0),
    },
    {
      key: 'aum',
      label: 'AUM',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.aum || 0,
      render: (row) => formatUGX(row.metrics?.aum || 0),
    },
    {
      key: 'totalSubscribers',
      label: 'Subscribers',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.totalSubscribers || 0,
      render: (row) => (row.metrics?.totalSubscribers || 0).toLocaleString(),
    },
    {
      key: 'activeRate',
      label: 'Active Rate',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.activeRate || 0,
      render: (row) => {
        const v = row.metrics?.activeRate || 0;
        const color = v >= 70 ? 'var(--color-status-good)' : v >= 50 ? 'var(--color-status-warning)' : 'var(--color-status-poor)';
        return <span style={{ color, fontWeight: 600, fontSize: 'var(--text-xs)' }}>{v}%</span>;
      },
    },
    {
      key: 'growth',
      label: 'MoM Growth',
      align: 'right',
      sortable: true,
      render: (row) => {
        const color = row.growth > 0 ? 'var(--color-status-good)' : row.growth < 0 ? 'var(--color-status-poor)' : 'var(--color-gray)';
        return <span style={{ color, fontWeight: 600, fontSize: 'var(--text-xs)' }}>{row.growth > 0 ? '+' : ''}{row.growth}%</span>;
      },
    },
    {
      key: 'subsPerAgent',
      label: 'Subs / Agent',
      align: 'right',
      sortable: true,
    },
  ];

  return (
    <ReportView
      onBack={onBack}
      title="Branch Performance"
      description="Branches ranked by contribution volume, growth, and efficiency"
      filters={
        <>
          <SearchFilter value={search} onChange={setSearch} placeholder="Search branches…" />
          <FilterSelect label="Region" value={regionFilter} onChange={setRegionFilter} options={regionOptions} />
        </>
      }
    >
      <ReportTable columns={columns} data={filtered} defaultSort="rank" defaultDir="asc" loading={loadingBranches} />
    </ReportView>
  );
}
