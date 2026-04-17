import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAllEntities } from '../../hooks/useEntity';
import { formatUGX, fmtShort, EASE_OUT_EXPO } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import { getInitials } from '../../utils/dashboard';
import { Icons } from '../shared/Icons';
import MiniChart from '../shared/MiniChart';
import KpiCard from '../shared/KpiCard';
import styles from './ViewSubscribers.module.css';


/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Helpers                                                                   */
/* ═══════════════════════════════════════════════════════════════════════════ */

function subscriberStatus(sub) {
  return sub.isActive ? 'active' : 'inactive';
}

function kycLabel(status) {
  if (status === 'complete') return 'KYC Verified';
  if (status === 'pending') return 'KYC Pending';
  return 'KYC Incomplete';
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Compute a balance-like value from contributions minus withdrawals */
function subscriberBalance(sub) {
  return sub.totalContributions - sub.totalWithdrawals;
}

/** Monthly average from the 12-month contribution history */
function monthlyAverage(sub) {
  const arr = sub.contributionHistory;
  if (!arr || arr.length === 0) return 0;
  return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
}


/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Sort options                                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */
const SORT_OPTIONS = [
  { key: 'balance', label: 'Balance', fn: (a, b) => subscriberBalance(b) - subscriberBalance(a) },
  { key: 'contributions', label: 'Contributions', fn: (a, b) => b.totalContributions - a.totalContributions },
  { key: 'registration', label: 'Registration Date', fn: (a, b) => (b.registeredDate || '').localeCompare(a.registeredDate || '') },
  { key: 'name', label: 'Name', fn: (a, b) => a.name.localeCompare(b.name) },
];


/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Subscriber Detail                                                         */
/* ═══════════════════════════════════════════════════════════════════════════ */
function SubscriberDetail({ subscriber, agentsMap, branchesMap }) {
  const status = subscriberStatus(subscriber);
  const balance = subscriberBalance(subscriber);
  const avg = monthlyAverage(subscriber);
  const agent = agentsMap[subscriber.parentId];
  const branch = agent ? branchesMap[agent.parentId] : null;

  return (
    <div className={styles.detailContent}>
      {/* Profile card */}
      <div className={styles.profileCard}>
        <div className={styles.profileAvatar}>{getInitials(subscriber.name)}</div>
        <div className={styles.profileInfo}>
          <div className={styles.profileName}>{subscriber.name}</div>
          <div className={styles.profileMeta}>
            <span>{subscriber.phone}</span>
            {subscriber.email && (
              <>
                <span>&middot;</span>
                <span>{subscriber.email}</span>
              </>
            )}
          </div>
          <div className={styles.profileBadges}>
            <span className={styles.kycBadge} data-kyc={subscriber.kycStatus}>
              {subscriber.kycStatus === 'complete' && (
                <svg aria-hidden="true" viewBox="0 0 12 12" fill="none" width="10" height="10" style={{ marginRight: 3 }}>
                  <path d="M2.5 6l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {kycLabel(subscriber.kycStatus)}
            </span>
            <span className={styles.kycBadge} data-kyc={status === 'active' ? 'complete' : 'incomplete'}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: status === 'active' ? 'var(--color-status-good)' : 'var(--color-status-poor)',
                display: 'inline-block',
                marginRight: 4,
                flexShrink: 0,
              }} />
              {status === 'active' ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className={styles.kpiRow}>
        <KpiCard icon={Icons.aum} label="Balance" value={formatUGX(balance)} />
        <KpiCard icon={Icons.contributions} label="Total Contributions" value={formatUGX(subscriber.totalContributions)} />
        <KpiCard icon={Icons.activeRate} label="Monthly Average" value={formatUGX(avg)} />
        <KpiCard
          icon={
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
              <rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M3 8h14" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7 4V2M13 4V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
          label="Registered"
          value={formatDate(subscriber.registeredDate)}
        />
      </div>

      {/* Contribution history */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Contribution History</div>
        <MiniChart data={subscriber.contributionHistory} />
      </div>

      {/* Personal info */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Personal Information</div>
        <div className={styles.infoCard}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Gender</span>
            <span className={styles.infoValue} style={{ textTransform: 'capitalize' }}>{subscriber.gender}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Age</span>
            <span className={styles.infoValue}>{subscriber.age} years</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Phone</span>
            <span className={styles.infoValue}>{subscriber.phone}</span>
          </div>
          {subscriber.email && (
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Email</span>
              <span className={styles.infoValue}>{subscriber.email}</span>
            </div>
          )}
        </div>
      </div>

      {/* Financial info */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Financial Summary</div>
        <div className={styles.infoCard}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Total Contributions</span>
            <span className={styles.infoValue} style={{ fontVariantNumeric: 'tabular-nums' }}>{formatUGX(subscriber.totalContributions)}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Total Withdrawals</span>
            <span className={styles.infoValue} style={{ fontVariantNumeric: 'tabular-nums' }}>{formatUGX(subscriber.totalWithdrawals)}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Net Balance</span>
            <span className={styles.infoValue} style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--color-indigo)' }}>{formatUGX(balance)}</span>
          </div>
        </div>
      </div>

      {/* Products */}
      {subscriber.productsHeld && subscriber.productsHeld.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Products Held</div>
          <div className={styles.productsWrap}>
            {subscriber.productsHeld.map((p) => (
              <span key={p} className={styles.productTag}>{p}</span>
            ))}
          </div>
        </div>
      )}

      {/* Agent & Branch assignment */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Enrolment</div>
        <div className={styles.infoCard}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Agent</span>
            <span className={styles.infoValue}>{agent ? agent.name : '--'}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Branch</span>
            <span className={styles.infoValue}>{branch ? branch.name : '--'}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Registered</span>
            <span className={styles.infoValue}>{formatDate(subscriber.registeredDate)}</span>
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

  const { data: allSubscribersRaw = [] } = useAllEntities('subscriber');
  const { data: allAgentsRaw = [] } = useAllEntities('agent');
  const { data: allBranchesRaw = [] } = useAllEntities('branch');

  const AGENTS_MAP = useMemo(() => Object.fromEntries(allAgentsRaw.map(a => [a.id, a])), [allAgentsRaw]);
  const BRANCHES_MAP = useMemo(() => Object.fromEntries(allBranchesRaw.map(b => [b.id, b])), [allBranchesRaw]);

  const [view, setView] = useState('list');
  const [selectedSubscriber, setSelectedSubscriber] = useState(null);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('balance');
  const [sortDropOpen, setSortDropOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const bodyRef = useRef(null);
  const sortBtnRef = useRef(null);

  function handleClose() {
    setViewSubscribersOpen(false);
  }

  // Aggregate stats for summary strip
  const totals = useMemo(() => {
    const t = { active: 0, totalContrib: 0, totalBalance: 0 };
    allSubscribersRaw.forEach((s) => {
      if (s.isActive) t.active++;
      t.totalContrib += s.totalContributions;
      t.totalBalance += subscriberBalance(s);
    });
    return t;
  }, [allSubscribersRaw]);

  const filtered = useMemo(() => {
    let list = allSubscribersRaw;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.phone.includes(q)
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter((s) =>
        statusFilter === 'active' ? s.isActive : !s.isActive
      );
    }
    const sortOpt = SORT_OPTIONS.find((o) => o.key === sortKey);
    return [...list].sort(sortOpt ? sortOpt.fn : SORT_OPTIONS[0].fn);
  }, [allSubscribersRaw, search, statusFilter, sortKey]);

  const estimateSize = useCallback(() => 72, []);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => bodyRef.current,
    estimateSize,
    overscan: 10,
  });

  // Reset state on close
  useEffect(() => {
    if (viewSubscribersOpen) return;
    const t = setTimeout(() => {
      setView('list');
      setSelectedSubscriber(null);
      setSearch('');
      setSortKey('balance');
      setStatusFilter('all');
    }, 400);
    return () => clearTimeout(t);
  }, [viewSubscribersOpen]);

  // Scroll to top on view change
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
    if (!sortDropOpen) return;
    function handler(e) {
      if (sortBtnRef.current && !sortBtnRef.current.contains(e.target)) setSortDropOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sortDropOpen]);

  function handleSelectSubscriber(sub) {
    setSelectedSubscriber(sub);
    setView('detail');
  }

  function handleBack() {
    setView('list');
    setSelectedSubscriber(null);
  }

  let headerTitle = 'Subscribers';
  let headerSubtitle = `${allSubscribersRaw.length.toLocaleString()} subscribers across Uganda`;
  if (view === 'detail' && selectedSubscriber) {
    headerTitle = selectedSubscriber.name;
    headerSubtitle = `Subscriber${selectedSubscriber.phone ? ` \u00B7 ${selectedSubscriber.phone}` : ''}`;
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
            animate={{
              x: 0,
              transition: { duration: 0.55, ease: EASE_OUT_EXPO },
            }}
            exit={{
              x: '100%',
              transition: { duration: 0.55, ease: EASE_OUT_EXPO },
            }}
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
                      {view === 'list' && (
                        <span className={styles.filterCount} style={{ marginLeft: 'var(--space-2)', verticalAlign: 'middle' }}>
                          {allSubscribersRaw.length.toLocaleString()}
                        </span>
                      )}
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

            {/* Toolbar (list view only) */}
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
                      placeholder="Search by name or phone\u2026"
                      aria-label="Search subscribers"
                      name="search"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {search && (
                      <button className={styles.searchClear} onClick={() => setSearch('')} aria-label="Clear search">
                        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="12" height="12">
                          <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div style={{ position: 'relative' }} ref={sortBtnRef}>
                    <button className={styles.filterBtn} data-active={sortKey !== 'balance'} onClick={() => setSortDropOpen((p) => !p)}>
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
                    <span className={styles.summaryChipValue}>{allSubscribersRaw.length.toLocaleString()}</span>
                    <span className={styles.summaryChipLabel}>Total</span>
                  </div>
                  <div className={styles.summaryChip}>
                    <span className={styles.summaryChipIcon}>{Icons.activeRate}</span>
                    <span className={styles.summaryChipValue}>{totals.active.toLocaleString()}</span>
                    <span className={styles.summaryChipLabel}>Active</span>
                  </div>
                  <div className={styles.summaryChip}>
                    <span className={styles.summaryChipIcon}>{Icons.aum}</span>
                    <span className={styles.summaryChipValue}>{fmtShort(totals.totalBalance)}</span>
                    <span className={styles.summaryChipLabel}>Balance</span>
                  </div>
                </div>
              </>
            )}

            {/* Body */}
            <div className={styles.body} ref={bodyRef}>
              <AnimatePresence mode="wait">
                {view === 'list' && (
                  <motion.div key="vs-list" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}>
                    <div className={styles.listCount}>Showing {filtered.length.toLocaleString()} of {allSubscribersRaw.length.toLocaleString()} subscribers</div>

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
                        style={{ height: `${virtualizer.getTotalSize()}px`, padding: '0 var(--space-5)' }}
                      >
                        {virtualizer.getVirtualItems().map((virtualRow) => {
                          const sub = filtered[virtualRow.index];
                          const status = subscriberStatus(sub);
                          const balance = subscriberBalance(sub);
                          return (
                            <button
                              key={sub.id}
                              className={styles.subItem}
                              onClick={() => handleSelectSubscriber(sub)}
                              data-index={virtualRow.index}
                              ref={virtualizer.measureElement}
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                transform: `translateY(${virtualRow.start}px)`,
                                paddingLeft: 'var(--space-5)',
                                paddingRight: 'var(--space-5)',
                              }}
                            >
                              <div className={styles.subAvatar}>{getInitials(sub.name)}</div>
                              <div className={styles.subInfo}>
                                <div className={styles.subName}>{sub.name}</div>
                                <div className={styles.subMeta}>
                                  <span className={styles.subStatus} data-status={status} />
                                  <span style={{ textTransform: 'capitalize' }}>{status}</span>
                                  <span>&middot;</span>
                                  <span>{sub.phone}</span>
                                </div>
                              </div>
                              <div className={styles.subStats}>
                                <div className={styles.stat}>
                                  <span className={styles.statValue}>{fmtShort(balance)}</span>
                                  <span className={styles.statLabel}>Balance</span>
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
                  </motion.div>
                )}

                {view === 'detail' && selectedSubscriber && (
                  <motion.div key="vs-detail" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}>
                    <SubscriberDetail subscriber={selectedSubscriber} agentsMap={AGENTS_MAP} branchesMap={BRANCHES_MAP} />
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
