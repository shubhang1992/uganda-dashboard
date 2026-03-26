import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard } from '../../contexts/DashboardContext';
import { COUNTRY, getChildEntities, getEntityById, formatUGX } from '../../data/mockData';
import styles from './OverlayPanel.module.css';

const EASE = [0.16, 1, 0.3, 1];
const NEXT_LEVEL = { country: 'region', region: 'district', district: 'branch', branch: 'agent' };
const LEVEL_LABELS = { region: 'Regions', district: 'Districts', branch: 'Branches', agent: 'Agents' };

function getCurrentMetrics(level, selectedIds) {
  if (level === 'country') return COUNTRY.metrics;
  const id = selectedIds[level];
  const entity = getEntityById(level, id);
  return entity?.metrics || COUNTRY.metrics;
}

function getCurrentParentId(level, selectedIds) {
  if (level === 'country') return 'ug';
  return selectedIds[level];
}

function StatusBar({ label, value, segments }) {
  return (
    <div className={styles.statusRow}>
      <span className={styles.statusLabel}>{label}</span>
      <div className={styles.barTrack}>
        {segments.map((seg, i) => (
          <div key={i} className={styles.barSegment} style={{ width: `${seg.pct}%`, background: seg.color }} />
        ))}
      </div>
      <span className={styles.statusPct}>{value}%</span>
    </div>
  );
}

export default function OverlayPanel() {
  const { level, selectedIds, drillDown } = useDashboard();
  const metrics = getCurrentMetrics(level, selectedIds);
  const parentId = getCurrentParentId(level, selectedIds);
  const nextLevel = NEXT_LEVEL[level];
  const children = nextLevel ? getChildEntities(level, parentId) : [];

  return (
    <motion.div
      className={styles.panel}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      {level === 'country' && <h2 className={styles.greeting}>Hi Admin</h2>}

      {/* Primary KPIs — Widget Data */}
      <AnimatePresence mode="wait">
        <motion.div
          key={level + parentId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Row 1: AUM + Coverage */}
          <div className={styles.kpiRow}>
            <div className={styles.kpi}>
              <span className={styles.kpiValue}>{formatUGX(metrics.aum || metrics.totalContributions)}</span>
              <span className={styles.kpiLabel}>Assets Under Mgmt</span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiValue}>{metrics.coverageRate || 0}%</span>
              <span className={styles.kpiLabel}>Coverage Rate</span>
            </div>
          </div>

          {/* Row 2: Contributions + Withdrawals */}
          <div className={styles.kpiRow}>
            <div className={styles.kpi}>
              <span className={styles.kpiValueSm}>{formatUGX(metrics.totalContributions)}</span>
              <span className={styles.kpiLabel}>Total Contributions</span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiValueSm}>{formatUGX(metrics.totalWithdrawals)}</span>
              <span className={styles.kpiLabel}>Total Withdrawals</span>
            </div>
          </div>

          {/* Row 3: Entity counts */}
          <div className={styles.countRow}>
            <button className={styles.countBtn}>
              <span className={styles.countNum}>{metrics.totalBranches ?? Object.keys(children).length}</span>
              <span className={styles.countLabel}>Branches</span>
            </button>
            <button className={styles.countBtn}>
              <span className={styles.countNum}>{metrics.totalAgents ?? 0}</span>
              <span className={styles.countLabel}>Agents</span>
            </button>
            <button className={styles.countBtn}>
              <span className={styles.countNum}>{(metrics.totalSubscribers || 0).toLocaleString()}</span>
              <span className={styles.countLabel}>Subscribers</span>
            </button>
          </div>

          {/* Active vs Inactive */}
          {metrics.activeRate != null && (
            <div className={styles.activeBar}>
              <div className={styles.activeBarHeader}>
                <span className={styles.kpiLabel}>Active vs Inactive</span>
                <span className={styles.activeBarPct}>{metrics.activeRate}% active</span>
              </div>
              <div className={styles.barTrack}>
                <div className={styles.barSegment} style={{ width: `${metrics.activeRate}%`, background: 'var(--color-status-good)' }} />
                <div className={styles.barSegment} style={{ width: `${100 - metrics.activeRate}%`, background: 'var(--color-lavender)' }} />
              </div>
            </div>
          )}

          {/* Complaints */}
          {metrics.complaintsCount != null && (
            <div className={styles.complaintRow}>
              <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
                <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M10 6v5M10 13.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className={styles.complaintNum}>{metrics.complaintsCount}</span>
              <span className={styles.kpiLabel}>Complaints</span>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Child entity status bars */}
      {children.length > 0 && nextLevel && (
        <AnimatePresence mode="wait">
          <motion.div
            key={'list-' + level + parentId}
            className={styles.entityList}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <div className={styles.listHeader}>
              <span className={styles.listTitle}>{LEVEL_LABELS[nextLevel] || 'Items'}</span>
              <span className={styles.listCount}>{children.length}</span>
            </div>
            {children.map((child) => {
              const active = child.metrics?.activeRate || 80;
              const warning = Math.min(100 - active, 15);
              const poor = Math.max(100 - active - warning, 0);
              return (
                <button key={child.id} className={styles.entityBtn} onClick={() => drillDown(nextLevel, child.id)}>
                  <StatusBar
                    label={child.name}
                    value={active}
                    segments={[
                      { pct: active, color: 'var(--color-status-good)' },
                      { pct: warning, color: 'var(--color-status-warning)' },
                      { pct: poor, color: 'var(--color-status-poor)' },
                    ]}
                  />
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      )}
    </motion.div>
  );
}
