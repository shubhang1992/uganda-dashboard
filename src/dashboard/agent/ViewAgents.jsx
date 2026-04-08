import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAllEntities } from '../../hooks/useEntity';
import { formatUGX, fmtShort, EASE_OUT_EXPO } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import styles from './ViewAgents.module.css';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function perfLevel(pct) {
  if (pct >= 75) return 'high';
  if (pct >= 55) return 'mid';
  return 'low';
}

function getInitials(name) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function branchName(agent, branchesMap) {
  return branchesMap[agent.parentId]?.name || '';
}

function districtOfAgent(agent, branchesMap, districtsMap) {
  const b = branchesMap[agent.parentId];
  return b ? (districtsMap[b.parentId]?.name || '') : '';
}

function regionOfAgent(agent, branchesMap, districtsMap, regionsMap) {
  const b = branchesMap[agent.parentId];
  if (!b) return '';
  const d = districtsMap[b.parentId];
  return d ? (regionsMap[d.parentId]?.name || '') : '';
}

function getTrend(today, weekAvg) {
  const avg = weekAvg / 7;
  if (today > avg * 1.15) return 'up';
  if (today < avg * 0.85) return 'down';
  return 'flat';
}

const SORT_OPTIONS = [
  { key: 'subscribers', label: 'Subscribers', fn: (a, b) => b.metrics.totalSubscribers - a.metrics.totalSubscribers },
  { key: 'performance', label: 'Performance', fn: (a, b) => b.performance - a.performance },
  { key: 'activeRate', label: 'Active Rate', fn: (a, b) => b.metrics.activeRate - a.metrics.activeRate },
  { key: 'rating', label: 'Rating', fn: (a, b) => b.rating - a.rating },
];

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Icons                                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */
const Icons = {
  subscribers: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <circle cx="10" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 18v-.5a6.5 6.5 0 0113 0v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  activeRate: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <path d="M10 2a8 8 0 110 16 8 8 0 010-16z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  contributions: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <path d="M2 18V6l4-4h8l4 4v12" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M2 10h16" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 10v8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  aum: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <rect x="2" y="7" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 7V5a4 4 0 018 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  phone: (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="12" height="12">
      <path d="M6.2 7.4a6.5 6.5 0 002.4 2.4l1.2-1.2a.8.8 0 01.9-.2c.8.3 1.7.4 2.5.4a.8.8 0 01.8.8v2.6a.8.8 0 01-.8.8A12.2 12.2 0 011 1.8a.8.8 0 01.8-.8h2.6a.8.8 0 01.8.8c0 .8.2 1.7.4 2.5a.8.8 0 01-.2.9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  ),
};

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Stars                                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */
function Stars({ rating }) {
  const full = Math.round(rating);
  return (
    <div className={styles.ratingWrap}>
      {[1,2,3,4,5].map((i) => (
        <svg aria-hidden="true" key={i} viewBox="0 0 16 16" width="12" height="12" className={styles.ratingStar} data-filled={i <= full}>
          <path d="M8 1.5l1.76 3.56 3.93.57-2.84 2.77.67 3.91L8 10.27 4.48 12.31l.67-3.91L2.31 5.63l3.93-.57z"
            fill={i <= full ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
        </svg>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MiniChart                                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */
function MiniChart({ data }) {
  const max = Math.max(...data, 1);
  const peakIdx = data.indexOf(max);
  return (
    <div className={styles.chartWrap}>
      <div className={styles.chartBars}>
        {data.map((v, i) => (
          <div key={i} className={styles.chartBar} data-peak={i === peakIdx} style={{ height: `${Math.max((v / max) * 100, 4)}%` }} title={`${MONTHS[i]}: ${formatUGX(v)}`} />
        ))}
      </div>
      <div className={styles.chartLabels}>
        {MONTHS.map((m) => <span key={m} className={styles.chartLabel}>{m}</span>)}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  KpiCard                                                                   */
/* ═══════════════════════════════════════════════════════════════════════════ */
function KpiCard({ icon, label, value, suffix }) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiIcon}>{icon}</div>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={styles.kpiValue}>{value}{suffix && <span className={styles.kpiSuffix}>{suffix}</span>}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Demographics                                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */
function Demographics({ metrics }) {
  const m = metrics;
  const ageTotal = Object.values(m.ageDistribution).reduce((s, x) => s + x, 0);
  return (
    <div className={styles.demoRow}>
      <div className={styles.demoCard}>
        <div className={styles.demoTitle}>Gender</div>
        {['male', 'female', 'other'].map((g) => (
          <div key={g} className={styles.demoItem}>
            <span className={styles.demoItemLabel} style={{ textTransform: 'capitalize' }}>{g}</span>
            <div className={styles.demoBar}><div className={styles.demoBarFill} style={{ width: `${m.genderRatio[g]}%` }} /></div>
            <span className={styles.demoItemValue}>{m.genderRatio[g]}%</span>
          </div>
        ))}
      </div>
      <div className={styles.demoCard}>
        <div className={styles.demoTitle}>Age</div>
        {Object.entries(m.ageDistribution).map(([k, v]) => {
          const pct = ageTotal ? Math.round((v / ageTotal) * 100) : 0;
          return (
            <div key={k} className={styles.demoItem}>
              <span className={styles.demoItemLabel}>{k}</span>
              <div className={styles.demoBar}><div className={styles.demoBarFill} style={{ width: `${pct}%` }} /></div>
              <span className={styles.demoItemValue}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TrendArrow                                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */
const TrendArrow = ({ trend }) => (
  <span className={styles.trendBadge} data-trend={trend}>
    {trend === 'up' && <svg aria-hidden="true" viewBox="0 0 12 12" fill="none" width="10" height="10"><path d="M6 9V3M6 3L3 6M6 3l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    {trend === 'down' && <svg aria-hidden="true" viewBox="0 0 12 12" fill="none" width="10" height="10"><path d="M6 3v6M6 9L3 6M6 9l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    {trend === 'flat' && <svg aria-hidden="true" viewBox="0 0 12 12" fill="none" width="10" height="10"><path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>}
  </span>
);

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Agent Detail                                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */
function AgentDetail({ agent, branchesMap, districtsMap, regionsMap }) {
  const m = agent.metrics;
  const level = perfLevel(agent.performance);

  return (
    <div className={styles.detailContent}>
      <div className={styles.profileCard}>
        <div className={styles.profileAvatar}>{getInitials(agent.name)}</div>
        <div className={styles.profileInfo}>
          <div className={styles.profileName}>{agent.name}</div>
          <div className={styles.profileMeta}>
            <span className={styles.agentStatus} data-status={agent.status} />
            <span style={{ textTransform: 'capitalize' }}>{agent.status}</span>
            <span>&middot;</span>
            <span>{agent.phone}</span>
          </div>
          <div className={styles.profileRating}>
            <Stars rating={agent.rating} />
            <span className={styles.profileRatingValue}>{agent.rating.toFixed(1)}</span>
            <span className={styles.profilePerfBadge} data-level={level}>{agent.performance}%</span>
          </div>
        </div>
      </div>

      <div className={styles.kpiRow}>
        <KpiCard icon={Icons.subscribers} label="Subscribers" value={m.totalSubscribers.toLocaleString()} />
        <KpiCard icon={Icons.activeRate} label="Active Rate" value={m.activeRate} suffix="%" />
        <KpiCard icon={Icons.contributions} label="Contributions" value={formatUGX(m.totalContributions)} />
        <KpiCard icon={Icons.aum} label="AUM" value={formatUGX(m.aum)} />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Branch Assignment</div>
        <div className={styles.infoCard}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Branch</span>
            <span className={styles.infoValue}>{branchName(agent, branchesMap)}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>District</span>
            <span className={styles.infoValue}>{districtOfAgent(agent, branchesMap, districtsMap)}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Region</span>
            <span className={styles.infoValue}>{regionOfAgent(agent, branchesMap, districtsMap, regionsMap)}</span>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Monthly Contributions</div>
        <MiniChart data={m.monthlyContributions} />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Activity</div>
        <div className={styles.infoCard}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>New today</span>
            <span className={styles.infoValue}>
              {m.newSubscribersToday} subscribers
              <TrendArrow trend={getTrend(m.newSubscribersToday, m.newSubscribersThisWeek)} />
            </span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>This week</span>
            <span className={styles.infoValue}>{m.newSubscribersThisWeek} subscribers</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>This month</span>
            <span className={styles.infoValue}>{m.newSubscribersThisMonth} subscribers</span>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Demographics</div>
        <Demographics metrics={m} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  ViewAgents — main panel                                                   */
/* ═══════════════════════════════════════════════════════════════════════════ */
export default function ViewAgents() {
  const { viewAgentsOpen, setViewAgentsOpen, drillTargetAgentId, closeDrillPanel } = useDashboard();

  const { data: allAgentsRaw = [] } = useAllEntities('agent');
  const { data: allBranchesRaw = [] } = useAllEntities('branch');
  const { data: allDistrictsRaw = [] } = useAllEntities('district');
  const { data: allRegionsRaw = [] } = useAllEntities('region');

  const BRANCHES_MAP = useMemo(() => Object.fromEntries(allBranchesRaw.map(b => [b.id, b])), [allBranchesRaw]);
  const DISTRICTS_MAP = useMemo(() => Object.fromEntries(allDistrictsRaw.map(d => [d.id, d])), [allDistrictsRaw]);
  const REGIONS_MAP = useMemo(() => Object.fromEntries(allRegionsRaw.map(r => [r.id, r])), [allRegionsRaw]);

  const [view, setView] = useState('list');
  const [selectedAgent, setSelectedAgent] = useState(null);

  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState(null);
  const [regionDropOpen, setRegionDropOpen] = useState(false);
  const [sortKey, setSortKey] = useState('subscribers');
  const [sortDropOpen, setSortDropOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const bodyRef = useRef(null);
  const regionBtnRef = useRef(null);
  const sortBtnRef = useRef(null);

  const allAgents = allAgentsRaw;

  // Auto-select agent when opened via map drill-down
  useEffect(() => {
    if (viewAgentsOpen && drillTargetAgentId && allAgentsRaw.length > 0) {
      const agent = allAgentsRaw.find(a => a.id === drillTargetAgentId);
      if (agent) {
        setSelectedAgent(agent);
        setView('detail');
      }
    }
  }, [viewAgentsOpen, drillTargetAgentId, allAgentsRaw]);

  function handleClose() {
    if (drillTargetAgentId) closeDrillPanel();
    else setViewAgentsOpen(false);
  }

  const totals = useMemo(() => {
    const t = { subs: 0, aum: 0 };
    allAgents.forEach((a) => {
      t.subs += a.metrics.totalSubscribers;
      t.aum += a.metrics.aum;
    });
    return t;
  }, [allAgents]);

  const filtered = useMemo(() => {
    let list = allAgents;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((a) =>
        a.name.toLowerCase().includes(q) ||
        branchName(a, BRANCHES_MAP).toLowerCase().includes(q) ||
        districtOfAgent(a, BRANCHES_MAP, DISTRICTS_MAP).toLowerCase().includes(q)
      );
    }
    if (regionFilter) {
      list = list.filter((a) => {
        const b = BRANCHES_MAP[a.parentId];
        if (!b) return false;
        const d = DISTRICTS_MAP[b.parentId];
        return d && d.parentId === regionFilter;
      });
    }
    if (statusFilter !== 'all') {
      list = list.filter((a) => a.status === statusFilter);
    }
    const sortOpt = SORT_OPTIONS.find((o) => o.key === sortKey);
    return list.sort(sortOpt ? sortOpt.fn : SORT_OPTIONS[0].fn);
  }, [allAgents, search, regionFilter, statusFilter, sortKey, BRANCHES_MAP, DISTRICTS_MAP]);

  const regionOptions = allRegionsRaw;

  const regionCounts = useMemo(() => {
    const counts = {};
    allAgents.forEach((a) => {
      const b = BRANCHES_MAP[a.parentId];
      if (!b) return;
      const d = DISTRICTS_MAP[b.parentId];
      if (d) counts[d.parentId] = (counts[d.parentId] || 0) + 1;
    });
    return counts;
  }, [allAgents, BRANCHES_MAP, DISTRICTS_MAP]);

  const estimateSize = useCallback(() => 72, []);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => bodyRef.current,
    estimateSize,
    overscan: 10,
  });

  useEffect(() => {
    if (viewAgentsOpen) return;
    const t = setTimeout(() => {
      setView('list');
      setSelectedAgent(null);
      setSearch('');
      setRegionFilter(null);
      setSortKey('subscribers');
      setStatusFilter('all');
    }, 400);
    return () => clearTimeout(t);
  }, [viewAgentsOpen]);

  useEffect(() => { bodyRef.current?.scrollTo(0, 0); }, [view]);

  useEffect(() => {
    if (!viewAgentsOpen) return;
    function onKey(e) { if (e.key === 'Escape') handleClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [viewAgentsOpen, setViewAgentsOpen]);

  useEffect(() => {
    if (!regionDropOpen && !sortDropOpen) return;
    function handler(e) {
      if (regionDropOpen && regionBtnRef.current && !regionBtnRef.current.contains(e.target)) setRegionDropOpen(false);
      if (sortDropOpen && sortBtnRef.current && !sortBtnRef.current.contains(e.target)) setSortDropOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [regionDropOpen, sortDropOpen]);

  function handleSelectAgent(agent) { setSelectedAgent(agent); setView('detail'); }
  function handleBack() {
    if (drillTargetAgentId) closeDrillPanel();
    else { setView('list'); setSelectedAgent(null); }
  }

  let headerTitle = 'Existing Agents';
  let headerSubtitle = `${allAgents.length} agents across Uganda`;
  if (view === 'detail' && selectedAgent) {
    headerTitle = selectedAgent.name;
    headerSubtitle = `Agent at ${branchName(selectedAgent, BRANCHES_MAP)}`;
  }

  return (
    <>
      <AnimatePresence>
        {viewAgentsOpen && (
          <motion.div
            key="va-backdrop"
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={handleClose}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewAgentsOpen && (
          <motion.div
            key="va-panel"
            className={styles.panel}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
          >
            {/* Header */}
            <div className={styles.header} data-view={view}>
              <div className={styles.headerTop}>
                {view !== 'list' && (
                  <button className={styles.backBtn} onClick={handleBack} aria-label="Go back">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                      <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
                <div style={{ flex: 1 }}>
                  <AnimatePresence mode="wait">
                    <motion.h2
                      key={headerTitle}
                      className={styles.title}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                    >
                      {headerTitle}
                    </motion.h2>
                  </AnimatePresence>
                  <p className={styles.subtitle}>{headerSubtitle}</p>
                </div>
                <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Toolbar (list view) */}
            {view === 'list' && (
              <>
                <div className={styles.toolbar}>
                  <div className={styles.searchWrap}>
                    <span className={styles.searchIcon}>
                      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="14" height="14">
                        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M14 14l-3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </span>
                    <input
                      className={styles.searchInput}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search agents, branches, districts…"
                      aria-label="Search agents"
                      name="search"
                      autoComplete="off"
                    />
                    {search && (
                      <button className={styles.searchClear} onClick={() => setSearch('')} aria-label="Clear search">
                        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="12" height="12">
                          <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div style={{ position: 'relative' }} ref={regionBtnRef}>
                    <button className={styles.filterBtn} data-active={!!regionFilter} onClick={() => setRegionDropOpen((p) => !p)}>
                      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="12" height="12"><path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                      {regionFilter ? REGIONS_MAP[regionFilter]?.name : 'Region'}
                    </button>
                    <AnimatePresence>
                      {regionDropOpen && (
                        <motion.div className={styles.filterDropdown} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}>
                          <button className={styles.filterOption} data-selected={!regionFilter} onClick={() => { setRegionFilter(null); setRegionDropOpen(false); }}>
                            All Regions <span className={styles.filterCount}>{allAgents.length}</span>
                          </button>
                          {regionOptions.map((r) => (
                            <button key={r.id} className={styles.filterOption} data-selected={regionFilter === r.id} onClick={() => { setRegionFilter(r.id); setRegionDropOpen(false); }}>
                              {r.name} <span className={styles.filterCount}>{regionCounts[r.id] || 0}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div style={{ position: 'relative' }} ref={sortBtnRef}>
                    <button className={styles.filterBtn} data-active={sortKey !== 'subscribers'} onClick={() => setSortDropOpen((p) => !p)}>
                      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="12" height="12"><path d="M4 2v12M4 14l-3-3M4 14l3-3M12 14V2M12 2l-3 3M12 2l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      {SORT_OPTIONS.find((o) => o.key === sortKey)?.label || 'Sort'}
                    </button>
                    <AnimatePresence>
                      {sortDropOpen && (
                        <motion.div className={styles.filterDropdown} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}>
                          {SORT_OPTIONS.map((opt) => (
                            <button key={opt.key} className={styles.filterOption} data-selected={sortKey === opt.key} onClick={() => { setSortKey(opt.key); setSortDropOpen(false); }}>
                              {opt.label}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className={styles.statusChips}>
                  {['all', 'active', 'inactive'].map((s) => (
                    <button key={s} className={styles.statusChip} data-active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                      {s === 'all' ? 'All' : s === 'active' ? 'Active' : 'Inactive'}
                    </button>
                  ))}
                </div>

                <div className={styles.summaryStrip}>
                  <div className={styles.summaryChip}>
                    <span className={styles.summaryChipIcon}>{Icons.subscribers}</span>
                    <span className={styles.summaryChipValue}>{allAgents.length.toLocaleString()}</span>
                    <span className={styles.summaryChipLabel}>Agents</span>
                  </div>
                  <div className={styles.summaryChip}>
                    <span className={styles.summaryChipIcon}>{Icons.subscribers}</span>
                    <span className={styles.summaryChipValue}>{totals.subs.toLocaleString()}</span>
                    <span className={styles.summaryChipLabel}>Subscribers</span>
                  </div>
                  <div className={styles.summaryChip}>
                    <span className={styles.summaryChipIcon}>{Icons.aum}</span>
                    <span className={styles.summaryChipValue}>{fmtShort(totals.aum)}</span>
                    <span className={styles.summaryChipLabel}>AUM</span>
                  </div>
                </div>
              </>
            )}

            {/* Body */}
            <div className={styles.body} ref={bodyRef}>
              <AnimatePresence mode="wait">
                {view === 'list' && (
                  <motion.div key="va-list" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}>
                    <div className={styles.listCount}>Showing {filtered.length} of {allAgents.length} agents</div>

                    {filtered.length === 0 ? (
                      <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>
                          <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" width="48" height="48">
                            <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M16 20h16M16 28h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </div>
                        <div className={styles.emptyTitle}>No agents found</div>
                        <div className={styles.emptyDesc}>Try adjusting your search or filters</div>
                      </div>
                    ) : (
                      <div
                        className={styles.virtualList}
                        style={{ height: `${virtualizer.getTotalSize()}px` }}
                      >
                        {virtualizer.getVirtualItems().map((virtualRow) => {
                          const agent = filtered[virtualRow.index];
                          const level = perfLevel(agent.performance);
                          return (
                            <button
                              key={agent.id}
                              className={styles.agentItem}
                              onClick={() => handleSelectAgent(agent)}
                              data-index={virtualRow.index}
                              ref={virtualizer.measureElement}
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                transform: `translateY(${virtualRow.start}px)`,
                              }}
                            >
                                <div className={styles.agentAvatar}>{getInitials(agent.name)}</div>
                                <div className={styles.agentInfo}>
                                  <div className={styles.agentName}>{agent.name}</div>
                                  <div className={styles.agentMeta}>
                                    <span className={styles.agentStatus} data-status={agent.status} />
                                    <span>{branchName(agent, BRANCHES_MAP)}</span>
                                    <span>&middot;</span>
                                    <Stars rating={agent.rating} />
                                  </div>
                                </div>
                                <div className={styles.agentStats}>
                                  <div className={styles.stat}>
                                    <span className={styles.statValue}>{agent.metrics.totalSubscribers}</span>
                                    <span className={styles.statLabel}>Subs</span>
                                  </div>
                                  <span className={styles.agentPerf} data-level={level}>{agent.performance}%</span>
                                </div>
                                <span className={styles.chevron}>
                                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="14" height="14">
                                    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                    )}
                  </motion.div>
                )}

                {view === 'detail' && selectedAgent && (
                  <motion.div key="va-detail" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}>
                    <AgentDetail agent={selectedAgent} branchesMap={BRANCHES_MAP} districtsMap={DISTRICTS_MAP} regionsMap={REGIONS_MAP} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
