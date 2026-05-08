import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGX, fmtShort } from '../../utils/finance';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import {
  useAgentCommissionDetail,
  useConfirmCommission,
  useDisputeCommission,
  useWithdrawDispute,
  useNetworkCadence,
} from '../../hooks/useCommission';
import { useToast } from '../../contexts/ToastContext';
import ErrorCard from '../../components/feedback/ErrorCard';
import {
  CADENCES,
  cadenceLabel,
  cycleWindow,
  formatCycleLabel,
  formatPayoutDate,
  groupCommissionsByPaidCycle,
} from '../../utils/settlementCycle';
import PageHeader from '../shell/PageHeader';
import styles from './CommissionsPage.module.css';

const VALID_VIEWS = new Set(['earned', 'owed', 'confirm', 'disputes']);

const VIEW_LABELS = {
  earned: 'Earned',
  owed: 'Owed',
  confirm: 'Confirm receipts',
  disputes: 'My disputes',
};

const DISPUTE_REASONS = [
  'I never onboarded this subscriber',
  'Amount looks wrong',
  'Subscriber details incorrect',
  'Duplicate commission entry',
  'Other',
];

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
}

const Icons = {
  chev: (
    <svg viewBox="0 0 20 20" fill="none" width="16" height="16" aria-hidden="true">
      <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
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
  calendar: (
    <svg viewBox="0 0 20 20" fill="none" width="18" height="18" aria-hidden="true">
      <rect x="3" y="4.5" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3 8.5h14" stroke="currentColor" strokeWidth="1.75" />
      <path d="M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  ),
};

function StatusBadge({ commission }) {
  switch (commission.status) {
    case 'confirmed':
      return <span className={styles.badge} data-tone="confirmed">Confirmed</span>;
    case 'released':
      return <span className={styles.badge} data-tone="awaiting">Confirm</span>;
    case 'in_run':
      return <span className={styles.badge} data-tone="awaiting">In current run</span>;
    case 'held':
      return <span className={styles.badge} data-tone="awaiting">On hold</span>;
    case 'due':
      return <span className={styles.badge} data-tone="due">Due</span>;
    case 'disputed':
      return <span className={styles.badge} data-tone="disputed">Under review</span>;
    case 'rejected':
    default:
      return <span className={styles.badge} data-tone="rejected">Closed</span>;
  }
}

function CommissionRow({ commission, onConfirm, onDispute, onWithdraw, isPending }) {
  const isReleased = commission.status === 'released';
  const isPaidLike = isReleased || commission.status === 'confirmed';
  const isOutstanding =
    commission.status === 'due' || commission.status === 'in_run' || commission.status === 'held';
  const isDisputed = commission.status === 'disputed';
  const canWithdraw = isDisputed && !commission.resolvedAt;

  let dateLabel = '';
  if (isPaidLike) dateLabel = `Paid ${formatDate(commission.paidDate)}`;
  else if (commission.status === 'in_run') dateLabel = 'Bundled into current settlement run';
  else if (commission.status === 'held') dateLabel = 'Held — will roll into the next run';
  else if (commission.status === 'due') dateLabel = `Due ${formatDate(commission.dueDate)}`;
  else if (isDisputed) {
    dateLabel = commission.disputedAt
      ? `Filed ${formatDate(commission.disputedAt)}`
      : 'Filed for review';
  }

  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.rowHeader}>
          <span className={styles.rowName}>{commission.subscriberName}</span>
          <StatusBadge commission={commission} />
        </div>
        <div className={styles.rowMeta}>
          <span>{dateLabel}</span>
          <span className={styles.rowAmount}>{formatUGX(commission.amount)}</span>
        </div>
        {isDisputed && commission.disputeReason && (
          <div className={styles.disputeNote}>{commission.disputeReason}</div>
        )}
        {commission.status === 'held' && commission.holdReason && (
          <div className={styles.disputeNote}>Held: {commission.holdReason}</div>
        )}
        {commission.resolvedAt && commission.outcomeReason && (
          <div className={styles.outcomeNote}>
            Resolved {formatDate(commission.resolvedAt)} · {commission.outcomeReason}
          </div>
        )}
        {isPaidLike && commission.txnRef && (
          <div className={styles.disputeNote}>Ref: {commission.txnRef}</div>
        )}
      </div>

      {(isReleased || isPaidLike || isOutstanding || canWithdraw) && (
        <div className={styles.rowActions}>
          {isReleased && (
            <button type="button" className={styles.btnPrimary} disabled={isPending} onClick={() => onConfirm(commission)}>
              Confirm receipt
            </button>
          )}
          {canWithdraw && (
            <button type="button" className={styles.btnLink} disabled={isPending} onClick={() => onWithdraw(commission)}>
              Withdraw
            </button>
          )}
          {(isPaidLike || isOutstanding) && commission.status !== 'held' && (
            <button type="button" className={styles.btnLink} onClick={() => onDispute(commission)}>
              Dispute
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PayoutScheduleCard({ cadence, nextEnd, nextTotal, nextCount }) {
  return (
    <section className={styles.payoutCard} aria-labelledby="payout-schedule-title">
      <header className={styles.payoutHead}>
        <span className={styles.payoutEyebrow}>
          <span className={styles.payoutEyebrowIcon} aria-hidden="true">{Icons.calendar}</span>
          Payout schedule
        </span>
      </header>

      <h2 id="payout-schedule-title" className={styles.payoutCadence}>
        {cadenceLabel(cadence)}
      </h2>

      <div className={styles.payoutMeta}>
        <div className={styles.payoutMetaRow}>
          <span className={styles.payoutMetaLabel}>Next payout</span>
          <span className={styles.payoutMetaValue}>{formatPayoutDate(nextEnd)}</span>
        </div>
        <div className={styles.payoutMetaRow}>
          <span className={styles.payoutMetaLabel}>Bundled this cycle</span>
          <span className={styles.payoutMetaValue}>{formatUGX(nextTotal)}</span>
        </div>
        <div className={styles.payoutMetaRow}>
          <span className={styles.payoutMetaLabel}>
            {nextCount > 0
              ? `${nextCount} commission${nextCount === 1 ? '' : 's'} in the current run`
              : 'No commissions in the current run yet'}
          </span>
        </div>
      </div>

      <p className={styles.payoutFootnote}>
        Schedule is set by the distributor. New commissions roll into the next run automatically.
      </p>
    </section>
  );
}

function PastCyclesSection({ cycles, onConfirm, onDispute, onWithdraw, isPending }) {
  const [openKey, setOpenKey] = useState(cycles[0]?.key || null);

  if (cycles.length === 0) return null;

  return (
    <section className={styles.cyclesSection} aria-labelledby="past-cycles-title">
      <header className={styles.cyclesHead}>
        <span className={styles.cyclesEyebrow}>History</span>
        <h2 id="past-cycles-title" className={styles.cyclesTitle}>Past payout cycles</h2>
      </header>
      <ul className={styles.cyclesList}>
        {cycles.map((cycle) => {
          const open = openKey === cycle.key;
          return (
            <li key={cycle.key} className={styles.cycleItem}>
              <button
                type="button"
                className={styles.cycleHead}
                aria-expanded={open}
                aria-controls={`cycle-${cycle.key}`}
                onClick={() => setOpenKey(open ? null : cycle.key)}
              >
                <span className={styles.cycleLabelStack}>
                  <span className={styles.cycleLabel}>{cycle.label}</span>
                  <span className={styles.cycleSub}>
                    {cycle.commissions.length} commission{cycle.commissions.length === 1 ? '' : 's'}
                  </span>
                </span>
                <span className={styles.cycleAmount}>{formatUGX(cycle.total)}</span>
                <span className={styles.cycleChev} data-open={open}>{Icons.chevDown}</span>
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    key="rows"
                    id={`cycle-${cycle.key}`}
                    className={styles.cycleBody}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
                  >
                    <div className={styles.cycleRows}>
                      {cycle.commissions.map((c) => (
                        <CommissionRow
                          key={c.id}
                          commission={c}
                          onConfirm={onConfirm}
                          onDispute={onDispute}
                          onWithdraw={onWithdraw}
                          isPending={isPending}
                        />
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

function DisputeModal({ commission, onClose, onConfirm, isPending }) {
  const [reason, setReason] = useState(DISPUTE_REASONS[0]);
  const [custom, setCustom] = useState('');

  const finalReason = reason === 'Other' ? custom.trim() : reason;
  const canSubmit = finalReason.length > 0 && !isPending;

  return (
    <motion.div
      key="dispute-backdrop"
      className={styles.modalBackdrop}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispute-title"
        initial={{ y: 24, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 24, opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="dispute-title" className={styles.modalTitle}>Raise a dispute</h3>
        <p className={styles.modalSub}>
          Commission {commission.id} for <strong>{commission.subscriberName}</strong> · {formatUGX(commission.amount)}
        </p>

        <div className={styles.reasonList}>
          {DISPUTE_REASONS.map((r) => (
            <label key={r} className={styles.reasonOpt} data-active={reason === r}>
              <input
                type="radio"
                name="dispute-reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
              />
              {r}
            </label>
          ))}
          {reason === 'Other' && (
            <textarea
              className={styles.customReason}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Tell us what's wrong…"
              rows={3}
              maxLength={300}
            />
          )}
        </div>

        <div className={styles.modalActions}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={!canSubmit}
            onClick={() => onConfirm(finalReason)}
          >
            {isPending ? 'Submitting…' : 'Submit dispute'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function CommissionsPage() {
  const { view } = useParams();
  const navigate = useNavigate();
  const { agentId } = useAgentScope();
  const { data: detail, isLoading, isError, error, refetch } = useAgentCommissionDetail(agentId);
  const { data: cadenceCfg } = useNetworkCadence();
  const cadence = cadenceCfg?.cadence || CADENCES.MONTHLY_FIRST;
  const confirm = useConfirmCommission();
  const dispute = useDisputeCommission();
  const withdraw = useWithdrawDispute();
  const { addToast } = useToast();

  const [disputeTarget, setDisputeTarget] = useState(null);

  // Defensive: if a stale URL still points at /commissions/requests, redirect home.
  useEffect(() => {
    if (view && !VALID_VIEWS.has(view)) {
      navigate('/dashboard/commissions', { replace: true });
    }
  }, [view, navigate]);

  const isHome = !view;
  const activeView = VALID_VIEWS.has(view) ? view : null;

  const all = useMemo(() => detail?.commissions || [], [detail]);
  const totals = useMemo(() => {
    const paid = all.filter((c) => c.status === 'released' || c.status === 'confirmed');
    const due = all.filter((c) => c.status === 'due' || c.status === 'in_run' || c.status === 'held');
    const inRun = all.filter((c) => c.status === 'in_run');
    // Keep recently-resolved disputes in the My-Disputes view so the agent
    // sees the outcome — once status flips off `disputed`, only the
    // outcomeReason + resolvedAt fields remain.
    const disputed = all.filter(
      (c) => c.status === 'disputed' || (c.resolvedAt && c.outcomeReason)
    );
    const awaitingConfirm = all.filter((c) => c.status === 'released');
    const openDisputes = disputed.filter((c) => c.status === 'disputed');
    const totalPaid = paid.reduce((s, c) => s + c.amount, 0);
    const totalDue = due.reduce((s, c) => s + c.amount, 0);
    const totalDisputed = openDisputes.reduce((s, c) => s + c.amount, 0);
    const totalAll = totalPaid + totalDue + totalDisputed;
    const settledPct = totalAll ? Math.round((totalPaid / totalAll) * 100) : 0;
    return {
      paid, due, inRun, disputed, openDisputes, awaitingConfirm,
      totalPaid, totalDue, totalDisputed, totalAll, settledPct,
    };
  }, [all]);

  const nextCycle = useMemo(() => {
    const win = cycleWindow(cadence);
    // Lines already in the current run are guaranteed to pay out next cycle.
    let total = totals.inRun.reduce((s, c) => s + c.amount, 0);
    let count = totals.inRun.length;
    // Plus any due lines whose dueDate falls within the upcoming cycle window.
    for (const c of totals.due) {
      if (c.status !== 'due') continue;
      const d = c.dueDate ? new Date(c.dueDate) : null;
      if (d && d.getTime() <= win.end.getTime()) {
        total += c.amount || 0;
        count += 1;
      }
    }
    return { end: win.end, total, count };
  }, [totals.due, totals.inRun, cadence]);

  const pastCycles = useMemo(
    () => groupCommissionsByPaidCycle(totals.paid, cadence),
    [totals.paid, cadence]
  );

  function listFor(viewId) {
    if (viewId === 'earned') return [...totals.paid].sort((a, b) => (b.paidDate || '').localeCompare(a.paidDate || ''));
    if (viewId === 'owed') return [...totals.due].sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    if (viewId === 'confirm') return totals.awaitingConfirm;
    if (viewId === 'disputes') return totals.disputed;
    return [];
  }

  async function handleConfirm(commission) {
    try {
      await confirm.mutateAsync(commission.id);
      addToast('success', 'Receipt confirmed.');
    } catch {
      addToast('error', 'Could not confirm. Try again.');
    }
  }

  async function handleDisputeSubmit(reason) {
    if (!disputeTarget) return;
    try {
      await dispute.mutateAsync({ commissionId: disputeTarget.id, reason });
      addToast('success', 'Dispute filed for review.');
      setDisputeTarget(null);
    } catch {
      addToast('error', 'Could not file dispute. Try again.');
    }
  }

  async function handleWithdraw(commission) {
    try {
      await withdraw.mutateAsync(commission.id);
      addToast('success', 'Dispute withdrawn.');
    } catch {
      addToast('error', 'Could not withdraw. Try again.');
    }
  }

  const isAnyMutating = confirm.isPending || dispute.isPending || withdraw.isPending;
  const list = activeView ? listFor(activeView) : [];

  const title = isHome ? 'Commissions' : VIEW_LABELS[activeView];
  const subtitle = isHome
    ? 'Settled on the distributor schedule. Confirm receipts and raise disputes here.'
    : `${list.length} record${list.length === 1 ? '' : 's'}`;

  return (
    <div className={styles.page}>
      <PageHeader
        title={title}
        subtitle={subtitle}
        fallback={isHome ? '/dashboard' : '/dashboard/commissions'}
      />

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
            <PayoutScheduleCard
              cadence={cadence}
              nextEnd={nextCycle.end}
              nextTotal={nextCycle.total}
              nextCount={nextCycle.count}
            />

            <div className={styles.summaryStrip}>
              <div className={styles.summaryAmount}>
                <span className={styles.summaryLabel}>Total commissions</span>
                <span className={styles.summaryValue}>{formatUGX(totals.totalAll)}</span>
                <span className={styles.summaryHint}>
                  {all.length.toLocaleString()} record{all.length === 1 ? '' : 's'} from your subscribers
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
                <div className={styles.primaryAmount}>{fmtShort(totals.totalPaid)}</div>
                <div className={styles.primaryLabel}>Earned</div>
                <div className={styles.primaryCount}>{totals.paid.length.toLocaleString()} commissions paid</div>
              </button>
              <button className={styles.primaryCard} data-type="pending" onClick={() => navigate('/dashboard/commissions/owed')}>
                <div className={styles.primaryIcon}>{Icons.clock}</div>
                <div className={styles.primaryAmount}>{fmtShort(totals.totalDue)}</div>
                <div className={styles.primaryLabel}>Owed</div>
                <div className={styles.primaryCount}>{totals.due.length.toLocaleString()} awaiting next cycle</div>
              </button>
            </div>

            {(totals.awaitingConfirm.length > 0 || totals.openDisputes.length > 0) && (
              <div className={styles.attentionSection}>
                <div className={styles.attentionTitle}>Needs attention</div>
                {totals.awaitingConfirm.length > 0 && (
                  <button className={styles.attentionRow} onClick={() => navigate('/dashboard/commissions/confirm')}>
                    <div className={styles.attentionAccent} data-type="confirm" />
                    <div className={styles.attentionInfo}>
                      <div className={styles.attentionLabel}>Confirm receipts</div>
                      <div className={styles.attentionDesc}>
                        {formatUGX(totals.awaitingConfirm.reduce((s, c) => s + c.amount, 0))} paid · waiting on you
                      </div>
                    </div>
                    <div className={styles.attentionCount} data-type="confirm">{totals.awaitingConfirm.length}</div>
                    <span className={styles.chev} aria-hidden="true">{Icons.chev}</span>
                  </button>
                )}
                {totals.openDisputes.length > 0 && (
                  <button className={styles.attentionRow} onClick={() => navigate('/dashboard/commissions/disputes')}>
                    <div className={styles.attentionAccent} data-type="disputed" />
                    <div className={styles.attentionInfo}>
                      <div className={styles.attentionLabel}>My disputes</div>
                      <div className={styles.attentionDesc}>
                        {formatUGX(totals.totalDisputed)} under review
                      </div>
                    </div>
                    <div className={styles.attentionCount} data-type="disputed">{totals.openDisputes.length}</div>
                    <span className={styles.chev} aria-hidden="true">{Icons.chev}</span>
                  </button>
                )}
              </div>
            )}

            <PastCyclesSection
              cycles={pastCycles}
              onConfirm={handleConfirm}
              onDispute={(c) => setDisputeTarget(c)}
              onWithdraw={handleWithdraw}
              isPending={isAnyMutating}
            />

            {pastCycles.length > 0 && (
              <p className={styles.cyclesFootnote}>
                Cycle history grouped by {formatCycleLabel(nextCycle.end, cadence).toLowerCase().includes('week') ? 'pay-out week' : 'pay-out month'}.
              </p>
            )}
          </div>
        )}

        {!isLoading && !isError && !isHome && activeView && (
          list.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>{(() => {
                switch (activeView) {
                  case 'earned': return 'No paid commissions yet';
                  case 'owed': return 'Nothing owed right now';
                  case 'confirm': return "You're all caught up";
                  case 'disputes': return 'No open disputes';
                  default: return 'Nothing here';
                }
              })()}</p>
              <p>{(() => {
                switch (activeView) {
                  case 'earned': return 'Settlements appear here once the distributor releases a run.';
                  case 'owed': return 'New commissions roll into the next settlement run automatically.';
                  case 'confirm': return 'Nothing to confirm right now. Great work.';
                  case 'disputes': return "Anything you flag will appear here while it's reviewed.";
                  default: return '';
                }
              })()}</p>
            </div>
          ) : (
            <div className={styles.list}>
              {list.map((commission) => (
                <CommissionRow
                  key={commission.id}
                  commission={commission}
                  onConfirm={handleConfirm}
                  onDispute={(c) => setDisputeTarget(c)}
                  onWithdraw={handleWithdraw}
                  isPending={isAnyMutating}
                />
              ))}
            </div>
          )
        )}
      </div>

      <AnimatePresence>
        {disputeTarget && (
          <DisputeModal
            commission={disputeTarget}
            onClose={() => setDisputeTarget(null)}
            onConfirm={handleDisputeSubmit}
            isPending={dispute.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
