import { useState, useMemo } from 'react';
import { useAllEntities, useAllEntitiesMap } from '../../../hooks/useEntity';
import { useBranchScope } from '../../../contexts/BranchScopeContext';
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

function Stars({ rating }) {
  const full = Math.round(rating);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {[1,2,3,4,5].map((i) => (
        <svg key={i} viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" style={{ color: i <= full ? 'var(--color-status-warning)' : 'var(--color-lavender)' }}>
          <path d="M8 1.5l1.76 3.56 3.93.57-2.84 2.77.67 3.91L8 10.27 4.48 12.31l.67-3.91L2.31 5.63l3.93-.57z"
            fill={i <= full ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
        </svg>
      ))}
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray)', marginLeft: 4, fontVariantNumeric: 'tabular-nums' }}>{rating.toFixed(1)}</span>
    </div>
  );
}

export default function AgentPerformance({ onBack }) {
  const { branchId } = useBranchScope();
  const isBranch = !!branchId;
  const { data: agents = [], isLoading: loadingAgents } = useAllEntities('agent');
  const { data: branchesMap = {} } = useAllEntitiesMap('branch');
  const { data: districtsMap = {} } = useAllEntitiesMap('district');
  const { data: regionsMap = {} } = useAllEntitiesMap('region');

  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('');

  const regionOptions = useMemo(
    () => Object.values(regionsMap).map((r) => ({ value: r.id, label: r.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [regionsMap]
  );

  const scopedAgents = useMemo(
    () => (isBranch ? agents.filter((a) => a.parentId === branchId) : agents),
    [agents, isBranch, branchId]
  );

  const enriched = useMemo(() => {
    const sorted = [...scopedAgents].sort((a, b) => (b.metrics?.totalContributions || 0) - (a.metrics?.totalContributions || 0));
    return sorted.map((a, idx) => {
      const branch = branchesMap[a.parentId];
      const district = branch ? districtsMap[branch.parentId] : null;
      const region = district ? regionsMap[district.parentId] : null;
      return {
        ...a,
        rank: idx + 1,
        branchName: branch?.name || '',
        regionName: region?.name || '',
        regionId: region?.id || '',
      };
    });
  }, [scopedAgents, branchesMap, districtsMap, regionsMap]);

  const filtered = useMemo(() => {
    let data = enriched;
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((a) => a.name.toLowerCase().includes(q) || a.branchName.toLowerCase().includes(q));
    }
    if (!isBranch && regionFilter) data = data.filter((a) => a.regionId === regionFilter);
    return data;
  }, [enriched, search, regionFilter, isBranch]);

  const columns = [
    {
      key: 'rank',
      label: 'Rank',
      align: 'center',
      sortable: true,
      width: '60px',
      render: (row) => <RankBadge rank={row.rank} total={scopedAgents.length} />,
    },
    { key: 'name', label: 'Agent', sortable: true, width: '150px' },
    !isBranch && { key: 'branchName', label: 'Branch', sortable: true },
    !isBranch && { key: 'regionName', label: 'Region', sortable: true },
    {
      key: 'rating',
      label: 'Rating',
      sortable: true,
      render: (row) => <Stars rating={row.rating} />,
    },
    {
      key: 'performance',
      label: 'Score',
      align: 'right',
      sortable: true,
      render: (row) => {
        const v = row.performance;
        const color = v >= 75 ? 'var(--color-status-good)' : v >= 55 ? 'var(--color-status-warning)' : 'var(--color-status-poor)';
        return <span style={{ color, fontWeight: 600, fontSize: 'var(--text-xs)' }}>{v}</span>;
      },
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
    {
      key: 'activeRate',
      label: 'Active Rate',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.activeRate || 0,
      render: (row) => `${row.metrics?.activeRate || 0}%`,
    },
  ].filter(Boolean);

  return (
    <ReportView
      onBack={onBack}
      title="Agent Performance"
      description={isBranch
        ? `Agents in ${branchesMap[branchId]?.name || 'this branch'}, ranked by productivity, ratings, and contributions`
        : 'Agents ranked by productivity, ratings, and contribution collection'}
      filters={
        <>
          <SearchFilter value={search} onChange={setSearch} placeholder="Search agents…" />
          {!isBranch && (
            <FilterSelect label="Region" value={regionFilter} onChange={setRegionFilter} options={regionOptions} />
          )}
        </>
      }
    >
      <ReportTable columns={columns} data={filtered} defaultSort="rank" defaultDir="asc" loading={loadingAgents} />
    </ReportView>
  );
}
