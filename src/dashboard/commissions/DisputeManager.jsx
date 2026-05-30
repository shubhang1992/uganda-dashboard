import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { formatUGX, formatUGXShort } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { getInitials } from '../../utils/dashboard';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import { Icons } from './icons.jsx';
import styles from './CommissionPanel.module.css';

const viewAnim = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
  transition: { duration: 0.25, ease: EASE_OUT_EXPO },
};

/**
 * Disputes-tab subtree (`disputed` list view) and dispute-detail subtree
 * of `CommissionPanel`. The parent picks which sub-view by passing
 * `view`; both share the search / selection toolbar and route every
 * approve/reject action through callbacks so the parent can keep
 * toast wiring + React Query cache invalidation centralised.
 */
export default function DisputeManager({
  view,
  filteredDisputed,
  selectedDisputeAgent,
  disputedCold,
  search,
  debouncedSearch,
  selectedIds,
  onSearchChange,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onGoDisputeDetail,
  onOpenResolution,
}) {
  if (view === 'disputed') {
    return (
      <motion.div key="disputed" {...viewAnim}>
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>{Icons.search}</span>
            <input
              className={styles.searchInput}
              placeholder="Search agents…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search disputed agents"
              spellCheck={false}
            />
            {search && (
              <button className={styles.searchClear} onClick={() => onSearchChange('')} aria-label="Clear search">
                {Icons.close}
              </button>
            )}
          </div>
        </div>

        {filteredDisputed.length > 0 && (
          <div className={styles.selectBar}>
            <button
              className={styles.selectAllBtn}
              role="checkbox"
              aria-checked={
                selectedIds.size === 0
                  ? 'false'
                  : selectedIds.size === filteredDisputed.length
                    ? 'true'
                    : 'mixed'
              }
              aria-label={
                selectedIds.size === filteredDisputed.length
                  ? `Deselect all ${filteredDisputed.length} disputed agents`
                  : `Select all ${filteredDisputed.length} disputed agents`
              }
              onClick={() => {
                if (selectedIds.size === filteredDisputed.length) onClearSelection();
                else onSelectAll(filteredDisputed.map((a) => a.agentId));
              }}
            >
              <span className={styles.checkbox} data-checked={selectedIds.size === filteredDisputed.length && filteredDisputed.length > 0} aria-hidden="true">
                {selectedIds.size === filteredDisputed.length && filteredDisputed.length > 0 && Icons.approve}
              </span>
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
            </button>
            {selectedIds.size > 0 && (
              <button className={styles.selectClearBtn} onClick={onClearSelection}>Clear</button>
            )}
          </div>
        )}

        {disputedCold ? (
          <SkeletonRow count={5} label="Loading disputes" />
        ) : filteredDisputed.length === 0 ? (
          debouncedSearch.trim() === '' ? (
            <EmptyState
              kind="no-data"
              title="No disputed settlements"
              body="Disputes raised by agents will appear here for review."
            />
          ) : (
            <EmptyState
              kind="no-match"
              title="No agents match"
              body="Try adjusting your search."
            />
          )
        ) : (
          filteredDisputed.map((agent) => (
            <div key={agent.agentId} className={styles.selectableRow} data-selected={selectedIds.has(agent.agentId)}>
              <button
                className={styles.checkbox}
                data-checked={selectedIds.has(agent.agentId)}
                onClick={() => onToggleSelect(agent.agentId)}
                aria-label={`Select ${agent.agentName}`}
              >
                {selectedIds.has(agent.agentId) && Icons.approve}
              </button>
              <button
                className={styles.selectableContent}
                onClick={() => onGoDisputeDetail(agent)}
              >
                <div className={styles.agentAvatar}>{getInitials(agent.agentName)}</div>
                <div className={styles.agentInfo}>
                  <div className={styles.agentName}>{agent.agentName}</div>
                  <div className={styles.agentBranch}>{agent.branchName}{agent.employeeId ? ` · ${agent.employeeId}` : ''}</div>
                </div>
                <div>
                  <div className={styles.agentAmount} style={{ color: 'var(--color-status-poor)' }}>
                    {agent.disputedCount} disputed
                  </div>
                  <div className={styles.agentAmountLabel}>
                    {formatUGX(agent.disputedAmount)}
                  </div>
                </div>
              </button>
            </div>
          ))
        )}

        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div
              className={styles.floatingBar}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
            >
              <div className={styles.floatingInfo}>
                <span className={styles.floatingCount}>{selectedIds.size}</span> agents
              </div>
              <div className={styles.floatingActions}>
                <button
                  className={styles.floatingApprove}
                  onClick={() => {
                    const disputes = filteredDisputed
                      .filter((a) => selectedIds.has(a.agentId))
                      .flatMap((a) => a.disputes);
                    onOpenResolution('approve', disputes, `across ${selectedIds.size} agent${selectedIds.size === 1 ? '' : 's'}`);
                    onClearSelection();
                  }}
                >
                  {Icons.approve} Approve
                </button>
                <button
                  className={styles.floatingReject}
                  onClick={() => {
                    const disputes = filteredDisputed
                      .filter((a) => selectedIds.has(a.agentId))
                      .flatMap((a) => a.disputes);
                    onOpenResolution('reject', disputes, `across ${selectedIds.size} agent${selectedIds.size === 1 ? '' : 's'}`);
                    onClearSelection();
                  }}
                >
                  {Icons.reject} Reject
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  if (view === 'dispute-detail' && selectedDisputeAgent) {
    return (
      <motion.div key="dispute-detail" {...viewAnim}>
        <div className={styles.detailHeader}>
          <div className={styles.detailAvatar}>{getInitials(selectedDisputeAgent.agentName)}</div>
          <div className={styles.detailInfo}>
            <div className={styles.detailName}>{selectedDisputeAgent.agentName}</div>
            <div className={styles.detailBranch}>{selectedDisputeAgent.branchName}{selectedDisputeAgent.employeeId ? ` · ${selectedDisputeAgent.employeeId}` : ''}</div>
          </div>
        </div>

        <div className={styles.detailStats}>
          <div className={styles.detailStat}>
            <div className={styles.detailStatLabel}>Disputed</div>
            <div className={styles.detailStatValue} style={{ color: 'var(--color-status-poor)' }}>{selectedDisputeAgent.disputedCount}</div>
          </div>
          <div className={styles.detailStat}>
            <div className={styles.detailStatLabel}>Amount</div>
            <div className={styles.detailStatValue}>{formatUGXShort(selectedDisputeAgent.disputedAmount)}</div>
          </div>
        </div>

        {selectedDisputeAgent.disputes.length > 1 && (
          <div className={styles.bulkActions}>
            <button
              className={styles.bulkApproveBtn}
              onClick={() => onOpenResolution(
                'approve',
                selectedDisputeAgent.disputes,
                `all ${selectedDisputeAgent.disputes.length} disputes for ${selectedDisputeAgent.agentName}`
              )}
            >
              {Icons.approve}
              Approve all ({selectedDisputeAgent.disputes.length})
            </button>
            <button
              className={styles.bulkRejectBtn}
              onClick={() => onOpenResolution(
                'reject',
                selectedDisputeAgent.disputes,
                `all ${selectedDisputeAgent.disputes.length} disputes for ${selectedDisputeAgent.agentName}`
              )}
            >
              {Icons.reject}
              Reject all ({selectedDisputeAgent.disputes.length})
            </button>
          </div>
        )}

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Disputed Commissions</span>
          </div>
          {selectedDisputeAgent.disputes.map((d) => (
            <div key={d.id} className={styles.txRow}>
              <div className={styles.txDate}>
                {d.disputedAt ? `Filed ${formatDate(d.disputedAt)}` : `Due ${formatDate(d.dueDate)}`}
                {d.disputedBy && (
                  <div style={{ fontSize: '10px', color: 'var(--color-gray)', marginTop: '2px' }}>
                    by {d.disputedBy}
                    {d.previousStatus === 'released' || d.previousStatus === 'confirmed' ? ' · post-payment' : ''}
                  </div>
                )}
              </div>
              <div className={styles.txName}>
                <div>{d.subscriberName}</div>
                <div style={{ fontSize: '10px', color: 'var(--color-status-poor)', marginTop: '2px' }}>{d.reason}</div>
              </div>
              <div className={styles.txAmount} style={{ color: 'var(--color-status-poor)' }}>{formatUGX(d.amount)}</div>
              <div className={styles.txActions}>
                <button
                  className={styles.approveBtn}
                  onClick={() => onOpenResolution('approve', [d], `the dispute on ${d.subscriberName}`)}
                  aria-label={`Approve ${d.subscriberName}`}
                >
                  {Icons.approve}
                </button>
                <button
                  className={styles.rejectBtn}
                  onClick={() => onOpenResolution('reject', [d], `the dispute on ${d.subscriberName}`)}
                  aria-label={`Reject ${d.subscriberName}`}
                >
                  {Icons.reject}
                </button>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  return null;
}
