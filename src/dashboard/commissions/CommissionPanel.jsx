import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard } from '../../contexts/DashboardContext';
import { formatUGX, fmtShort, EASE_OUT_EXPO } from '../../utils/finance';
import {
  useCommissionRate, useSetCommissionRate,
  useCommissionSummary, useAgentCommissionList,
  useAgentCommissionDetail, useCommissionSubscribers,
  useDisputedAgentList, useSettlementRequestList,
  useApproveCommission, useRejectCommission,
  useBulkApproveCommissions, useBulkRejectCommissions,
  useSettleAgentCommissions, useSettleAllCommissions,
} from '../../hooks/useCommission';
import { getInitials } from '../../utils/dashboard';
import styles from './CommissionPanel.module.css';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Icons                                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */
const Icons = {
  close: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  ),
  back: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="20" height="20">
      <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  search: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  settings: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 1v2M10 17v2M3.5 3.5l1.4 1.4M15.1 15.1l1.4 1.4M1 10h2M17 10h2M3.5 16.5l1.4-1.4M15.1 4.9l1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  edit: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="14" height="14">
      <path d="M13.586 3.586a2 2 0 112.828 2.828L7 15.828 3 17l1.172-4L13.586 3.586z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  download: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <path d="M10 3v10M10 13l-3-3M10 13l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 15v2h14v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  wallet: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <rect x="2" y="4" width="16" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 8h16" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="14" cy="12" r="1" fill="currentColor"/>
    </svg>
  ),
  approve: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <path d="M5 10l3 3 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  reject: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <path d="M14 6L6 14M6 6l8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  ),
};

const viewAnim = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
  transition: { duration: 0.25, ease: EASE_OUT_EXPO },
};

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  CommissionPanel                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */
export default function CommissionPanel({ branchId, splitMode = false }) {
  const { commissionsOpen, setCommissionsOpen } = useDashboard();

  // View state: home → agents/disputed/requests → agent-detail/dispute-detail/request-detail → subscribers
  const [view, setView] = useState('home');
  const [statusFocus, setStatusFocus] = useState(null); // null | 'paid' | 'due'
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [subFilter, setSubFilter] = useState(null); // null | 'active' | 'dormant'
  const [search, setSearch] = useState('');
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [settleScope, setSettleScope] = useState('all'); // 'all' | 'agent'
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState('');
  const [selectedDisputeAgent, setSelectedDisputeAgent] = useState(null);
  const [selectedRequestAgent, setSelectedRequestAgent] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set()); // multi-select for bulk actions

  // Data hooks
  const { data: rate } = useCommissionRate();
  const setRateMutation = useSetCommissionRate();
  const { data: summary } = useCommissionSummary(branchId);
  const { data: agentList = [] } = useAgentCommissionList(statusFocus);
  const { data: agentDetail } = useAgentCommissionDetail(selectedAgentId);
  const { data: subscribers = [] } = useCommissionSubscribers(selectedAgentId, subFilter);
  const { data: disputedAgents = [] } = useDisputedAgentList();
  const { data: requestAgents = [] } = useSettlementRequestList();
  const approveMutation = useApproveCommission();
  const rejectMutation = useRejectCommission();
  const bulkApproveMutation = useBulkApproveCommissions();
  const bulkRejectMutation = useBulkRejectCommissions();
  const settleAgentMutation = useSettleAgentCommissions();
  const settleAllMutation = useSettleAllCommissions();

  // Reset state when panel closes
  useEffect(() => {
    if (commissionsOpen) return;
    const t = setTimeout(() => {
      setView('home');
      setStatusFocus(null);
      setSelectedAgentId(null);
      setSubFilter(null);
      setSearch('');
      setSettleModalOpen(false);
      setEditingRate(false);
      setSelectedDisputeAgent(null);
      setSelectedRequestAgent(null);
      setSelectedIds(new Set());
    }, 400);
    return () => clearTimeout(t);
  }, [commissionsOpen]);

  // Escape to close
  useEffect(() => {
    if (!commissionsOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') {
        if (settleModalOpen) setSettleModalOpen(false);
        else setCommissionsOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [commissionsOpen, settleModalOpen, setCommissionsOpen]);

  // Branch-scoped lists (when branchId is provided, filter to only agents in that branch)
  const scopedAgentList = useMemo(() => branchId ? agentList.filter(a => a.branchId === branchId) : agentList, [agentList, branchId]);
  const scopedDisputedAgents = useMemo(() => branchId ? disputedAgents.filter(a => a.branchId === branchId) : disputedAgents, [disputedAgents, branchId]);
  const scopedRequestAgents = useMemo(() => branchId ? requestAgents.filter(a => a.branchId === branchId) : requestAgents, [requestAgents, branchId]);

  // Filtered agent list
  const filteredAgents = useMemo(() => {
    if (!search.trim()) return scopedAgentList;
    const q = search.toLowerCase();
    return scopedAgentList.filter((a) =>
      a.agentName.toLowerCase().includes(q) || a.branchName.toLowerCase().includes(q)
    );
  }, [scopedAgentList, search]);

  // Navigation helpers
  function goHome() {
    setView('home');
    setStatusFocus(null);
    setSelectedAgentId(null);
    setSubFilter(null);
    setSearch('');
    setSelectedIds(new Set());
  }

  function goAgents(focus) {
    setStatusFocus(focus);
    setView('agents');
    setSearch('');
  }

  function goAgentDetail(agentId) {
    setSelectedAgentId(agentId);
    setView('agent-detail');
    setSubFilter(null);
  }

  function goSubscribers(filter) {
    setSubFilter(filter);
    setView('subscribers');
  }

  function goDisputed() {
    setView('disputed');
    setSearch('');
    setSelectedIds(new Set());
  }

  function goRequests() {
    setView('requests');
    setSearch('');
    setSelectedIds(new Set());
  }

  function goDisputeDetail(agent) {
    setSelectedDisputeAgent(agent);
    setView('dispute-detail');
  }

  function goRequestDetail(agent) {
    setSelectedRequestAgent(agent);
    setView('request-detail');
  }

  // Multi-select helpers
  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll(ids) {
    setSelectedIds(new Set(ids));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleBack() {
    if (view === 'subscribers') setView('agent-detail');
    else if (view === 'agent-detail') setView('agents');
    else if (view === 'agents') goHome();
    else if (view === 'dispute-detail') setView('disputed');
    else if (view === 'disputed') goHome();
    else if (view === 'request-detail') setView('requests');
    else if (view === 'requests') goHome();
  }

  // Rate editing
  function startEditRate() {
    setRateInput(String(rate || 5000));
    setEditingRate(true);
  }

  function saveRate() {
    const val = parseInt(rateInput);
    if (!isNaN(val) && val > 0) {
      setRateMutation.mutate(val);
    }
    setEditingRate(false);
  }

  // Settlement
  function openSettleModal(scope) {
    setSettleScope(scope);
    setSettleModalOpen(true);
  }

  function confirmSettle() {
    if (settleScope === 'agent' && selectedAgentId) {
      settleAgentMutation.mutate(selectedAgentId);
    } else {
      settleAllMutation.mutate(branchId || undefined);
    }
    setSettleModalOpen(false);
  }

  // Filtered disputed/request lists
  const filteredDisputed = useMemo(() => {
    if (!search.trim()) return scopedDisputedAgents;
    const q = search.toLowerCase();
    return scopedDisputedAgents.filter((a) =>
      a.agentName.toLowerCase().includes(q) || a.branchName.toLowerCase().includes(q)
    );
  }, [scopedDisputedAgents, search]);

  const filteredRequests = useMemo(() => {
    if (!search.trim()) return scopedRequestAgents;
    const q = search.toLowerCase();
    return scopedRequestAgents.filter((a) =>
      a.agentName.toLowerCase().includes(q) || a.branchName.toLowerCase().includes(q)
    );
  }, [scopedRequestAgents, search]);

  // Collect all commission IDs from selected agents (for bulk actions on list views)
  const selectedCommissionIds = useMemo(() => {
    if (selectedIds.size === 0) return [];
    const list = view === 'disputed' ? filteredDisputed : view === 'requests' ? filteredRequests : [];
    const ids = [];
    list.forEach((agent) => {
      if (!selectedIds.has(agent.agentId)) return;
      const items = agent.disputes || agent.requests || [];
      items.forEach((item) => ids.push(item.id));
    });
    return ids;
  }, [selectedIds, view, filteredDisputed, filteredRequests]);

  const selectedTotal = useMemo(() => {
    if (selectedIds.size === 0) return 0;
    const list = view === 'disputed' ? filteredDisputed : view === 'requests' ? filteredRequests : [];
    return list
      .filter((a) => selectedIds.has(a.agentId))
      .reduce((sum, a) => sum + (a.disputedAmount || a.requestedAmount || 0), 0);
  }, [selectedIds, view, filteredDisputed, filteredRequests]);

  // Breadcrumb
  const breadcrumbItems = useMemo(() => {
    const items = [{ label: 'Commissions', view: 'home' }];
    if (view === 'agents' || view === 'agent-detail' || view === 'subscribers') {
      items.push({ label: statusFocus === 'paid' ? 'Paid' : statusFocus === 'due' ? 'Due' : 'All Agents', view: 'agents' });
    }
    if (view === 'agent-detail' || view === 'subscribers') {
      items.push({ label: agentDetail?.agentName || '…', view: 'agent-detail' });
    }
    if (view === 'subscribers') {
      items.push({ label: subFilter === 'active' ? 'Active Subscribers' : subFilter === 'dormant' ? 'Dormant' : 'Subscribers', view: 'subscribers' });
    }
    if (view === 'disputed' || view === 'dispute-detail') {
      items.push({ label: 'Disputed', view: 'disputed' });
    }
    if (view === 'dispute-detail') {
      items.push({ label: selectedDisputeAgent?.agentName || '…', view: 'dispute-detail' });
    }
    if (view === 'requests' || view === 'request-detail') {
      items.push({ label: 'Requests', view: 'requests' });
    }
    if (view === 'request-detail') {
      items.push({ label: selectedRequestAgent?.agentName || '…', view: 'request-detail' });
    }
    return items;
  }, [view, statusFocus, agentDetail, subFilter, selectedDisputeAgent, selectedRequestAgent]);

  // Title per view
  const titles = {
    home: { title: 'Commission Settlement', subtitle: 'Track and manage agent commissions' },
    agents: { title: statusFocus === 'paid' ? 'Commissions Paid' : statusFocus === 'due' ? 'Commissions Due' : 'Total Commissions', subtitle: `${filteredAgents.length} agents` },
    'agent-detail': { title: agentDetail?.agentName || '…', subtitle: agentDetail?.branchName || '' },
    subscribers: { title: subFilter === 'active' ? 'Active Subscribers' : subFilter === 'dormant' ? 'Dormant Subscribers' : 'Subscribers', subtitle: `${subscribers.length} subscribers` },
    disputed: { title: 'Disputed Settlements', subtitle: `${filteredDisputed.length} agents with disputes` },
    'dispute-detail': { title: selectedDisputeAgent?.agentName || '…', subtitle: `${selectedDisputeAgent?.disputedCount || 0} disputed commissions` },
    requests: { title: 'Settlement Requests', subtitle: `${filteredRequests.length} agents with requests` },
    'request-detail': { title: selectedRequestAgent?.agentName || '…', subtitle: `${selectedRequestAgent?.requestedCount || 0} pending requests` },
  };

  const { title, subtitle } = titles[view] || titles.home;

  return (
    <AnimatePresence>
      {commissionsOpen && (
        <>
          {/* Backdrop — hidden in split mode */}
          {!splitMode && (
            <motion.div
              className={styles.backdrop}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setCommissionsOpen(false)}
            />
          )}

          {/* Panel */}
          <motion.div
            className={styles.panel}
            data-split-mode={splitMode || undefined}
            initial={{ x: '100%' }}
            animate={{
              x: 0,
              transition: { duration: 0.55, ease: EASE_OUT_EXPO },
            }}
            exit={{
              x: '100%',
              transition: { duration: 0.55, ease: EASE_OUT_EXPO },
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Commission Settlement"
          >
            {/* Header */}
            <div className={styles.header}>
              <div className={styles.headerTop}>
                {view !== 'home' && (
                  <button className={styles.backBtn} onClick={handleBack} aria-label="Go back">
                    {Icons.back}
                  </button>
                )}
                <div className={styles.titleWrap}>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={title}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className={styles.title}>{title}</div>
                      <div className={styles.subtitle}>{subtitle}</div>
                    </motion.div>
                  </AnimatePresence>
                </div>
                <button className={styles.closeBtn} onClick={() => setCommissionsOpen(false)} aria-label="Close commissions">
                  {Icons.close}
                </button>
              </div>
            </div>

            {/* Breadcrumb */}
            {view !== 'home' && (
              <div className={styles.breadcrumb}>
                {breadcrumbItems.map((item, i) => (
                  <span key={item.view + i}>
                    {i > 0 && <span className={styles.breadcrumbSep}> / </span>}
                    <button
                      className={styles.breadcrumbItem}
                      data-active={i === breadcrumbItems.length - 1}
                      onClick={() => {
                        if (item.view === 'home') goHome();
                        else if (item.view === 'agents') setView('agents');
                        else if (item.view === 'agent-detail') setView('agent-detail');
                        else if (item.view === 'disputed') setView('disputed');
                        else if (item.view === 'requests') setView('requests');
                      }}
                    >
                      {item.label}
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Body */}
            <div className={styles.body}>
              <AnimatePresence mode="wait">
                {/* ─── HOME VIEW ─────────────────────────────────────── */}
                {view === 'home' && (
                  <motion.div key="home" {...viewAnim}>
                    {/* ── Overview hero ── */}
                    <div className={styles.overviewHero}>
                      <button className={styles.overviewTotal} onClick={() => goAgents(null)}>
                        <div className={styles.overviewTotalLabel}>Total Commissions</div>
                        <div className={styles.overviewTotalAmount}>{formatUGX(summary?.totalCommissions || 0)}</div>
                        <div className={styles.overviewTotalCount}>{(summary?.countTotal || 0).toLocaleString()} transactions across your {branchId ? 'branch' : 'network'}</div>
                      </button>

                      {/* Progress bar: paid vs due */}
                      <div className={styles.progressWrap}>
                        <div className={styles.progressBar}>
                          <div
                            className={styles.progressFill}
                            style={{ width: `${summary?.countTotal ? Math.round((summary.countPaid / summary.countTotal) * 100) : 0}%` }}
                          />
                        </div>
                        <div className={styles.progressLabels}>
                          <span className={styles.progressLabelPaid}>{summary?.countTotal ? Math.round((summary.countPaid / summary.countTotal) * 100) : 0}% settled</span>
                          <span className={styles.progressLabelDue}>{summary?.countTotal ? Math.round((summary.countDue / summary.countTotal) * 100) : 0}% pending</span>
                        </div>
                      </div>

                      {/* Rate — inline, compact */}
                      <div className={styles.rateInline}>
                        <span className={styles.rateInlineLabel}>Rate:</span>
                        {editingRate ? (
                          <span className={styles.rateEditRow}>
                            <input
                              className={styles.rateInput}
                              type="number"
                              value={rateInput}
                              onChange={(e) => setRateInput(e.target.value)}
                              aria-label="Commission rate in UGX"
                              autoFocus
                            />
                            <button className={styles.rateSaveBtn} onClick={saveRate}>Save</button>
                            <button className={styles.rateCancelBtn} onClick={() => setEditingRate(false)}>Cancel</button>
                          </span>
                        ) : (
                          <>
                            <span className={styles.rateInlineValue}>{formatUGX(rate || 0)} per subscriber</span>
                            <button className={styles.rateEditBtn} onClick={startEditRate} aria-label="Edit commission rate">
                              {Icons.edit}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* ── Two primary cards: Settled / Pending ── */}
                    <div className={styles.primaryGrid}>
                      <button className={styles.primaryCard} data-type="settled" onClick={() => goAgents('paid')}>
                        <div className={styles.primaryIcon}>
                          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="20" height="20">
                            <path d="M5 10l3 3 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <div className={styles.primaryAmount}>{fmtShort(summary?.totalPaid || 0)}</div>
                        <div className={styles.primaryLabel}>Settled</div>
                        <div className={styles.primaryCount}>{(summary?.countPaid || 0).toLocaleString()} commissions paid</div>
                      </button>
                      <button className={styles.primaryCard} data-type="pending" onClick={() => goAgents('due')}>
                        <div className={styles.primaryIcon}>
                          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="20" height="20">
                            <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.75"/>
                            <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <div className={styles.primaryAmount}>{fmtShort(summary?.totalDue || 0)}</div>
                        <div className={styles.primaryLabel}>Pending</div>
                        <div className={styles.primaryCount}>{(summary?.countDue || 0).toLocaleString()} awaiting settlement</div>
                      </button>
                    </div>

                    {/* ── Settle All CTA ── */}
                    <button
                      className={styles.settleAllBtn}
                      onClick={() => openSettleModal('all')}
                      disabled={!summary?.countDue}
                    >
                      {Icons.wallet}
                      Settle All Due Commissions
                    </button>

                    {/* ── Needs Attention ── */}
                    <div className={styles.attentionSection}>
                      <div className={styles.attentionTitle}>Needs Attention</div>
                      <button className={styles.attentionRow} data-type="disputed" onClick={goDisputed}>
                        <div className={styles.attentionAccent} data-type="disputed" />
                        <div className={styles.attentionInfo}>
                          <div className={styles.attentionLabel}>Disputed Settlements</div>
                          <div className={styles.attentionDesc}>{formatUGX(summary?.totalDisputed || 0)} across {scopedDisputedAgents.length} agents</div>
                        </div>
                        <div className={styles.attentionCount} data-type="disputed">{summary?.countDisputed || 0}</div>
                        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16" style={{ color: 'var(--color-gray)', flexShrink: 0 }}>
                          <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button className={styles.attentionRow} data-type="requests" onClick={goRequests}>
                        <div className={styles.attentionAccent} data-type="requests" />
                        <div className={styles.attentionInfo}>
                          <div className={styles.attentionLabel}>Settlement Requests</div>
                          <div className={styles.attentionDesc}>{formatUGX(summary?.totalRequested || 0)} from {scopedRequestAgents.length} agents</div>
                        </div>
                        <div className={styles.attentionCount} data-type="requests">{summary?.countRequested || 0}</div>
                        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16" style={{ color: 'var(--color-gray)', flexShrink: 0 }}>
                          <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ─── AGENTS VIEW ───────────────────────────────────── */}
                {view === 'agents' && (
                  <motion.div key="agents" {...viewAnim}>
                    <div className={styles.toolbar}>
                      <div className={styles.searchWrap}>
                        <span className={styles.searchIcon}>{Icons.search}</span>
                        <input
                          className={styles.searchInput}
                          placeholder="Search agents…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          aria-label="Search agents"
                          spellCheck={false}
                        />
                        {search && (
                          <button className={styles.searchClear} onClick={() => setSearch('')} aria-label="Clear search">
                            {Icons.close}
                          </button>
                        )}
                      </div>
                    </div>

                    {filteredAgents.length === 0 ? (
                      <div className={styles.empty}>No agents found</div>
                    ) : (
                      filteredAgents.map((agent) => (
                        <button
                          key={agent.agentId}
                          className={styles.agentRow}
                          onClick={() => goAgentDetail(agent.agentId)}
                        >
                          <div className={styles.agentAvatar}>{getInitials(agent.agentName)}</div>
                          <div className={styles.agentInfo}>
                            <div className={styles.agentName}>{agent.agentName}</div>
                            <div className={styles.agentBranch}>{agent.branchName}</div>
                          </div>
                          <div>
                            <div className={styles.agentAmount}>
                              {statusFocus === 'paid' ? fmtShort(agent.totalPaid) :
                               statusFocus === 'due' ? fmtShort(agent.totalDue) :
                               fmtShort(agent.totalCommissions)}
                            </div>
                            <div className={styles.agentAmountLabel}>
                              {agent.subscribersOnboarded} subscribers
                            </div>
                          </div>
                        </button>
                      ))
                    )}

                    <button className={styles.downloadBtn} aria-label="Download as Excel">
                      {Icons.download}
                      Download
                    </button>
                  </motion.div>
                )}

                {/* ─── AGENT DETAIL VIEW ─────────────────────────────── */}
                {view === 'agent-detail' && agentDetail && (
                  <motion.div key="agent-detail" {...viewAnim}>
                    <div className={styles.detailHeader}>
                      <div className={styles.detailAvatar}>{getInitials(agentDetail.agentName)}</div>
                      <div className={styles.detailInfo}>
                        <div className={styles.detailName}>{agentDetail.agentName}</div>
                        <div className={styles.detailBranch}>{agentDetail.branchName}</div>
                      </div>
                    </div>

                    <div className={styles.detailStats}>
                      <button className={styles.detailStat} onClick={() => goSubscribers(null)}>
                        <div className={styles.detailStatLabel}>Onboarded</div>
                        <div className={styles.detailStatValue}>{agentDetail.subscribersOnboarded}</div>
                      </button>
                      <button className={styles.detailStat} onClick={() => goSubscribers('active')}>
                        <div className={styles.detailStatLabel}>Active</div>
                        <div className={styles.detailStatValue} data-color="green">{agentDetail.activeSubscribers}</div>
                      </button>
                      <button className={styles.detailStat} onClick={() => goSubscribers('dormant')}>
                        <div className={styles.detailStatLabel}>Dormant</div>
                        <div className={styles.detailStatValue}>{agentDetail.dormantSubscribers}</div>
                      </button>
                    </div>

                    {/* Commissions Paid */}
                    <div className={styles.section}>
                      <div className={styles.sectionHeader}>
                        <div>
                          <span className={styles.sectionTitle}>Commissions Paid</span>
                          <span className={styles.sectionCount}> — {formatUGX(agentDetail.totalPaid)}</span>
                        </div>
                      </div>
                      {agentDetail.paidTransactions.slice(0, 5).map((tx) => (
                        <div key={tx.id} className={styles.txRow}>
                          <div className={styles.txDate}>{formatDate(tx.transactionDate)}</div>
                          <div className={styles.txName}>{tx.subscriberName}</div>
                          <div className={styles.txAmount} data-status="paid">{formatUGX(tx.amount)}</div>
                          <div className={styles.txBadge} data-confirmed={tx.agentConfirmed}>
                            {tx.agentConfirmed ? 'Confirmed' : 'Pending'}
                          </div>
                          <div className={styles.txActions}>
                            <button className={styles.rejectBtn} onClick={() => rejectMutation.mutate(tx.id)} aria-label={`Reject ${tx.subscriberName}`}>
                              {Icons.reject}
                            </button>
                          </div>
                        </div>
                      ))}
                      {agentDetail.paidTransactions.length > 5 && (
                        <div className={styles.sectionAction}>
                          +{agentDetail.paidTransactions.length - 5} more transactions
                        </div>
                      )}
                    </div>

                    {/* Commissions Due */}
                    <div className={styles.section}>
                      <div className={styles.sectionHeader}>
                        <div>
                          <span className={styles.sectionTitle}>Commissions Due</span>
                          <span className={styles.sectionCount}> — {formatUGX(agentDetail.totalDue)}</span>
                        </div>
                      </div>
                      {agentDetail.dueTransactions.slice(0, 5).map((tx) => (
                        <div key={tx.id} className={styles.txRow}>
                          <div className={styles.txDate}>{formatDate(tx.dueDate)}</div>
                          <div className={styles.txName}>{tx.subscriberName}</div>
                          <div className={styles.txAmount} data-status="due">{formatUGX(tx.amount)}</div>
                          <div className={styles.txDays} data-overdue={tx.daysToDate < 0}>
                            {tx.daysToDate >= 0 ? `${tx.daysToDate}d` : `${Math.abs(tx.daysToDate)}d overdue`}
                          </div>
                          <div className={styles.txActions}>
                            <button className={styles.rejectBtn} onClick={() => rejectMutation.mutate(tx.id)} aria-label={`Reject ${tx.subscriberName}`}>
                              {Icons.reject}
                            </button>
                          </div>
                        </div>
                      ))}
                      {agentDetail.dueTransactions.length > 5 && (
                        <div className={styles.sectionAction}>
                          +{agentDetail.dueTransactions.length - 5} more due
                        </div>
                      )}
                    </div>

                    {/* Settle Due CTA */}
                    {agentDetail.dueTransactions.length > 0 && (
                      <button
                        className={styles.settleDueBtn}
                        onClick={() => openSettleModal('agent')}
                      >
                        {Icons.wallet}
                        Settle Due Commissions ({formatUGX(agentDetail.totalDue)})
                      </button>
                    )}

                    <button className={styles.downloadBtn} aria-label="Download as Excel">
                      {Icons.download}
                      Download
                    </button>
                  </motion.div>
                )}

                {/* ─── SUBSCRIBERS VIEW ──────────────────────────────── */}
                {view === 'subscribers' && (
                  <motion.div key="subscribers" {...viewAnim}>
                    <div className={styles.filterPills}>
                      <button className={styles.filterPill} data-active={!subFilter} onClick={() => setSubFilter(null)}>
                        All
                      </button>
                      <button className={styles.filterPill} data-active={subFilter === 'active'} onClick={() => setSubFilter('active')}>
                        Active
                      </button>
                      <button className={styles.filterPill} data-active={subFilter === 'dormant'} onClick={() => setSubFilter('dormant')}>
                        Dormant
                      </button>
                    </div>

                    {subscribers.length === 0 ? (
                      <div className={styles.empty}>No subscribers found</div>
                    ) : (
                      subscribers.map((sub) => (
                        <div key={sub.subscriberId} className={styles.subRow}>
                          <span className={styles.subStatusDot} data-active={sub.isActive} />
                          <div className={styles.subName}>
                            <div className={styles.subNameText}>{sub.subscriberName}</div>
                            <div className={styles.subId}>{sub.subscriberId} — Joined {formatDate(sub.registeredDate)}</div>
                          </div>
                          <div className={styles.subMeta}>
                            <div className={styles.subAmount}>{formatUGX(sub.totalContributions)}</div>
                            <div className={styles.subDate}>Last: {formatDate(sub.lastContributionDate)}</div>
                          </div>
                        </div>
                      ))
                    )}

                    <button className={styles.downloadBtn} aria-label="Download as Excel">
                      {Icons.download}
                      Download
                    </button>
                  </motion.div>
                )}

                {/* ─── DISPUTED AGENTS VIEW ──────────────────────────── */}
                {view === 'disputed' && (
                  <motion.div key="disputed" {...viewAnim}>
                    <div className={styles.toolbar}>
                      <div className={styles.searchWrap}>
                        <span className={styles.searchIcon}>{Icons.search}</span>
                        <input
                          className={styles.searchInput}
                          placeholder="Search agents…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          aria-label="Search disputed agents"
                          spellCheck={false}
                        />
                        {search && (
                          <button className={styles.searchClear} onClick={() => setSearch('')} aria-label="Clear search">
                            {Icons.close}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Select all bar */}
                    {filteredDisputed.length > 0 && (
                      <div className={styles.selectBar}>
                        <button
                          className={styles.selectAllBtn}
                          onClick={() => {
                            if (selectedIds.size === filteredDisputed.length) clearSelection();
                            else selectAll(filteredDisputed.map((a) => a.agentId));
                          }}
                        >
                          <span className={styles.checkbox} data-checked={selectedIds.size === filteredDisputed.length && filteredDisputed.length > 0}>
                            {selectedIds.size === filteredDisputed.length && filteredDisputed.length > 0 && Icons.approve}
                          </span>
                          {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                        </button>
                        {selectedIds.size > 0 && (
                          <button className={styles.selectClearBtn} onClick={clearSelection}>Clear</button>
                        )}
                      </div>
                    )}

                    {filteredDisputed.length === 0 ? (
                      <div className={styles.empty}>No disputed settlements</div>
                    ) : (
                      filteredDisputed.map((agent) => (
                        <div key={agent.agentId} className={styles.selectableRow} data-selected={selectedIds.has(agent.agentId)}>
                          <button
                            className={styles.checkbox}
                            data-checked={selectedIds.has(agent.agentId)}
                            onClick={() => toggleSelect(agent.agentId)}
                            aria-label={`Select ${agent.agentName}`}
                          >
                            {selectedIds.has(agent.agentId) && Icons.approve}
                          </button>
                          <button
                            className={styles.selectableContent}
                            onClick={() => goDisputeDetail(agent)}
                          >
                            <div className={styles.agentAvatar}>{getInitials(agent.agentName)}</div>
                            <div className={styles.agentInfo}>
                              <div className={styles.agentName}>{agent.agentName}</div>
                              <div className={styles.agentBranch}>{agent.branchName}</div>
                            </div>
                            <div>
                              <div className={styles.agentAmount} style={{ color: 'var(--color-status-poor)' }}>
                                {agent.disputedCount} disputed
                              </div>
                              <div className={styles.agentAmountLabel}>
                                {formatUGX(agent.disputedAmount)}
                              </div>
                            </div>
                          </button>
                        </div>
                      ))
                    )}

                    {/* Floating bulk action bar */}
                    <AnimatePresence>
                      {selectedIds.size > 0 && (
                        <motion.div
                          className={styles.floatingBar}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 20 }}
                          transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                        >
                          <div className={styles.floatingInfo}>
                            <span className={styles.floatingCount}>{selectedIds.size}</span> agents — {formatUGX(selectedTotal)}
                          </div>
                          <div className={styles.floatingActions}>
                            <button className={styles.floatingApprove} onClick={() => { bulkApproveMutation.mutate(selectedCommissionIds); clearSelection(); }}>
                              {Icons.approve} Approve
                            </button>
                            <button className={styles.floatingReject} onClick={() => { bulkRejectMutation.mutate(selectedCommissionIds); clearSelection(); }}>
                              {Icons.reject} Reject
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* ─── DISPUTE DETAIL VIEW ───────────────────────────── */}
                {view === 'dispute-detail' && selectedDisputeAgent && (
                  <motion.div key="dispute-detail" {...viewAnim}>
                    <div className={styles.detailHeader}>
                      <div className={styles.detailAvatar}>{getInitials(selectedDisputeAgent.agentName)}</div>
                      <div className={styles.detailInfo}>
                        <div className={styles.detailName}>{selectedDisputeAgent.agentName}</div>
                        <div className={styles.detailBranch}>{selectedDisputeAgent.branchName}</div>
                      </div>
                    </div>

                    <div className={styles.detailStats}>
                      <div className={styles.detailStat}>
                        <div className={styles.detailStatLabel}>Disputed</div>
                        <div className={styles.detailStatValue} style={{ color: 'var(--color-status-poor)' }}>{selectedDisputeAgent.disputedCount}</div>
                      </div>
                      <div className={styles.detailStat}>
                        <div className={styles.detailStatLabel}>Amount</div>
                        <div className={styles.detailStatValue}>{fmtShort(selectedDisputeAgent.disputedAmount)}</div>
                      </div>
                    </div>

                    {/* Bulk actions */}
                    <div className={styles.bulkActions}>
                      <button
                        className={styles.bulkApproveBtn}
                        onClick={() => bulkApproveMutation.mutate(selectedDisputeAgent.disputes.map((d) => d.id))}
                      >
                        {Icons.approve}
                        Approve All
                      </button>
                      <button
                        className={styles.bulkRejectBtn}
                        onClick={() => bulkRejectMutation.mutate(selectedDisputeAgent.disputes.map((d) => d.id))}
                      >
                        {Icons.reject}
                        Reject All
                      </button>
                    </div>

                    <div className={styles.section}>
                      <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Disputed Commissions</span>
                      </div>
                      {selectedDisputeAgent.disputes.map((d) => (
                        <div key={d.id} className={styles.txRow}>
                          <div className={styles.txDate}>{formatDate(d.dueDate)}</div>
                          <div className={styles.txName}>
                            <div>{d.subscriberName}</div>
                            <div style={{ fontSize: '10px', color: 'var(--color-status-poor)', marginTop: '2px' }}>{d.reason}</div>
                          </div>
                          <div className={styles.txAmount} style={{ color: 'var(--color-status-poor)' }}>{formatUGX(d.amount)}</div>
                          <div className={styles.txActions}>
                            <button className={styles.approveBtn} onClick={() => approveMutation.mutate(d.id)} aria-label={`Approve ${d.subscriberName}`}>
                              {Icons.approve}
                            </button>
                            <button className={styles.rejectBtn} onClick={() => rejectMutation.mutate(d.id)} aria-label={`Reject ${d.subscriberName}`}>
                              {Icons.reject}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button className={styles.downloadBtn} aria-label="Download as Excel">
                      {Icons.download}
                      Download
                    </button>
                  </motion.div>
                )}

                {/* ─── SETTLEMENT REQUESTS VIEW ─────────────────────── */}
                {view === 'requests' && (
                  <motion.div key="requests" {...viewAnim}>
                    <div className={styles.toolbar}>
                      <div className={styles.searchWrap}>
                        <span className={styles.searchIcon}>{Icons.search}</span>
                        <input
                          className={styles.searchInput}
                          placeholder="Search agents…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          aria-label="Search agents with requests"
                          spellCheck={false}
                        />
                        {search && (
                          <button className={styles.searchClear} onClick={() => setSearch('')} aria-label="Clear search">
                            {Icons.close}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Select all bar */}
                    {filteredRequests.length > 0 && (
                      <div className={styles.selectBar}>
                        <button
                          className={styles.selectAllBtn}
                          onClick={() => {
                            if (selectedIds.size === filteredRequests.length) clearSelection();
                            else selectAll(filteredRequests.map((a) => a.agentId));
                          }}
                        >
                          <span className={styles.checkbox} data-checked={selectedIds.size === filteredRequests.length && filteredRequests.length > 0}>
                            {selectedIds.size === filteredRequests.length && filteredRequests.length > 0 && Icons.approve}
                          </span>
                          {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                        </button>
                        {selectedIds.size > 0 && (
                          <button className={styles.selectClearBtn} onClick={clearSelection}>Clear</button>
                        )}
                      </div>
                    )}

                    {filteredRequests.length === 0 ? (
                      <div className={styles.empty}>No settlement requests</div>
                    ) : (
                      filteredRequests.map((agent) => (
                        <div key={agent.agentId} className={styles.selectableRow} data-selected={selectedIds.has(agent.agentId)}>
                          <button
                            className={styles.checkbox}
                            data-checked={selectedIds.has(agent.agentId)}
                            onClick={() => toggleSelect(agent.agentId)}
                            aria-label={`Select ${agent.agentName}`}
                          >
                            {selectedIds.has(agent.agentId) && Icons.approve}
                          </button>
                          <button
                            className={styles.selectableContent}
                            onClick={() => goRequestDetail(agent)}
                          >
                            <div className={styles.agentAvatar}>{getInitials(agent.agentName)}</div>
                            <div className={styles.agentInfo}>
                              <div className={styles.agentName}>{agent.agentName}</div>
                              <div className={styles.agentBranch}>{agent.branchName}</div>
                            </div>
                            <div>
                              <div className={styles.agentAmount} style={{ color: 'var(--color-indigo-soft)' }}>
                                {agent.requestedCount} requests
                              </div>
                              <div className={styles.agentAmountLabel}>
                                {formatUGX(agent.requestedAmount)}
                              </div>
                            </div>
                          </button>
                        </div>
                      ))
                    )}

                    {/* Floating bulk action bar */}
                    <AnimatePresence>
                      {selectedIds.size > 0 && (
                        <motion.div
                          className={styles.floatingBar}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 20 }}
                          transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                        >
                          <div className={styles.floatingInfo}>
                            <span className={styles.floatingCount}>{selectedIds.size}</span> agents — {formatUGX(selectedTotal)}
                          </div>
                          <div className={styles.floatingActions}>
                            <button className={styles.floatingApprove} onClick={() => { bulkApproveMutation.mutate(selectedCommissionIds); clearSelection(); }}>
                              {Icons.approve} Settle
                            </button>
                            <button className={styles.floatingReject} onClick={() => { bulkRejectMutation.mutate(selectedCommissionIds); clearSelection(); }}>
                              {Icons.reject} Reject
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* ─── REQUEST DETAIL VIEW ───────────────────────────── */}
                {view === 'request-detail' && selectedRequestAgent && (
                  <motion.div key="request-detail" {...viewAnim}>
                    <div className={styles.detailHeader}>
                      <div className={styles.detailAvatar}>{getInitials(selectedRequestAgent.agentName)}</div>
                      <div className={styles.detailInfo}>
                        <div className={styles.detailName}>{selectedRequestAgent.agentName}</div>
                        <div className={styles.detailBranch}>{selectedRequestAgent.branchName}</div>
                      </div>
                    </div>

                    <div className={styles.detailStats}>
                      <div className={styles.detailStat}>
                        <div className={styles.detailStatLabel}>Requests</div>
                        <div className={styles.detailStatValue} style={{ color: 'var(--color-indigo-soft)' }}>{selectedRequestAgent.requestedCount}</div>
                      </div>
                      <div className={styles.detailStat}>
                        <div className={styles.detailStatLabel}>Amount</div>
                        <div className={styles.detailStatValue}>{fmtShort(selectedRequestAgent.requestedAmount)}</div>
                      </div>
                    </div>

                    {/* Bulk actions */}
                    <div className={styles.bulkActions}>
                      <button
                        className={styles.bulkApproveBtn}
                        onClick={() => {
                          const ids = selectedRequestAgent.requests.map((r) => r.id);
                          settleAgentMutation.mutate(selectedRequestAgent.agentId);
                        }}
                      >
                        {Icons.approve}
                        Approve & Settle All
                      </button>
                      <button
                        className={styles.bulkRejectBtn}
                        onClick={() => bulkRejectMutation.mutate(selectedRequestAgent.requests.map((r) => r.id))}
                      >
                        {Icons.reject}
                        Reject All
                      </button>
                    </div>

                    <div className={styles.section}>
                      <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Requested Settlements</span>
                      </div>
                      {selectedRequestAgent.requests.map((r) => (
                        <div key={r.id} className={styles.txRow}>
                          <div className={styles.txDate}>{formatDate(r.dueDate)}</div>
                          <div className={styles.txName}>{r.subscriberName}</div>
                          <div className={styles.txAmount} data-status="due">{formatUGX(r.amount)}</div>
                          <div className={styles.txActions}>
                            <button className={styles.approveBtn} onClick={() => approveMutation.mutate(r.id)} aria-label={`Approve ${r.subscriberName}`}>
                              {Icons.approve}
                            </button>
                            <button className={styles.rejectBtn} onClick={() => rejectMutation.mutate(r.id)} aria-label={`Reject ${r.subscriberName}`}>
                              {Icons.reject}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button className={styles.downloadBtn} aria-label="Download as Excel">
                      {Icons.download}
                      Download
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Settlement Modal */}
            <AnimatePresence>
              {settleModalOpen && (
                <motion.div
                  className={styles.modalOverlay}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <motion.div
                    className={styles.modal}
                    initial={{ opacity: 0, scale: 0.95, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 12 }}
                    transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                  >
                    <div className={styles.modalHeader}>
                      <div className={styles.modalTitle}>Confirm Settlement</div>
                      <div className={styles.modalSubtitle}>
                        {settleScope === 'agent'
                          ? `Settle all due commissions for ${agentDetail?.agentName}`
                          : 'Settle all due commissions across your network'}
                      </div>
                    </div>
                    <div className={styles.modalBody}>
                      <div className={styles.modalSummary}>
                        <div className={styles.modalSummaryLabel}>Total to settle</div>
                        <div className={styles.modalSummaryValue}>
                          {formatUGX(settleScope === 'agent' ? (agentDetail?.totalDue || 0) : (summary?.totalDue || 0))}
                        </div>
                      </div>
                      <div className={styles.modalSummary}>
                        <div className={styles.modalSummaryLabel}>Transactions</div>
                        <div className={styles.modalSummaryValue}>
                          {settleScope === 'agent'
                            ? agentDetail?.dueTransactions?.length || 0
                            : summary?.countDue || 0}
                        </div>
                      </div>
                    </div>
                    <div className={styles.modalActions}>
                      <button className={styles.modalBackBtn} onClick={() => setSettleModalOpen(false)}>
                        Back
                      </button>
                      <button className={styles.modalConfirmBtn} onClick={confirmSettle}>
                        Confirm
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
