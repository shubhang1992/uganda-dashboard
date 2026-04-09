import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAllEntities } from '../../hooks/useEntity';
import { formatUGX, fmtShort, EASE_OUT_EXPO } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import { getInitials } from '../../utils/dashboard';
import styles from './ViewSubscribers.module.css';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function agentName(sub, agentsMap) {
  return agentsMap[sub.parentId]?.name || '';
}

function branchOfSubscriber(sub, agentsMap, branchesMap) {
  const a = agentsMap[sub.parentId];
  return a ? (branchesMap[a.parentId]?.name || '') : '';
}

function districtOfSubscriber(sub, agentsMap, branchesMap, districtsMap) {
  const a = agentsMap[sub.parentId];
  if (!a) return '';
  const b = branchesMap[a.parentId];
  return b ? (districtsMap[b.parentId]?.name || '') : '';
}

function regionOfSubscriber(sub, agentsMap, branchesMap, districtsMap, regionsMap) {
  const a = agentsMap[sub.parentId];
  if (!a) return '';
  const b = branchesMap[a.parentId];
  if (!b) return '';
  const d = districtsMap[b.parentId];
  return d ? (regionsMap[d.parentId]?.name || '') : '';
}

const SORT_OPTIONS = [
  { key: 'contributions', label: 'Contributions', fn: (a, b) => b.totalContributions - a.totalContributions },
  { key: 'recent', label: 'Recently Joined', fn: (a, b) => b.registeredDate.localeCompare(a.registeredDate) },
  { key: 'age', label: 'Age', fn: (a, b) => a.age - b.age },
  { key: 'balance', label: 'Balance', fn: (a, b) => (b.totalContributions - b.totalWithdrawals) - (a.totalContributions - a.totalWithdrawals) },
];

const KYC_LABELS = { complete: 'Complete', pending: 'Pending', incomplete: 'Incomplete' };

function activityLevel(monthsActive) {
  if (monthsActive >= 10) return 'high';
  if (monthsActive >= 6) return 'mid';
  return 'low';
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Icons                                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */
const Icons = {
  contributions: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <path d="M2 18V6l4-4h8l4 4v12" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M2 10h16" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 10v8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  balance: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <rect x="2" y="7" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 7V5a4 4 0 018 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  products: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8h14" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 8v9" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  calendar: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8h14" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 2v4M13 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
};

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
/*  KYC Badge                                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */
function KycBadge({ status }) {
  return (
    <span className={styles.kycBadge} data-kyc={status}>
      {KYC_LABELS[status] || status}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Product tag                                                               */
/* ═══════════════════════════════════════════════════════════════════════════ */
function ProductTag({ name }) {
  return <span className={styles.productTag}>{name}</span>;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Subscriber Detail                                                         */
/* ═══════════════════════════════════════════════════════════════════════════ */
function SubscriberDetail({ subscriber, agentsMap, branchesMap, districtsMap, regionsMap }) {
  const s = subscriber;
  const balance = s.totalContributions - s.totalWithdrawals;
  const monthsActive = s.contributionHistory.filter(v => v > 0).length;

  return (
    <div className={styles.detailContent}>
      <div className={styles.profileCard}>
        <div className={styles.profileAvatar}>{getInitials(s.name)}</div>
        <div className={styles.profileInfo}>
          <div className={styles.profileName}>{s.name}</div>
          <div className={styles.profileMeta}>
            <span className={styles.subStatus} data-status={s.isActive ? 'active' : 'inactive'} />
            <span style={{ textTransform: 'capitalize' }}>{s.isActive ? 'Active' : 'Inactive'}</span>
            <span>&middot;</span>
            <span>{s.gender}, {s.age} yrs</span>
          </div>
          <div className={styles.profileBadges}>
            <KycBadge status={s.kycStatus} />
          </div>
        </div>
      </div>

      <div className={styles.kpiRow}>
        <KpiCard icon={Icons.contributions} label="Contributions" value={formatUGX(s.totalContributions)} />
        <KpiCard icon={Icons.balance} label="Balance" value={formatUGX(balance)} />
        <KpiCard icon={Icons.products} label="Products" value={s.productsHeld.length} />
        <KpiCard icon={Icons.calendar} label="Months Active" value={monthsActive} suffix="/12" />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Contact</div>
        <div className={styles.infoCard}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Phone</span>
            <span className={styles.infoValue}>{s.phone}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Email</span>
            <span className={styles.infoValue}>{s.email}</span>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Agent Assignment</div>
        <div className={styles.infoCard}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Agent</span>
            <span className={styles.infoValue}>{agentName(s, agentsMap)}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Branch</span>
            <span className={styles.infoValue}>{branchOfSubscriber(s, agentsMap, branchesMap)}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>District</span>
            <span className={styles.infoValue}>{districtOfSubscriber(s, agentsMap, branchesMap, districtsMap)}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Region</span>
            <span className={styles.infoValue}>{regionOfSubscriber(s, agentsMap, branchesMap, districtsMap, regionsMap)}</span>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Monthly Contributions</div>
        <MiniChart data={s.contributionHistory} />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Products Held</div>
        <div className={styles.productsWrap}>
          {s.productsHeld.map((p) => <ProductTag key={p} name={p} />)}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Registration</div>
        <div className={styles.infoCard}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Joined</span>
            <span className={styles.infoValue}>{s.registeredDate}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>KYC Status</span>
            <span className={styles.infoValue}><KycBadge status={s.kycStatus} /></span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  ViewSubscribers — main panel                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */
export default function ViewSubscribers() {
  const { viewSubscribersOpen, setViewSubscribersOpen } = useDashboard();

  const { data: allSubsRaw = [] } = useAllEntities('subscriber');
  const { data: allAgentsRaw = [] } = useAllEntities('agent');
  const { data: allBranchesRaw = [] } = useAllEntities('branch');
  const { data: allDistrictsRaw = [] } = useAllEntities('district');
  const { data: allRegionsRaw = [] } = useAllEntities('region');

  const AGENTS_MAP = useMemo(() => Object.fromEntries(allAgentsRaw.map(a => [a.id, a])), [allAgentsRaw]);
  const BRANCHES_MAP = useMemo(() => Object.fromEntries(allBranchesRaw.map(b => [b.id, b])), [allBranchesRaw]);
  const DISTRICTS_MAP = useMemo(() => Object.fromEntries(allDistrictsRaw.map(d => [d.id, d])), [allDistrictsRaw]);
  const REGIONS_MAP = useMemo(() => Object.fromEntries(allRegionsRaw.map(r => [r.id, r])), [allRegionsRaw]);

  const [view, setView] = useState('list');
  const [selectedSub, setSelectedSub] = useState(null);

  const [search, setSearch] = useState('');
  const [kycFilter, setKycFilter] = useState(null);
  const [kycDropOpen, setKycDropOpen] = useState(false);
  const [sortKey, setSortKey] = useState('contributions');
  const [sortDropOpen, setSortDropOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const bodyRef = useRef(null);
  const kycBtnRef = useRef(null);
  const sortBtnRef = useRef(null);

  const allSubs = allSubsRaw;

  function handleClose() {
    setViewSubscribersOpen(false);
  }

  const totals = useMemo(() => {
    const t = { contribs: 0, active: 0 };
    allSubs.forEach((s) => {
      t.contribs += s.totalContributions;
      if (s.isActive) t.active++;
    });
    return t;
  }, [allSubs]);

  const filtered = useMemo(() => {
    let list = allSubs;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        agentName(s, AGENTS_MAP).toLowerCase().includes(q) ||
        branchOfSubscriber(s, AGENTS_MAP, BRANCHES_MAP).toLowerCase().includes(q)
      );
    }
    if (kycFilter) {
      list = list.filter((s) => s.kycStatus === kycFilter);
    }
    if (statusFilter !== 'all') {
      const isActive = statusFilter === 'active';
      list = list.filter((s) => s.isActive === isActive);
    }
    const sortOpt = SORT_OPTIONS.find((o) => o.key === sortKey);
    return list.sort(sortOpt ? sortOpt.fn : SORT_OPTIONS[0].fn);
  }, [allSubs, search, kycFilter, statusFilter, sortKey, AGENTS_MAP, BRANCHES_MAP]);

  const kycCounts = useMemo(() => {
    const counts = { complete: 0, pending: 0, incomplete: 0 };
    allSubs.forEach((s) => { counts[s.kycStatus] = (counts[s.kycStatus] || 0) + 1; });
    return counts;
  }, [allSubs]);

  const estimateSize = useCallback(() => 72, []);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => bodyRef.current,
    estimateSize,
    overscan: 10,
  });

  // Reset state after panel closes
  useEffect(() => {
    if (viewSubscribersOpen) return;
    const t = setTimeout(() => {
      setView('list');
      setSelectedSub(null);
      setSearch('');
      setKycFilter(null);
      setSortKey('contributions');
      setStatusFilter('all');
    }, 400);
    return () => clearTimeout(t);
  }, [viewSubscribersOpen]);

  useEffect(() => { bodyRef.current?.scrollTo(0, 0); }, [view]);

  // Escape key handler
  useEffect(() => {
    if (!viewSubscribersOpen) return;
    function onKey(e) { if (e.key === 'Escape') handleClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [viewSubscribersOpen]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!kycDropOpen && !sortDropOpen) return;
    function handler(e) {
      if (kycDropOpen && kycBtnRef.current && !kycBtnRef.current.contains(e.target)) setKycDropOpen(false);
      if (sortDropOpen && sortBtnRef.current && !sortBtnRef.current.contains(e.target)) setSortDropOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [kycDropOpen, sortDropOpen]);

  function handleSelectSub(sub) { setSelectedSub(sub); setView('detail'); }
  function handleBack() { setView('list'); setSelectedSub(null); }

  let headerTitle = 'Existing Subscribers';
  let headerSubtitle = `${allSubs.length.toLocaleString()} subscribers across Uganda`;
  if (view === 'detail' && selectedSub) {
    headerTitle = selectedSub.name;
    headerSubtitle = `Subscriber under ${agentName(selectedSub, AGENTS_MAP)}`;
  }

  return (
    <>
      <AnimatePresence>
        {viewSubscribersOpen && (
          <motion.div
            key="vs-backdrop"
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
        {viewSubscribersOpen && (
          <motion.div
            key="vs-panel"
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
                      placeholder="Search subscribers, agents, branches\u2026"
                      aria-label="Search subscribers"
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
                  <div style={{ position: 'relative' }} ref={kycBtnRef}>
                    <button className={styles.filterBtn} data-active={!!kycFilter} onClick={() => setKycDropOpen((p) => !p)}>
                      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="12" height="12"><path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                      {kycFilter ? KYC_LABELS[kycFilter] : 'KYC'}
                    </button>
                    <AnimatePresence>
                      {kycDropOpen && (
                        <motion.div className={styles.filterDropdown} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}>
                          <button className={styles.filterOption} data-selected={!kycFilter} onClick={() => { setKycFilter(null); setKycDropOpen(false); }}>
                            All KYC <span className={styles.filterCount}>{allSubs.length}</span>
                          </button>
                          {['complete', 'pending', 'incomplete'].map((k) => (
                            <button key={k} className={styles.filterOption} data-selected={kycFilter === k} onClick={() => { setKycFilter(k); setKycDropOpen(false); }}>
                              {KYC_LABELS[k]} <span className={styles.filterCount}>{kycCounts[k] || 0}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div style={{ position: 'relative' }} ref={sortBtnRef}>
                    <button className={styles.filterBtn} data-active={sortKey !== 'contributions'} onClick={() => setSortDropOpen((p) => !p)}>
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
                    <span className={styles.summaryChipValue}>{allSubs.length.toLocaleString()}</span>
                    <span className={styles.summaryChipLabel}>Subscribers</span>
                  </div>
                  <div className={styles.summaryChip}>
                    <span className={styles.summaryChipIcon}>{Icons.activeRate}</span>
                    <span className={styles.summaryChipValue}>{allSubs.length ? Math.round((totals.active / allSubs.length) * 100) : 0}%</span>
                    <span className={styles.summaryChipLabel}>Active</span>
                  </div>
                  <div className={styles.summaryChip}>
                    <span className={styles.summaryChipIcon}>{Icons.contributions}</span>
                    <span className={styles.summaryChipValue}>{fmtShort(totals.contribs)}</span>
                    <span className={styles.summaryChipLabel}>Contributions</span>
                  </div>
                </div>
              </>
            )}

            {/* Body */}
            <div className={styles.body} ref={bodyRef}>
              <AnimatePresence mode="wait">
                {view === 'list' && (
                  <motion.div key="vs-list" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}>
                    <div className={styles.listCount}>Showing {filtered.length.toLocaleString()} of {allSubs.length.toLocaleString()} subscribers</div>

                    {filtered.length === 0 ? (
                      <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>
                          <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" width="48" height="48">
                            <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M16 20h16M16 28h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </div>
                        <div className={styles.emptyTitle}>No subscribers found</div>
                        <div className={styles.emptyDesc}>Try adjusting your search or filters</div>
                      </div>
                    ) : (
                      <div
                        className={styles.virtualList}
                        style={{ height: `${virtualizer.getTotalSize()}px` }}
                      >
                        {virtualizer.getVirtualItems().map((virtualRow) => {
                          const sub = filtered[virtualRow.index];
                          const monthsActive = sub.contributionHistory.filter(v => v > 0).length;
                          const level = activityLevel(monthsActive);
                          return (
                            <button
                              key={sub.id}
                              className={styles.subItem}
                              onClick={() => handleSelectSub(sub)}
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
                              <div className={styles.subAvatar}>{getInitials(sub.name)}</div>
                              <div className={styles.subInfo}>
                                <div className={styles.subName}>{sub.name}</div>
                                <div className={styles.subMeta}>
                                  <span className={styles.subStatus} data-status={sub.isActive ? 'active' : 'inactive'} />
                                  <span>{agentName(sub, AGENTS_MAP)}</span>
                                  <span>&middot;</span>
                                  <KycBadge status={sub.kycStatus} />
                                </div>
                              </div>
                              <div className={styles.subStats}>
                                <div className={styles.stat}>
                                  <span className={styles.statValue}>{fmtShort(sub.totalContributions)}</span>
                                  <span className={styles.statLabel}>Contribs</span>
                                </div>
                                <span className={styles.activityBadge} data-level={level}>{monthsActive}/12</span>
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

                {view === 'detail' && selectedSub && (
                  <motion.div key="vs-detail" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}>
                    <SubscriberDetail subscriber={selectedSub} agentsMap={AGENTS_MAP} branchesMap={BRANCHES_MAP} districtsMap={DISTRICTS_MAP} regionsMap={REGIONS_MAP} />
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
