import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { formatUGXShort } from '../../utils/currency';
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
 * Agents-tab subtree of `CommissionPanel`. Search toolbar + filtered
 * agent list with empty/skeleton states. Stateless — all interaction
 * routes through callbacks supplied by the parent.
 */
export default function CommissionGrid({
  filteredAgents,
  agentsCold,
  statusFocus,
  search,
  debouncedSearch,
  onSearchChange,
  onSelectAgent,
}) {
  return (
    <motion.div key="agents" {...viewAnim}>
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>{Icons.search}</span>
          <input
            className={styles.searchInput}
            placeholder="Search agents…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search agents"
            spellCheck={false}
          />
          {search && (
            <button className={styles.searchClear} onClick={() => onSearchChange('')} aria-label="Clear search">
              {Icons.close}
            </button>
          )}
        </div>
      </div>

      {agentsCold ? (
        <SkeletonRow count={6} label="Loading commission ledger" />
      ) : filteredAgents.length === 0 ? (
        // Differentiated empty: clean state ("no commissions
        // recorded yet") vs filter mismatch ("widen your search").
        debouncedSearch.trim() === '' ? (
          <EmptyState
            kind="no-data"
            title={
              statusFocus === 'paid'
                ? 'No commissions paid yet.'
                : statusFocus === 'due'
                  ? 'No commissions due.'
                  : 'No commissions yet.'
            }
            body="Commission activity will appear here as soon as it's recorded."
          />
        ) : (
          <EmptyState
            kind="no-match"
            title="No agents match"
            body="Try adjusting your search."
          />
        )
      ) : (
        filteredAgents.map((agent) => (
          <button
            key={agent.agentId}
            className={styles.agentRow}
            onClick={() => onSelectAgent(agent.agentId)}
          >
            <div className={styles.agentAvatar}>{getInitials(agent.agentName)}</div>
            <div className={styles.agentInfo}>
              <div className={styles.agentName}>{agent.agentName}</div>
              <div className={styles.agentBranch}>{agent.branchName}{agent.employeeId ? ` · ${agent.employeeId}` : ''}</div>
            </div>
            <div>
              <div className={styles.agentAmount}>
                {statusFocus === 'paid' ? formatUGXShort(agent.totalPaid) :
                 statusFocus === 'due' ? formatUGXShort(agent.totalDue) :
                 formatUGXShort(agent.totalCommissions)}
              </div>
              <div className={styles.agentAmountLabel}>
                {agent.subscribersOnboarded} subscribers
              </div>
            </div>
          </button>
        ))
      )}
    </motion.div>
  );
}
