import { useMemo } from 'react';
import { useCountry, useAllEntities } from '../../../hooks/useEntity';
import { formatUGX } from '../../../utils/finance';
import ReportView from '../ReportView';
import ReportTable from '../ReportTable';

export default function DistributionSummary({ onBack }) {
  const { data: country, isLoading: loadingCountry } = useCountry();
  const { data: regions = [], isLoading: loadingRegions } = useAllEntities('region');

  const columns = [
    { key: 'name', label: 'Region', sortable: true, width: '160px' },
    {
      key: 'totalSubscribers',
      label: 'Subscribers',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.totalSubscribers || 0,
      render: (row) => (row.metrics?.totalSubscribers || 0).toLocaleString(),
    },
    {
      key: 'totalBranches',
      label: 'Branches',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.totalBranches || 0,
      render: (row) => (row.metrics?.totalBranches || 0).toLocaleString(),
    },
    {
      key: 'totalAgents',
      label: 'Agents',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.totalAgents || 0,
      render: (row) => (row.metrics?.totalAgents || 0).toLocaleString(),
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
    if (!country?.metrics) return 'Network summary across all regions';
    const m = country.metrics;
    return `${m.totalSubscribers?.toLocaleString()} subscribers \u00B7 ${m.totalBranches?.toLocaleString()} branches \u00B7 ${formatUGX(m.aum)} AUM`;
  }, [country]);

  return (
    <ReportView title="Distribution Summary" description={description} onBack={onBack}>
      <ReportTable columns={columns} data={regions} defaultSort="aum" loading={loadingCountry || loadingRegions} />
    </ReportView>
  );
}
