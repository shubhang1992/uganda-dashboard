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
          <div
            key={i}
            className={styles.barSegment}
            style={{ width: `${seg.pct}%`, background: seg.color }}
          />
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
      {level === 'country' && (
        <h2 className={styles.greeting}>Hi Admin</h2>
      )}

      {/* KPI strip */}
      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span className={styles.kpiValue}>{formatUGX(metrics.totalContributions)}</span>
          <span className={styles.kpiLabel}>Contributions</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiValue}>{(metrics.totalSubscribers || 0).toLocaleString()}</span>
          <span className={styles.kpiLabel}>Subscribers</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiValue}>{metrics.coverageRate || 0}%</span>
          <span className={styles.kpiLabel}>Coverage</span>
        </div>
      </div>

      {/* Child entity status bars */}
      {children.length > 0 && nextLevel && (
        <AnimatePresence mode="wait">
          <motion.div
            key={level + parentId}
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
                <button
                  key={child.id}
                  className={styles.entityBtn}
                  onClick={() => drillDown(nextLevel, child.id)}
                >
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
