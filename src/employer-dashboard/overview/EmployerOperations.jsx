// Employer overview — operations section (the secondary row below the hero,
// cloned in spirit from `branch-dashboard/overview/OperationsSection.jsx`).
//
// Two cards on a light surface:
//   * Left  — recent contribution runs (newest-first), each a clickable row
//     with an animated bar (relative to the largest grand total) opening the
//     runs panel; an EmptyState CTA when there are none.
//   * Right — roster snapshot: a CSS/SVG funding-mode donut (co-contribution vs
//     employer-only) + a status breakdown (active / suspended / insured) with
//     animated fills. Opens the employees panel.
//
// All figures come in as props (the parent reads the employer hooks) — this
// component never touches the data layer directly. Charts are pure SVG/CSS to
// stay faithful to the branch template, which uses no Recharts.

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { formatUGX, formatNumber } from '../../utils/currency';
import { formatRelativeTime } from '../../utils/date';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import EmptyState from '../../components/EmptyState';
import styles from './EmployerOperations.module.css';

/* Donut geometry — a single full-circle stroke split into two arcs. */
function ModeDonut({ coContribution, employerOnly }) {
  const total = coContribution + employerOnly || 1;
  const coPct = (coContribution / total) * 100;
  const size = 120, r = 46, cx = 60, cy = 60, strokeW = 14;
  const circumference = 2 * Math.PI * r;
  const coLen = (coPct / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={styles.donut} role="img" aria-label={`${coContribution} co-contribution, ${employerOnly} employer-only`}>
      {/* Track (employer-only segment fills the remainder) */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-lavender)" strokeWidth={strokeW} />
      {/* Co-contribution arc, drawn from the top (rotate -90deg) */}
      <motion.circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke="var(--color-teal)" strokeWidth={strokeW} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        strokeDasharray={`${coLen} ${circumference}`}
        initial={{ strokeDashoffset: coLen }}
        animate={{ strokeDashoffset: 0 }}
        transition={{ duration: 0.9, delay: 0.2, ease: EASE_OUT_EXPO }}
      />
      <text x={cx} y={cy - 2} textAnchor="middle" className={styles.donutNumber}>{Math.round(coPct)}%</text>
      <text x={cx} y={cy + 14} textAnchor="middle" className={styles.donutCaption}>co-funded</text>
    </svg>
  );
}

function StatusBar({ label, value, total, variant }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className={styles.statusRow}>
      <span className={styles.statusLabel}>{label}</span>
      <div className={styles.statusTrack}>
        <motion.div
          className={styles.statusFill}
          data-variant={variant}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(pct, value > 0 ? 4 : 0)}%` }}
          transition={{ duration: 0.7, delay: 0.25, ease: EASE_OUT_EXPO }}
        />
      </div>
      <span className={styles.statusValue}>{formatNumber(value)}</span>
    </div>
  );
}

export default function EmployerOperations({ runs = [], metrics = {} }) {
  const { setRunsOpen, setEmployeesOpen, closeAllPanels } = useEmployerPanel();

  function openRuns() {
    closeAllPanels();
    setRunsOpen(true);
  }
  function openEmployees() {
    closeAllPanels();
    setEmployeesOpen(true);
  }

  const recentRuns = useMemo(() => runs.slice(0, 5), [runs]);
  const maxTotal = recentRuns.length ? Math.max(...recentRuns.map((r) => r.grandTotal || 0), 1) : 1;

  const headcount = metrics.headcount || 0;
  const active = metrics.active || 0;
  const suspended = metrics.suspended || 0;
  const insured = metrics.insuredCount || 0;
  const co = metrics.modeSplit?.coContribution || 0;
  const employerOnly = metrics.modeSplit?.employerOnly || 0;

  return (
    <motion.div className={styles.grid}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15, ease: EASE_OUT_EXPO }}
    >
      {/* ── Left: Recent contribution runs ── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.headerLeft}>
            <h3 className={styles.cardTitle}>Recent Runs</h3>
            <span className={styles.cardBadge}>{runs.length} total</span>
          </div>
          <button type="button" className={styles.viewAllBtn} onClick={openRuns}>
            View All
            <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10">
              <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </button>
        </div>

        <div className={styles.runList}>
          {recentRuns.length === 0 ? (
            <EmptyState
              kind="no-data"
              title="No contribution runs yet."
              body="Start your first run to fund your staff's pensions."
              cta={{
                label: 'Start a contribution run',
                onClick: openRuns,
                icon: (
                  <svg aria-hidden="true" viewBox="0 0 12 12" width="11" height="11" fill="none">
                    <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  </svg>
                ),
              }}
            />
          ) : (
            recentRuns.map((run, i) => {
              const pct = ((run.grandTotal || 0) / maxTotal) * 100;
              return (
                <motion.button
                  type="button"
                  key={run.id}
                  className={styles.runRow}
                  onClick={openRuns}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 + 0.03 * i, ease: EASE_OUT_EXPO }}
                >
                  <div className={styles.runInfo}>
                    <div className={styles.runTop}>
                      <span className={styles.runPeriod}>{run.periodLabel}</span>
                      <span className={styles.runTime}>{formatRelativeTime(run.runAt)}</span>
                    </div>
                    <div className={styles.barRow}>
                      <div className={styles.barTrack}>
                        <motion.div className={styles.barFill}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(pct, 3)}%` }}
                          transition={{ duration: 0.6, delay: 0.1 + 0.04 * i, ease: EASE_OUT_EXPO }}
                        />
                      </div>
                      <span className={styles.barLabel}>{formatUGX(run.grandTotal || 0)}</span>
                    </div>
                  </div>
                </motion.button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right: Roster snapshot ── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.headerLeft}>
            <h3 className={styles.cardTitle}>Roster Snapshot</h3>
            <span className={styles.cardBadge}>{formatNumber(headcount)} staff</span>
          </div>
          <button type="button" className={styles.viewAllBtn} onClick={openEmployees}>
            View All
            <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10">
              <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </button>
        </div>

        <div className={styles.snapshotBody}>
          <div className={styles.donutWrap}>
            <ModeDonut coContribution={co} employerOnly={employerOnly} />
            <div className={styles.donutLegend}>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} data-variant="co" />
                <span className={styles.legendLabel}>Co-contribution</span>
                <span className={styles.legendValue}>{formatNumber(co)}</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} data-variant="employer" />
                <span className={styles.legendLabel}>Employer-only</span>
                <span className={styles.legendValue}>{formatNumber(employerOnly)}</span>
              </div>
            </div>
          </div>

          <div className={styles.statusList}>
            <StatusBar label="Active" value={active} total={headcount} variant="active" />
            <StatusBar label="Suspended" value={suspended} total={headcount} variant="suspended" />
            <StatusBar label="Insured" value={insured} total={headcount} variant="insured" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
