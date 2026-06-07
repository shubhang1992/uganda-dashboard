// Members roster panel. The employer's staff are tagged SUBSCRIBERS (unified
// model 0043–0045): a KPI strip, a single company-wide funding chip (Issue 2 —
// the funding model is the same for everyone), a search + status filter, and a
// table whose every row opens the member detail panel. Data comes from
// `useEmployees(employerId)` (tagged subscribers) — never imports `employerSeed`.

import { useState, useMemo, useEffect } from 'react';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import { useEmployees, useEmployer, usePendingInvites, useCancelInvite } from '../../hooks/useEmployer';
import { formatUGX, formatNumber } from '../../utils/currency';
import { PillChip, PillChipGroup } from '../../components/PillChip';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import ErrorCard from '../../components/feedback/ErrorCard';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import { companyFundingLabel } from './fundingLabel';
import styles from './ViewEmployees.module.css';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
];

export default function ViewEmployees({ splitMode = false }) {
  const { employeesOpen, setEmployeesOpen, openEmployeeDetail } = useEmployerPanel();
  const { employerId } = useEmployerScope();

  const { data: employees = [], isLoading, isError, error, refetch } = useEmployees(employerId);
  const { data: employer } = useEmployer(employerId);
  const { data: pendingInvites = [] } = usePendingInvites(employerId);
  const cancelInvite = useCancelInvite(employerId);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (employeesOpen) return undefined;
    const t = setTimeout(() => {
      setSearch('');
      setStatusFilter('all');
    }, 400);
    return () => clearTimeout(t);
  }, [employeesOpen]);

  const kpis = useMemo(() => {
    const headcount = employees.length;
    const active = employees.filter((e) => e.status === 'active').length;
    const suspended = employees.filter((e) => e.status === 'suspended').length;
    const totalBalance = employees.reduce((s, e) => s + (e.netBalance || 0), 0);
    return { headcount, active, suspended, totalBalance };
  }, [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (e.name || '').toLowerCase().includes(q) ||
        (e.phone || '').toLowerCase().includes(q)
      );
    });
  }, [employees, search, statusFilter]);

  const isCold = isLoading && employees.length === 0;
  const hasFilters = statusFilter !== 'all' || search.trim() !== '';

  return (
    <EmployerSlidePanel
      open={employeesOpen}
      onClose={() => setEmployeesOpen(false)}
      title="Members"
      eyebrow="Roster"
      width={640}
      splitMode={splitMode}
    >
      {/* KPI strip */}
      <div className={styles.kpiRow}>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Headcount</span>
          <span className={styles.kpiValue}>{formatNumber(kpis.headcount)}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Active</span>
          <span className={styles.kpiValue}>{formatNumber(kpis.active)}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Suspended</span>
          <span className={styles.kpiValue}>{formatNumber(kpis.suspended)}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Total balance</span>
          <span className={styles.kpiValue}>{formatUGX(kpis.totalBalance)}</span>
        </div>
      </div>

      {/* Single company-wide funding model (Issue 2) */}
      {employer?.defaultContributionConfig ? (
        <p className={styles.listCount}>
          <strong>Company funding:</strong> {companyFundingLabel(employer.defaultContributionConfig)}
        </p>
      ) : null}

      {/* Pending invites — invited but not yet completed KYC */}
      {pendingInvites.length > 0 && (
        <div className={styles.pending}>
          <p className={styles.pendingHead}>
            {formatNumber(pendingInvites.length)} pending {pendingInvites.length === 1 ? 'invite' : 'invites'} · awaiting KYC
          </p>
          <ul className={styles.pendingList}>
            {pendingInvites.map((inv) => (
              <li key={inv.token} className={styles.pendingRow}>
                <span className={styles.pendingName}>{inv.prefill?.fullName || 'Invited member'}</span>
                <span className={styles.pendingPhone}>{inv.prefill?.phone || '—'}</span>
                <span className={styles.pendingBadge}>Pending KYC</span>
                <button
                  type="button"
                  className={styles.pendingCancel}
                  onClick={() => cancelInvite.mutate(inv.token)}
                  disabled={cancelInvite.isPending}
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Search + status filter */}
      <div className={styles.controls}>
        <label className={styles.searchWrap}>
          <span className={styles.srOnly}>Search members by name or phone</span>
          <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6" stroke="currentColor" strokeWidth="1.75" />
            <path d="M20 20l-4.5-4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className={styles.search}
            placeholder="Search name or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <PillChipGroup label="Filter members by status" className={styles.statusGroup}>
          {STATUS_OPTIONS.map((opt) => (
            <PillChip key={opt.value} selected={statusFilter === opt.value} onClick={() => setStatusFilter(opt.value)}>
              {opt.label}
            </PillChip>
          ))}
        </PillChipGroup>
      </div>

      {/* Roster table */}
      {isCold ? (
        <SkeletonRow count={8} variant="compact" label="Loading members" />
      ) : isError ? (
        <ErrorCard title="We couldn't load the roster" message={error} onRetry={refetch} />
      ) : filtered.length === 0 ? (
        hasFilters ? (
          <EmptyState kind="no-match" title="No members match" body="Try a different search term or status filter." />
        ) : (
          <EmptyState kind="no-data" title="No members yet" body="Staff you onboard will appear here as subscribers." />
        )
      ) : (
        <>
          <p className={styles.listCount}>
            Showing {filtered.length} of {employees.length} {employees.length === 1 ? 'member' : 'members'}
          </p>
          <div className={styles.tableWrap} role="table" aria-label="Member roster">
            <div className={styles.tableHead} role="row">
              <span role="columnheader" className={styles.colName}>Member</span>
              <span role="columnheader" className={styles.colMode}>Saving / mo</span>
              <span role="columnheader" className={styles.colSplit}>Joined</span>
              <span role="columnheader" className={styles.colStatus}>Status</span>
              <span role="columnheader" className={styles.colBalance}>Balance</span>
            </div>
            <ul className={styles.tableBody}>
              {filtered.map((emp) => (
                <li key={emp.id} role="row" className={styles.rowItem}>
                  <button
                    type="button"
                    className={styles.row}
                    onClick={() => openEmployeeDetail(emp.id)}
                    aria-label={`Open ${emp.name} details`}
                  >
                    <span className={styles.colName} role="cell">
                      <span className={styles.name}>{emp.name}</span>
                      <span className={styles.subline}>{emp.phone}</span>
                    </span>
                    <span className={styles.colMode} role="cell">
                      {formatUGX(emp.monthlyContribution, { compact: false })}
                    </span>
                    <span className={styles.colSplit} role="cell">
                      {emp.joinedDate ? String(emp.joinedDate).slice(0, 10) : '—'}
                    </span>
                    <span className={styles.colStatus} role="cell">
                      <span className={styles.statusPill} data-status={emp.status}>
                        {emp.status === 'active' ? 'Active' : 'Suspended'}
                      </span>
                    </span>
                    <span className={styles.colBalance} role="cell">
                      {formatUGX(emp.netBalance)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </EmployerSlidePanel>
  );
}
