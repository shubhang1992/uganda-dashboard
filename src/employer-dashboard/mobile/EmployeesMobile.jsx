import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployees, usePendingInvites } from '../../hooks/useEmployer';
import { formatUGX, formatNumber } from '../../utils/currency';
import { PillChip, PillChipGroup } from '../../components/PillChip';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import ErrorCard from '../../components/feedback/ErrorCard';
import s from './employerMobile.module.css';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Inactive' },
];

function initials(name) {
  return (
    (name || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  );
}

const PlusIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/**
 * EmployeesMobile — the Staff roster (phone). Fresh body against useEmployees +
 * usePendingInvites (the ViewEmployees panel couples its list to slide-panel
 * chrome), mirroring how EmployeesDesktop re-implements the roster. Rows drill to
 * the routed member detail; pending invites surface as a summary → Pending KYC.
 */
export default function EmployeesMobile() {
  const navigate = useNavigate();
  const { employerId } = useEmployerScope();
  const { data: employees = [], isLoading, isError, error, refetch } = useEmployees(employerId);
  const { data: pendingInvites = [] } = usePendingInvites(employerId);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const headcount = employees.length;
  const active = employees.filter((e) => e.status === 'active').length;
  const suspended = employees.filter((e) => e.status === 'suspended').length;
  const pendingKyc = pendingInvites.length;

  const q = search.trim().toLowerCase();
  const filtered = employees.filter((e) => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (!q) return true;
    return (e.name || '').toLowerCase().includes(q) || (e.phone || '').toLowerCase().includes(q);
  });

  const isCold = isLoading && employees.length === 0;
  const hasFilters = statusFilter !== 'all' || search.trim() !== '';

  return (
    <div className={s.page}>
      <div className={`${s.card} ${s.grad}`} style={{ textAlign: 'center' }}>
        <div className={s.eyebrow}>Your roster</div>
        <div className={s.heroVal} style={{ marginTop: 4 }}>{formatNumber(headcount)} staff</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 9, fontSize: 12.5 }}>
          <span style={{ color: 'var(--color-status-good)', fontWeight: 700 }}>{formatNumber(active)} active</span>
          <span style={{ color: '#8a6209', fontWeight: 700 }}>{formatNumber(suspended)} inactive</span>
          {pendingKyc > 0 && <span style={{ color: 'var(--color-gray)' }}>{formatNumber(pendingKyc)} pending</span>}
        </div>
      </div>

      <div className={s.btnRow}>
        <button type="button" className={`${s.btn} ${s.btnPri}`} style={{ flex: 1.4 }} onClick={() => navigate('/dashboard/onboard')}>
          {PlusIcon}Onboard staff
        </button>
        {pendingKyc > 0 && (
          <button type="button" className={`${s.btn} ${s.btnSec}`} onClick={() => navigate('/dashboard/pending-kyc')}>
            Pending · {formatNumber(pendingKyc)}
          </button>
        )}
      </div>

      <div className={s.search}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" />
        </svg>
        <input type="search" placeholder="Search name or phone" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search staff by name or phone" />
      </div>

      <PillChipGroup label="Filter staff by status">
        {STATUS_OPTIONS.map((o) => (
          <PillChip key={o.value} selected={statusFilter === o.value} onClick={() => setStatusFilter(o.value)}>
            {o.label}
          </PillChip>
        ))}
      </PillChipGroup>

      {isCold ? (
        <SkeletonRow count={8} variant="compact" label="Loading staff" />
      ) : isError ? (
        <ErrorCard title="We couldn't load the roster" message={error} onRetry={refetch} />
      ) : filtered.length === 0 ? (
        hasFilters ? (
          <EmptyState kind="no-match" title="No staff match" body="Try a different search term or status filter." />
        ) : (
          <EmptyState kind="no-data" title="No staff yet" body="Staff you onboard will appear here." />
        )
      ) : (
        <div className={s.card} style={{ paddingTop: 4, paddingBottom: 4 }}>
          {filtered.map((emp) => (
            <button key={emp.id} type="button" className={s.lrow} onClick={() => navigate(`/dashboard/employees/${emp.id}`)} aria-label={`Open ${emp.name}`}>
              <span className={s.av}>{initials(emp.name)}</span>
              <span className={s.lMid}><b>{emp.name}</b><small>{emp.phone}</small></span>
              <span className={s.lEnd}>
                <span className={`${s.pill} ${emp.status === 'active' ? s.pillOk : s.pillWarn}`}><i />{emp.status === 'active' ? 'Active' : 'Inactive'}</span>
                <span className={s.lAmt} style={{ fontSize: 12 }}>{formatUGX(emp.compensation, { compact: true })}/mo</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
