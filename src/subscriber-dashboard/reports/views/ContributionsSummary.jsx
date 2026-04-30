import { useMemo } from 'react';
import { useCurrentSubscriber } from '../../../hooks/useSubscriber';
import { formatUGX, formatUGXExact } from '../../../utils/finance';
import { downloadCSV } from '../../../utils/csv';
import frameStyles from './ReportFrame.module.css';

function monthLabel(i, len) {
  const d = new Date();
  const target = new Date(d.getFullYear(), d.getMonth() - (len - 1 - i), 1);
  return target.toLocaleDateString('en-UG', { month: 'short', year: 'numeric' });
}

export default function ContributionsSummary() {
  const { data: sub } = useCurrentSubscriber();
  const history = useMemo(() => sub?.contributionHistory || [], [sub?.contributionHistory]);
  const schedule = sub?.contributionSchedule;
  const retPct = (schedule?.retirementPct ?? 80) / 100;

  const monthly = useMemo(
    () => history.map((v, i) => {
      const ret = Math.round(v * retPct);
      const emg = v - ret;
      return {
        id: `m-${i}`,
        monthLabel: monthLabel(i, history.length),
        total: v,
        retirement: ret,
        emergency: emg,
      };
    }).reverse(),
    [history, retPct]
  );

  const totals = useMemo(() => {
    return monthly.reduce((acc, m) => {
      acc.total += m.total;
      acc.retirement += m.retirement;
      acc.emergency += m.emergency;
      return acc;
    }, { total: 0, retirement: 0, emergency: 0 });
  }, [monthly]);

  function handleExport() {
    const headers = ['Month', 'Retirement (UGX)', 'Emergency (UGX)', 'Total (UGX)'];
    const rows = monthly.map((m) => [m.monthLabel, m.retirement, m.emergency, m.total]);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCSV(`contributions-summary-${stamp}.csv`, headers, rows);
  }

  return (
    <div className={frameStyles.frame}>
      <div className={frameStyles.headerRow}>
        <div className={frameStyles.headerText}>
          <span className={frameStyles.eyebrow}>Month-by-month view</span>
          <span className={frameStyles.headerDesc}>Your contributions split by retirement and emergency bucket.</span>
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
          <span className={frameStyles.kpiLabel}>Total contributed</span>
          <span className={frameStyles.kpiValue}>{formatUGX(totals.total)}</span>
        </div>
        <div className={frameStyles.kpi}>
          <span className={frameStyles.kpiLabel}>Retirement bucket</span>
          <span className={frameStyles.kpiValue}>{formatUGX(totals.retirement)}</span>
        </div>
        <div className={frameStyles.kpi}>
          <span className={frameStyles.kpiLabel}>Emergency bucket</span>
          <span className={frameStyles.kpiValue}>{formatUGX(totals.emergency)}</span>
        </div>
      </div>

      <section className={frameStyles.statSection}>
        <div className={frameStyles.statSectionTitle}>Monthly breakdown</div>
        <div className={frameStyles.monthGrid}>
          {monthly.map((m) => (
            <div key={m.id} className={frameStyles.monthCard}>
              <span className={frameStyles.monthLabel}>{m.monthLabel}</span>
              <span className={frameStyles.monthValue}>{formatUGXExact(m.total)}</span>
              <span className={frameStyles.monthMeta}>
                <span>R {formatUGX(m.retirement)}</span>
                <span>E {formatUGX(m.emergency)}</span>
              </span>
            </div>
          ))}
          {monthly.length === 0 && (
            <div className={frameStyles.emptyState}>No contributions yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}
