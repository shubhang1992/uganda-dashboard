// Insurance & benefits panel (Phase 5). Company-wide insurance oversight: a KPI
// strip (covered count · total monthly premium · uninsured · total cover) and a
// per-employee cover/status table. Mostly read-only — editing an individual
// employee's cover reuses the existing EmployeeDetail insurance editor: each row
// calls `openEmployeeDetail(emp.id)`, which docks the detail panel (and closes
// this one) so the user edits in one place.
//
// Data comes from `useEmployees(employerId)` — this component never imports
// `employerSeed`. Wraps the shared `EmployerSlidePanel` chrome (width 600) and
// passes through `splitMode` so the overview reflows beside it.

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import { useEmployees } from '../../hooks/useEmployer';
import { formatUGX, formatNumber } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { PillChip, PillChipGroup } from '../../components/PillChip';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import ErrorCard from '../../components/feedback/ErrorCard';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import styles from './InsuranceBenefits.module.css';

// Coverage filter options. 'all' is a synthetic UI value (no filter).
const COVER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'insured', label: 'Insured' },
  { value: 'uninsured', label: 'Uninsured' },
];

/** An employee counts as covered when their policy is active or carries cover. */
function isCovered(emp) {
  return emp.insuranceStatus === 'active' || Number(emp.insuranceCover) > 0;
}

export default function InsuranceBenefits({ splitMode = false }) {
  const { insuranceOpen, setInsuranceOpen, openEmployeeDetail } = useEmployerPanel();
  const { employerId } = useEmployerScope();

  const {
    data: employees = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useEmployees(employerId);

  const [search, setSearch] = useState('');
  const [coverFilter, setCoverFilter] = useState('all');

  // Reset transient filter/search state shortly after the panel closes.
  useEffect(() => {
    if (insuranceOpen) return undefined;
    const t = setTimeout(() => {
      setSearch('');
      setCoverFilter('all');
    }, 400);
    return () => clearTimeout(t);
  }, [insuranceOpen]);

  const kpis = useMemo(() => {
    let coveredCount = 0;
    let totalPremium = 0;
    let totalCover = 0;
    for (const e of employees) {
      const cover = Number(e.insuranceCover) || 0;
      totalCover += cover;
      if (isCovered(e)) {
        coveredCount += 1;
        totalPremium += Number(e.insurancePremiumMonthly) || 0;
      }
    }
    return {
      coveredCount,
      uninsuredCount: employees.length - coveredCount,
      totalPremium,
      totalCover,
    };
  }, [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees
      .filter((e) => {
        if (coverFilter === 'insured' && !isCovered(e)) return false;
        if (coverFilter === 'uninsured' && isCovered(e)) return false;
        if (!q) return true;
        return (
          (e.name || '').toLowerCase().includes(q) ||
          (e.phone || '').toLowerCase().includes(q)
        );
      })
      // Covered first, then by cover amount descending — the densest detail up top.
      .sort((a, b) => {
        const ca = isCovered(a) ? 1 : 0;
        const cb = isCovered(b) ? 1 : 0;
        if (ca !== cb) return cb - ca;
        return (Number(b.insuranceCover) || 0) - (Number(a.insuranceCover) || 0);
      });
  }, [employees, search, coverFilter]);

  // Cold-load guard — skeleton only on a true first fetch.
  const isCold = isLoading && employees.length === 0;
  const hasFilters = coverFilter !== 'all' || search.trim() !== '';

  // Opening the detail closes this panel so the two never stack — the detail
  // (with the insurance editor) docks in its place. Mirrors the single-panel
  // layout the context's closeAllPanels guarantees elsewhere.
  const handleRowClick = useCallback((employeeId) => {
    setInsuranceOpen(false);
    openEmployeeDetail(employeeId);
  }, [setInsuranceOpen, openEmployeeDetail]);

  return (
    <EmployerSlidePanel
      open={insuranceOpen}
      onClose={() => setInsuranceOpen(false)}
      title="Insurance & benefits"
      eyebrow="Benefits"
      width={600}
      splitMode={splitMode}
    >
      {/* KPI strip */}
      <div className={styles.kpiRow}>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Covered</span>
          <span className={styles.kpiValue}>{formatNumber(kpis.coveredCount)}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Uninsured</span>
          <span className={styles.kpiValue}>{formatNumber(kpis.uninsuredCount)}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Monthly premium</span>
          <span className={styles.kpiValue}>{formatUGX(kpis.totalPremium)}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Total cover</span>
          <span className={styles.kpiValue}>{formatUGX(kpis.totalCover)}</span>
        </div>
      </div>

      {/* Search + coverage filter */}
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

        <PillChipGroup label="Filter employees by insurance coverage" className={styles.statusGroup}>
          {COVER_OPTIONS.map((opt) => (
            <PillChip
              key={opt.value}
              selected={coverFilter === opt.value}
              onClick={() => setCoverFilter(opt.value)}
            >
              {opt.label}
            </PillChip>
          ))}
        </PillChipGroup>
      </div>

      {/* Cover table */}
      {isCold ? (
        <SkeletonRow count={8} variant="compact" label="Loading insurance" />
      ) : isError ? (
        <ErrorCard
          title="We couldn't load insurance"
          message={error}
          onRetry={refetch}
        />
      ) : filtered.length === 0 ? (
        hasFilters ? (
          <EmptyState
            kind="no-match"
            title="No employees match"
            body="Try a different search term or coverage filter."
          />
        ) : (
          <EmptyState
            kind="no-data"
            title="No employees yet"
            body="Staff you onboard will appear here with their insurance cover."
          />
        )
      ) : (
        <>
          <p className={styles.listCount}>
            Showing {filtered.length} of {employees.length} {employees.length === 1 ? 'employee' : 'employees'}
          </p>
          <div className={styles.tableWrap} role="table" aria-label="Employee insurance cover">
            <div className={styles.tableHead} role="row">
              <span role="columnheader" className={styles.colName}>Employee</span>
              <span role="columnheader" className={styles.colCover}>Cover</span>
              <span role="columnheader" className={styles.colPremium}>Premium / mo</span>
              <span role="columnheader" className={styles.colStatus}>Status</span>
              <span role="columnheader" className={styles.colRenewal}>Renewal</span>
            </div>
            <ul className={styles.tableBody}>
              {filtered.map((emp) => {
                const covered = isCovered(emp);
                return (
                  <li key={emp.id} role="row" className={styles.rowItem}>
                    <button
                      type="button"
                      className={styles.row}
                      onClick={() => handleRowClick(emp.id)}
                      aria-label={`Edit insurance for ${emp.name}`}
                    >
                      <span className={styles.colName} role="cell">
                        <span className={styles.name}>{emp.name}</span>
                        <span className={styles.subline}>{emp.phone || '—'}</span>
                      </span>
                      <span className={styles.colCover} role="cell">
                        {covered ? formatUGX(emp.insuranceCover, { compact: false }) : 'No cover'}
                      </span>
                      <span className={styles.colPremium} role="cell">
                        {covered && Number(emp.insurancePremiumMonthly) > 0
                          ? formatUGX(emp.insurancePremiumMonthly, { compact: false })
                          : '—'}
                      </span>
                      <span className={styles.colStatus} role="cell">
                        <span className={styles.statusPill} data-status={covered ? 'active' : 'inactive'}>
                          {covered ? 'Active' : 'Inactive'}
                        </span>
                      </span>
                      <span className={styles.colRenewal} role="cell">
                        {covered && emp.insuranceRenewalDate ? formatDate(emp.insuranceRenewalDate) : '—'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </EmployerSlidePanel>
  );
}
