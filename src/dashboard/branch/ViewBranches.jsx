import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAllEntities } from '../../hooks/useEntity';
import { formatUGX, fmtShort, EASE_OUT_EXPO } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import styles from './ViewBranches.module.css';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getStatus(activeRate) {
  if (activeRate >= 70) return 'good';
  if (activeRate >= 50) return 'warning';
  return 'poor';
}

function perfLevel(pct) {
  if (pct >= 75) return 'high';
  if (pct >= 55) return 'mid';
  return 'low';
}

function getInitials(name) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function getTrend(today, weekAvg) {
  const avg = weekAvg / 7;
  if (today > avg * 1.15) return 'up';
  if (today < avg * 0.85) return 'down';
  return 'flat';
}

const TrendArrow = ({ trend }) => (
  <span className={styles.trendBadge} data-trend={trend}>
    {trend === 'up' && (
      <svg aria-hidden="true" viewBox="0 0 12 12" fill="none" width="10" height="10">
        <path d="M6 9V3M6 3L3 6M6 3l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
    {trend === 'down' && (
      <svg aria-hidden="true" viewBox="0 0 12 12" fill="none" width="10" height="10">
        <path d="M6 3v6M6 9L3 6M6 9l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
    {trend === 'flat' && (
      <svg aria-hidden="true" viewBox="0 0 12 12" fill="none" width="10" height="10">
        <path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )}
  </span>
);

function districtName(branch, districtsMap) {
  return districtsMap[branch.parentId]?.name || '';
}

function regionName(branch, districtsMap, regionsMap) {
  const d = districtsMap[branch.parentId];
  return d ? (regionsMap[d.parentId]?.name || '') : '';
}

function branchAgents(branchId, agentsByBranch) {
  return agentsByBranch[branchId] || [];
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Small reusable SVG icons                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */
const Icons = {
  subscribers: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <circle cx="10" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 18v-.5a6.5 6.5 0 0113 0v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  agents: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <circle cx="7.5" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 17v-.5a5.5 5.5 0 0111 0v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="14.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M18 17v-.5a3.5 3.5 0 00-3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  aum: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <rect x="2" y="7" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 7V5a4 4 0 018 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
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
  phone: (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="12" height="12">
      <path d="M6.2 7.4a6.5 6.5 0 002.4 2.4l1.2-1.2a.8.8 0 01.9-.2c.8.3 1.7.4 2.5.4a.8.8 0 01.8.8v2.6a.8.8 0 01-.8.8A12.2 12.2 0 011 1.8a.8.8 0 01.8-.8h2.6a.8.8 0 01.8.8c0 .8.2 1.7.4 2.5a.8.8 0 01-.2.9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  ),
  email: (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="12" height="12">
      <rect x="1.5" y="3" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.5 4.5L8 9l6.5-4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  person: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="22" height="22">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5 21v-1a7 7 0 0114 0v1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  ),
};

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Rating stars                                                              */
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
/*  Mini bar chart for monthly contributions                                  */
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
/*  KPI card with icon                                                        */
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
/*  Demographics section (shared)                                             */
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
/*  Agent Detail View                                                         */
/* ═══════════════════════════════════════════════════════════════════════════ */
function AgentDetail({ agent }) {
  const m = agent.metrics;
  const level = perfLevel(agent.performance);

  return (
    <div className={styles.detailContent}>
      {/* Profile card */}
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

      {/* KPIs */}
      <div className={styles.kpiRow}>
        <KpiCard icon={Icons.subscribers} label="Subscribers" value={m.totalSubscribers.toLocaleString()} />
        <KpiCard icon={Icons.activeRate} label="Active Rate" value={m.activeRate} suffix="%" />
        <KpiCard icon={Icons.contributions} label="Contributions" value={formatUGX(m.totalContributions)} />
        <KpiCard icon={Icons.aum} label="AUM" value={formatUGX(m.aum)} />
      </div>

      {/* Chart */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Monthly Contributions</div>
        <MiniChart data={m.monthlyContributions} />
      </div>

      {/* Activity */}
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

      {/* Demographics */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Demographics</div>
        <Demographics metrics={m} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Branch Detail View                                                        */
/* ═══════════════════════════════════════════════════════════════════════════ */
function BranchDetail({ branch, onSelectAgent, onEdit, agentsByBranch }) {
  const m = branch.metrics;
  const agents = useMemo(() => branchAgents(branch.id, agentsByBranch), [branch.id, agentsByBranch]);

  return (
    <div className={styles.detailContent}>
      <span className={styles.statusBadge} data-status={branch.status}>
        <span className={styles.statusDot} data-status={branch.status === 'active' ? 'good' : 'poor'} />
        {branch.status === 'active' ? 'Active' : 'Inactive'}
      </span>

      {/* KPIs */}
      <div className={styles.kpiRow}>
        <KpiCard icon={Icons.subscribers} label="Subscribers" value={m.totalSubscribers.toLocaleString()} />
        <KpiCard icon={Icons.agents} label="Agents" value={m.totalAgents} />
        <KpiCard icon={Icons.aum} label="AUM" value={formatUGX(m.aum)} />
        <KpiCard icon={Icons.activeRate} label="Active Rate" value={m.activeRate} suffix="%" />
      </div>

      {/* Branch admin */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Branch Admin</span>
          <button className={styles.editBtn} onClick={() => onEdit('admin')}>
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="12" height="12">
              <path d="M11.5 1.5l3 3L5 14H2v-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            Edit
          </button>
        </div>
        <div className={styles.adminCard}>
          <div className={styles.adminAvatar}>{getInitials(branch.managerName)}</div>
          <div className={styles.adminDetails}>
            <div className={styles.adminName}>{branch.managerName}</div>
            <div className={styles.adminRow}>
              <span className={styles.adminRowIcon}>{Icons.phone}</span>
              <span className={styles.adminRowText}>{branch.managerPhone}</span>
            </div>
            <div className={styles.adminRow}>
              <span className={styles.adminRowIcon}>{Icons.email}</span>
              <span className={styles.adminRowText}>{branch.managerEmail}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Monthly Contributions</div>
        <MiniChart data={m.monthlyContributions} />
      </div>

      {/* Activity */}
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

      {/* Demographics */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Demographics</div>
        <Demographics metrics={m} />
      </div>

      {/* Agents list */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Agents ({agents.length})</span>
        </div>
        <div className={styles.agentList}>
          {agents.map((agent) => {
            const level = perfLevel(agent.performance);
            return (
              <button key={agent.id} className={styles.agentItem} onClick={() => onSelectAgent(agent)}>
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
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Edit Branch Panel                                                         */
/* ═══════════════════════════════════════════════════════════════════════════ */
function EditBranch({ branch, section, onSave, onCancel }) {
  const [name, setName] = useState(branch.managerName);
  const [phone, setPhone] = useState(branch.managerPhone);
  const [email, setEmail] = useState(branch.managerEmail);
  const [branchName, setBranchName] = useState(branch.name);

  function handleSave() {
    if (section === 'admin') {
      onSave({ managerName: name, managerPhone: phone, managerEmail: email });
    } else {
      onSave({ name: branchName });
    }
  }

  return (
    <>
      <div className={styles.detailContent}>
        <div className={styles.editForm}>
          {section === 'admin' ? (
            <>
              <div className={styles.field}>
                <label className={styles.label}>Full Name</label>
                <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Manager name" name="managerName" autoComplete="name" />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Phone Number</label>
                <input className={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+256…" name="phone" type="tel" autoComplete="tel" />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Email Address</label>
                <input className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" name="email" type="email" autoComplete="email" />
              </div>
            </>
          ) : (
            <div className={styles.field}>
              <label className={styles.label}>Branch Name</label>
              <input className={styles.input} value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="Branch name" name="branchName" autoComplete="off" />
            </div>
          )}
        </div>
      </div>
      <div className={styles.footer}>
        <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <div className={styles.footerSpacer} />
        <button className={styles.saveBtn} onClick={handleSave}>Save Changes</button>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  ViewBranches — main panel orchestrator                                    */
/* ═══════════════════════════════════════════════════════════════════════════ */
const SORT_OPTIONS = [
  { key: 'subscribers', label: 'Subscribers', fn: (a, b) => b.metrics.totalSubscribers - a.metrics.totalSubscribers },
  { key: 'activeRate', label: 'Active Rate', fn: (a, b) => b.metrics.activeRate - a.metrics.activeRate },
  { key: 'aum', label: 'AUM', fn: (a, b) => b.metrics.aum - a.metrics.aum },
  { key: 'agents', label: 'Agents', fn: (a, b) => b.metrics.totalAgents - a.metrics.totalAgents },
];

export default function ViewBranches() {
  const { viewBranchesOpen, setViewBranchesOpen, drillTargetBranchId, closeDrillPanel } = useDashboard();

  const [view, setView] = useState('list');
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [editSection, setEditSection] = useState(null);

  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState(null);
  const [regionDropOpen, setRegionDropOpen] = useState(false);
  const [sortKey, setSortKey] = useState('subscribers');
  const [sortDropOpen, setSortDropOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const bodyRef = useRef(null);
  const virtualListRef = useRef(null);
  const regionBtnRef = useRef(null);
  const sortBtnRef = useRef(null);

  const { data: allBranchesRaw = [] } = useAllEntities('branch');
  const { data: allAgentsRaw = [] } = useAllEntities('agent');
  const { data: allDistrictsRaw = [] } = useAllEntities('district');
  const { data: allRegionsRaw = [] } = useAllEntities('region');

  const DISTRICTS_MAP = useMemo(() => Object.fromEntries(allDistrictsRaw.map(d => [d.id, d])), [allDistrictsRaw]);
  const REGIONS_MAP = useMemo(() => Object.fromEntries(allRegionsRaw.map(r => [r.id, r])), [allRegionsRaw]);
  const AGENTS_BY_BRANCH = useMemo(() => {
    const map = {};
    allAgentsRaw.forEach(a => {
      if (!map[a.parentId]) map[a.parentId] = [];
      map[a.parentId].push(a);
    });
    return map;
  }, [allAgentsRaw]);

  const allBranches = allBranchesRaw;

  // Auto-select branch when opened via map drill-down
  useEffect(() => {
    if (viewBranchesOpen && drillTargetBranchId && allBranchesRaw.length > 0) {
      const branch = allBranchesRaw.find(b => b.id === drillTargetBranchId);
      if (branch) {
        setSelectedBranch(branch);
        setView('detail');
      }
    }
  }, [viewBranchesOpen, drillTargetBranchId, allBranchesRaw]);

  function handleClose() {
    if (drillTargetBranchId) closeDrillPanel();
    else setViewBranchesOpen(false);
  }

  // Aggregate stats for summary strip
  const totals = useMemo(() => {
    const t = { subs: 0, agents: 0, aum: 0 };
    allBranches.forEach((b) => {
      t.subs += b.metrics.totalSubscribers;
      t.agents += b.metrics.totalAgents;
      t.aum += b.metrics.aum;
    });
    return t;
  }, [allBranches]);

  const filtered = useMemo(() => {
    let list = allBranches;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((b) =>
        b.name.toLowerCase().includes(q) ||
        districtName(b, DISTRICTS_MAP).toLowerCase().includes(q) ||
        b.managerName.toLowerCase().includes(q)
      );
    }
    if (regionFilter) {
      list = list.filter((b) => {
        const d = DISTRICTS_MAP[b.parentId];
        return d && d.parentId === regionFilter;
      });
    }
    if (statusFilter !== 'all') {
      list = list.filter((b) => b.status === statusFilter);
    }
    const sortOpt = SORT_OPTIONS.find((o) => o.key === sortKey);
    return list.sort(sortOpt ? sortOpt.fn : SORT_OPTIONS[0].fn);
  }, [allBranches, search, regionFilter, statusFilter, sortKey, DISTRICTS_MAP]);

  const regionCounts = useMemo(() => {
    const counts = {};
    allBranches.forEach((b) => {
      const d = DISTRICTS_MAP[b.parentId];
      if (d) counts[d.parentId] = (counts[d.parentId] || 0) + 1;
    });
    return counts;
  }, [allBranches, DISTRICTS_MAP]);

  const regionOptions = allRegionsRaw;

  /* ── Virtualizer for branch list ──────────────────────────────────────── */
  const ESTIMATED_ITEM_HEIGHT = 72; // matches contain-intrinsic-size in CSS
  const ITEM_GAP = 8; // var(--space-2)
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: useCallback(() => bodyRef.current, []),
    estimateSize: useCallback(() => ESTIMATED_ITEM_HEIGHT, []),
    gap: ITEM_GAP,
    overscan: 8,
    scrollMargin: virtualListRef.current?.offsetTop ?? 0,
  });

  useEffect(() => {
    if (viewBranchesOpen) return;
    const t = setTimeout(() => {
      setView('list');
      setSelectedBranch(null);
      setSelectedAgent(null);
      setEditSection(null);
      setSearch('');
      setRegionFilter(null);
      setSortKey('subscribers');
      setStatusFilter('all');
    }, 400);
    return () => clearTimeout(t);
  }, [viewBranchesOpen]);

  useEffect(() => { bodyRef.current?.scrollTo(0, 0); }, [view]);

  /* Escape key to close panel */
  useEffect(() => {
    if (!viewBranchesOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') handleClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [viewBranchesOpen, drillTargetBranchId]);

  useEffect(() => {
    if (!regionDropOpen && !sortDropOpen) return;
    function handler(e) {
      if (regionDropOpen && regionBtnRef.current && !regionBtnRef.current.contains(e.target)) setRegionDropOpen(false);
      if (sortDropOpen && sortBtnRef.current && !sortBtnRef.current.contains(e.target)) setSortDropOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [regionDropOpen, sortDropOpen]);

  function handleSelectBranch(branch) { setSelectedBranch(branch); setView('detail'); }
  function handleSelectAgent(agent) { setSelectedAgent(agent); setView('agent'); }
  function handleEdit(section) { setEditSection(section); setView('edit'); }

  function handleSaveEdit(updates) {
    Object.assign(selectedBranch, updates);
    setView('detail');
  }

  function handleToggleStatus() {
    const action = selectedBranch.status === 'active' ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} this branch?`)) return;
    selectedBranch.status = selectedBranch.status === 'active' ? 'inactive' : 'active';
    setSelectedBranch({ ...selectedBranch });
  }

  function handleBack() {
    if (view === 'edit') { setView('detail'); setEditSection(null); }
    else if (view === 'agent') { setView('detail'); setSelectedAgent(null); }
    else if (view === 'detail') {
      if (drillTargetBranchId) closeDrillPanel();
      else { setView('list'); setSelectedBranch(null); }
    }
  }

  let headerTitle = 'Existing Branches';
  let headerSubtitle = `${allBranches.length} branches across Uganda`;
  if (view === 'detail' && selectedBranch) {
    headerTitle = selectedBranch.name;
    headerSubtitle = `${districtName(selectedBranch, DISTRICTS_MAP)}, ${regionName(selectedBranch, DISTRICTS_MAP, REGIONS_MAP)} Region`;
  } else if (view === 'agent' && selectedAgent) {
    headerTitle = selectedAgent.name;
    headerSubtitle = `Agent at ${selectedBranch?.name || ''}`;
  } else if (view === 'edit') {
    headerTitle = editSection === 'admin' ? 'Edit Branch Admin' : 'Edit Branch Details';
    headerSubtitle = selectedBranch?.name || '';
  }

  return (
    <>
      <AnimatePresence>
        {viewBranchesOpen && (
          <motion.div
            key="vb-backdrop"
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
        {viewBranchesOpen && (
          <motion.div
            key="vb-panel"
            className={styles.panel}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
          >
            {/* ── Header ──────────────────────────────────────────── */}
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

            {/* ── Search + filters (list view) ────────────────────── */}
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
                      placeholder="Search branches, districts, managers…"
                      aria-label="Search branches"
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
                    <button
                      className={styles.filterBtn}
                      data-active={!!regionFilter}
                      onClick={() => setRegionDropOpen((p) => !p)}
                    >
                      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="12" height="12">
                        <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      {regionFilter ? REGIONS_MAP[regionFilter]?.name : 'Region'}
                    </button>
                    <AnimatePresence>
                      {regionDropOpen && (
                        <motion.div
                          className={styles.filterDropdown}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.12 }}
                        >
                          <button
                            className={styles.filterOption}
                            data-selected={!regionFilter}
                            onClick={() => { setRegionFilter(null); setRegionDropOpen(false); }}
                          >
                            All Regions
                            <span className={styles.filterCount}>{allBranches.length}</span>
                          </button>
                          {regionOptions.map((r) => (
                            <button
                              key={r.id}
                              className={styles.filterOption}
                              data-selected={regionFilter === r.id}
                              onClick={() => { setRegionFilter(r.id); setRegionDropOpen(false); }}
                            >
                              {r.name}
                              <span className={styles.filterCount}>{regionCounts[r.id] || 0}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div style={{ position: 'relative' }} ref={sortBtnRef}>
                    <button
                      className={styles.filterBtn}
                      data-active={sortKey !== 'subscribers'}
                      onClick={() => setSortDropOpen((p) => !p)}
                    >
                      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="12" height="12">
                        <path d="M4 2v12M4 14l-3-3M4 14l3-3M12 14V2M12 2l-3 3M12 2l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {SORT_OPTIONS.find((o) => o.key === sortKey)?.label || 'Sort'}
                    </button>
                    <AnimatePresence>
                      {sortDropOpen && (
                        <motion.div
                          className={styles.filterDropdown}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.12 }}
                        >
                          {SORT_OPTIONS.map((opt) => (
                            <button
                              key={opt.key}
                              className={styles.filterOption}
                              data-selected={sortKey === opt.key}
                              onClick={() => { setSortKey(opt.key); setSortDropOpen(false); }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* ── Status filter chips ────────────────────────── */}
                <div className={styles.statusChips}>
                  {['all', 'active', 'inactive'].map((s) => (
                    <button
                      key={s}
                      className={styles.statusChip}
                      data-active={statusFilter === s}
                      onClick={() => setStatusFilter(s)}
                    >
                      {s === 'all' ? 'All' : s === 'active' ? 'Active' : 'Inactive'}
                    </button>
                  ))}
                </div>

                {/* ── Summary strip ───────────────────────────────── */}
                <div className={styles.summaryStrip}>
                  <div className={styles.summaryChip}>
                    <span className={styles.summaryChipIcon}>{Icons.subscribers}</span>
                    <span className={styles.summaryChipValue}>{totals.subs.toLocaleString()}</span>
                    <span className={styles.summaryChipLabel}>Subscribers</span>
                  </div>
                  <div className={styles.summaryChip}>
                    <span className={styles.summaryChipIcon}>{Icons.agents}</span>
                    <span className={styles.summaryChipValue}>{totals.agents.toLocaleString()}</span>
                    <span className={styles.summaryChipLabel}>Agents</span>
                  </div>
                  <div className={styles.summaryChip}>
                    <span className={styles.summaryChipIcon}>{Icons.aum}</span>
                    <span className={styles.summaryChipValue}>{fmtShort(totals.aum)}</span>
                    <span className={styles.summaryChipLabel}>AUM</span>
                  </div>
                </div>
              </>
            )}

            {/* ── Body ────────────────────────────────────────────── */}
            <div className={styles.body} ref={bodyRef}>
              <AnimatePresence mode="wait">
                {/* ─── List View ─────────────────────────────────── */}
                {view === 'list' && (
                  <motion.div
                    key="v-list"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                  >
                    <div className={styles.listCount}>
                      Showing {filtered.length} of {allBranches.length} branches
                    </div>

                    {filtered.length === 0 ? (
                      <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>
                          <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" width="48" height="48">
                            <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M16 20h16M16 28h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </div>
                        <div className={styles.emptyTitle}>No branches found</div>
                        <div className={styles.emptyDesc}>Try adjusting your search or filters</div>
                      </div>
                    ) : (
                      <div
                        ref={virtualListRef}
                        className={styles.virtualList}
                        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                      >
                          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const branch = filtered[virtualRow.index];
                            return (
                              <button
                                key={branch.id}
                                className={styles.branchItem}
                                onClick={() => handleSelectBranch(branch)}
                                data-index={virtualRow.index}
                                ref={rowVirtualizer.measureElement}
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                  width: '100%',
                                  transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`,
                                }}
                              >
                                <span className={styles.branchAccent} data-status={getStatus(branch.metrics.activeRate)} />
                                <div className={styles.branchInfo}>
                                  <div className={styles.branchName}>{branch.name}</div>
                                  <div className={styles.branchLocation}>{districtName(branch, DISTRICTS_MAP)}, {regionName(branch, DISTRICTS_MAP, REGIONS_MAP)}</div>
                                  <div className={styles.branchActiveBar}>
                                    <div className={styles.branchActiveBarFill} data-status={getStatus(branch.metrics.activeRate)} style={{ width: `${branch.metrics.activeRate}%` }} />
                                  </div>
                                </div>
                                <div className={styles.branchStats}>
                                  <div className={styles.stat}>
                                    <span className={styles.statValue}>{branch.metrics.totalAgents}</span>
                                    <span className={styles.statLabel}>Agents</span>
                                  </div>
                                  <div className={styles.stat}>
                                    <span className={styles.statValue}>{branch.metrics.totalSubscribers}</span>
                                    <span className={styles.statLabel}>Subs</span>
                                  </div>
                                  <div className={styles.stat}>
                                    <span className={styles.statValue}>{branch.metrics.activeRate}%</span>
                                    <span className={styles.statLabel}>Active</span>
                                  </div>
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
                    {/* Bottom padding for scrolling past bottom cards */}
                    <div style={{ height: 'var(--space-4)' }} />
                  </motion.div>
                )}

                {/* ─── Branch Detail View ────────────────────────── */}
                {view === 'detail' && selectedBranch && (
                  <motion.div
                    key="v-detail"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                  >
                    <BranchDetail branch={selectedBranch} onSelectAgent={handleSelectAgent} onEdit={handleEdit} agentsByBranch={AGENTS_BY_BRANCH} />
                  </motion.div>
                )}

                {/* ─── Agent Detail View ─────────────────────────── */}
                {view === 'agent' && selectedAgent && (
                  <motion.div
                    key="v-agent"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                  >
                    <AgentDetail agent={selectedAgent} />
                  </motion.div>
                )}

                {/* ─── Edit View ─────────────────────────────────── */}
                {view === 'edit' && selectedBranch && (
                  <motion.div
                    key="v-edit"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                    style={{ display: 'flex', flexDirection: 'column', flex: 1 }}
                  >
                    <EditBranch branch={selectedBranch} section={editSection} onSave={handleSaveEdit} onCancel={handleBack} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Footer (detail view — toggle status) ────────────── */}
            {view === 'detail' && selectedBranch && (
              <div className={styles.footer}>
                {selectedBranch.status === 'active' ? (
                  <button className={styles.deactivateBtn} onClick={handleToggleStatus}>Deactivate Branch</button>
                ) : (
                  <button className={styles.activateBtn} onClick={handleToggleStatus}>Activate Branch</button>
                )}
                <div className={styles.footerSpacer} />
                <button className={styles.editBtn} onClick={() => handleEdit('details')}>
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="12" height="12">
                    <path d="M11.5 1.5l3 3L5 14H2v-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                  Edit Details
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
