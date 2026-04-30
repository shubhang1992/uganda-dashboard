import { useState, useMemo } from 'react';
import { useCurrentSubscriber } from '../../../hooks/useSubscriber';
import { formatUGX, formatUGXExact } from '../../../utils/finance';
import { downloadCSV } from '../../../utils/csv';
import frameStyles from './ReportFrame.module.css';

function txYear(isoDate) {
  return new Date(isoDate).getFullYear();
}

export default function AnnualStatement() {
  const { data: sub } = useCurrentSubscriber();
  const transactions = useMemo(() => sub?.transactions || [], [sub?.transactions]);

  /* Build a set of years present in transactions */
  const years = useMemo(() => {
    const s = new Set();
    transactions.forEach((t) => s.add(txYear(t.date)));
    return Array.from(s).sort((a, b) => b - a);
  }, [transactions]);

  const [year, setYear] = useState(years[0] ?? new Date().getFullYear());

  const yearTx = useMemo(
    () => transactions.filter((t) => txYear(t.date) === year),
    [transactions, year]
  );

  const totals = useMemo(() => {
    let contributions = 0, premiums = 0, withdrawals = 0, claimsInflow = 0;
    yearTx.forEach((t) => {
      if (t.type === 'contribution') contributions += t.amount;
      else if (t.type === 'premium') premiums += t.amount;
      else if (t.type === 'withdrawal') withdrawals += Math.abs(t.amount);
      else if (t.type === 'claim') claimsInflow += t.amount;
    });
    return {
      contributions,
      premiums,
      withdrawals,
      claimsInflow,
      netInflow: contributions + claimsInflow - withdrawals - premiums,
    };
  }, [yearTx]);

  function handleExport() {
    const headers = ['Item', 'Amount (UGX)'];
    const rows = [
      [`Contributions ${year}`, totals.contributions],
      [`Insurance premiums ${year}`, totals.premiums],
      [`Withdrawals ${year}`, totals.withdrawals],
      [`Claim payouts ${year}`, totals.claimsInflow],
      ['Net inflow', totals.netInflow],
    ];
    downloadCSV(`annual-statement-${year}.csv`, headers, rows);
  }

  return (
    <div className={frameStyles.frame}>
      <div className={frameStyles.headerRow}>
        <div className={frameStyles.headerText}>
          <span className={frameStyles.eyebrow}>Annual tax statement</span>
          <span className={frameStyles.headerDesc}>A year-end summary for your records.</span>
        </div>
        <button type="button" className={frameStyles.exportBtn} onClick={handleExport}>
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="14" height="14">
            <path d="M10 3v10M10 13l-3-3M10 13l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 15v2h14v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Export CSV</span>
        </button>
      </div>

      {/* Year chips */}
      {years.length > 0 && (
        <div className={frameStyles.filters}>
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              style={{
                padding: '0.375rem 0.875rem',
                minHeight: 34,
                borderRadius: 999,
                border: '1.5px solid var(--color-lavender)',
                background: year === y ? 'var(--color-indigo)' : 'var(--color-white)',
                color: year === y ? 'var(--color-white)' : 'var(--color-indigo-soft)',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 'var(--text-xs)',
                letterSpacing: '-0.01em',
              }}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      <div className={frameStyles.kpiStrip}>
        <div className={frameStyles.kpi}>
          <span className={frameStyles.kpiLabel}>Contributions</span>
          <span className={frameStyles.kpiValue}>{formatUGX(totals.contributions)}</span>
        </div>
        <div className={frameStyles.kpi}>
          <span className={frameStyles.kpiLabel}>Premiums</span>
          <span className={frameStyles.kpiValue}>{formatUGX(totals.premiums)}</span>
        </div>
        <div className={frameStyles.kpi}>
          <span className={frameStyles.kpiLabel}>Withdrawals</span>
          <span className={frameStyles.kpiValue}>{formatUGX(totals.withdrawals)}</span>
        </div>
        <div className={frameStyles.kpi}>
          <span className={frameStyles.kpiLabel}>Claim payouts</span>
          <span className={frameStyles.kpiValue}>{formatUGX(totals.claimsInflow)}</span>
        </div>
      </div>

      <section className={frameStyles.statSection}>
        <div className={frameStyles.statSectionTitle}>{year} summary</div>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <li style={rowStyle}>
            <span>Total saved ({totals.contributions ? 'gross' : 'none'})</span>
            <strong>{formatUGXExact(totals.contributions)}</strong>
          </li>
          <li style={rowStyle}>
            <span>Insurance premiums paid</span>
            <strong>{formatUGXExact(totals.premiums)}</strong>
          </li>
          <li style={rowStyle}>
            <span>Withdrawals made</span>
            <strong>{formatUGXExact(totals.withdrawals)}</strong>
          </li>
          <li style={rowStyle}>
            <span>Insurance claim payouts</span>
            <strong>{formatUGXExact(totals.claimsInflow)}</strong>
          </li>
          <li style={{ ...rowStyle, borderTop: '1px solid var(--color-lavender)', paddingTop: '0.75rem', fontWeight: 800 }}>
            <span>Net inflow to your account</span>
            <strong>{formatUGXExact(Math.max(0, totals.netInflow))}</strong>
          </li>
        </ul>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-gray)', lineHeight: 1.6 }}>
          This summary is for your personal records. Universal Pensions contributions may be tax-deductible in some cases — check with a qualified tax advisor.
        </p>
      </section>
    </div>
  );
}

const rowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.625rem 0.875rem',
  background: 'var(--color-cloud)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--color-slate)',
};
