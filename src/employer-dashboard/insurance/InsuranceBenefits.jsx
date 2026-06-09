// Insurance & benefits panel — COMPANY-WIDE group life cover. Insurance is
// all-or-nothing: a single Settings toggle + one flat cover amount applies to
// EVERY staff member, or no-one. So this panel reads the employer's
// `defaultContributionConfig` (insuranceEnabled + groupCoverAmount) and shows a
// company-level summary (coverage on/off · cover per member · staff covered ·
// total exposure) — never per-member cover/premium/renewal/uninsured (which
// don't exist under this model). Cover is changed in Settings → Default config.
//
// Data via `useEmployees` (headcount) + `useEmployer` (the config) — never
// imports `employerSeed`.

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import { useEmployees, useEmployer } from '../../hooks/useEmployer';
import { formatUGX, formatNumber } from '../../utils/currency';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import ErrorCard from '../../components/feedback/ErrorCard';
import EmployerSlidePanel from '../panels/EmployerSlidePanel';
import { requestSettingsTab } from '../settings/EmployerSettings';
import styles from './InsuranceBenefits.module.css';

export default function InsuranceBenefits({ splitMode = false }) {
  const { insuranceOpen, setInsuranceOpen, setSettingsOpen } = useEmployerPanel();
  const { employerId } = useEmployerScope();

  const { data: employees = [], isLoading, isError, error, refetch } = useEmployees(employerId);
  const { data: employer } = useEmployer(employerId);

  const [search, setSearch] = useState('');
  useEffect(() => {
    if (insuranceOpen) return undefined;
    const t = setTimeout(() => setSearch(''), 400);
    return () => clearTimeout(t);
  }, [insuranceOpen]);

  // Company-wide config (back-compat: an un-migrated config with a positive cover
  // counts as enabled — same read as Settings).
  const cfg = employer?.defaultContributionConfig ?? {};
  const cover = Number(cfg.groupCoverAmount) || 0;
  const enabled = cfg.insuranceEnabled ?? cover > 0;
  const headcount = employees.length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) => (e.name || '').toLowerCase().includes(q) || (e.phone || '').toLowerCase().includes(q),
    );
  }, [employees, search]);

  const manageCover = useCallback(() => {
    setInsuranceOpen(false);
    // Deep-link straight to the Insurance tab in Settings (the shared panel
    // context only carries a single `settingsOpen` flag, so signal the initial
    // tab through EmployerSettings' module-scoped request channel).
    requestSettingsTab('insurance');
    setSettingsOpen(true);
  }, [setInsuranceOpen, setSettingsOpen]);

  const isCold = isLoading && employees.length === 0;

  return (
    <EmployerSlidePanel
      open={insuranceOpen}
      onClose={() => setInsuranceOpen(false)}
      title="Insurance & benefits"
      eyebrow="Group cover"
      width={600}
      splitMode={splitMode}
      headerActions={<button type="button" className={styles.manageBtn} onClick={manageCover}>Manage cover</button>}
    >
      {isCold ? (
        <SkeletonRow count={6} variant="compact" label="Loading insurance" />
      ) : isError ? (
        <ErrorCard title="We couldn't load insurance" message={error} onRetry={refetch} />
      ) : (
        <>
          {/* Company coverage summary */}
          <div className={styles.kpiRow}>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Coverage</span>
              <span className={styles.kpiValue} data-on={enabled || undefined}>{enabled ? 'On' : 'Off'}</span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Cover / member</span>
              <span className={styles.kpiValue}>{enabled ? formatUGX(cover) : '—'}</span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Staff covered</span>
              <span className={styles.kpiValue}>{enabled ? formatNumber(headcount) : '0'}</span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Total exposure</span>
              <span className={styles.kpiValue}>{enabled ? formatUGX(cover * headcount) : '—'}</span>
            </div>
          </div>

          {!enabled ? (
            <EmptyState
              kind="no-data"
              title="No group cover set up"
              body="Provide group life cover to all staff at a single flat amount from Settings → Default config. It's all-or-nothing — everyone is covered, or no-one is."
              cta={{ label: 'Set up cover', onClick: manageCover }}
            />
          ) : (
            <>
              <p className={styles.note}>
                Group life cover applies to <strong>all {formatNumber(headcount)} staff</strong> at a flat{' '}
                <strong>{formatUGX(cover, { compact: false })}</strong> each (employer-funded — no member
                premium). There&apos;s no per-member opt-out; change it in{' '}
                <button type="button" className={styles.inlineLink} onClick={manageCover}>Settings</button>.
              </p>

              <label className={styles.searchWrap}>
                <span className={styles.srOnly}>Search covered staff by name or phone</span>
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

              {filtered.length === 0 ? (
                <EmptyState
                  kind={search ? 'no-match' : 'no-data'}
                  title={search ? 'No staff match' : 'No staff yet'}
                  body={search ? 'Try a different search term.' : 'Onboarded staff are covered automatically.'}
                />
              ) : (
                <>
                  <p className={styles.listCount}>{formatNumber(filtered.length)} of {formatNumber(headcount)} covered</p>
                  <ul className={styles.list}>
                    {filtered.map((emp) => (
                      <li key={emp.id} className={styles.rowItem}>
                        <span className={styles.main}>
                          <span className={styles.name}>{emp.name}</span>
                          <span className={styles.subline}>{emp.phone || '—'}</span>
                        </span>
                        <span className={styles.statusPill} data-status="active">Covered</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </>
      )}
    </EmployerSlidePanel>
  );
}
