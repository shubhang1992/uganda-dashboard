import { useState, useMemo } from 'react';
import { useAllEntities, useAllEntitiesMap, useChildren, useAllEntitiesMetrics, useChildrenMetrics } from '../../../hooks/useEntity';
import { useBranchScope } from '../../../contexts/BranchScopeContext';
import { formatUGX } from '../../../utils/currency';

import ReportView from '../ReportView';
import ReportTable from '../ReportTable';
import FilterSelect from '../FilterSelect';

export default function WithdrawalsPayouts({ onBack }) {
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
    const region = isBranch ? null : regionsMap[row.parentId];
    const m = row.metrics || {};
    const ratio = m.totalContributions ? Math.round((m.totalWithdrawals / m.totalContributions) * 100) : 0;
    return {
      ...row,
      regionName: region?.name || '',
      regionId: region?.id || '',
      withdrawalRatio: ratio,
    };
  }), [rows, regionsMap, isBranch]);

  const filtered = useMemo(() => {
    if (isBranch || !regionFilter) return enriched;
    return enriched.filter((d) => d.regionId === regionFilter);
  }, [enriched, regionFilter, isBranch]);

  // CSV serialiser walks `row[col.key]` flatly — project nested metrics up.
  const exportRows = useMemo(() => filtered.map((r) => ({
    ...r,
    totalWithdrawals: r.metrics?.totalWithdrawals ?? 0,
    monthlyWithdrawals: r.metrics?.monthlyWithdrawals ?? 0,
    weeklyWithdrawals: r.metrics?.weeklyWithdrawals ?? 0,
    dailyWithdrawals: r.metrics?.dailyWithdrawals ?? 0,
    totalContributions: r.metrics?.totalContributions ?? 0,
  })), [filtered]);

  const columns = [
    { key: 'name', label: isBranch ? 'Agent' : 'District', sortable: true, width: '160px' },
    !isBranch && { key: 'regionName', label: 'Region', sortable: true },
    {
      key: 'totalWithdrawals',
      label: 'Total Withdrawals',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.totalWithdrawals || 0,
      render: (row) => formatUGX(row.metrics?.totalWithdrawals || 0),
    },
    {
      key: 'monthlyWithdrawals',
      label: 'Monthly',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.monthlyWithdrawals || 0,
      render: (row) => formatUGX(row.metrics?.monthlyWithdrawals || 0),
    },
    {
      key: 'weeklyWithdrawals',
      label: 'Weekly',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.weeklyWithdrawals || 0,
      render: (row) => formatUGX(row.metrics?.weeklyWithdrawals || 0),
    },
    {
      key: 'dailyWithdrawals',
      label: 'Daily',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.dailyWithdrawals || 0,
      render: (row) => formatUGX(row.metrics?.dailyWithdrawals || 0),
    },
    {
      key: 'withdrawalRatio',
      label: 'W/C Ratio',
      align: 'right',
      sortable: true,
      render: (row) => {
        const color = row.withdrawalRatio > 50 ? 'var(--color-status-poor)' : row.withdrawalRatio > 30 ? 'var(--color-status-warning)' : 'var(--color-status-good)';
        return <span style={{ color, fontWeight: 600, fontSize: 'var(--text-xs)' }}>{row.withdrawalRatio}%</span>;
      },
    },
    {
      key: 'totalContributions',
      label: 'Contributions',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.totalContributions || 0,
      render: (row) => formatUGX(row.metrics?.totalContributions || 0),
    },
  ].filter(Boolean);

  return (
    <ReportView
      onBack={onBack}
      title="Withdrawals & Payouts"
      description={isBranch
        ? 'Withdrawal outflows by agent with contribution ratios'
        : 'Withdrawal outflows by district with contribution ratios'}
      exportRows={exportRows}
      exportColumns={columns}
      exportFilename="withdrawals-payouts"
      filters={isBranch ? null : (
        <FilterSelect label="Region" value={regionFilter} onChange={setRegionFilter} options={regionOptions} />
      )}
    >
      <ReportTable columns={columns} data={filtered} defaultSort="totalWithdrawals" loading={isBranch ? loadingAgents : loadingDistricts} />
    </ReportView>
  );
}
