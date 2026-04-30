import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard } from '../../contexts/DashboardContext';
import { useCurrentEntity, useChildren, useTopBranch, useSearch } from '../../hooks/useEntity';
import { useEntityCommissionSummary } from '../../hooks/useCommission';
import { CHILD_LEVEL } from '../../constants/levels';
import { formatUGX, EASE_OUT_EXPO as EASE } from '../../utils/finance';
import { useIsMobile } from '../../hooks/useIsMobile';
import styles from './OverlayPanel.module.css';
const LEVEL_LABELS = { region: 'Regions', district: 'Districts', branch: 'Branches', agent: 'Agents' };
const LEVEL_TAG = { region: 'Region', district: 'District', branch: 'Branch', agent: 'Agent' };

function ChevronIcon({ expanded }) {
  return (
    <svg
      aria-hidden="true"
      width="14" height="14" viewBox="0 0 14 14" fill="none"
      className={styles.chevron}
      data-expanded={expanded}
    >
      <path d="M4 5.5l3 3 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ExpandIcon({ expanded }) {
  return (
    <svg
      aria-hidden="true"
      width="12" height="12" viewBox="0 0 12 12" fill="none"
      className={styles.expandIcon}
      data-expanded={expanded}
    >
      <path
        d={expanded ? 'M3 5l3 3 3-3' : 'M3 7l3-3 3 3'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CollapsibleSection({ title, count, defaultOpen, children, fill, expanded, onExpandToggle }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(defaultOpen ?? true);

  if (!isMobile) {
    return (
      <div className={styles.section} data-fill={fill ? 'true' : undefined} data-expanded={expanded ? 'true' : undefined}>
        <div className={styles.sectionHeader} data-static="true">
          <span className={styles.sectionTitle}>{title}</span>
          <div className={styles.sectionRight}>
            {count != null && <span className={styles.sectionCount}>{count}</span>}
            {onExpandToggle && (
              <button
                className={styles.expandBtn}
                onClick={onExpandToggle}
                aria-label={expanded ? 'Collapse list' : 'Expand list'}
                aria-pressed={!!expanded}
              >
                <ExpandIcon expanded={expanded} />
              </button>
            )}
          </div>
        </div>
        <div className={styles.sectionBody}>{children}</div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <button className={styles.sectionHeader} onClick={() => setOpen(!open)} aria-expanded={open}>
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

function GlobalSearch({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { data: results = [] } = useSearch(query);

  function handleSelect(item) {
    onNavigate(item.level, item.id);
    setQuery('');
    setOpen(false);
  }

  function handleClose() {
    setQuery('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button className={styles.searchToggle} onClick={() => setOpen(true)} aria-label="Search">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="14" height="14">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75"/>
          <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        </svg>
        <span>Search…</span>
      </button>
    );
  }

  return (
    <div className={styles.globalSearch}>
      <div className={styles.searchBarCompact}>
        <svg aria-hidden="true" className={styles.searchBarIcon} viewBox="0 0 24 24" fill="none" width="13" height="13">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75"/>
          <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        </svg>
        <input
          className={styles.searchBarInput}
          type="text"
          placeholder="Region, district, branch…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          onBlur={() => setTimeout(handleClose, 150)}
          aria-label="Search entities"
          name="search"
          autoComplete="off"
        />
        <button className={styles.searchBarClose} onMouseDown={handleClose} aria-label="Close search">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="12" height="12">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      {results.length > 0 && (
        <div className={styles.searchResults}>
          {results.map((item) => (
            <button key={item.id} className={styles.searchResultBtn} onMouseDown={() => handleSelect(item)}>
              <span className={styles.searchResultName}>{item.name}</span>
              <span className={styles.searchResultLevel}>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

function pctChange(curr, prev) {
  if (!prev) return 0;
  return Math.round(((curr - prev) / prev) * 100);
}

function ChangeBadge({ value }) {
  return (
    <span className={styles.changeBadge} data-positive={value >= 0}>
      <svg aria-hidden="true" viewBox="0 0 10 10" width="8" height="8" fill="none">
        {value >= 0
          ? <path d="M5 2l3.5 5H1.5z" fill="currentColor"/>
          : <path d="M5 8L1.5 3h7z" fill="currentColor"/>}
      </svg>
      {Math.abs(value)}%
    </span>
  );
}

function MetricRow({ variant, icon, value, label, change, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={styles.monthlyRow} data-variant={variant} data-clickable={!!onClick} onClick={onClick}>
      <div className={styles.monthlyIcon} data-variant={variant}>{icon}</div>
      <div className={styles.monthlyText}>
        <span className={styles.monthlyValue}>{value}</span>
        <span className={styles.monthlyLabel}>{label}</span>
      </div>
      {change != null && <ChangeBadge value={change} />}
      {onClick && (
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="10" height="10" className={styles.monthlyChevron}>
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </Tag>
  );
}

const SubsIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="15" height="15">
    <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.75"/>
    <path d="M19 8v6M22 11h-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const ContribIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="15" height="15">
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const WithdrawIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="15" height="15">
    <path d="M21 12l-4 4-4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M17 16V4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    <path d="M3 20h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
  </svg>
);
const StarIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="15" height="15">
    <path d="M12 2l2.09 6.26L20 9.27l-4.91 3.82L16.18 20 12 16.77 7.82 20l1.09-6.91L4 9.27l5.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

function TimePeriodCard({ metrics, level, parentId, onMetricClick }) {
  const [activeIdx, setActiveIdx] = useState(2); // default: This Month
  const period = PERIODS[activeIdx].key;
  const { data: topBranch } = useTopBranch(level, parentId);

  const data = {
    today: {
      subs: metrics.newSubscribersToday || 0,
      subsChange: pctChange(metrics.newSubscribersToday, metrics.prevNewSubscribersToday),
      contrib: metrics.dailyContributions || 0,
      contribChange: pctChange(metrics.dailyContributions, metrics.prevDailyContributions),
      withdraw: metrics.dailyWithdrawals || 0,
      withdrawChange: pctChange(metrics.dailyWithdrawals, metrics.prevDailyWithdrawals),
      changeLabel: 'vs yesterday',
    },
    week: {
      subs: metrics.newSubscribersThisWeek || 0,
      subsChange: pctChange(metrics.newSubscribersThisWeek, metrics.prevNewSubscribersThisWeek),
      contrib: metrics.weeklyContributions || 0,
      contribChange: pctChange(metrics.weeklyContributions, metrics.prevWeeklyContributions),
      withdraw: metrics.weeklyWithdrawals || 0,
      withdrawChange: pctChange(metrics.weeklyWithdrawals, metrics.prevWeeklyWithdrawals),
      changeLabel: 'vs last week',
    },
    month: {
      subs: metrics.newSubscribersThisMonth || 0,
      subsChange: pctChange(metrics.newSubscribersThisMonth, metrics.prevNewSubscribersThisMonth),
      contrib: metrics.monthlyContributions?.[11] || 0,
      contribChange: pctChange(metrics.monthlyContributions?.[11], metrics.monthlyContributions?.[10]),
      withdraw: metrics.monthlyWithdrawals || 0,
      withdrawChange: pctChange(metrics.monthlyWithdrawals, metrics.prevMonthlyWithdrawals),
      changeLabel: 'vs last month',
    },
  };

  const d = data[period];

  return (
    <div className={styles.periodCard}>
      <div className={styles.periodTabs} role="tablist">
        {PERIODS.map((p, i) => (
          <button
            key={p.key}
            className={styles.periodTab}
            data-active={i === activeIdx}
            onClick={() => setActiveIdx(i)}
            role="tab"
            aria-selected={i === activeIdx}
          >
            {p.label}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={period}
          className={styles.monthlyList}
          initial={{ opacity: 0, x: activeIdx > 1 ? 8 : -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: activeIdx > 1 ? -8 : 8 }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          <MetricRow
            variant="subscribers" icon={<SubsIcon />}
            value={d.subs.toLocaleString()} label="New Subscribers"
            change={d.subsChange}
            onClick={onMetricClick ? () => onMetricClick('subscriber-growth') : undefined}
          />
          <MetricRow
            variant="contribution" icon={<ContribIcon />}
            value={formatUGX(d.contrib)} label="Contributions"
            change={d.contribChange}
            onClick={onMetricClick ? () => onMetricClick('contributions-collections') : undefined}
          />
          <MetricRow
            variant="withdrawal" icon={<WithdrawIcon />}
            value={formatUGX(d.withdraw)} label="Withdrawals"
            change={d.withdrawChange}
            onClick={onMetricClick ? () => onMetricClick('withdrawals-payouts') : undefined}
          />
          {topBranch && (
            <MetricRow
              variant="branch" icon={<StarIcon />}
              value={topBranch.name} label={`Top Branch · ${formatUGX(topBranch.contribution)}`}
              onClick={onMetricClick ? () => onMetricClick('branch-performance') : undefined}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default function OverlayPanel() {
  const isMobile = useIsMobile();
  const { level, selectedIds, drillDown, drillUp, reset, branchMenuOpen, agentMenuOpen, subscriberMenuOpen, setViewReportsOpen, setReportContext, setCommissionsOpen } = useDashboard();
  const [listExpanded, setListExpanded] = useState(false);

  // When drilled into a specific branch/agent, keep showing the parent district
  // context on the left so the user doesn't lose their place while the slide-in
  // detail panel occupies the right.
  const displayLevel = (level === 'branch' || level === 'agent') ? 'district' : level;
  const parentId = displayLevel === 'country' ? 'ug' : selectedIds[displayLevel];
  const nextLevel = CHILD_LEVEL[displayLevel] || null;
  const { data: currentEntity } = useCurrentEntity(displayLevel, selectedIds);
  const { data: children = [] } = useChildren(displayLevel, parentId);
  const { data: commissionSummary } = useEntityCommissionSummary(displayLevel, parentId);

  const openReport = useCallback((reportId) => {
    setReportContext(reportId);
    setViewReportsOpen(true);
  }, [setReportContext, setViewReportsOpen]);

  const handleSearchNavigate = useCallback((targetLevel, targetId) => {
    drillDown(targetLevel, targetId);
  }, [drillDown]);

  // Collapse the expanded list view when the user navigates to a different entity.
  // Adjusting state during render (instead of in an effect) avoids a cascading render.
  const [lastNavKey, setLastNavKey] = useState(`${displayLevel}-${parentId}`);
  const navKey = `${displayLevel}-${parentId}`;
  if (navKey !== lastNavKey) {
    setLastNavKey(navKey);
    setListExpanded(false);
  }

  if (!currentEntity) return null;

  const isInactive = currentEntity.active === false;
  const metrics = isInactive ? null : currentEntity.metrics;
  const aum = metrics ? (metrics.aum || metrics.totalContributions) : 0;

  return (
    <motion.div
      className={styles.panel}
      initial={{ opacity: 0, x: -20 }}
      animate={{
        opacity: 1,
        x: 0,
        left: isMobile ? 'auto' : (branchMenuOpen || agentMenuOpen || subscriberMenuOpen) ? 'calc(100% - 310px - var(--space-6))' : 'var(--space-6)',
      }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      {/* Panel header: title/back + search */}
      <div className={styles.panelHeader}>
        {displayLevel === 'country' ? (
          <h2 className={styles.greeting}>Summary</h2>
        ) : (
          <button
            className={styles.backBtn}
            onClick={() => displayLevel === 'region' ? reset() : drillUp(displayLevel)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="16" height="16">
              <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back
          </button>
        )}
        <GlobalSearch onNavigate={handleSearchNavigate} />
      </div>

          {isInactive && (
            <div className={styles.emptyState}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="32" height="32">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              </svg>
              <h3 className={styles.emptyTitle}>{currentEntity?.name}</h3>
              <p className={styles.emptyText}>No active branches in this district yet. This is a coverage opportunity for network expansion.</p>
            </div>
          )}

          {!isInactive && <>
          {/* AUM hero — indigo-gradient card with contributions/withdrawals footer */}
          <div className={styles.hero}>
            {displayLevel !== 'country' && (
              <div className={styles.heroLabel} aria-live="polite">
                <span className={styles.heroTag}>{LEVEL_TAG[displayLevel] || displayLevel}</span>
                <span className={styles.heroName}>{currentEntity?.name || ''}</span>
              </div>
            )}
            <div className={styles.heroTop}>
              <span className={styles.aumValue}>{formatUGX(aum)}</span>
              <span className={styles.aumLabel}>Assets Under Management</span>
            </div>
            <div className={styles.heroStats}>
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
          </div>

          {/* Entity counts + activity bar */}
          <div className={styles.countsBlock}>
            <div className={styles.countRow}>
              <button className={styles.countItem} data-clickable onClick={() => openReport('all-subscribers')}>
                <span className={styles.countNum}>{(metrics.totalSubscribers || 0).toLocaleString()}</span>
                <span className={styles.countLabel}>Subscribers</span>
              </button>
              <button className={styles.countItem} data-clickable onClick={() => openReport('all-agents')}>
                <span className={styles.countNum}>{metrics.totalAgents ?? 0}</span>
                <span className={styles.countLabel}>Agents</span>
              </button>
              <button className={styles.countItem} data-clickable onClick={() => openReport('all-branches')}>
                <span className={styles.countNum}>{metrics.totalBranches ?? 0}</span>
                <span className={styles.countLabel}>Branches</span>
              </button>
              <div className={styles.countItem}>
                <span className={styles.countNum}>{metrics.coverageRate || 0}%</span>
                <span className={styles.countLabel}>Coverage</span>
              </div>
            </div>
            <div className={styles.activityInline}>
              <div className={styles.activityBarTrack}>
                <div className={styles.activityBarFill} style={{ width: `${metrics.activeRate}%` }} />
              </div>
              <div className={styles.activityLabels}>
                <span className={styles.activityActive}>
                  {Math.round((metrics.totalSubscribers || 0) * (metrics.activeRate / 100)).toLocaleString()} active
                </span>
                <span className={styles.activityInactive}>
                  {Math.round((metrics.totalSubscribers || 0) * ((100 - metrics.activeRate) / 100)).toLocaleString()} inactive
                </span>
              </div>
            </div>
          </div>

          {/* Commission summary */}
          {commissionSummary && commissionSummary.countTotal > 0 && (
            <button className={styles.commissionBlock} onClick={() => setCommissionsOpen(true)}>
              <div className={styles.commissionHeader}>
                <span className={styles.commissionTitle}>Commissions</span>
                <span className={styles.commissionRate}>{commissionSummary.settlementRate}% settled</span>
              </div>
              <div className={styles.commissionBar}>
                <div className={styles.commissionBarFill} data-status="settled" style={{ flex: commissionSummary.countPaid }} />
                <div className={styles.commissionBarFill} data-status="due" style={{ flex: commissionSummary.countDue }} />
                {commissionSummary.countDisputed > 0 && (
                  <div className={styles.commissionBarFill} data-status="disputed" style={{ flex: commissionSummary.countDisputed }} />
                )}
              </div>
              <div className={styles.commissionStats}>
                <span className={styles.commissionStat}>
                  <span className={styles.commissionDot} data-status="settled" />
                  {formatUGX(commissionSummary.totalPaid)}
                </span>
                <span className={styles.commissionStat}>
                  <span className={styles.commissionDot} data-status="due" />
                  {formatUGX(commissionSummary.totalDue)}
                </span>
                {commissionSummary.countDisputed > 0 && (
                  <span className={styles.commissionStat} data-status="disputed">
                    <span className={styles.commissionDot} data-status="disputed" />
                    {commissionSummary.countDisputed}
                  </span>
                )}
              </div>
            </button>
          )}

          {/* Time-period highlights: Today / This Week / This Month.
              Animates out when the child list is expanded so the list can
              absorb the freed vertical space. */}
          <AnimatePresence initial={false}>
            {!listExpanded && (
              <motion.div
                key="period-card"
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 0 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                style={{ overflow: 'hidden', flexShrink: 0 }}
              >
                <TimePeriodCard metrics={metrics} level={displayLevel} parentId={parentId} onMetricClick={openReport} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Region/child list */}
          {children.length > 0 && nextLevel && (
            <CollapsibleSection
              title={LEVEL_LABELS[nextLevel] || 'Items'}
              count={children.length}
              defaultOpen={false}
              fill
              expanded={listExpanded}
              onExpandToggle={() => setListExpanded((v) => !v)}
              key={`children-${displayLevel}-${parentId}`}
            >
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
