import { useMemo } from 'react';
import { useCountry, useAllEntities, useAllEntitiesMetrics, useEntityMetrics } from '../../../hooks/useEntity';

import { formatNumber, formatUGX } from '../../../utils/currency';
import ReportView from '../ReportView';
import ReportTable from '../ReportTable';

export default function DistributionSummary({ onBack }) {
  const { data: country, isLoading: loadingCountry } = useCountry();
  const { data: regionsRaw = [], isLoading: loadingRegions } = useAllEntities('region');
  const { data: regionMetricsMap = {} } = useAllEntitiesMetrics('region');
  const { data: countryMetrics } = useEntityMetrics('country', 'ug');
  const regions = useMemo(
    () => regionsRaw.map(r => ({ ...r, metrics: regionMetricsMap[r.id] ?? r.metrics })),
    [regionsRaw, regionMetricsMap],
  );

  const columns = [
    { key: 'name', label: 'Region', sortable: true, width: '160px' },
    {
      key: 'totalSubscribers',
      label: 'Subscribers',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.totalSubscribers || 0,
      render: (row) => formatNumber(row.metrics?.totalSubscribers || 0),
    },
    {
      key: 'totalBranches',
      label: 'Branches',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.totalBranches || 0,
      render: (row) => formatNumber(row.metrics?.totalBranches || 0),
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
      key: 'totalContributions',
      label: 'Contributions',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.totalContributions || 0,
      render: (row) => formatUGX(row.metrics?.totalContributions || 0),
    },
    {
      key: 'totalWithdrawals',
      label: 'Withdrawals',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.totalWithdrawals || 0,
      render: (row) => formatUGX(row.metrics?.totalWithdrawals || 0),
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
      key: 'coverageRate',
      label: 'Coverage',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.coverageRate || 0,
      render: (row) => `${row.metrics?.coverageRate || 0}%`,
    },
  ];

  const description = useMemo(() => {
    const m = countryMetrics ?? country?.metrics;
    if (!m) return 'Network summary across all regions';
    return `${formatNumber(m.totalSubscribers)} subscribers \u00B7 ${formatNumber(m.totalBranches)} branches \u00B7 ${formatUGX(m.aum)} AUM`;
  }, [country, countryMetrics]);

  // CSV serialiser walks `row[col.key]` flatly \u2014 project nested metrics up.
  const exportRows = useMemo(() => regions.map((r) => ({
    ...r,
    totalSubscribers: r.metrics?.totalSubscribers ?? 0,
    totalBranches: r.metrics?.totalBranches ?? 0,
    totalAgents: r.metrics?.totalAgents ?? 0,
    aum: r.metrics?.aum ?? 0,
    totalContributions: r.metrics?.totalContributions ?? 0,
    totalWithdrawals: r.metrics?.totalWithdrawals ?? 0,
    activeRate: r.metrics?.activeRate ?? 0,
    coverageRate: r.metrics?.coverageRate ?? 0,
  })), [regions]);

  return (
    <ReportView
      title="Distribution Summary"
      description={description}
      onBack={onBack}
      exportRows={exportRows}
      exportColumns={columns}
      exportFilename="distribution-summary"
    >
      <ReportTable columns={columns} data={regions} defaultSort="aum" loading={loadingCountry || loadingRegions} />
    </ReportView>
  );
}
