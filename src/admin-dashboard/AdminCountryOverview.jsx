import { useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';

import { useDashboard } from '../contexts/DashboardContext';
import { useAdminPanel } from '../contexts/AdminPanelContext';
import { useDataScope } from '../contexts/DataScopeContext';
import { SCOPES } from '../constants/scopes';
import { usePlatformOverview, useEntityMetrics, useChildren, useChildrenMetrics, useEmployerGeoRollup, useEmployerActivityRollup } from '../hooks/useEntity';
import { PillChip, PillChipGroup } from '../components/PillChip';
// Reuse the distributor overlay's polished sub-components (search, trends,
// collapsible list) + its CSS so the admin Summary card is pixel-identical and
// fits the same fixed-height panel — only the metrics are re-framed for admin.
import { GlobalSearch, TimePeriodCard, CollapsibleSection } from '../dashboard/overlay/OverlayPanel';
import { EASE_OUT_EXPO as EASE } from '../utils/motion';
import { formatUGX, formatNumber } from '../utils/currency';
import ov from '../dashboard/overlay/OverlayPanel.module.css';
import styles from './AdminCountryOverview.module.css';

// Scoped money: render a legitimate 0 as "UGX 0" (not the "—" that compact
// formatUGX returns for non-positive values — correct for a never-zero hero AUM,
// but wrong for a scoped metric, e.g. employer withdrawals, that is honestly 0).
const money0 = (n) => (Number(n) > 0 ? formatUGX(n) : 'UGX 0');

/**
 * Admin country-level Summary card. Replaces the distributor OverlayPanel at
 * level==='country' so the admin sees a TRUE platform picture:
 *   - headcount = ALL subscribers (distributor + employer + direct), fixing the
 *     5,000-vs-5,017 undercount (the country rollup walks the agent tree only);
 *   - leads with Distributors + Employers (the admin's domain), not agents/branches.
 * Layout mirrors the distributor card's footprint (header, hero, one counts row +
 * activity bar, a thin meta line, trends, regions) so it fits the
 * fixed-height `.panel` without clipping. Deeper drill (region→agent) still uses
 * the distributor OverlayPanel.
 */
export default function AdminCountryOverview() {
  const { drillDown, setViewReportsOpen, setReportContext } = useDashboard();
  const { setViewDistributorsOpen, setViewEmployersOpen } = useAdminPanel();
  const { scope, setScope } = useDataScope();

  const { data: overview, isError } = usePlatformOverview();
  // Country rollup still powers the Today/Week/Month trend card + per-region counts.
  const { data: periodMetrics } = useEntityMetrics('country', 'ug');
  const { data: regions = [] } = useChildren('country', 'ug');
  const { data: regionMetrics = {} } = useChildrenMetrics('country', 'ug');
  // Employer-channel geography — merged into the per-region counts under the
  // Employers / All scopes (the distributor rollup above excludes employer subs).
  const { data: geo } = useEmployerGeoRollup();
  // Employer-channel Today/Week/Month activity — only fetched under the Employers
  // scope (where the trends strip swaps to it). 0059, admin-gated.
  const { data: employerActivity } = useEmployerActivityRollup(scope === SCOPES.EMPLOYERS);

  const o = overview ?? {};
  // Channel headcounts — drive the acquisition card (shown only in the ALL scope).
  const viaDist = o.subscribersViaDistributor ?? 0;
  const viaEmp = o.subscribersViaEmployer ?? 0;
  const direct = o.subscribersDirect ?? 0;

  // Headline metrics re-scoped by the filter: ALL = platform totals; Distributors /
  // Employers = the matching byChannel slice (zeros until the RPC resolves). Derives
  // from the stable `overview` query result (not the per-render `o`/`ch` literals).
  const scoped = useMemo(() => {
    const ovr = overview ?? {};
    const byCh = ovr.byChannel ?? {};
    if (scope === SCOPES.DISTRIBUTORS) return byCh.distributor ?? {};
    if (scope === SCOPES.EMPLOYERS) return byCh.employer ?? {};
    return {
      subscribers: ovr.totalSubscribers,
      active: ovr.activeSubscribers,
      inactive: ovr.inactiveSubscribers,
      aum: ovr.aum,
      contributions: ovr.totalContributions,
      withdrawals: ovr.totalWithdrawals,
    };
  }, [scope, overview]);

  const total = scoped.subscribers ?? 0;
  const active = scoped.active ?? 0;
  const inactive = scoped.inactive ?? 0;
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

      {/* Data-scope filter — re-scopes every headline metric below + the per-region
          counts (and the map drill-down's district list counts) by acquisition
          channel. All = distributor + employer combined. */}
      <PillChipGroup label="Data scope" layout="row" className={styles.scopeFilter}>
        <PillChip selected={scope === SCOPES.ALL} onClick={() => setScope(SCOPES.ALL)}>All data</PillChip>
        <PillChip selected={scope === SCOPES.DISTRIBUTORS} onClick={() => setScope(SCOPES.DISTRIBUTORS)}>Distributors</PillChip>
        <PillChip selected={scope === SCOPES.EMPLOYERS} onClick={() => setScope(SCOPES.EMPLOYERS)}>Employers</PillChip>
      </PillChipGroup>

      {/* AUM hero (platform-wide) */}
      <div className={ov.hero}>
        <div className={ov.heroTop}>
          <span className={ov.aumValue}>{money0(scoped.aum ?? 0)}</span>
          <span className={ov.aumLabel}>Assets Under Management</span>
          {isError && <span className={ov.metricsErrorBadge} role="status">Metrics unavailable</span>}
        </div>
        <div className={ov.heroStats}>
          <div className={ov.stat}>
            <span className={ov.statNum}>{money0(scoped.contributions ?? 0)}</span>
            <span className={ov.statLabel}>Contributions</span>
          </div>
          <div className={ov.statDivider} />
          <div className={ov.stat}>
            <span className={ov.statNum}>{money0(scoped.withdrawals ?? 0)}</span>
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

      {/* Subscriber acquisition channels — a curved stat card mirroring the
          counts block (display number + micro uppercase label, hairline
          dividers) with a per-channel colour dot. Makes the employer share
          explicit (the 5,000-vs-5,017 fix). Shown only in the All-data scope —
          under a single-channel scope the headline already represents it. */}
      {scope === SCOPES.ALL && (
        <div className={styles.channelCard}>
          <div className={styles.channel}>
            <span className={styles.channelValue}>
              <span className={styles.channelDot} data-kind="dist" />
              <span className={styles.channelNum}>{formatNumber(viaDist)}</span>
            </span>
            <span className={styles.channelLabel}>via distributors</span>
          </div>
          <div className={styles.channel}>
            <span className={styles.channelValue}>
              <span className={styles.channelDot} data-kind="emp" />
              <span className={styles.channelNum}>{formatNumber(viaEmp)}</span>
            </span>
            <span className={styles.channelLabel}>via employers</span>
          </div>
          {direct > 0 && (
            <div className={styles.channel}>
              <span className={styles.channelValue}>
                <span className={styles.channelDot} data-kind="direct" />
                <span className={styles.channelNum}>{formatNumber(direct)}</span>
              </span>
              <span className={styles.channelLabel}>direct</span>
            </div>
          )}
        </div>
      )}

      {/* Today / Week / Month trends. Distributor / All scopes use the agent-tree
          country series + Top Branch. The Employers scope swaps in the employer-
          channel series (0059) + Top Employer (rows non-clickable — the drill-down
          reports are distributor-oriented). */}
      {scope === SCOPES.EMPLOYERS
        ? employerActivity && (
            <TimePeriodCard
              metrics={employerActivity}
              level={null}
              parentId={null}
              topEntity={employerActivity.topEmployer ?? null}
              topEntityLabel="Top Employer"
            />
          )
        : periodMetrics && (
            <TimePeriodCard metrics={periodMetrics} level="country" parentId="ug" onMetricClick={openReport} />
          )}

      {/* Geographic distribution by region (drill-down). Per-region count is
          re-scoped: distributor rollup, employer geo rollup, or their sum. */}
      {regions.length > 0 && (
        <CollapsibleSection title="Regions" count={regions.length} defaultOpen={false} fill>
          <div className={ov.entityList}>
            {regions.map((r) => {
              const distSubs = regionMetrics[r.id]?.totalSubscribers ?? 0;
              const empSubs = geo?.byRegion?.[r.id]?.subscribers ?? 0;
              const subs = scope === SCOPES.DISTRIBUTORS ? distSubs
                : scope === SCOPES.EMPLOYERS ? empSubs
                : distSubs + empSubs;
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
