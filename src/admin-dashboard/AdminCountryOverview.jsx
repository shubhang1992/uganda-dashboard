import { useCallback } from 'react';
import { motion } from 'framer-motion';

import { useDashboard } from '../contexts/DashboardContext';
import { useAdminPanel } from '../contexts/AdminPanelContext';
import { usePlatformOverview, useEntityMetrics, useChildren, useChildrenMetrics } from '../hooks/useEntity';
import { useEntityCommissionSummary } from '../hooks/useCommission';
// Reuse the distributor overlay's polished sub-components (search, trends,
// collapsible list) + its CSS so the admin Summary card is pixel-identical and
// fits the same fixed-height panel — only the metrics are re-framed for admin.
import { GlobalSearch, TimePeriodCard, CollapsibleSection } from '../dashboard/overlay/OverlayPanel';
import { EASE_OUT_EXPO as EASE } from '../utils/motion';
import { formatUGX, formatNumber } from '../utils/currency';
import ov from '../dashboard/overlay/OverlayPanel.module.css';
import styles from './AdminCountryOverview.module.css';

/**
 * Admin country-level Summary card. Replaces the distributor OverlayPanel at
 * level==='country' so the admin sees a TRUE platform picture:
 *   - headcount = ALL subscribers (distributor + employer + direct), fixing the
 *     5,000-vs-5,017 undercount (the country rollup walks the agent tree only);
 *   - leads with Distributors + Employers (the admin's domain), not agents/branches.
 * Layout mirrors the distributor card's footprint (header, hero, one counts row +
 * activity bar, a thin meta line, commissions, trends, regions) so it fits the
 * fixed-height `.panel` without clipping. Deeper drill (region→agent) still uses
 * the distributor OverlayPanel.
 */
export default function AdminCountryOverview() {
  const { drillDown, setViewReportsOpen, setReportContext, setCommissionsOpen } = useDashboard();
  const { setViewDistributorsOpen, setViewEmployersOpen } = useAdminPanel();

  const { data: overview, isError } = usePlatformOverview();
  // Country rollup still powers the Today/Week/Month trend card + per-region counts.
  const { data: periodMetrics } = useEntityMetrics('country', 'ug');
  const { data: regions = [] } = useChildren('country', 'ug');
  const { data: regionMetrics = {} } = useChildrenMetrics('country', 'ug');
  const { data: commissionSummary } = useEntityCommissionSummary('country', 'ug');

  const o = overview ?? {};
  const total = o.totalSubscribers ?? 0;
  const viaDist = o.subscribersViaDistributor ?? 0;
  const viaEmp = o.subscribersViaEmployer ?? 0;
  const direct = o.subscribersDirect ?? 0;
  const active = o.activeSubscribers ?? 0;
  const inactive = o.inactiveSubscribers ?? 0;
  const activeRate = total > 0 ? Math.round((active / total) * 100) : 0;

  const openReport = useCallback((reportId) => {
    setReportContext(reportId);
    setViewReportsOpen(true);
  }, [setReportContext, setViewReportsOpen]);

  const handleSearchNavigate = useCallback((level, id) => drillDown(level, id), [drillDown]);

  return (
    <motion.div
      className={ov.panel}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      {/* Header */}
      <div className={ov.panelHeader}>
        <h2 className={ov.greeting}>Platform Overview</h2>
        <GlobalSearch onNavigate={handleSearchNavigate} />
      </div>

      {/* AUM hero (platform-wide) */}
      <div className={ov.hero}>
        <div className={ov.heroTop}>
          <span className={ov.aumValue}>{formatUGX(o.aum ?? 0)}</span>
          <span className={ov.aumLabel}>Assets Under Management</span>
          {isError && <span className={ov.metricsErrorBadge} role="status">Metrics unavailable</span>}
        </div>
        <div className={ov.heroStats}>
          <div className={ov.stat}>
            <span className={ov.statNum}>{formatUGX(o.totalContributions ?? 0)}</span>
            <span className={ov.statLabel}>Contributions</span>
          </div>
          <div className={ov.statDivider} />
          <div className={ov.stat}>
            <span className={ov.statNum}>{formatUGX(o.totalWithdrawals ?? 0)}</span>
            <span className={ov.statLabel}>Withdrawals</span>
          </div>
        </div>
      </div>

      {/* Counts — leads with the admin's domain (distributors + employers) + true
          subscriber total; reuses the distributor counts-block footprint. */}
      <div className={ov.countsBlock}>
        <div className={ov.countRow}>
          <button className={ov.countItem} data-clickable onClick={() => setViewDistributorsOpen(true)}>
            <span className={ov.countNum}>{formatNumber(o.distributors ?? 0)}</span>
            <span className={ov.countLabel}>Distributors</span>
          </button>
          <button className={ov.countItem} data-clickable onClick={() => setViewEmployersOpen(true)}>
            <span className={ov.countNum}>{formatNumber(o.employers ?? 0)}</span>
            <span className={ov.countLabel}>Employers</span>
          </button>
          <button className={ov.countItem} data-clickable onClick={() => openReport('all-subscribers')}>
            <span className={ov.countNum}>{formatNumber(total)}</span>
            <span className={ov.countLabel}>Subscribers</span>
          </button>
          <div className={ov.countItem}>
            <span className={ov.countNum}>{activeRate}%</span>
            <span className={ov.countLabel}>Active</span>
          </div>
        </div>
        <div className={ov.activityInline}>
          <div className={ov.activityBarTrack}>
            <div className={ov.activityBarFill} style={{ width: `${activeRate}%` }} />
          </div>
          <div className={ov.activityLabels}>
            <span className={ov.activityActive}>{formatNumber(active)} active</span>
            <span className={ov.activityInactive}>{formatNumber(inactive)} inactive</span>
          </div>
        </div>
      </div>

      {/* Thin meta line: subscriber acquisition channels + network size. Makes the
          employer share explicit (the 5,000-vs-5,017 fix) in one compact row. */}
      <div className={styles.metaLine}>
        <span className={styles.metaItem}>
          <span className={styles.metaDot} data-kind="dist" />
          <strong>{formatNumber(viaDist)}</strong> via distributors
        </span>
        <span className={styles.metaItem}>
          <span className={styles.metaDot} data-kind="emp" />
          <strong>{formatNumber(viaEmp)}</strong> via employers
        </span>
        {direct > 0 && (
          <span className={styles.metaItem}>
            <span className={styles.metaDot} data-kind="direct" />
            <strong>{formatNumber(direct)}</strong> direct
          </span>
        )}
        <span className={styles.metaSep}>·</span>
        <span className={styles.metaItem}>{formatNumber(o.agents ?? 0)} agents</span>
        <span className={styles.metaItem}>{formatNumber(o.branches ?? 0)} branches</span>
      </div>

      {/* Commissions (platform-wide) */}
      {commissionSummary && commissionSummary.countTotal > 0 && (
        <button className={ov.commissionBlock} onClick={() => setCommissionsOpen(true)}>
          <div className={ov.commissionHeader}>
            <span className={ov.commissionTitle}>Commissions</span>
            <span className={ov.commissionRate}>{commissionSummary.settlementRate}% settled</span>
          </div>
          <div className={ov.commissionBar}>
            <div className={ov.commissionBarFill} data-status="settled" style={{ flex: commissionSummary.countPaid }} />
            <div className={ov.commissionBarFill} data-status="due" style={{ flex: commissionSummary.countDue }} />
          </div>
          <div className={ov.commissionStats}>
            <span className={ov.commissionStat}>
              <span className={ov.commissionDot} data-status="settled" />
              {formatUGX(commissionSummary.totalPaid)}
            </span>
            <span className={ov.commissionStat}>
              <span className={ov.commissionDot} data-status="due" />
              {formatUGX(commissionSummary.totalDue)}
            </span>
          </div>
        </button>
      )}

      {/* Today / Week / Month trends */}
      {periodMetrics && (
        <TimePeriodCard metrics={periodMetrics} level="country" parentId="ug" onMetricClick={openReport} />
      )}

      {/* Geographic distribution — distributor network by region (drill-down) */}
      {regions.length > 0 && (
        <CollapsibleSection title="Regions" count={regions.length} defaultOpen={false} fill>
          <div className={ov.entityList}>
            {regions.map((r) => {
              const subs = regionMetrics[r.id]?.totalSubscribers ?? 0;
              return (
                <button key={r.id} className={ov.entityBtn} onClick={() => drillDown('region', r.id)}>
                  <div className={ov.statusRow}>
                    <span className={ov.statusLabel}>{r.name}</span>
                    <span className={ov.statusCount}>{formatNumber(subs)} subscribers</span>
                  </div>
                </button>
              );
            })}
          </div>
        </CollapsibleSection>
      )}
    </motion.div>
  );
}
