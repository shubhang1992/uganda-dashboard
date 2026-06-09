import { useState, useMemo } from 'react';
import { useAllEntities, useAllEntitiesMap, useAllEntitiesMetrics } from '../../../hooks/useEntity';

import { formatNumber, formatUGX } from '../../../utils/currency';
import ReportView from '../ReportView';
import ReportTable from '../ReportTable';
import FilterSelect from '../FilterSelect';
import SearchFilter from '../SearchFilter';

function StatusBadge({ status }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      fontSize: 'var(--text-xs)',
      fontWeight: 600,
      color: status === 'active' ? 'var(--color-status-good)' : 'var(--color-status-poor)',
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'currentColor',
        flexShrink: 0,
      }} />
      {status === 'active' ? 'Active' : 'Inactive'}
    </span>
  );
}

export default function AllBranches({ onBack }) {
  const { data: branchesRaw = [], isLoading: loadingBranches } = useAllEntities('branch');
  const { data: districtsMap = {}, isLoading: loadingDistricts } = useAllEntitiesMap('district');
  const { data: regionsMap = {}, isLoading: loadingRegions } = useAllEntitiesMap('region');
  const { data: branchMetricsMap = {} } = useAllEntitiesMetrics('branch');
  const branches = useMemo(
    () => branchesRaw.map(b => ({ ...b, metrics: branchMetricsMap[b.id] ?? b.metrics })),
    [branchesRaw, branchMetricsMap],
  );

  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const regionOptions = useMemo(
    () => Object.values(regionsMap).map((r) => ({ value: r.id, label: r.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [regionsMap]
  );

  const enriched = useMemo(() => branches.map((b) => {
    const district = districtsMap[b.parentId];
    const region = district ? regionsMap[district.parentId] : null;
    return { ...b, districtName: district?.name || '', regionName: region?.name || '', regionId: region?.id || '' };
  }), [branches, districtsMap, regionsMap]);

  const filtered = useMemo(() => {
    let data = enriched;
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((b) => b.name.toLowerCase().includes(q) || b.managerName?.toLowerCase().includes(q) || b.districtName.toLowerCase().includes(q));
    }
    if (regionFilter) data = data.filter((b) => b.regionId === regionFilter);
    if (statusFilter) data = data.filter((b) => b.status === statusFilter);
    return data;
  }, [enriched, search, regionFilter, statusFilter]);

  const loading = loadingBranches || loadingDistricts || loadingRegions;

  // CSV serialiser walks `row[col.key]` flatly, so project nested `metrics.*`
  // values up to the top level for the export rows. The on-screen table keeps
  // reading via `sortValue`/`render` and is unaffected.
  const exportRows = useMemo(() => filtered.map((b) => ({
    ...b,
    totalSubscribers: b.metrics?.totalSubscribers ?? 0,
    totalAgents: b.metrics?.totalAgents ?? 0,
    aum: b.metrics?.aum ?? 0,
    activeRate: b.metrics?.activeRate ?? 0,
  })), [filtered]);

  const columns = [
    { key: 'name', label: 'Branch', sortable: true, width: '180px' },
    { key: 'districtName', label: 'District', sortable: true },
    { key: 'regionName', label: 'Region', sortable: true },
    { key: 'managerName', label: 'Manager', sortable: true },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'totalSubscribers',
      label: 'Subscribers',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.totalSubscribers || 0,
      render: (row) => formatNumber(row.metrics?.totalSubscribers || 0),
    },
    {
      key: 'totalAgents',
      label: 'Agents',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.totalAgents || 0,
      render: (row) => formatNumber(row.metrics?.totalAgents || 0),
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
      key: 'activeRate',
      label: 'Active Rate',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.activeRate || 0,
      render: (row) => `${row.metrics?.activeRate || 0}%`,
    },
  ];

  return (
    <ReportView
      onBack={onBack}
      title="All Branches"
      description={`${filtered.length} branches across the distribution network`}
      exportRows={exportRows}
      exportColumns={columns}
      exportFilename="all-branches"
      filters={
        <>
          <SearchFilter value={search} onChange={setSearch} placeholder="Search branches…" />
          <FilterSelect
            label="Region"
            value={regionFilter}
            onChange={setRegionFilter}
            options={regionOptions}
          />
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
          />
        </>
      }
    >
      <ReportTable
        columns={columns}
        data={filtered}
        defaultSort="aum"
        loading={loading}
      />
    </ReportView>
  );
}
