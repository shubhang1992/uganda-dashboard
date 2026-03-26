import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard } from '../../contexts/DashboardContext';
import { COUNTRY, getChildEntities, getEntityById, formatUGX } from '../../data/mockData';
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
  const { level, selectedIds, drillDown } = useDashboard();
  const metrics = getCurrentMetrics(level, selectedIds);
  const parentId = getCurrentParentId(level, selectedIds);
  const nextLevel = NEXT_LEVEL[level];
  const children = nextLevel ? getChildEntities(level, parentId) : [];

  const aum = metrics.aum || metrics.totalContributions;

  return (
    <motion.div
      className={styles.panel}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      {level === 'country' && <h2 className={styles.greeting}>Hi Admin</h2>}

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
      <CollapsibleSection title="Activity" defaultOpen={false}>
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
        <CollapsibleSection title={LEVEL_LABELS[nextLevel] || 'Items'} count={children.length} defaultOpen={false}>
          <div className={styles.entityList}>
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
          </div>
        </CollapsibleSection>
      )}
    </motion.div>
  );
}
