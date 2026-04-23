import { useMemo, useState } from 'react';
import { useCurrentSubscriber } from '../../../hooks/useSubscriber';
import { formatUGX, formatUGXExact } from '../../../utils/finance';
import { downloadCSV } from '../../../utils/csv';
import ReportTable from '../../../dashboard/reports/ReportTable';
import FilterSelect from '../../../dashboard/reports/FilterSelect';
import frameStyles from './ReportFrame.module.css';

const BUCKET_OPTIONS = [
  { value: 'emergency', label: 'Emergency' },
  { value: 'retirement', label: 'Retirement' },
];

const STATUS_OPTIONS = [
  { value: 'paid', label: 'Paid' },
  { value: 'processing', label: 'Processing' },
];

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function pillTone(status) {
  if (status === 'paid') return 'ok';
  return 'pending';
}

export default function WithdrawalsHistory() {
  const { data: sub } = useCurrentSubscriber();
  const withdrawals = sub?.withdrawals || [];

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

  return (
    <div className={frameStyles.frame}>
      <div className={frameStyles.headerRow}>
        <div className={frameStyles.headerText}>
          <span className={frameStyles.eyebrow}>Your withdrawals</span>
          <span className={frameStyles.headerDesc}>{filtered.length} of {withdrawals.length} entries</span>
        </div>
        <button type="button" className={frameStyles.exportBtn} onClick={handleExport}>
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="14" height="14">
            <path d="M10 3v10M10 13l-3-3M10 13l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 15v2h14v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Export CSV</span>
        </button>
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

      <ReportTable
        columns={columns}
        data={filtered}
        defaultSort="date"
        defaultDir="desc"
        rowKey="id"
      />
    </div>
  );
}
