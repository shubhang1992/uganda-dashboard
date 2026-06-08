// Members roster panel. The employer's staff are tagged SUBSCRIBERS (unified
// model 0043–0045). A single EmployerSlidePanel hosts BOTH views via a local
// list↔detail replace model (mirrors dashboard/commissions/CommissionPanel —
// `view` state + `AnimatePresence mode="wait"` + Back), so drilling into a
// member swaps the panel body in place instead of opening a SECOND panel that
// overlaps the roster. "Remove from company" lives in the member's own detail
// view (a destructive footer action), not on every roster row. Data comes from
// `useEmployees(employerId)` — never imports `employerSeed`.

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import { useEmployees, useEmployer, usePendingInvites, useRemoveEmployee } from '../../hooks/useEmployer';
import { useToast } from '../../contexts/ToastContext';
import { formatUGX, formatNumber } from '../../utils/currency';
import { PillChip, PillChipGroup } from '../../components/PillChip';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import ErrorCard from '../../components/feedback/ErrorCard';
import Modal from '../../components/Modal';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import { companyFundingLabel } from './fundingLabel';
import MemberDetailBody from './MemberDetailBody';
import styles from './ViewEmployees.module.css';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Inactive' },
];

const viewAnim = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
  transition: { duration: 0.25, ease: EASE_OUT_EXPO },
};

export default function ViewEmployees({ splitMode = false }) {
  const { employeesOpen, setEmployeesOpen, setKycOpen } = useEmployerPanel();
  const { employerId } = useEmployerScope();

  const { data: employees = [], isLoading, isError, error, refetch } = useEmployees(employerId);
  const { data: employer } = useEmployer(employerId);
  const { data: pendingInvites = [] } = usePendingInvites(employerId);
  const removeEmployee = useRemoveEmployee(employerId);
  const { addToast } = useToast();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  // Local replace-model view: the roster list, or one member's detail.
  const [view, setView] = useState('list');
  const [detailId, setDetailId] = useState(null);
  // The member pending a "Remove from company" confirmation (null = no modal).
  const [removeTarget, setRemoveTarget] = useState(null);

  function openDetail(id) {
    setDetailId(id);
    setView('detail');
  }
  function backToList() {
    setView('list');
    setDetailId(null);
  }
  // Slim roster affordance — full invite management lives in the Pending KYC panel.
  function reviewPendingKyc() {
    setEmployeesOpen(false);
    setKycOpen(true);
  }

  // The member currently in the detail view (looked up from the already-loaded
  // roster, so the header title + Remove target resolve without an extra fetch).
  const detailEmployee = useMemo(
    () => employees.find((e) => e.id === detailId) || null,
    [employees, detailId],
  );

  function confirmRemove() {
    if (!removeTarget || removeEmployee.isPending) return;
    const { id, name } = removeTarget;
    removeEmployee.mutate(
      { employeeId: id },
      {
        onSuccess: () => {
          addToast('success', `${name.split(' ')[0]} was removed from your company. Their account stays active.`);
          setRemoveTarget(null);
          backToList();
        },
        onError: (err) => addToast('error', err?.message || 'Could not remove this member.'),
      },
    );
  }

  useEffect(() => {
    if (employeesOpen) return undefined;
    const t = setTimeout(() => {
      setSearch('');
      setStatusFilter('all');
      setView('list');
      setDetailId(null);
    }, 400);
    return () => clearTimeout(t);
  }, [employeesOpen]);

  const kpis = useMemo(() => {
    const headcount = employees.length;
    const active = employees.filter((e) => e.status === 'active').length;
    const suspended = employees.filter((e) => e.status === 'suspended').length;
    // Balances are private to the member. Surface workforce counts + the real
    // "pending KYC" = people invited who haven't completed sign-up yet.
    return { headcount, active, suspended, pendingKyc: pendingInvites.length };
  }, [employees, pendingInvites]);

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

  const inDetail = view === 'detail';
  const headerActions = inDetail && detailEmployee ? (
    <span className={styles.statusPill} data-status={detailEmployee.status}>
      {detailEmployee.status === 'active' ? 'Active' : 'Inactive'}
    </span>
  ) : null;

  return (
    <>
    <EmployerSlidePanel
      open={employeesOpen}
      onClose={() => setEmployeesOpen(false)}
      title={inDetail ? (detailEmployee?.name || 'Member') : 'Members'}
      eyebrow={inDetail ? 'Member' : 'Roster'}
      width={640}
      splitMode={splitMode}
      headerActions={headerActions}
    >
      <AnimatePresence mode="wait" initial={false}>
        {inDetail ? (
          /* ─── MEMBER DETAIL VIEW ─────────────────────────────────────── */
          <motion.div key="detail" {...viewAnim}>
            <button type="button" className={styles.detailBack} onClick={backToList}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="16" height="16">
                <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back to roster
            </button>

            <MemberDetailBody employeeId={detailId} />

            {detailEmployee && (
              <div className={styles.detailFooter}>
                <button
                  type="button"
                  className={styles.removeFromCompanyBtn}
                  onClick={() => setRemoveTarget(detailEmployee)}
                >
                  Remove from company
                </button>
              </div>
            )}
          </motion.div>
        ) : (
          /* ─── ROSTER LIST VIEW ───────────────────────────────────────── */
          <motion.div key="list" {...viewAnim}>
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
                <span className={styles.kpiLabel}>Inactive</span>
                <span className={styles.kpiValue}>{formatNumber(kpis.suspended)}</span>
              </div>
              <div className={styles.kpi}>
                <span className={styles.kpiLabel}>Pending KYC</span>
                <span className={styles.kpiValue}>{formatNumber(kpis.pendingKyc)}</span>
              </div>
            </div>

            {/* Single company-wide funding model (Issue 2) */}
            {employer?.defaultContributionConfig ? (
              <p className={styles.listCount}>
                <strong>Company funding:</strong> {companyFundingLabel(employer.defaultContributionConfig)}
              </p>
            ) : null}

            {/* Pending invites — slim summary; manage them in the Pending KYC panel */}
            {pendingInvites.length > 0 && (
              <button type="button" className={styles.pendingSummary} onClick={reviewPendingKyc}>
                <span className={styles.pendingSummaryText}>
                  {formatNumber(pendingInvites.length)} pending {pendingInvites.length === 1 ? 'invite' : 'invites'} · awaiting sign-up
                </span>
                <span className={styles.pendingSummaryCta}>Review in Pending KYC →</span>
              </button>
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
                  </div>
                  <ul className={styles.tableBody}>
                    {filtered.map((emp) => (
                      <li key={emp.id} role="row" className={styles.rowItem}>
                        <button
                          type="button"
                          className={styles.nameBtn}
                          onClick={() => openDetail(emp.id)}
                          aria-label={`Open ${emp.name} details`}
                          role="cell"
                        >
                          <span className={styles.name}>{emp.name}</span>
                          <span className={styles.subline}>{emp.phone}</span>
                        </button>
                        <span className={styles.colMode} role="cell">
                          {formatUGX(emp.monthlyContribution, { compact: false })}
                        </span>
                        <span className={styles.colSplit} role="cell">
                          {emp.joinedDate ? String(emp.joinedDate).slice(0, 10) : '—'}
                        </span>
                        <span className={styles.colStatus} role="cell">
                          <span className={styles.statusPill} data-status={emp.status}>
                            {emp.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </EmployerSlidePanel>

      <Modal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title="Remove from company"
        size="sm"
      >
        <div className={styles.confirm}>
          <h2 className={styles.confirmTitle}>Remove from company?</h2>
          <p className={styles.confirmBody}>
            <strong>{removeTarget?.name}</strong> will be removed from your roster
            and won&apos;t be included in future contribution runs. Their pension
            account stays active — they simply continue as an individual subscriber.
          </p>
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.confirmCancel}
              onClick={() => setRemoveTarget(null)}
              disabled={removeEmployee.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.confirmRemove}
              onClick={confirmRemove}
              disabled={removeEmployee.isPending}
            >
              {removeEmployee.isPending ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
