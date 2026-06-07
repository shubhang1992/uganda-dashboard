// Member detail panel. Opens for the `activeEmployeeId` (a tagged subscriber id)
// and renders a READ-ONLY view: identity, balances with own/employer breakdown,
// the company-wide funding model (Issue 2 — not per-member), contribution
// history (own + employer transactions), insurance (group-managed), and
// nominees. All data via hooks; never imports `employerSeed`.

import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployee, useEmployeeContributions, useEmployer } from '../../hooks/useEmployer';
import { formatUGX, formatNumber } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import SkeletonRow from '../../components/SkeletonRow';
import ErrorCard from '../../components/feedback/ErrorCard';
import EmptyState from '../../components/EmptyState';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import { companyFundingLabel } from './fundingLabel';
import styles from './EmployeeDetail.module.css';

export default function EmployeeDetail({ splitMode = false }) {
  const { employeeDetailOpen, setEmployeeDetailOpen, activeEmployeeId } = useEmployerPanel();
  const { employerId } = useEmployerScope();

  const { data: employee, isLoading, isError, error, refetch } = useEmployee(activeEmployeeId);
  const {
    data: contributions = [],
    isLoading: txLoading,
    isError: txError,
    error: txErrorObj,
    refetch: refetchTx,
  } = useEmployeeContributions(activeEmployeeId);
  const { data: employer } = useEmployer(employerId);

  const title = employee?.name || 'Member';
  const isCold = isLoading && !employee;

  const headerBadge = employee ? (
    <span className={styles.statusPill} data-status={employee.status}>
      {employee.status === 'active' ? 'Active' : 'Suspended'}
    </span>
  ) : null;

  return (
    <EmployerSlidePanel
      open={employeeDetailOpen}
      onClose={() => setEmployeeDetailOpen(false)}
      title={title}
      eyebrow="Member"
      width={560}
      splitMode={splitMode}
      headerActions={headerBadge}
    >
      {isCold ? (
        <SkeletonRow count={6} label="Loading member" />
      ) : isError ? (
        <ErrorCard title="We couldn't load this member" message={error} onRetry={refetch} />
      ) : !employee ? (
        <EmptyState kind="no-data" title="Member not found" body="This record may have been removed." />
      ) : (
        <div className={styles.sections}>
          {/* Identity meta */}
          <p className={styles.identity}>
            {employee.phone}
            {employee.email ? ` · ${employee.email}` : ''}
            {employee.joinedDate ? ` · Joined ${formatDate(employee.joinedDate, { variant: 'long' })}` : ''}
          </p>
          {employee.status === 'suspended' && (
            <p className={styles.suspendNote}>
              This member is suspended — contribution runs skip them.
            </p>
          )}

          {/* ── Balances + own/employer breakdown ──────────────────────────── */}
          <section className={styles.section} aria-labelledby="bal-h">
            <h3 id="bal-h" className={styles.sectionTitle}>Balances</h3>
            <div className={styles.metricGrid}>
              <Metric label="Retirement" value={formatUGX(employee.retirementBalance)} />
              <Metric label="Emergency" value={formatUGX(employee.emergencyBalance)} />
              <Metric label="Net balance" value={formatUGX(employee.netBalance)} accent />
              <Metric label="Units held" value={formatNumber(employee.unitsHeld)} />
              <Metric label="Own contributions" value={formatUGX(employee.ownContributions ?? 0)} />
              <Metric label="Employer contributions" value={formatUGX(employee.employerContributions ?? 0)} />
            </div>
          </section>

          {/* ── Funding (company-wide; Issue 2) ────────────────────────────── */}
          <section className={styles.section} aria-labelledby="sched-h">
            <h3 id="sched-h" className={styles.sectionTitle}>Contribution plan</h3>
            <dl className={styles.defs}>
              <Def label="Own monthly saving" value={formatUGX(employee.monthlyContribution, { compact: false })} />
              <Def label="Company funding" value={companyFundingLabel(employer?.defaultContributionConfig)} />
              <Def
                label="Retirement / Emergency"
                value={`${Number(employee.contributionSchedule?.retirementPct ?? 80)}% / ${Number(employee.contributionSchedule?.emergencyPct ?? 20)}%`}
              />
            </dl>
          </section>

          {/* ── Contribution history (own + employer) ──────────────────────── */}
          <section className={styles.section} aria-labelledby="hist-h">
            <h3 id="hist-h" className={styles.sectionTitle}>Contribution history</h3>
            {txLoading && contributions.length === 0 ? (
              <SkeletonRow count={3} variant="compact" label="Loading contributions" />
            ) : txError ? (
              <ErrorCard title="We couldn't load contributions" message={txErrorObj} onRetry={refetchTx} variant="inline" />
            ) : contributions.length === 0 ? (
              <EmptyState kind="no-data" title="No contributions yet" body="Own savings and employer contributions appear here." />
            ) : (
              <ul className={styles.txList}>
                {contributions.map((c) => (
                  <li key={c.id} className={styles.txRow}>
                    <div className={styles.txMain}>
                      <span className={styles.txPeriod}>
                        {c.source === 'employer' ? 'Employer contribution' : 'Own contribution'}
                      </span>
                      <span className={styles.txMeta}>
                        {c.date ? formatDate(c.date, { variant: 'short' }) : '—'}
                        {c.method ? ` · ${c.method}` : ''}
                      </span>
                    </div>
                    <div className={styles.txAmounts}>
                      <span className={styles.txTotal}>{formatUGX(c.amount, { compact: false })}</span>
                      <span className={styles.txHalves} data-source={c.source}>
                        {c.source === 'employer' ? 'Employer' : 'You'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Insurance (group-managed; read-only here) ──────────────────── */}
          <section className={styles.section} aria-labelledby="ins-h">
            <h3 id="ins-h" className={styles.sectionTitle}>Insurance</h3>
            <dl className={styles.defs}>
              <Def label="Cover" value={employee.insuranceCover > 0 ? formatUGX(employee.insuranceCover, { compact: false }) : 'No cover'} />
              <Def
                label="Status"
                value={(
                  <span className={styles.insStatus} data-status={employee.insuranceStatus === 'active' ? 'active' : 'inactive'}>
                    {employee.insuranceStatus === 'active' ? 'Active' : 'Inactive'}
                  </span>
                )}
              />
              {employee.insuranceRenewalDate && (
                <Def label="Renewal" value={formatDate(employee.insuranceRenewalDate, { variant: 'long' })} />
              )}
            </dl>
            <p className={styles.insHint}>Cover is managed company-wide from Insurance &amp; benefits.</p>
          </section>

          {/* ── Nominees ──────────────────────────────────────────────────── */}
          <section className={styles.section} aria-labelledby="nom-h">
            <h3 id="nom-h" className={styles.sectionTitle}>Nominees</h3>
            {employee.nominees && employee.nominees.length > 0 ? (
              <ul className={styles.nomineeList}>
                {employee.nominees.map((n, i) => (
                  <li key={n.id || n.nin || `${n.name}-${i}`} className={styles.nomineeRow}>
                    <div className={styles.nomineeMain}>
                      <span className={styles.nomineeName}>{n.name}</span>
                      {n.relationship && <span className={styles.nomineeRel}>{n.relationship}</span>}
                    </div>
                    {n.share != null && <span className={styles.nomineeShare}>{Number(n.share)}%</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.emptyInline}>No nominees on file.</p>
            )}
          </section>
        </div>
      )}
    </EmployerSlidePanel>
  );
}

function Metric({ label, value, accent }) {
  return (
    <div className={styles.metric} data-accent={accent || undefined}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
    </div>
  );
}

function Def({ label, value }) {
  return (
    <div className={styles.def}>
      <dt className={styles.defLabel}>{label}</dt>
      <dd className={styles.defValue}>{value}</dd>
    </div>
  );
}
