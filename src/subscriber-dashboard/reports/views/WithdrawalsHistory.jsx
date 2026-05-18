import { useMemo, useState } from 'react';
import { useCurrentSubscriber, useSubscriberWithdrawals } from '../../../hooks/useSubscriber';
import { formatUGX, formatUGXExact } from '../../../utils/finance';
import { formatDate } from '../../../utils/date';
import { downloadCSV } from '../../../utils/csv';
import ReportTable from '../../../components/reports/ReportTable';
import FilterSelect from '../../../components/reports/FilterSelect';
import ErrorCard from '../../../components/feedback/ErrorCard';
import ExportButton from '../../../components/reports/ExportButton';
import SkeletonRow from '../../../components/SkeletonRow';
import EmptyState from '../../../components/EmptyState';
import frameStyles from './ReportFrame.module.css';

const BUCKET_OPTIONS = [
  { value: 'emergency', label: 'Emergency' },
  { value: 'retirement', label: 'Retirement' },
];

const STATUS_OPTIONS = [
  { value: 'paid', label: 'Paid' },
  { value: 'processing', label: 'Processing' },
];

function pillTone(status) {
  if (status === 'paid') return 'ok';
  return 'pending';
}

export default function WithdrawalsHistory() {
  const { data: sub, isLoading, isError, error, refetch } = useCurrentSubscriber();
  const { data: withdrawals = [] } = useSubscriberWithdrawals(sub?.id);

  const [bucketFilter, setBucketFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = useMemo(() => {
    let rows = withdrawals;
    if (bucketFilter) rows = rows.filter((w) => w.bucket === bucketFilter);
    if (statusFilter) rows = rows.filter((w) => w.status === statusFilter);
    return rows;
  }, [withdrawals, bucketFilter, statusFilter]);

  const totals = useMemo(() => {
    let total = 0, retirement = 0, emergency = 0;
    filtered.forEach((w) => {
      total += w.amount;
      if (w.bucket === 'retirement') retirement += w.amount;
      else emergency += w.amount;
    });
    return { total, retirement, emergency };
  }, [filtered]);

  const columns = [
    {
      key: 'date',
      label: 'Date',
      sortable: true,
      width: '110px',
      render: (row) => formatDate(row.date),
    },
    {
      key: 'amount',
      label: 'Amount',
      sortable: true,
      align: 'right',
      render: (row) => formatUGXExact(row.amount),
    },
    {
      key: 'bucket',
      label: 'Bucket',
      sortable: true,
      render: (row) => row.bucket.charAt(0).toUpperCase() + row.bucket.slice(1),
    },
    { key: 'reason', label: 'Reason', sortable: true },
    { key: 'method', label: 'Method', sortable: true },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <span className={frameStyles.pill} data-tone={pillTone(row.status)}>
          <span className={frameStyles.pillDot} />
          {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
        </span>
      ),
    },
  ];

  function handleExport() {
    const headers = ['Date', 'Amount (UGX)', 'Bucket', 'Reason', 'Method', 'Status'];
    const rows = filtered.map((w) => [w.date, w.amount, w.bucket, w.reason, w.method, w.status]);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCSV(`withdrawals-${stamp}.csv`, headers, rows);
  }

  if (isError) {
    return (
      <ErrorCard
        title="We couldn't load your withdrawals"
        message={error}
        onRetry={refetch}
      />
    );
  }

  // Cold-load skeleton — keep the report frame anchored while data hydrates.
  if (isLoading && !sub) {
    return (
      <div className={frameStyles.frame}>
        <div className={frameStyles.headerRow}>
          <div className={frameStyles.headerText}>
            <span className={frameStyles.eyebrow}>Your withdrawals</span>
            <span className={frameStyles.headerDesc}>Loading…</span>
          </div>
        </div>
        <SkeletonRow count={6} label="Loading withdrawals" />
      </div>
    );
  }

  return (
    <div className={frameStyles.frame}>
      <div className={frameStyles.headerRow}>
        <div className={frameStyles.headerText}>
          <span className={frameStyles.eyebrow}>Your withdrawals</span>
          <span className={frameStyles.headerDesc}>{filtered.length} of {withdrawals.length} entries</span>
        </div>
        <ExportButton onExport={handleExport} />
      </div>

      <div className={frameStyles.kpiStrip}>
        <div className={frameStyles.kpi}>
          <span className={frameStyles.kpiLabel}>Total withdrawn</span>
          <span className={frameStyles.kpiValue}>{formatUGX(totals.total)}</span>
        </div>
        <div className={frameStyles.kpi}>
          <span className={frameStyles.kpiLabel}>From emergency</span>
          <span className={frameStyles.kpiValue}>{formatUGX(totals.emergency)}</span>
        </div>
        <div className={frameStyles.kpi}>
          <span className={frameStyles.kpiLabel}>From retirement</span>
          <span className={frameStyles.kpiValue}>{formatUGX(totals.retirement)}</span>
        </div>
      </div>

      <div className={frameStyles.filters}>
        <FilterSelect label="Bucket" value={bucketFilter} onChange={setBucketFilter} options={BUCKET_OPTIONS} />
        <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
      </div>

      {filtered.length === 0 ? (
        // No withdrawals at all vs filtered down to zero — different prompts.
        withdrawals.length === 0 ? (
          <EmptyState
            kind="no-data"
            title="No withdrawals yet."
            body="Any withdrawals you make will be tracked here."
          />
        ) : (
          <EmptyState
            kind="no-match"
            title="No withdrawals match"
            body="Try adjusting your bucket or status filter."
          />
        )
      ) : (
        <ReportTable
          columns={columns}
          data={filtered}
          defaultSort="date"
          defaultDir="desc"
          rowKey="id"
        />
      )}
    </div>
  );
}
