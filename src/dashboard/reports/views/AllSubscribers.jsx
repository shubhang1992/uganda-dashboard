import { useState, useMemo } from 'react';
import { useAllEntities, useAllEntitiesMap } from '../../../hooks/useEntity';
import { useBranchScope } from '../../../contexts/BranchScopeContext';
import { formatUGX } from '../../../utils/finance';
import ReportView from '../ReportView';
import ReportTable from '../ReportTable';
import FilterSelect, { SearchFilter } from '../FilterSelect';

function KycBadge({ status }) {
  const colors = {
    complete: 'var(--color-status-good)',
    pending: 'var(--color-status-warning)',
    incomplete: 'var(--color-status-poor)',
  };
  const labels = { complete: 'Complete', pending: 'Pending', incomplete: 'Incomplete' };
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      fontSize: 'var(--text-xs)',
      fontWeight: 600,
      color: colors[status] || 'var(--color-gray)',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
      {labels[status] || status}
    </span>
  );
}

export default function AllSubscribers({ onBack }) {
  const { branchId } = useBranchScope();
  const isBranch = !!branchId;
  const { data: subscribers = [], isLoading: loadingSubs } = useAllEntities('subscriber');
  const { data: agentsMap = {} } = useAllEntitiesMap('agent');
  const { data: branchesMap = {} } = useAllEntitiesMap('branch');

  const [search, setSearch] = useState('');
  const [kycFilter, setKycFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');

  const enriched = useMemo(() => {
    const out = [];
    for (const s of subscribers) {
      const agent = agentsMap[s.parentId];
      if (!agent) continue;
      if (isBranch && agent.parentId !== branchId) continue;
      const branch = branchesMap[agent.parentId];
      out.push({
        ...s,
        agentName: agent.name || '',
        branchName: branch?.name || '',
      });
    }
    return out;
  }, [subscribers, agentsMap, branchesMap, isBranch, branchId]);

  const filtered = useMemo(() => {
    let data = enriched;
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((s) => s.name.toLowerCase().includes(q) || s.agentName.toLowerCase().includes(q) || s.branchName.toLowerCase().includes(q));
    }
    if (kycFilter) data = data.filter((s) => s.kycStatus === kycFilter);
    if (activeFilter) data = data.filter((s) => (activeFilter === 'active' ? s.isActive : !s.isActive));
    if (genderFilter) data = data.filter((s) => s.gender === genderFilter);
    return data;
  }, [enriched, search, kycFilter, activeFilter, genderFilter]);

  const columns = [
    { key: 'name', label: 'Subscriber', sortable: true, width: '160px' },
    {
      key: 'gender',
      label: 'Gender',
      sortable: true,
      render: (row) => row.gender.charAt(0).toUpperCase() + row.gender.slice(1),
    },
    { key: 'age', label: 'Age', align: 'right', sortable: true },
    {
      key: 'kycStatus',
      label: 'KYC',
      sortable: true,
      render: (row) => <KycBadge status={row.kycStatus} />,
    },
    {
      key: 'isActive',
      label: 'Status',
      sortable: true,
      sortValue: (row) => (row.isActive ? 1 : 0),
      render: (row) => (
        <span style={{
          fontSize: 'var(--text-xs)', fontWeight: 600,
          color: row.isActive ? 'var(--color-status-good)' : 'var(--color-status-poor)',
        }}>
          {row.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    { key: 'agentName', label: 'Agent', sortable: true },
    !isBranch && { key: 'branchName', label: 'Branch', sortable: true },
    {
      key: 'totalContributions',
      label: 'Total Contributions',
      align: 'right',
      sortable: true,
      render: (row) => formatUGX(row.totalContributions || 0),
    },
    {
      key: 'productsHeld',
      label: 'Products',
      sortable: false,
      render: (row) => (row.productsHeld || []).length,
    },
  ].filter(Boolean);

  return (
    <ReportView
      onBack={onBack}
      title="All Subscribers"
      description={isBranch
        ? `${filtered.length.toLocaleString()} subscribers in ${branchesMap[branchId]?.name || 'this branch'}`
        : `${filtered.length.toLocaleString()} subscribers in the network`}
      filters={
        <>
          <SearchFilter value={search} onChange={setSearch} placeholder="Search subscribers…" />
          <FilterSelect label="KYC" value={kycFilter} onChange={setKycFilter} options={[
            { value: 'complete', label: 'Complete' },
            { value: 'pending', label: 'Pending' },
            { value: 'incomplete', label: 'Incomplete' },
          ]} />
          <FilterSelect label="Status" value={activeFilter} onChange={setActiveFilter} options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]} />
          <FilterSelect label="Gender" value={genderFilter} onChange={setGenderFilter} options={[
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
            { value: 'other', label: 'Other' },
          ]} />
        </>
      }
    >
      <ReportTable columns={columns} data={filtered} defaultSort="totalContributions" loading={loadingSubs} />
    </ReportView>
  );
}
