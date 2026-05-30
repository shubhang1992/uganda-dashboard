import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { formatUGX, formatNumber } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { getInitials } from '../../utils/dashboard';
import { Icons } from './icons.jsx';
import styles from './CommissionPanel.module.css';

const viewAnim = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
  transition: { duration: 0.25, ease: EASE_OUT_EXPO },
};

const RUN_STATE_LABEL = {
  branch_review: 'Branch review',
  released: 'Released',
  cancelled: 'Cancelled',
  draft: 'Draft',
};

/**
 * Run-detail, run-branch-detail, and branch-review subtrees of
 * `CommissionPanel`. The parent picks which sub-view by passing `view`;
 * each sub-view receives the data + callbacks it needs.
 *
 * Stateless — all mutations (release run, release branch, mark
 * reviewed, approve/hold/dispute line, branch sign-off) bubble up to
 * the parent through callbacks so React Query cache invalidation +
 * toast wiring stays in one place.
 */
export default function SettlementRunStepper({
  view,
  currentRun,
  branchReview,
  runBranches,
  runBranchAgents,
  selectedRunBranchId,
  branchPendingLines,
  branchHeldLines,
  branchSliceTotal,
  onOpenBulkRelease,
  onOpenBranchRelease,
  onGoRunBranchDetail,
  onApproveHeldLine,
  onOpenLineAction,
  onBranchSignOff,
  branchApproveAllPending,
  markReviewedPending,
}) {
  if (view === 'run-detail' && currentRun) {
    return (
      <motion.div key="run-detail" {...viewAnim}>
        <div className={styles.runHeader}>
          <div className={styles.runHeaderRow}>
            <div className={styles.runHeaderStat}>
              <span className={styles.runMetricLabel}>Total</span>
              <span className={styles.runHeaderValue}>{formatUGX(currentRun.totalAmount)}</span>
            </div>
            <div className={styles.runHeaderStat}>
              <span className={styles.runMetricLabel}>Commissions</span>
              <span className={styles.runHeaderValue}>{formatNumber(currentRun.commissionCount)}</span>
            </div>
            <div className={styles.runHeaderStat}>
              <span className={styles.runMetricLabel}>Approved</span>
              <span className={styles.runHeaderValue}>{currentRun.branchApprovedCount} / {currentRun.branchCount}</span>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Branches in this run</span>
          </div>
          {runBranches.map((row) => (
            <button
              key={row.branchId}
              className={styles.runBranchRow}
              onClick={() => onGoRunBranchDetail(row.branchId)}
            >
              <div className={styles.runBranchMain}>
                <div className={styles.runBranchName}>{row.branchName}</div>
                <div className={styles.runBranchSub}>
                  {row.branchId} · {row.count} commission{row.count === 1 ? '' : 's'}
                  {row.reviewedAt ? ` · approved ${formatDate(row.reviewedAt)}` : ''}
                  {row.releasedAt ? ` · released ${formatDate(row.releasedAt)}` : ''}
                </div>
              </div>
              <div className={styles.runBranchAmount}>{formatUGX(row.amount)}</div>
              <span className={styles.runStateBadge} data-state={row.state}>
                {row.state}
              </span>
              <span className={styles.runBranchChev} aria-hidden="true">{Icons.chev}</span>
            </button>
          ))}
        </div>

        <button
          className={styles.settleAllBtn}
          onClick={onOpenBulkRelease}
          disabled={!currentRun.canReleaseAny}
        >
          {Icons.wallet}
          {currentRun.canReleaseAny
            ? `Release ${currentRun.branchApprovedCount} approved · ${formatUGX(currentRun.approvedAmount || 0)}`
            : 'No branches ready to release'}
        </button>
      </motion.div>
    );
  }

  if (view === 'run-branch-detail' && currentRun && selectedRunBranchId) {
    const branchRow = runBranches.find((b) => b.branchId === selectedRunBranchId);
    if (!branchRow) return null;
    const canReleaseThis = branchRow.state === 'approved';
    return (
      <motion.div key="run-branch-detail" {...viewAnim}>
        <div className={styles.runHeader}>
          <div className={styles.runHeaderRow}>
            <div className={styles.runHeaderStat}>
              <span className={styles.runMetricLabel}>Branch total</span>
              <span className={styles.runHeaderValue}>{formatUGX(branchRow.amount)}</span>
            </div>
            <div className={styles.runHeaderStat}>
              <span className={styles.runMetricLabel}>Commissions</span>
              <span className={styles.runHeaderValue}>{formatNumber(branchRow.count)}</span>
            </div>
            <div className={styles.runHeaderStat}>
              <span className={styles.runMetricLabel}>State</span>
              <span className={styles.runHeaderValue}>{RUN_STATE_LABEL[branchRow.state] || branchRow.state}</span>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Agents in this branch</span>
          </div>
          {runBranchAgents.length === 0 ? (
            <div className={styles.empty}>No commissions in this branch for this run</div>
          ) : (
            runBranchAgents.map((agent) => (
              <div key={agent.agentId} className={styles.agentBlock}>
                <div className={styles.agentBlockHead}>
                  <div className={styles.agentAvatar}>{getInitials(agent.agentName)}</div>
                  <div className={styles.agentInfo}>
                    <div className={styles.agentName}>{agent.agentName}</div>
                    <div className={styles.agentBranch}>
                      {agent.employeeId || agent.agentId} · {agent.count} commission{agent.count === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className={styles.agentBlockAmount}>{formatUGX(agent.amount)}</div>
                </div>
                <div className={styles.agentLineList}>
                  {agent.commissions.map((c) => (
                    <div key={c.id} className={styles.agentLineRow}>
                      <span className={styles.agentLineName}>{c.subscriberName}</span>
                      <span className={styles.agentLineAmount}>{formatUGX(c.amount)}</span>
                      <span className={styles.runStateBadge} data-state={c.status === 'in_run' ? 'branch_review' : c.status === 'released' || c.status === 'confirmed' ? 'released' : 'cancelled'}>
                        {c.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <button
          className={styles.settleAllBtn}
          onClick={() => onOpenBranchRelease(branchRow.branchId)}
          disabled={!canReleaseThis}
        >
          {Icons.wallet}
          {branchRow.state === 'released'
            ? 'Already released'
            : canReleaseThis
              ? `Release this branch (${formatUGX(branchRow.amount)})`
              : 'Waiting for branch sign-off'}
        </button>
      </motion.div>
    );
  }

  if (view === 'branch-review' && branchReview) {
    return (
      <motion.div key="branch-review" {...viewAnim}>
        <div className={styles.runHeader}>
          <div className={styles.runHeaderRow}>
            <div className={styles.runHeaderStat}>
              <span className={styles.runMetricLabel}>Pending review</span>
              <span className={styles.runHeaderValue}>{branchPendingLines.length}</span>
            </div>
            <div className={styles.runHeaderStat}>
              <span className={styles.runMetricLabel}>On hold</span>
              <span className={styles.runHeaderValue}>{branchHeldLines.length}</span>
            </div>
            <div className={styles.runHeaderStat}>
              <span className={styles.runMetricLabel}>Branch total</span>
              <span className={styles.runHeaderValue}>{formatUGX(branchSliceTotal)}</span>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Lines in this run</span>
          </div>
          {branchReview.lines.map((line) => (
            <div key={line.id} className={styles.txRow}>
              <div className={styles.txName}>
                <div>{line.subscriberName}</div>
                <div style={{ fontSize: '10px', color: 'var(--color-gray)', marginTop: '2px' }}>
                  {line.id} · agent {line.agentId}
                </div>
                {line.status === 'held' && line.holdReason && (
                  <div style={{ fontSize: '10px', color: 'var(--color-status-warning)', marginTop: '2px' }}>
                    Held: {line.holdReason}
                  </div>
                )}
              </div>
              <div className={styles.txAmount} data-status={line.status === 'in_run' ? 'due' : 'paid'}>
                {formatUGX(line.amount)}
              </div>
              <div className={styles.txActions}>
                {line.status === 'in_run' && (
                  <>
                    <button
                      className={styles.holdBtn}
                      onClick={() => onOpenLineAction('hold', line)}
                      aria-label={`Hold ${line.subscriberName}`}
                      title="Hold for next run"
                    >
                      Hold
                    </button>
                    <button
                      className={styles.rejectBtn}
                      onClick={() => onOpenLineAction('dispute', line)}
                      aria-label={`Flag dispute on ${line.subscriberName}`}
                      title="Flag a dispute"
                    >
                      {Icons.reject}
                    </button>
                  </>
                )}
                {line.status === 'held' && (
                  <button
                    className={styles.approveBtn}
                    onClick={() => onApproveHeldLine(line.id)}
                    aria-label={`Restore ${line.subscriberName}`}
                    title="Restore into run"
                  >
                    {Icons.approve}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {branchReview.reviewState !== 'approved' && (
          <button
            className={styles.settleAllBtn}
            onClick={onBranchSignOff}
            disabled={branchApproveAllPending || markReviewedPending}
          >
            {Icons.approve}
            Submit branch sign-off
          </button>
        )}
      </motion.div>
    );
  }

  return null;
}
