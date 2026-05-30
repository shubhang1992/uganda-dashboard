import Stars from '../shared/Stars';
import { getInitials, perfLevel } from '../../utils/dashboard';
import styles from './ViewBranches.module.css';

/**
 * Stateless agent list rendered inside the branch detail view.
 *
 * Pure props-driven — no context hooks, no metrics fetches. Receives the
 * already-enriched `agents` array (live rollup metrics overlaid in the
 * parent) and emits `onSelectAgent(agent)` when a row is clicked.
 *
 * Sort props (`sortKey`, `sortDir`, `onSortChange`) are accepted for future
 * sortable-column extension; current UI does not sort agents.
 */
export default function AgentListTable({
  agents,
  // eslint-disable-next-line no-unused-vars
  selectedAgentId,
  onSelectAgent,
  // eslint-disable-next-line no-unused-vars
  sortKey,
  // eslint-disable-next-line no-unused-vars
  sortDir,
  // eslint-disable-next-line no-unused-vars
  onSortChange,
}) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Agents ({agents.length})</span>
      </div>
      <div className={styles.agentList}>
        {agents.map((agent) => {
          const level = perfLevel(agent.performance);
          return (
            <button
              key={agent.id}
              className={styles.agentItem}
              onClick={() => onSelectAgent(agent)}
            >
              <div className={styles.agentAvatar}>{getInitials(agent.name)}</div>
              <div className={styles.agentInfo}>
                <div className={styles.agentName}>{agent.name}</div>
                <div className={styles.agentMeta}>
                  <span className={styles.agentStatus} data-status={agent.status} />
                  <span>{agent.metrics.totalSubscribers} subs</span>
                  <span>&middot;</span>
                  <Stars rating={agent.rating} />
                </div>
              </div>
              <span className={styles.agentPerf} data-level={level}>{agent.performance}%</span>
              <span className={styles.chevronAgent}>
                <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="14" height="14">
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
