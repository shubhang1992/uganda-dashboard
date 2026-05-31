import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { formatUGX, formatUGXShort, formatNumber } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useAgentCommissionDetail, useSettlementsList } from '../../hooks/useCommission';
import { groupByPaidMonth } from '../../utils/commissionMonths';
import { SUPPORT_EMAIL } from '../../config/env';
import ErrorCard from '../../components/feedback/ErrorCard';
import PageHeader from '../../components/PageHeader';
import { useAgentHeaderChrome } from '../shell/AgentHeaderChrome';
import styles from './CommissionsPage.module.css';

const VALID_VIEWS = new Set(['earned', 'owed']);

const VIEW_LABELS = {
  earned: 'Earned',
  owed: 'Owed',
};

const Icons = {
  chevDown: (
    <svg viewBox="0 0 20 20" fill="none" width="16" height="16" aria-hidden="true">
      <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 20 20" fill="none" width="20" height="20" aria-hidden="true">
      <path d="M5 10l3 3 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 20 20" fill="none" width="20" height="20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  wallet: (
    <svg viewBox="0 0 20 20" fill="none" width="18" height="18" aria-hidden="true">
      <rect x="2.5" y="5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M2.5 8.5h15" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="13.5" cy="12" r="1.1" fill="currentColor" />
    </svg>
  ),
};

function StatusBadge({ status }) {
  if (status === 'paid') {
    return <span className={styles.badge} data-tone="confirmed">Paid</span>;
  }
  return <span className={styles.badge} data-tone="due">Due</span>;
}

/**
 * CommissionRow — one paid or due line. Paid lines (from `paidTransactions`)
 * read "Paid {date} · Ref {txnRef}"; due lines (from `dueTransactions`) read
 * "Due {date}". No confirm / dispute / withdraw actions survive the flat
 * `due → paid` flow.
 */
function CommissionRow({ line }) {
  const isPaid = line.status === 'paid';
  const dateLabel = isPaid
    ? `Paid ${formatDate(line.transactionDate)}`
    : `Due ${formatDate(line.dueDate)}`;

  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.rowHeader}>
          <span className={styles.rowName}>{line.subscriberName}</span>
          <StatusBadge status={line.status} />
        </div>
        <div className={styles.rowMeta}>
          <span>{dateLabel}</span>
          <span className={styles.rowAmount}>{formatUGX(line.amount)}</span>
        </div>
        {isPaid && line.txnRef && (
          <div className={styles.refNote}>Ref: {line.txnRef}</div>
        )}
      </div>
    </div>
  );
}

/**
 * EarnedMonths — paid transactions grouped by the calendar month they were paid
 * in (newest month first), each a collapsible section. Replaces the old
 * cadence-driven "past cycles" grouping.
 */
function EarnedMonths({ months }) {
  const [openKey, setOpenKey] = useState(months[0]?.key || null);

  if (months.length === 0) return null;

  return (
    <section className={styles.cyclesSection} aria-labelledby="earned-months-title">
      <header className={styles.cyclesHead}>
        <span className={styles.cyclesEyebrow}>History</span>
        <h2 id="earned-months-title" className={styles.cyclesTitle}>Paid by month</h2>
      </header>
      <ul className={styles.cyclesList}>
        {months.map((group) => {
          const open = openKey === group.key;
          return (
            <li key={group.key} className={styles.cycleItem}>
              <button
                type="button"
                className={styles.cycleHead}
                aria-expanded={open}
                aria-controls={`month-${group.key}`}
                onClick={() => setOpenKey(open ? null : group.key)}
              >
                <span className={styles.cycleLabelStack}>
                  <span className={styles.cycleLabel}>{group.label}</span>
                  <span className={styles.cycleSub}>
                    {group.lines.length} commission{group.lines.length === 1 ? '' : 's'}
                  </span>
                </span>
                <span className={styles.cycleAmount}>{formatUGX(group.total)}</span>
                <span className={styles.cycleChev} data-open={open}>{Icons.chevDown}</span>
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    key="rows"
                    id={`month-${group.key}`}
                    className={styles.cycleBody}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
                  >
                    <div className={styles.cycleRows}>
                      {group.lines.map((line) => (
                        <CommissionRow key={line.id} line={line} />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * SettlementMismatchBanner — INFORM-NOT-BLOCK surfacing of a short-paid
 * settlement (BL-1). When the distributor's most recent settlement for this
 * agent paid less than the pending total it was raised against, the FIFO
 * apply leaves some lines genuinely `due`; this banner tells the agent what
 * happened and offers an "Ask for reason" mailto prefilled with the batch
 * reference, the due total, and the paid total. A client-side mailto is a demo
 * affordance (no backend integration); the recipient is the distributor/back-
 * office support mailbox (`SUPPORT_EMAIL`).
 */
function SettlementMismatchBanner({ batch }) {
  if (!batch) return null;
  const shortfall = Math.max(0, (batch.pendingTotal || 0) - (batch.paidAmount || 0));
  const subject = `Commission settlement query — ${batch.id}`;
  const bodyLines = [
    `Hello,`,
    ``,
    `I have a question about a recent commission settlement.`,
    ``,
    `Settlement reference: ${batch.id}`,
    `Due at the time: ${formatUGX(batch.pendingTotal)}`,
    `Amount paid: ${formatUGX(batch.paidAmount)}`,
    `Still outstanding: ${formatUGX(shortfall)}`,
    ``,
    `Could you let me know the reason for the difference?`,
    ``,
    `Thank you.`,
  ];
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;

  return (
    <section className={styles.mismatchBanner} role="status" aria-live="polite">
      <div className={styles.mismatchText}>
        <span className={styles.mismatchTitle}>Your last settlement was partial</span>
        <span className={styles.mismatchBody}>
          {formatUGX(batch.paidAmount)} paid against {formatUGX(batch.pendingTotal)} due
          {' '}— {formatUGX(shortfall)} is still outstanding (ref {batch.id}).
        </span>
      </div>
      <a className={styles.mismatchCta} href={mailto}>Ask for reason</a>
    </section>
  );
}

export default function CommissionsPage() {
  const { view } = useParams();
  const navigate = useNavigate();
  const { agentId } = useAgentScope();
  const { data: detail, isLoading, isError, error, refetch } = useAgentCommissionDetail(agentId);
  const { data: settlements = [] } = useSettlementsList({ agentId });
  const headerChrome = useAgentHeaderChrome();

  // INFORM-NOT-BLOCK mismatch surfacing (BL-1): find the LOGGED-IN agent's most
  // recent settlement batch that paid less than the pending total it was raised
  // against — i.e. a partial payment that left some lines `due`. In LIVE mode
  // RLS scopes `settlement_batches` to the agent's own rows; in MOCK mode there
  // is no RLS, so we pass `agentId` to the query AND defensively re-filter by
  // `b.agentId` here so this page can never surface ANOTHER agent's partial
  // batch. Newest-first from the service.
  const partialBatch = useMemo(
    () => settlements.find(
      (b) => b.agentId === agentId && (b.paidAmount || 0) < (b.pendingTotal || 0),
    ) || null,
    [settlements, agentId],
  );

  // A removed view (confirm / disputes) or any unknown param falls back to the
  // commissions home.
  useEffect(() => {
    if (view && !VALID_VIEWS.has(view)) {
      navigate('/dashboard/commissions', { replace: true });
    }
  }, [view, navigate]);

  const isHome = !view;
  const activeView = VALID_VIEWS.has(view) ? view : null;

  const paidTransactions = useMemo(() => detail?.paidTransactions || [], [detail]);
  const dueTransactions = useMemo(() => detail?.dueTransactions || [], [detail]);

  const totals = useMemo(() => {
    const totalPaid = detail?.totalPaid ?? paidTransactions.reduce((s, c) => s + (c.amount || 0), 0);
    const totalDue = detail?.totalDue ?? dueTransactions.reduce((s, c) => s + (c.amount || 0), 0);
    const totalAll = totalPaid + totalDue;
    const settledPct = totalAll ? Math.round((totalPaid / totalAll) * 100) : 0;
    return {
      paid: paidTransactions,
      due: dueTransactions,
      totalPaid,
      totalDue,
      totalAll,
      settledPct,
    };
  }, [detail, paidTransactions, dueTransactions]);

  const earnedMonths = useMemo(() => groupByPaidMonth(paidTransactions), [paidTransactions]);

  const recordCount = totals.paid.length + totals.due.length;

  function listFor(viewId) {
    if (viewId === 'earned') {
      return [...totals.paid].sort((a, b) =>
        (b.transactionDate || '').localeCompare(a.transactionDate || ''),
      );
    }
    if (viewId === 'owed') {
      return [...totals.due].sort((a, b) =>
        (a.dueDate || '').localeCompare(b.dueDate || ''),
      );
    }
    return [];
  }

  const list = activeView ? listFor(activeView) : [];

  const title = isHome ? 'Commissions' : VIEW_LABELS[activeView];
  const heroStatRow = (
    <>
      <span>
        <strong>{totals.settledPct}%</strong> settled
      </span>
      <span>
        <strong>{formatNumber(recordCount)}</strong> record{recordCount === 1 ? '' : 's'}
      </span>
    </>
  );

  return (
    <div className={styles.page}>
      {isHome ? (
        <PageHeader
          variant="hero"
          title="Commissions"
          eyebrow="TOTAL COMMISSIONS"
          prefix="UGX"
          amount={isLoading ? '—' : formatUGX(totals.totalAll).replace('UGX ', '')}
          subtitle="Paid out by your distributor. You'll get a notification each time a settlement lands."
          statRow={isLoading ? <span style={{ opacity: 0.6 }}>Loading…</span> : heroStatRow}
          showBack={false}
          leadingSlot={headerChrome.leadingSlot}
          trailingSlot={headerChrome.trailingSlot}
        />
      ) : (
        <PageHeader
          title={title}
          subtitle={`${list.length} record${list.length === 1 ? '' : 's'}`}
          fallback="/dashboard/commissions"
        />
      )}

      <div className={styles.body}>
        {isLoading && (
          <div className={styles.empty}>
            <div className={styles.spinner} />
            <p>Loading your commissions…</p>
          </div>
        )}

        {isError && !isLoading && (
          <div className={styles.empty}>
            <ErrorCard
              title="We couldn't load your commissions"
              message={error}
              onRetry={refetch}
            />
          </div>
        )}

        {!isLoading && !isError && isHome && (
          <div className={styles.homeWrap}>
            <SettlementMismatchBanner batch={partialBatch} />

            <section className={styles.outstandingCard} aria-labelledby="outstanding-title">
              <span className={styles.outstandingEyebrow}>
                <span className={styles.outstandingIcon} aria-hidden="true">{Icons.wallet}</span>
                Outstanding
              </span>
              <h2 id="outstanding-title" className={styles.outstandingValue}>
                {formatUGX(totals.totalDue)}
              </h2>
              <p className={styles.outstandingNote}>
                {totals.due.length > 0
                  ? `${formatNumber(totals.due.length)} commission${totals.due.length === 1 ? '' : 's'} owed — settled when your distributor next pays out.`
                  : 'Nothing owed right now. New commissions appear here until they’re paid.'}
              </p>
            </section>

            <div className={styles.summaryStrip}>
              <div className={styles.summaryAmount}>
                <span className={styles.summaryLabel}>Total commissions</span>
                <span className={styles.summaryValue}>{formatUGX(totals.totalAll)}</span>
                <span className={styles.summaryHint}>
                  {formatNumber(recordCount)} record{recordCount === 1 ? '' : 's'} from your subscribers
                </span>
              </div>
              <div className={styles.summaryProgress}>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${totals.settledPct}%` }} />
                </div>
                <div className={styles.progressLabels}>
                  <span className={styles.progressLabelPaid}>{totals.settledPct}% settled</span>
                  <span className={styles.progressLabelDue}>{100 - totals.settledPct}% pending</span>
                </div>
              </div>
            </div>

            <div className={styles.primaryGrid}>
              <button className={styles.primaryCard} data-type="settled" onClick={() => navigate('/dashboard/commissions/earned')}>
                <div className={styles.primaryIcon}>{Icons.check}</div>
                <div className={styles.primaryAmount}>{formatUGXShort(totals.totalPaid)}</div>
                <div className={styles.primaryLabel}>Earned</div>
                <div className={styles.primaryCount}>{formatNumber(totals.paid.length)} commissions paid</div>
              </button>
              <button className={styles.primaryCard} data-type="pending" onClick={() => navigate('/dashboard/commissions/owed')}>
                <div className={styles.primaryIcon}>{Icons.clock}</div>
                <div className={styles.primaryAmount}>{formatUGXShort(totals.totalDue)}</div>
                <div className={styles.primaryLabel}>Owed</div>
                <div className={styles.primaryCount}>{formatNumber(totals.due.length)} awaiting payout</div>
              </button>
            </div>

            <EarnedMonths months={earnedMonths} />
          </div>
        )}

        {!isLoading && !isError && !isHome && activeView && (
          list.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>
                {activeView === 'earned' ? 'No paid commissions yet' : 'Nothing owed right now'}
              </p>
              <p>
                {activeView === 'earned'
                  ? 'Paid commissions appear here once your distributor settles them.'
                  : 'New commissions show up here until your distributor pays them out.'}
              </p>
            </div>
          ) : (
            <div className={styles.list}>
              {list.map((line) => (
                <CommissionRow key={line.id} line={line} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
