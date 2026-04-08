import { useState, useMemo } from 'react';
import { useAllEntities, useAllEntitiesMap } from '../../../hooks/useEntity';
import ReportView from '../ReportView';
import ReportTable from '../ReportTable';
import FilterSelect from '../FilterSelect';

function KycBar({ complete, pending, incomplete }) {
  const total = complete + pending + incomplete;
  if (!total) return null;
  const cPct = Math.round((complete / total) * 100);
  const pPct = Math.round((pending / total) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ display: 'flex', width: 60, height: 6, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${cPct}%`, background: 'var(--color-status-good)' }} />
        <div style={{ width: `${pPct}%`, background: 'var(--color-status-warning)' }} />
        <div style={{ flex: 1, background: 'var(--color-status-poor)' }} />
      </div>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray)', fontVariantNumeric: 'tabular-nums' }}>
        {cPct}%
      </span>
    </div>
  );
}

export default function KycCompliance({ onBack }) {
  const { data: subscribers = [], isLoading: loadingSubs } = useAllEntities('subscriber');
  const { data: agentsMap = {} } = useAllEntitiesMap('agent');
  const { data: branchesMap = {} } = useAllEntitiesMap('branch');
  const { data: districtsMap = {} } = useAllEntitiesMap('district');
  const { data: regionsMap = {} } = useAllEntitiesMap('region');

  const [regionFilter, setRegionFilter] = useState('');

  const regionOptions = useMemo(
    () => Object.values(regionsMap).map((r) => ({ value: r.id, label: r.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [regionsMap]
  );

  // Aggregate KYC stats by district
  const districtKyc = useMemo(() => {
    const agg = {};
    subscribers.forEach((s) => {
      const agent = agentsMap[s.parentId];
      const branch = agent ? branchesMap[agent.parentId] : null;
      const districtId = branch?.parentId;
      if (!districtId) return;
      if (!agg[districtId]) agg[districtId] = { complete: 0, pending: 0, incomplete: 0, total: 0 };
      agg[districtId][s.kycStatus]++;
      agg[districtId].total++;
    });
    return agg;
  }, [subscribers, agentsMap, branchesMap]);

  const rows = useMemo(() => {
    return Object.entries(districtKyc).map(([districtId, kyc]) => {
      const district = districtsMap[districtId];
      const region = district ? regionsMap[district.parentId] : null;
      return {
        id: districtId,
        name: district?.name || districtId,
        regionName: region?.name || '',
        regionId: region?.id || '',
        ...kyc,
        completePct: kyc.total ? Math.round((kyc.complete / kyc.total) * 100) : 0,
        pendingPct: kyc.total ? Math.round((kyc.pending / kyc.total) * 100) : 0,
        incompletePct: kyc.total ? Math.round((kyc.incomplete / kyc.total) * 100) : 0,
      };
    });
  }, [districtKyc, districtsMap, regionsMap]);

  const filtered = useMemo(() => {
    if (!regionFilter) return rows;
    return rows.filter((r) => r.regionId === regionFilter);
  }, [rows, regionFilter]);

  const columns = [
    { key: 'name', label: 'District', sortable: true, width: '160px' },
    { key: 'regionName', label: 'Region', sortable: true },
    { key: 'total', label: 'Total', align: 'right', sortable: true },
    {
      key: 'completePct',
      label: 'Completion',
      sortable: true,
      render: (row) => <KycBar complete={row.complete} pending={row.pending} incomplete={row.incomplete} />,
    },
    {
      key: 'complete',
      label: 'Complete',
      align: 'right',
      sortable: true,
      render: (row) => (
        <span style={{ color: 'var(--color-status-good)', fontWeight: 600, fontSize: 'var(--text-xs)' }}>
          {row.complete.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'pending',
      label: 'Pending',
      align: 'right',
      sortable: true,
      render: (row) => (
        <span style={{ color: 'var(--color-status-warning)', fontWeight: 600, fontSize: 'var(--text-xs)' }}>
          {row.pending.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'incomplete',
      label: 'Incomplete',
      align: 'right',
      sortable: true,
      render: (row) => (
        <span style={{ color: 'var(--color-status-poor)', fontWeight: 600, fontSize: 'var(--text-xs)' }}>
          {row.incomplete.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'pendingPct',
      label: 'Pending %',
      align: 'right',
      sortable: true,
      render: (row) => `${row.pendingPct}%`,
    },
    {
      key: 'incompletePct',
      label: 'Incomplete %',
      align: 'right',
      sortable: true,
      render: (row) => {
        const color = row.incompletePct > 20 ? 'var(--color-status-poor)' : 'var(--color-slate)';
        return <span style={{ color, fontWeight: row.incompletePct > 20 ? 600 : 400, fontSize: 'var(--text-xs)' }}>{row.incompletePct}%</span>;
      },
    },
  ];

  return (
    <ReportView
      onBack={onBack}
      title="KYC & Compliance"
      description="KYC completion rates and flagged accounts by district"
      filters={
        <FilterSelect label="Region" value={regionFilter} onChange={setRegionFilter} options={regionOptions} />
      }
    >
      <ReportTable columns={columns} data={filtered} defaultSort="incompletePct" loading={loadingSubs} />
    </ReportView>
  );
}
