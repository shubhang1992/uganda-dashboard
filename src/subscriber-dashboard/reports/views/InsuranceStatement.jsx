import { useMemo } from 'react';
import { useCurrentSubscriber } from '../../../hooks/useSubscriber';
import { formatUGX, formatUGXExact } from '../../../utils/finance';
import { downloadCSV } from '../../../utils/csv';
import ReportTable from '../../../dashboard/reports/ReportTable';
import frameStyles from './ReportFrame.module.css';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
}

const CLAIM_TYPES = {
  medical: 'Medical',
  accident: 'Accident',
  hospitalization: 'Hospitalisation',
  critical_illness: 'Critical illness',
};

function statusTone(s) {
  if (s === 'paid' || s === 'approved') return 'ok';
  if (s === 'rejected') return 'alert';
  return 'pending';
}

export default function InsuranceStatement() {
  const { data: sub } = useCurrentSubscriber();
  const insurance = sub?.insurance || {};
  const claims = sub?.claims || [];
  const premiumTx = useMemo(
    () => (sub?.transactions || []).filter((t) => t.type === 'premium'),
    [sub]
  );

  const totals = useMemo(() => {
    const premiumsPaid = premiumTx.reduce((s, t) => s + t.amount, 0);
    const claimsPaid = claims.filter((c) => c.status === 'paid').reduce((s, c) => s + c.amount, 0);
    return { premiumsPaid, claimsPaid, net: claimsPaid - premiumsPaid };
  }, [premiumTx, claims]);

  const claimColumns = [
    {
      key: 'submittedDate',
      label: 'Filed',
      sortable: true,
      render: (row) => formatDate(row.submittedDate),
    },
    {
      key: 'type',
      label: 'Type',
      sortable: true,
      render: (row) => CLAIM_TYPES[row.type] || row.type,
    },
    {
      key: 'incidentDate',
      label: 'Incident',
      sortable: true,
      render: (row) => formatDate(row.incidentDate),
    },
    {
      key: 'amount',
      label: 'Claimed',
      sortable: true,
      align: 'right',
      render: (row) => formatUGXExact(row.amount),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <span className={frameStyles.pill} data-tone={statusTone(row.status)}>
          <span className={frameStyles.pillDot} />
          {row.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </span>
      ),
    },
  ];

  function handleExport() {
    const headers = ['Filed', 'Type', 'Incident', 'Claimed (UGX)', 'Status', 'Description'];
    const rows = claims.map((c) => [
      c.submittedDate,
      CLAIM_TYPES[c.type] || c.type,
      c.incidentDate,
      c.amount,
      c.status,
      c.description || '',
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCSV(`insurance-statement-${stamp}.csv`, headers, rows);
  }

  return (
    <div className={frameStyles.frame}>
      <div className={frameStyles.headerRow}>
        <div className={frameStyles.headerText}>
          <span className={frameStyles.eyebrow}>Your coverage at a glance</span>
          <span className={frameStyles.headerDesc}>Premiums, claims, and your current policy.</span>
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
          <span className={frameStyles.kpiLabel}>Current cover</span>
          <span className={frameStyles.kpiValue}>{formatUGX(insurance.cover || 0)}</span>
          <span className={frameStyles.kpiSub}>
            {insurance.status === 'active' ? 'Active' : 'Inactive'} · {formatUGXExact(insurance.premiumMonthly || 0)} / mo
          </span>
        </div>
        <div className={frameStyles.kpi}>
          <span className={frameStyles.kpiLabel}>Premiums paid</span>
          <span className={frameStyles.kpiValue}>{formatUGX(totals.premiumsPaid)}</span>
          <span className={frameStyles.kpiSub}>{premiumTx.length} payment{premiumTx.length !== 1 ? 's' : ''}</span>
        </div>
        <div className={frameStyles.kpi}>
          <span className={frameStyles.kpiLabel}>Claims paid</span>
          <span className={frameStyles.kpiValue}>{formatUGX(totals.claimsPaid)}</span>
          <span className={frameStyles.kpiSub}>{claims.length} filed</span>
        </div>
        <div className={frameStyles.kpi}>
          <span className={frameStyles.kpiLabel}>Policy start</span>
          <span className={frameStyles.kpiValue}>{formatDate(insurance.policyStart)}</span>
          <span className={frameStyles.kpiSub}>Renews {formatDate(insurance.renewalDate)}</span>
        </div>
      </div>

      <section className={frameStyles.statSection}>
        <div className={frameStyles.statSectionTitle}>Claims history</div>
        {claims.length === 0 ? (
          <div className={frameStyles.emptyState}>No claims filed yet.</div>
        ) : (
          <ReportTable
            columns={claimColumns}
            data={claims}
            defaultSort="submittedDate"
            defaultDir="desc"
            rowKey="id"
          />
        )}
      </section>
    </div>
  );
}
