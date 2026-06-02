// Employees roster panel (Phase 3). The full staff roster: a KPI strip, a
// search box + status filter, and a table whose every row opens the
// per-employee detail panel (via the employer panel context). Data comes from
// `useEmployees(employerId)` — this component never imports `employerSeed`.
//
// Wraps the shared `EmployerSlidePanel` chrome (width 640) and passes through
// `splitMode` so the overview reflows beside it.

import { useState, useMemo, useEffect } from 'react';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import { useEmployees } from '../../hooks/useEmployer';
import { formatUGX, formatNumber } from '../../utils/currency';
import { PillChip, PillChipGroup } from '../../components/PillChip';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import ErrorCard from '../../components/feedback/ErrorCard';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import styles from './ViewEmployees.module.css';

// Status filter options. 'all' is a synthetic UI value (no filter).
const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
];

/** Render the funding split as "10% / 5%" (pct) or fixed-amount fallback. */
function fundingSplit(config) {
  if (!config) return '—';
  if (config.mode === 'employer-only') {
    if (config.employerAmount != null) return `${formatUGX(config.employerAmount, { compact: false })}`;
    return `${Number(config.employerPct ?? 0)}% · employer`;
  }
  // co-contribution
  if (config.employerAmount != null || config.employeeAmount != null) {
    const er = config.employerAmount != null ? formatUGX(config.employerAmount, { compact: false }) : `${Number(config.employerPct ?? 0)}%`;
    const ee = config.employeeAmount != null ? formatUGX(config.employeeAmount, { compact: false }) : `${Number(config.employeePct ?? 0)}%`;
    return `${er} / ${ee}`;
  }
  return `${Number(config.employerPct ?? 0)}% / ${Number(config.employeePct ?? 0)}%`;
}

export default function ViewEmployees({ splitMode = false }) {
  const { employeesOpen, setEmployeesOpen, openEmployeeDetail } = useEmployerPanel();
  const { employerId } = useEmployerScope();

  const {
    data: employees = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useEmployees(employerId);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Reset transient filter/search state shortly after the panel closes.
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
        (e.jobTitle || '').toLowerCase().includes(q)
      );
    });
  }, [employees, search, statusFilter]);

  // Cold-load guard — skeleton only on a true first fetch.
  const isCold = isLoading && employees.length === 0;
  const hasFilters = statusFilter !== 'all' || search.trim() !== '';

  function handleRowClick(employeeId) {
    openEmployeeDetail(employeeId);
  }

  return (
    <EmployerSlidePanel
      open={employeesOpen}
      onClose={() => setEmployeesOpen(false)}
      title="Employees"
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

      {/* Search + status filter */}
      <div className={styles.controls}>
        <label className={styles.searchWrap}>
          <span className={styles.srOnly}>Search employees by name or job title</span>
          <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6" stroke="currentColor" strokeWidth="1.75" />
            <path d="M20 20l-4.5-4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className={styles.search}
            placeholder="Search name or job title"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <PillChipGroup label="Filter employees by status" className={styles.statusGroup}>
          {STATUS_OPTIONS.map((opt) => (
            <PillChip
              key={opt.value}
              selected={statusFilter === opt.value}
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label}
            </PillChip>
          ))}
        </PillChipGroup>
      </div>

      {/* Roster table */}
      {isCold ? (
        <SkeletonRow count={8} variant="compact" label="Loading employees" />
      ) : isError ? (
        <ErrorCard
          title="We couldn't load the roster"
          message={error}
          onRetry={refetch}
        />
      ) : filtered.length === 0 ? (
        hasFilters ? (
          <EmptyState
            kind="no-match"
            title="No employees match"
            body="Try a different search term or status filter."
          />
        ) : (
          <EmptyState
            kind="no-data"
            title="No employees yet"
            body="Staff you onboard will appear here as a roster."
          />
        )
      ) : (
        <>
          <p className={styles.listCount}>
            Showing {filtered.length} of {employees.length} {employees.length === 1 ? 'employee' : 'employees'}
          </p>
          <div className={styles.tableWrap} role="table" aria-label="Employee roster">
            <div className={styles.tableHead} role="row">
              <span role="columnheader" className={styles.colName}>Employee</span>
              <span role="columnheader" className={styles.colMode}>Funding</span>
              <span role="columnheader" className={styles.colSplit}>Split</span>
              <span role="columnheader" className={styles.colStatus}>Status</span>
              <span role="columnheader" className={styles.colBalance}>Balance</span>
            </div>
            <ul className={styles.tableBody}>
              {filtered.map((emp) => (
                <li key={emp.id} role="row" className={styles.rowItem}>
                  <button
                    type="button"
                    className={styles.row}
                    onClick={() => handleRowClick(emp.id)}
                    aria-label={`Open ${emp.name} details`}
                  >
                    <span className={styles.colName} role="cell">
                      <span className={styles.name}>{emp.name}</span>
                      <span className={styles.subline}>
                        {emp.jobTitle} · {formatUGX(emp.salary, { compact: false })}
                      </span>
                    </span>
                    <span className={styles.colMode} role="cell">
                      <span
                        className={styles.modeBadge}
                        data-mode={emp.contributionConfig?.mode === 'co-contribution' ? 'co' : 'employer'}
                      >
                        {emp.contributionConfig?.mode === 'co-contribution' ? 'Co-contribution' : 'Employer-only'}
                      </span>
                    </span>
                    <span className={styles.colSplit} role="cell">
                      {fundingSplit(emp.contributionConfig)}
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
