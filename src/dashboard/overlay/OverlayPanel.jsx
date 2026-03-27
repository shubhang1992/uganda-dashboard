import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard } from '../../contexts/DashboardContext';
import { COUNTRY, getChildEntities, getEntityById, formatUGX, DISTRICTS } from '../../data/mockData';
import { EASE_OUT_EXPO as EASE } from '../../utils/finance';
import styles from './OverlayPanel.module.css';
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

function ChevronIcon({ expanded }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 14 14" fill="none"
      className={styles.chevron}
      data-expanded={expanded}
    >
      <path d="M4 5.5l3 3 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function CollapsibleSection({ title, count, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div className={styles.section}>
      <button className={styles.sectionHeader} onClick={() => setOpen(!open)}>
        <span className={styles.sectionTitle}>{title}</span>
        <div className={styles.sectionRight}>
          {count != null && <span className={styles.sectionCount}>{count}</span>}
          <ChevronIcon expanded={open} />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className={styles.sectionBody}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
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
  const { level, selectedIds, drillDown, drillUp, reset } = useDashboard();
  const parentId = getCurrentParentId(level, selectedIds);
  const nextLevel = NEXT_LEVEL[level];
  const children = nextLevel ? getChildEntities(level, parentId) : [];

  // Check if current entity is inactive (no branches/data)
  const currentEntity = level !== 'country' ? getEntityById(level, selectedIds[level]) : null;
  const isInactive = currentEntity && currentEntity.active === false;
  const metrics = isInactive ? null : getCurrentMetrics(level, selectedIds);
  const aum = metrics ? (metrics.aum || metrics.totalContributions) : 0;

  return (
    <motion.div
      className={styles.panel}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      {level === 'country' && <h2 className={styles.greeting}>Hi Admin</h2>}

      {level !== 'country' && (
        <>
          <button
            className={styles.backBtn}
            onClick={() => level === 'region' ? reset() : drillUp(level)}
          >
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
              <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back
          </button>
          <h2 className={styles.entityName}>{currentEntity?.name || ''}</h2>
        </>
      )}

      {isInactive && (
        <div className={styles.emptyState}>
          <svg viewBox="0 0 24 24" fill="none" width="32" height="32">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
          <h3 className={styles.emptyTitle}>{currentEntity?.name}</h3>
          <p className={styles.emptyText}>No active branches in this district yet. This is a coverage opportunity for network expansion.</p>
        </div>
      )}

      {!isInactive && <>
      {/* AUM — hero number */}
      <div className={styles.aumBlock}>
        <span className={styles.aumValue}>{formatUGX(aum)}</span>
        <span className={styles.aumLabel}>Assets Under Management</span>
      </div>

      {/* Quick stats row */}
      <div className={styles.quickStats}>
        <div className={styles.stat}>
          <span className={styles.statNum}>{formatUGX(metrics.totalContributions)}</span>
          <span className={styles.statLabel}>Contributions</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.stat}>
          <span className={styles.statNum}>{formatUGX(metrics.totalWithdrawals)}</span>
          <span className={styles.statLabel}>Withdrawals</span>
        </div>
      </div>

      {/* Entity counts */}
      <div className={styles.countRow}>
        <div className={styles.countItem}>
          <span className={styles.countNum}>{(metrics.totalSubscribers || 0).toLocaleString()}</span>
          <span className={styles.countLabel}>Subscribers</span>
        </div>
        <div className={styles.countItem}>
          <span className={styles.countNum}>{metrics.totalAgents ?? 0}</span>
          <span className={styles.countLabel}>Agents</span>
        </div>
        <div className={styles.countItem}>
          <span className={styles.countNum}>{metrics.totalBranches ?? 0}</span>
          <span className={styles.countLabel}>Branches</span>
        </div>
        <div className={styles.countItem}>
          <span className={styles.countNum}>{metrics.coverageRate || 0}%</span>
          <span className={styles.countLabel}>Coverage</span>
        </div>
      </div>

      {/* Activity — active vs inactive subscribers */}
      <CollapsibleSection title="Activity" defaultOpen={false} key={`activity-${level}-${parentId}`}>
        <div className={styles.activityContent}>
          <div className={styles.activeBarRow}>
            <div className={styles.barTrackLg}>
              <div className={styles.barSegment} style={{ width: `${metrics.activeRate}%`, background: 'var(--color-status-good)' }} />
              <div className={styles.barSegment} style={{ width: `${100 - metrics.activeRate}%`, background: 'var(--color-lavender)' }} />
            </div>
            <div className={styles.activeLabels}>
              <span className={styles.activeLabel}>
                {Math.round((metrics.totalSubscribers || 0) * (metrics.activeRate / 100)).toLocaleString()} active
              </span>
              <span className={styles.inactiveLabel}>
                {Math.round((metrics.totalSubscribers || 0) * ((100 - metrics.activeRate) / 100)).toLocaleString()} inactive
              </span>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Region/child list */}
      {children.length > 0 && nextLevel && (
        <CollapsibleSection title={LEVEL_LABELS[nextLevel] || 'Items'} count={children.length} defaultOpen={false} key={`children-${level}-${parentId}`}>
          <div className={styles.entityList}>
            {children.map((child) => {
              const isChildActive = child.active !== false;
              const subCount = child.metrics?.totalSubscribers || 0;
              return (
                <button key={child.id} className={styles.entityBtn} data-inactive={!isChildActive} onClick={() => drillDown(nextLevel, child.id)}>
                  <div className={styles.statusRow}>
                    <span className={styles.statusLabel}>{child.name}</span>
                    {isChildActive ? (
                      <span className={styles.statusCount}>{subCount.toLocaleString()} subscribers</span>
                    ) : (
                      <span className={styles.inactiveTag}>No branches</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </CollapsibleSection>
      )}
      </>}
    </motion.div>
  );
}
