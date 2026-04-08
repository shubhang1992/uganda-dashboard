import { useMemo } from 'react';
import { useAllEntities, useAllEntitiesMap } from '../../../hooks/useEntity';
import ReportView from '../ReportView';
import ReportTable from '../ReportTable';

export default function SubscriberDemographics({ onBack }) {
  const { data: districts = [], isLoading } = useAllEntities('district');
  const { data: regionsMap = {} } = useAllEntitiesMap('region');

  const enriched = useMemo(() => districts.map((d) => {
    const region = regionsMap[d.parentId];
    const m = d.metrics || {};
    const totalAge = Object.values(m.ageDistribution || {}).reduce((s, v) => s + v, 0) || 1;
    const youthPct = Math.round(((m.ageDistribution?.['18-25'] || 0) + (m.ageDistribution?.['26-35'] || 0)) / totalAge * 100);
    return {
      ...d,
      regionName: region?.name || '',
      malePct: m.genderRatio?.male || 0,
      femalePct: m.genderRatio?.female || 0,
      otherPct: m.genderRatio?.other || 0,
      youthPct,
      age1825: m.ageDistribution?.['18-25'] || 0,
      age2635: m.ageDistribution?.['26-35'] || 0,
      age3645: m.ageDistribution?.['36-45'] || 0,
      age4655: m.ageDistribution?.['46-55'] || 0,
      age56plus: m.ageDistribution?.['56+'] || 0,
    };
  }), [districts, regionsMap]);

  function GenderBar({ male, female }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ display: 'flex', width: 60, height: 6, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${male}%`, background: 'var(--color-indigo)' }} />
          <div style={{ width: `${female}%`, background: 'var(--color-teal)' }} />
          <div style={{ flex: 1, background: 'var(--color-lavender)' }} />
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray)', fontVariantNumeric: 'tabular-nums' }}>
          {male}/{female}
        </span>
      </div>
    );
  }

  const columns = [
    { key: 'name', label: 'District', sortable: true, width: '160px' },
    { key: 'regionName', label: 'Region', sortable: true },
    {
      key: 'totalSubscribers',
      label: 'Subscribers',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.metrics?.totalSubscribers || 0,
      render: (row) => (row.metrics?.totalSubscribers || 0).toLocaleString(),
    },
    {
      key: 'gender',
      label: 'Gender (M/F)',
      sortable: true,
      sortValue: (row) => row.malePct,
      render: (row) => <GenderBar male={row.malePct} female={row.femalePct} />,
    },
    {
      key: 'youthPct',
      label: 'Youth (18-35)',
      align: 'right',
      sortable: true,
      render: (row) => `${row.youthPct}%`,
    },
    {
      key: 'age1825',
      label: '18-25',
      align: 'right',
      sortable: true,
      render: (row) => row.age1825.toLocaleString(),
    },
    {
      key: 'age2635',
      label: '26-35',
      align: 'right',
      sortable: true,
      render: (row) => row.age2635.toLocaleString(),
    },
    {
      key: 'age3645',
      label: '36-45',
      align: 'right',
      sortable: true,
      render: (row) => row.age3645.toLocaleString(),
    },
    {
      key: 'age4655',
      label: '46-55',
      align: 'right',
      sortable: true,
      render: (row) => row.age4655.toLocaleString(),
    },
    {
      key: 'age56plus',
      label: '56+',
      align: 'right',
      sortable: true,
      render: (row) => row.age56plus.toLocaleString(),
    },
  ];

  return (
    <ReportView
      onBack={onBack}
      title="Subscriber Demographics"
      description="Age distribution and gender breakdown by district"
    >
      <ReportTable columns={columns} data={enriched} defaultSort="totalSubscribers" loading={isLoading} />
    </ReportView>
  );
}
