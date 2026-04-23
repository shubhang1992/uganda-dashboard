import { useState, useMemo } from 'react';
import { useCurrentSubscriber } from '../../../hooks/useSubscriber';
import { formatUGXExact, formatUGX } from '../../../utils/finance';
import { downloadCSV } from '../../../utils/csv';
import ReportTable from '../../../dashboard/reports/ReportTable';
import FilterSelect, { SearchFilter } from '../../../dashboard/reports/FilterSelect';
import frameStyles from './ReportFrame.module.css';

const TYPE_OPTIONS = [
  { value: 'contribution', label: 'Contribution' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'premium', label: 'Premium' },
  { value: 'claim', label: 'Claim' },
];

const STATUS_OPTIONS = [
  { value: 'settled', label: 'Settled' },
  { value: 'paid', label: 'Paid' },
  { value: 'processing', label: 'Processing' },
];

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function pillTone(status) {
  if (status === 'paid' || status === 'settled') return 'ok';
  if (status === 'processing' || status === 'submitted' || status === 'under_review') return 'pending';
  return 'ok';
}

export default function AllTransactions() {
  const { data: sub } = useCurrentSubscriber();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const transactions = sub?.transactions || [];

  const filtered = useMemo(() => {
    let rows = transactions;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((t) =>
        (t.reference || '').toLowerCase().includes(q) ||
        (t.method || '').toLowerCase().includes(q) ||
        (t.type || '').toLowerCase().includes(q)
      );
    }
    if (typeFilter) rows = rows.filter((t) => t.type === typeFilter);
    if (statusFilter) rows = rows.filter((t) => t.status === statusFilter);
    return rows;
  }, [transactions, search, typeFilter, statusFilter]);

  const totals = useMemo(() => {
    let inflow = 0, outflow = 0;
    filtered.forEach((t) => {
      if (t.amount > 0) inflow += t.amount;
      else outflow += Math.abs(t.amount);
    });
    return { inflow, outflow, net: inflow - outflow };
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
      key: 'type',
      label: 'Type',
      sortable: true,
      render: (row) => (
        <span className={frameStyles.typeBadge} data-type={row.type}>
          {row.type.charAt(0).toUpperCase() + row.type.slice(1)}
        </span>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      sortable: true,
      render: (row) => (
        <span className={row.amount >= 0 ? frameStyles.amountPositive : frameStyles.amountNegative}>
          {row.amount >= 0 ? '+' : '−'}{formatUGXExact(Math.abs(row.amount))}
        </span>
      ),
    },
    {
      key: 'method',
      label: 'Method',
      sortable: true,
      render: (row) => row.method || '—',
    },
    {
      key: 'reference',
      label: 'Reference',
      sortable: false,
      render: (row) => row.reference || '—',
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <span className={frameStyles.pill} data-tone={pillTone(row.status)}>
          <span className={frameStyles.pillDot} />
          {row.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </span>
      ),
    },
  ];

  function handleExport() {
    const headers = ['Date', 'Type', 'Amount (UGX)', 'Method', 'Reference', 'Status'];
    const rows = filtered.map((t) => [
      t.date,
      t.type,
      t.amount,
      t.method || '',
      t.reference || '',
      t.status,
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCSV(`transactions-${stamp}.csv`, headers, rows);
  }

  return (
    <div className={frameStyles.frame}>
      <div className={frameStyles.headerRow}>
        <div className={frameStyles.headerText}>
          <span className={frameStyles.eyebrow}>Every movement in your account</span>
          <span className={frameStyles.headerDesc}>{filtered.length} of {transactions.length} transactions</span>
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
          <span className={frameStyles.kpiLabel}>Money in</span>
          <span className={frameStyles.kpiValue}>{formatUGX(totals.inflow)}</span>
        </div>
        <div className={frameStyles.kpi}>
          <span className={frameStyles.kpiLabel}>Money out</span>
          <span className={frameStyles.kpiValue}>{formatUGX(totals.outflow)}</span>
        </div>
        <div className={frameStyles.kpi}>
          <span className={frameStyles.kpiLabel}>Net</span>
          <span className={frameStyles.kpiValue}>{formatUGX(Math.max(0, totals.net))}</span>
        </div>
      </div>

      <div className={frameStyles.filters}>
        <SearchFilter value={search} onChange={setSearch} placeholder="Search by type or method…" />
        <FilterSelect label="Type" value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} />
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
