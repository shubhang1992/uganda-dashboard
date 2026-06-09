import { useState, useMemo } from 'react';
import { useCurrentSubscriber } from '../../../hooks/useSubscriber';
import { formatUGX } from '../../../utils/currency';

import { downloadCSV } from '../../../utils/csv';
import ErrorCard from '../../../components/feedback/ErrorCard';
import ExportButton from '../../../components/reports/ExportButton';
import SkeletonRow from '../../../components/SkeletonRow';
import EmptyState from '../../../components/EmptyState';
import { PillChip, PillChipGroup } from '../../../components/PillChip';
import frameStyles from './ReportFrame.module.css';

function txYear(isoDate) {
  return new Date(isoDate).getFullYear();
}

export default function AnnualStatement() {
  const { data: sub, isLoading, isError, error, refetch } = useCurrentSubscriber();
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

  if (isError) {
    return (
      <ErrorCard
        title="We couldn't load your annual statement"
        message={error}
        onRetry={refetch}
      />
    );
  }

  // Cold-load skeleton — without this the report briefly renders a "0 of 0"
  // year summary on a slow connection.
  if (isLoading && !sub) {
    return (
      <div className={frameStyles.frame}>
        <div className={frameStyles.headerRow}>
          <div className={frameStyles.headerText}>
            <span className={frameStyles.eyebrow}>Annual tax statement</span>
            <span className={frameStyles.headerDesc}>Loading…</span>
          </div>
        </div>
        <SkeletonRow count={5} label="Loading annual statement" />
      </div>
    );
  }

  return (
    <div className={frameStyles.frame}>
      <div className={frameStyles.headerRow}>
        <div className={frameStyles.headerText}>
          <span className={frameStyles.eyebrow}>Annual tax statement</span>
          <span className={frameStyles.headerDesc}>A year-end summary for your records.</span>
        </div>
        <ExportButton onExport={handleExport} />
      </div>

      {transactions.length === 0 ? (
        // Match the other report views: when there are no transactions at all
        // we show a single empty-state instead of a "0 of 0" year summary.
        <EmptyState
          kind="no-data"
          title="No statement yet."
          body="Once your first transaction settles, a year-end summary will appear here for your records."
        />
      ) : (
        <>
          {/* Year chips */}
          {years.length > 0 && (
            <PillChipGroup label="Statement year" layout="row">
              {years.map((y) => (
                <PillChip
                  key={y}
                  selected={year === y}
                  onClick={() => setYear(y)}
                >
                  {y}
                </PillChip>
              ))}
            </PillChipGroup>
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
            <ul className={frameStyles.summaryList}>
              <li className={frameStyles.summaryRow}>
                <span>Total saved ({totals.contributions ? 'gross' : 'none'})</span>
                <strong>{formatUGX(totals.contributions, { compact: false })}</strong>
              </li>
              <li className={frameStyles.summaryRow}>
                <span>Insurance premiums paid</span>
                <strong>{formatUGX(totals.premiums, { compact: false })}</strong>
              </li>
              <li className={frameStyles.summaryRow}>
                <span>Withdrawals made</span>
                <strong>{formatUGX(totals.withdrawals, { compact: false })}</strong>
              </li>
              <li className={frameStyles.summaryRow}>
                <span>Insurance claim payouts</span>
                <strong>{formatUGX(totals.claimsInflow, { compact: false })}</strong>
              </li>
              <li className={`${frameStyles.summaryRow} ${frameStyles.summaryTotal}`}>
                <span>Net inflow to your account</span>
                <strong>{formatUGX(Math.max(0, totals.netInflow), { compact: false })}</strong>
              </li>
            </ul>
            <p className={frameStyles.summaryNote}>
              This summary is for your personal records. Universal Pensions contributions may be tax-deductible in some cases — check with a qualified tax advisor.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
