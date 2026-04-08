import { useState, useMemo } from 'react';
import { useAllEntities, useAllEntitiesMap } from '../../../hooks/useEntity';
import { formatUGX } from '../../../utils/finance';
import ReportView from '../ReportView';
import ReportTable from '../ReportTable';
import FilterSelect, { SearchFilter } from '../FilterSelect';

function RatingBadge({ rating }) {
  const color = rating >= 4 ? 'var(--color-status-good)' : rating >= 3 ? 'var(--color-status-warning)' : 'var(--color-status-poor)';
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', color, fontWeight: 600, fontSize: 'var(--text-xs)' }}>
      {rating.toFixed(1)}
    </span>
  );
}

function PerfBar({ value }) {
  const color = value >= 75 ? 'var(--color-status-good)' : value >= 55 ? 'var(--color-status-warning)' : 'var(--color-status-poor)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-end' }}>
      <div style={{ width: 48, height: 4, borderRadius: 2, background: 'var(--color-lavender)', overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', borderRadius: 2, background: color }} />
      </div>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-xs)', color: 'var(--color-slate)', minWidth: 28, textAlign: 'right' }}>
        {value}%
      </span>
    </div>
  );
}

export default function AllAgents({ onBack }) {
  const { data: agents = [], isLoading: loadingAgents } = useAllEntities('agent');
  const { data: branchesMap = {}, isLoading: loadingBranches } = useAllEntitiesMap('branch');
  const { data: districtsMap = {} } = useAllEntitiesMap('district');
  const { data: regionsMap = {} } = useAllEntitiesMap('region');

  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const regionOptions = useMemo(
    () => Object.values(regionsMap).map((r) => ({ value: r.id, label: r.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [regionsMap]
  );

  const enriched = useMemo(() => agents.map((a) => {
    const branch = branchesMap[a.parentId];
    const district = branch ? districtsMap[branch.parentId] : null;
    const region = district ? regionsMap[district.parentId] : null;
    return {
      ...a,
      branchName: branch?.name || '',
      districtName: district?.name || '',
      regionName: region?.name || '',
      regionId: region?.id || '',
    };
  }), [agents, branchesMap, districtsMap, regionsMap]);

  const filtered = useMemo(() => {
    let data = enriched;
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((a) => a.name.toLowerCase().includes(q) || a.branchName.toLowerCase().includes(q));
    }
    if (regionFilter) data = data.filter((a) => a.regionId === regionFilter);
    if (statusFilter) data = data.filter((a) => a.status === statusFilter);
    return data;
  }, [enriched, search, regionFilter, statusFilter]);

  const loading = loadingAgents || loadingBranches;

  const columns = [
    { key: 'name', label: 'Agent', sortable: true, width: '160px' },
    { key: 'branchName', label: 'Branch', sortable: true },
    { key: 'districtName', label: 'District', sortable: true },
    { key: 'regionName', label: 'Region', sortable: true },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <span style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          color: row.status === 'active' ? 'var(--color-status-good)' : 'var(--color-status-poor)',
        }}>
          {row.status === 'active' ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'rating',
      label: 'Rating',
      align: 'right',
      sortable: true,
      render: (row) => <RatingBadge rating={row.rating} />,
    },
    {
      key: 'performance',
      label: 'Performance',
      align: 'right',
      sortable: true,
      width: '140px',
      render: (row) => <PerfBar value={row.performance} />,
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
      key: 'totalContributions',
      label: 'Contributions',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.totalContributions || 0,
      render: (row) => formatUGX(row.metrics?.totalContributions || 0),
    },
  ];

  return (
    <ReportView
      onBack={onBack}
      title="All Agents"
      description={`${filtered.length} agents across the distribution network`}
      filters={
        <>
          <SearchFilter value={search} onChange={setSearch} placeholder="Search agents…" />
          <FilterSelect label="Region" value={regionFilter} onChange={setRegionFilter} options={regionOptions} />
          <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]} />
        </>
      }
    >
      <ReportTable columns={columns} data={filtered} defaultSort="totalContributions" loading={loading} />
    </ReportView>
  );
}
