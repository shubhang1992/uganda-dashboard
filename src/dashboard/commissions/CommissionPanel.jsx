import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard } from '../../contexts/DashboardContext';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useToast } from '../../contexts/ToastContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { formatUGX, fmtShort, EASE_OUT_EXPO } from '../../utils/finance';
import { cadenceLabel, CADENCES } from '../../utils/settlementCycle';
import { downloadCsv } from '../../utils/csvDownload';
import {
  useCommissionRate, useSetCommissionRate,
  useCommissionSummary, useAgentCommissionList,
  useAgentCommissionDetail, useCommissionSubscribers,
  useDisputedAgentList,
  useNetworkCadence, useSetNetworkCadence,
  useCurrentRun, useRunsList, useBranchRunReview,
  useRunBranchBreakdown, useRunBranchAgents,
  useApproveDispute, useRejectDispute,
  useBulkApproveDisputes, useBulkRejectDisputes,
  useBranchApproveLine, useBranchHoldLine, useBranchApproveAll,
  useBranchDisputeLine,
  useMarkBranchReviewed, useReleaseRun, useReleaseBranch,
} from '../../hooks/useCommission';
import { getInitials } from '../../utils/dashboard';
import styles from './CommissionPanel.module.css';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatRunRange(start, end) {
  if (!start || !end) return '—';
  return `${formatDate(start)} → ${formatDate(end)}`;
}

const RUN_STATE_LABEL = {
  branch_review: 'Branch review',
  released: 'Released',
  cancelled: 'Cancelled',
  draft: 'Draft',
};

const CADENCE_OPTIONS = [
  { value: CADENCES.WEEKLY_FRIDAY, label: 'Weekly · Fridays' },
  { value: CADENCES.BIWEEKLY_FRIDAY, label: 'Bi-weekly · alternate Fridays' },
  { value: CADENCES.MONTHLY_FIRST, label: 'Monthly · 1st of every month' },
];

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
  chev: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="16" height="16">
      <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
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
export default function CommissionPanel({ splitMode = false }) {
  const { commissionsOpen, setCommissionsOpen } = useDashboard();
  const { branchId } = useBranchScope();
  const { addToast } = useToast();

  const isBranch = !!branchId;
  const isDistributor = !branchId;

  // View state
  const [view, setView] = useState('home');
  const [statusFocus, setStatusFocus] = useState(null);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [subFilter, setSubFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState('');
  const [editingCadence, setEditingCadence] = useState(false);
  const [selectedDisputeAgent, setSelectedDisputeAgent] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);
  const [releaseScope, setReleaseScope] = useState('approved'); // 'approved' (bulk) | 'branch'
  const [selectedRunBranchId, setSelectedRunBranchId] = useState(null);

  // Resolution modal — used by both single-row + bulk approve/reject.
  // target: { ids: string[], action: 'approve'|'reject', label: string }
  const [resolutionTarget, setResolutionTarget] = useState(null);
  const [resolutionReason, setResolutionReason] = useState('');
  // Branch-side hold/dispute line action modal.
  // target: { line, action: 'hold'|'dispute' }
  const [lineActionTarget, setLineActionTarget] = useState(null);
  const [lineActionReason, setLineActionReason] = useState('');

  // Data hooks
  const { data: rate } = useCommissionRate();
  const setRateMutation = useSetCommissionRate();
  const { data: cadenceCfg } = useNetworkCadence();
  const setCadenceMutation = useSetNetworkCadence();
  const cadence = cadenceCfg?.cadence || CADENCES.MONTHLY_FIRST;
  const { data: summary } = useCommissionSummary(branchId);
  const { data: currentRun } = useCurrentRun();
  const { data: pastRuns = [] } = useRunsList({ limit: 5, branchId });
  const { data: branchReview } = useBranchRunReview(
    isBranch && currentRun ? currentRun.id : null,
    isBranch ? branchId : null
  );
  const { data: agentList = [] } = useAgentCommissionList(statusFocus);
  const { data: agentDetail } = useAgentCommissionDetail(selectedAgentId);
  const { data: subscribers = [] } = useCommissionSubscribers(selectedAgentId, subFilter);
  const { data: disputedAgents = [] } = useDisputedAgentList();
  const approveDisputeMutation = useApproveDispute();
  const rejectDisputeMutation = useRejectDispute();
  const bulkApproveMutation = useBulkApproveDisputes();
  const bulkRejectMutation = useBulkRejectDisputes();
  const branchDisputeLineMutation = useBranchDisputeLine();
  const branchApproveLineMutation = useBranchApproveLine();
  const branchHoldLineMutation = useBranchHoldLine();
  const branchApproveAllMutation = useBranchApproveAll();
  const markReviewedMutation = useMarkBranchReviewed();
  const releaseRunMutation = useReleaseRun();
  const releaseBranchMutation = useReleaseBranch();
  const { data: runBranches = [] } = useRunBranchBreakdown(currentRun?.id);
  const { data: runBranchAgents = [] } = useRunBranchAgents(
    currentRun?.id,
    selectedRunBranchId
  );

  // Reset state when panel closes
  useEffect(() => {
    if (commissionsOpen) return;
    const t = setTimeout(() => {
      setView('home');
      setStatusFocus(null);
      setSelectedAgentId(null);
      setSubFilter(null);
      setSearch('');
      setEditingRate(false);
      setEditingCadence(false);
      setSelectedDisputeAgent(null);
      setSelectedIds(new Set());
      setReleaseModalOpen(false);
      setReleaseScope('approved');
      setSelectedRunBranchId(null);
      setResolutionTarget(null);
      setResolutionReason('');
      setLineActionTarget(null);
      setLineActionReason('');
    }, 400);
    return () => clearTimeout(t);
  }, [commissionsOpen]);

  // Escape to close
  useEffect(() => {
    if (!commissionsOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') {
        if (releaseModalOpen) setReleaseModalOpen(false);
        else setCommissionsOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [commissionsOpen, releaseModalOpen, setCommissionsOpen]);

  // Branch-scoped lists
  const scopedAgentList = useMemo(
    () => isBranch ? agentList.filter(a => a.branchId === branchId) : agentList,
    [agentList, branchId, isBranch]
  );
  const scopedDisputedAgents = useMemo(
    () => isBranch ? disputedAgents.filter(a => a.branchId === branchId) : disputedAgents,
    [disputedAgents, branchId, isBranch]
  );

  // Debounce the search input — the filter memos below run a full
  // `.toLowerCase()` + `.includes()` pass over the agent list on every
  // keystroke. With 2k+ agents that's enough work to drop a frame on every
  // letter. 200ms aligns with the OverlayPanel debounce so the two search
  // surfaces feel uniform.
  const debouncedSearch = useDebouncedValue(search, 200);

  const filteredAgents = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return scopedAgentList;
    return scopedAgentList.filter((a) =>
      a.agentName.toLowerCase().includes(q) || a.branchName.toLowerCase().includes(q)
    );
  }, [scopedAgentList, debouncedSearch]);

  const filteredDisputed = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return scopedDisputedAgents;
    return scopedDisputedAgents.filter((a) =>
      a.agentName.toLowerCase().includes(q) || a.branchName.toLowerCase().includes(q)
    );
  }, [scopedDisputedAgents, debouncedSearch]);

  // Branch view of the open run
  const branchSliceTotal = branchReview?.lines?.reduce((s, c) => s + (c.amount || 0), 0) || 0;
  const branchPendingLines = branchReview?.lines?.filter((c) => c.status === 'in_run') || [];
  const branchHeldLines = branchReview?.lines?.filter((c) => c.status === 'held') || [];

  // Navigation
  function goHome() {
    setView('home');
    setStatusFocus(null);
    setSelectedAgentId(null);
    setSubFilter(null);
    setSearch('');
    setSelectedIds(new Set());
  }
  function goAgents(focus) { setStatusFocus(focus); setView('agents'); setSearch(''); }
  function goAgentDetail(agentId) { setSelectedAgentId(agentId); setView('agent-detail'); setSubFilter(null); }
  function goSubscribers(filter) { setSubFilter(filter); setView('subscribers'); }
  function goDisputed() { setView('disputed'); setSearch(''); setSelectedIds(new Set()); }
  function goDisputeDetail(agent) { setSelectedDisputeAgent(agent); setView('dispute-detail'); }
  function goRunDetail() { setView('run-detail'); }
  function goBranchReview() { setView('branch-review'); setSelectedIds(new Set()); }
  function goRunsHistory() { setView('runs-history'); }
  function goRunBranchDetail(branchId) {
    setSelectedRunBranchId(branchId);
    setView('run-branch-detail');
  }

  // Multi-select
  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll(ids) { setSelectedIds(new Set(ids)); }
  function clearSelection() { setSelectedIds(new Set()); }

  function handleBack() {
    if (view === 'subscribers') setView('agent-detail');
    else if (view === 'agent-detail') setView('agents');
    else if (view === 'agents') goHome();
    else if (view === 'dispute-detail') setView('disputed');
    else if (view === 'disputed') goHome();
    else if (view === 'run-detail') goHome();
    else if (view === 'run-branch-detail') setView('run-detail');
    else if (view === 'branch-review') goHome();
    else if (view === 'runs-history') goHome();
  }

  function startEditRate() {
    setRateInput(String(rate || 5000));
    setEditingRate(true);
  }
  function saveRate() {
    const val = parseInt(rateInput);
    if (!isNaN(val) && val > 0) setRateMutation.mutate(val);
    setEditingRate(false);
  }

  async function handleCadenceSelect(next) {
    if (next === cadence) { setEditingCadence(false); return; }
    try {
      await setCadenceMutation.mutateAsync(next);
      addToast('success', 'Settlement cadence updated.');
    } catch {
      addToast('error', 'Could not update cadence.');
    }
    setEditingCadence(false);
  }

  async function handleReleaseConfirm() {
    if (!currentRun) return;
    try {
      if (releaseScope === 'branch' && selectedRunBranchId) {
        await releaseBranchMutation.mutateAsync({
          runId: currentRun.id,
          branchId: selectedRunBranchId,
        });
        addToast('success', 'Branch released.');
      } else {
        await releaseRunMutation.mutateAsync({ runId: currentRun.id });
        addToast('success', `Released ${currentRun.branchApprovedCount} approved branch${currentRun.branchApprovedCount === 1 ? '' : 'es'}.`);
      }
      setReleaseModalOpen(false);
    } catch (err) {
      addToast('error', err?.message || 'Could not release.');
    }
  }

  function openBulkReleaseModal() {
    setReleaseScope('approved');
    setReleaseModalOpen(true);
  }

  function openBranchReleaseModal(branchId) {
    setReleaseScope('branch');
    setSelectedRunBranchId(branchId);
    setReleaseModalOpen(true);
  }

  // disputes is the list of dispute records (each with { id, previousStatus, ... }).
  // contextLabel is a short human description, e.g. 'Diana Musinguzi' or 'across 5 agents'.
  function openResolutionModal(action, disputes, contextLabel) {
    const POST_PAYMENT = new Set(['released', 'confirmed']);
    const ids = disputes.map((d) => d.id);
    let prePaymentCount = 0;
    let postPaymentCount = 0;
    for (const d of disputes) {
      if (POST_PAYMENT.has(d.previousStatus)) postPaymentCount += 1;
      else prePaymentCount += 1;
    }
    setResolutionTarget({ action, ids, contextLabel, prePaymentCount, postPaymentCount });
    setResolutionReason('');
  }

  async function submitResolution() {
    if (!resolutionTarget) return;
    const reason = resolutionReason.trim();
    if (!reason) return;
    const ids = resolutionTarget.ids;
    const isApprove = resolutionTarget.action === 'approve';
    const resolvedBy = isBranch ? 'Branch admin' : 'Distributor admin';
    try {
      if (ids.length === 1) {
        const mutate = isApprove ? approveDisputeMutation : rejectDisputeMutation;
        await mutate.mutateAsync({ commissionId: ids[0], outcomeReason: reason, resolvedBy });
      } else {
        const mutate = isApprove ? bulkApproveMutation : bulkRejectMutation;
        await mutate.mutateAsync({ commissionIds: ids, outcomeReason: reason, resolvedBy });
      }
      addToast('success', isApprove ? 'Dispute approved.' : 'Dispute rejected.');
      setResolutionTarget(null);
      setResolutionReason('');
    } catch {
      addToast('error', 'Could not resolve dispute.');
    }
  }

  function openLineAction(action, line) {
    setLineActionTarget({ action, line });
    setLineActionReason('');
  }

  async function submitLineAction() {
    if (!lineActionTarget) return;
    const reason = lineActionReason.trim();
    if (!reason) return;
    const { action, line } = lineActionTarget;
    try {
      if (action === 'hold') {
        await branchHoldLineMutation.mutateAsync({ commissionId: line.id, reason });
        addToast('success', 'Line held for the next run.');
      } else {
        await branchDisputeLineMutation.mutateAsync({ commissionId: line.id, reason });
        addToast('success', 'Dispute filed.');
      }
      setLineActionTarget(null);
      setLineActionReason('');
    } catch {
      addToast('error', 'Could not save action.');
    }
  }

  async function handleBranchSignOff() {
    if (!currentRun || !branchId) return;
    try {
      await branchApproveAllMutation.mutateAsync({ runId: currentRun.id, branchId });
      await markReviewedMutation.mutateAsync({ runId: currentRun.id, branchId });
      addToast('success', 'Branch sign-off submitted.');
      goHome();
    } catch {
      addToast('error', 'Could not submit sign-off.');
    }
  }

  // ── Agent commission detail CSV download ──────────────────────────────────
  // Wires the "Download" button at the bottom of the agent-detail view to a
  // real CSV export. We flatten the paid + due transactions into one table so
  // the export is a self-contained ledger of the agent's commission lines.
  // Hidden when there's no agentDetail (e.g. while the detail query loads).
  const isMobile = useIsMobile();
  const handleAgentDetailDownload = useCallback(async () => {
    if (!agentDetail) return;
    const rows = [
      ...(agentDetail.paidTransactions || []).map((tx) => ({
        date: tx.transactionDate,
        subscriber: tx.subscriberName,
        amount: tx.amount,
        status: tx.status === 'confirmed' ? 'Paid (confirmed)' : 'Paid (awaiting agent)',
      })),
      ...(agentDetail.dueTransactions || []).map((tx) => ({
        date: tx.dueDate,
        subscriber: tx.subscriberName,
        amount: tx.amount,
        status: tx.status === 'in_run'
          ? 'Due (in current run)'
          : tx.status === 'held'
            ? 'Due (held)'
            : 'Due',
      })),
    ];
    const columns = [
      { key: 'date', label: 'Date' },
      { key: 'subscriber', label: 'Subscriber' },
      { key: 'amount', label: 'Amount (UGX)' },
      { key: 'status', label: 'Status' },
    ];
    try {
      await downloadCsv({
        rows,
        columns,
        // Filename slug — agent name + ID keep the file searchable on disk.
        filename: `commissions-${agentDetail.agentName || 'agent'}-${agentDetail.agentId || ''}`,
        isMobile,
        onCapNotice: ({ capped, total }) => {
          addToast(
            'warning',
            `Showing first ${capped.toLocaleString()} rows in export — refine your filter for full data (${total.toLocaleString()} total).`,
          );
        },
      });
    } catch (err) {
      addToast('error', err?.message || 'Could not download commission ledger.');
    }
  }, [agentDetail, isMobile, addToast]);

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
      items.push({ label: 'Disputes', view: 'disputed' });
    }
    if (view === 'dispute-detail') {
      items.push({ label: selectedDisputeAgent?.agentName || '…', view: 'dispute-detail' });
    }
    if (view === 'run-detail' || view === 'run-branch-detail') {
      items.push({ label: 'Branch sign-off', view: 'run-detail' });
    }
    if (view === 'run-branch-detail') {
      const branch = runBranches.find((b) => b.branchId === selectedRunBranchId);
      items.push({ label: branch?.branchName || selectedRunBranchId || '…', view: 'run-branch-detail' });
    }
    if (view === 'branch-review') items.push({ label: 'Review run', view: 'branch-review' });
    if (view === 'runs-history') items.push({ label: 'Settlement history', view: 'runs-history' });
    return items;
  }, [view, statusFocus, agentDetail, subFilter, selectedDisputeAgent, runBranches, selectedRunBranchId]);

  const titles = {
    home: { title: 'Commission Settlement', subtitle: isBranch ? 'Review and sign off on your branch slice' : 'Manage runs, cadence and disputes' },
    agents: { title: statusFocus === 'paid' ? 'Commissions Paid' : statusFocus === 'due' ? 'Commissions Due' : 'Total Commissions', subtitle: `${filteredAgents.length} agents` },
    'agent-detail': { title: agentDetail?.agentName || '…', subtitle: agentDetail?.branchName || '' },
    subscribers: { title: subFilter === 'active' ? 'Active Subscribers' : subFilter === 'dormant' ? 'Dormant Subscribers' : 'Subscribers', subtitle: `${subscribers.length} subscribers` },
    disputed: { title: 'Disputed Settlements', subtitle: `${filteredDisputed.length} agents with disputes` },
    'dispute-detail': { title: selectedDisputeAgent?.agentName || '…', subtitle: `${selectedDisputeAgent?.disputedCount || 0} disputed commissions` },
    'run-detail': { title: 'Branch sign-off', subtitle: currentRun ? formatRunRange(currentRun.openedAt, currentRun.closesAt) : '' },
    'run-branch-detail': (() => {
      const branch = runBranches.find((b) => b.branchId === selectedRunBranchId);
      return {
        title: branch?.branchName || selectedRunBranchId || 'Branch detail',
        subtitle: branch ? `${branch.branchId} · ${RUN_STATE_LABEL[branch.state] || branch.state}` : '',
      };
    })(),
    'branch-review': { title: 'Review settlement run', subtitle: `${branchReview?.lines?.length || 0} commission${branchReview?.lines?.length === 1 ? '' : 's'} for your branch` },
    'runs-history': { title: 'Settlement history', subtitle: `${pastRuns.length} run${pastRuns.length === 1 ? '' : 's'}` },
  };
  const { title, subtitle } = titles[view] || titles.home;

  return (
    <AnimatePresence>
      {commissionsOpen && (
        <>
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

          <motion.div
            className={styles.panel}
            data-split-mode={splitMode || undefined}
            initial={{ x: '100%' }}
            animate={{ x: 0, transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            exit={{ x: '100%', transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            role="dialog"
            aria-modal="true"
            aria-label="Commission Settlement"
          >
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
                        else if (item.view === 'run-detail') setView('run-detail');
                        else if (item.view === 'run-branch-detail') setView('run-branch-detail');
                        else if (item.view === 'branch-review') setView('branch-review');
                        else if (item.view === 'runs-history') setView('runs-history');
                      }}
                    >
                      {item.label}
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className={styles.body}>
              <AnimatePresence mode="wait">
                {/* ─── HOME VIEW ─────────────────────────────────────── */}
                {view === 'home' && (
                  <motion.div key="home" {...viewAnim}>
                    {/* ── Active settlement run card ── */}
                    {currentRun && (
                      <div className={styles.runCard}>
                        <div className={styles.runCardEyebrow}>
                          {isBranch ? 'Open run · sign-off needed' : 'Active settlement run'}
                        </div>
                        <div className={styles.runCardTitle}>
                          {formatRunRange(currentRun.openedAt, currentRun.closesAt)}
                        </div>
                        <div className={styles.runCardMetrics}>
                          {isBranch ? (
                            <>
                              <div className={styles.runMetric}>
                                <span className={styles.runMetricLabel}>Commissions for your branch</span>
                                <span className={styles.runMetricValue}>{branchReview?.lines?.length || 0}</span>
                              </div>
                              <div className={styles.runMetric}>
                                <span className={styles.runMetricLabel}>Branch total</span>
                                <span className={styles.runMetricValue}>{formatUGX(branchSliceTotal)}</span>
                              </div>
                              <div className={styles.runMetric}>
                                <span className={styles.runMetricLabel}>Status</span>
                                <span className={styles.runMetricValue}>
                                  {branchReview?.reviewState === 'approved' ? 'Approved' : 'Pending review'}
                                </span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className={styles.runMetric}>
                                <span className={styles.runMetricLabel}>Total</span>
                                <span className={styles.runMetricValue}>{formatUGX(currentRun.totalAmount)}</span>
                              </div>
                              <div className={styles.runMetric}>
                                <span className={styles.runMetricLabel}>Agents</span>
                                <span className={styles.runMetricValue}>{(currentRun.agentCount || 0).toLocaleString()}</span>
                              </div>
                              <div className={styles.runMetric}>
                                <span className={styles.runMetricLabel}>Branch sign-off</span>
                                <span className={styles.runMetricValue}>
                                  {currentRun.branchApprovedCount} / {currentRun.branchCount}
                                </span>
                              </div>
                            </>
                          )}
                        </div>

                        <div className={styles.runCardActions}>
                          {isBranch ? (
                            <button
                              className={styles.runPrimaryBtn}
                              onClick={goBranchReview}
                              disabled={branchReview?.reviewState === 'approved'}
                            >
                              {branchReview?.reviewState === 'approved' ? 'Already approved' : 'Review and approve'}
                            </button>
                          ) : (
                            <>
                              <button className={styles.runSecondaryBtn} onClick={goRunDetail}>
                                View branches
                              </button>
                              <button
                                className={styles.runPrimaryBtn}
                                onClick={openBulkReleaseModal}
                                disabled={!currentRun.canReleaseAny}
                              >
                                {Icons.wallet}
                                {currentRun.canReleaseAny
                                  ? `Release ${currentRun.branchApprovedCount} approved · ${formatUGX(currentRun.approvedAmount || 0)}`
                                  : 'No branches ready'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {!currentRun && (
                      <div className={styles.emptyRunCard}>
                        <div className={styles.runCardEyebrow}>No open run</div>
                        <p className={styles.emptyRunCopy}>
                          {isBranch
                            ? 'You will be notified here when the next run opens for review.'
                            : 'The next run opens automatically on your scheduled cadence.'}
                        </p>
                      </div>
                    )}

                    {/* ── Settings: settlement cycle + rate (distributor only) ── */}
                    {isDistributor && (
                      <div className={styles.settingsGrid}>
                        <div className={styles.cadenceCard}>
                          <div className={styles.cadenceHead}>
                            <div>
                              <div className={styles.cadenceEyebrow}>Settlement cycle</div>
                              <div className={styles.cadenceValue}>{cadenceLabel(cadence)}</div>
                              <div className={styles.cadenceSub}>
                                Next run opens · {formatDate(cadenceCfg?.nextRunDate)}
                              </div>
                            </div>
                            <button
                              className={styles.rateEditBtn}
                              onClick={() => setEditingCadence((v) => !v)}
                              aria-label="Edit settlement cycle"
                            >
                              {Icons.edit}
                            </button>
                          </div>
                          {editingCadence && (
                            <div className={styles.cadenceOptions}>
                              {CADENCE_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  className={styles.cadenceOption}
                                  data-active={opt.value === cadence}
                                  onClick={() => handleCadenceSelect(opt.value)}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className={styles.cadenceCard}>
                          <div className={styles.cadenceHead}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className={styles.cadenceEyebrow}>Rate per subscriber</div>
                              {editingRate ? (
                                <div className={styles.rateEditRow} style={{ marginTop: 6 }}>
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
                                </div>
                              ) : (
                                <>
                                  <div className={styles.cadenceValue}>{formatUGX(rate || 0)}</div>
                                  <div className={styles.cadenceSub}>Paid for every first-contribution onboarding</div>
                                </>
                              )}
                            </div>
                            {!editingRate && (
                              <button
                                className={styles.rateEditBtn}
                                onClick={startEditRate}
                                aria-label="Edit commission rate"
                              >
                                {Icons.edit}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Summary strip ── */}
                    <div className={styles.summaryStrip}>
                      <button className={styles.summaryItem} onClick={() => goAgents(null)}>
                        <span className={styles.summaryItemLabel}>Total</span>
                        <span className={styles.summaryItemValue}>{fmtShort(summary?.totalCommissions || 0)}</span>
                        <span className={styles.summaryItemCount}>{(summary?.countTotal || 0).toLocaleString()} records</span>
                      </button>
                      <button className={styles.summaryItem} onClick={() => goAgents('paid')}>
                        <span className={styles.summaryItemLabel}>Settled</span>
                        <span className={styles.summaryItemValue}>{fmtShort(summary?.totalPaid || 0)}</span>
                        <span className={styles.summaryItemCount}>{(summary?.countPaid || 0).toLocaleString()} paid</span>
                      </button>
                      <button className={styles.summaryItem} onClick={() => goAgents('due')}>
                        <span className={styles.summaryItemLabel}>Outstanding</span>
                        <span className={styles.summaryItemValue}>{fmtShort(summary?.totalDue || 0)}</span>
                        <span className={styles.summaryItemCount}>{(summary?.countDue || 0).toLocaleString()} owed</span>
                      </button>
                    </div>

                    {/* ── Settlement history ── */}
                    <div className={styles.section}>
                      <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Settlement history</span>
                        {pastRuns.length > 0 && (
                          <button className={styles.sectionAction} onClick={goRunsHistory}>View all</button>
                        )}
                      </div>
                      {pastRuns.length === 0 ? (
                        <div className={styles.empty}>No runs yet</div>
                      ) : (
                        pastRuns.slice(0, 4).map((run) => (
                          <div key={run.id} className={styles.runRow}>
                            <div className={styles.runRowMain}>
                              <div className={styles.runRowTitle}>{formatRunRange(run.openedAt, run.closesAt)}</div>
                              <div className={styles.runRowSub}>
                                {run.state === 'released' && `Released ${formatDate(run.releasedAt)}`}
                                {run.state === 'branch_review' && `${run.branchApprovedCount} of ${run.branchCount} branches approved`}
                                {run.state === 'cancelled' && 'Cancelled'}
                              </div>
                            </div>
                            <div className={styles.runRowAmount}>{formatUGX(run.totalAmount)}</div>
                            <span className={styles.runStateBadge} data-state={run.state}>
                              {RUN_STATE_LABEL[run.state] || run.state}
                            </span>
                          </div>
                        ))
                      )}
                    </div>

                    {/* ── Disputes ── */}
                    {scopedDisputedAgents.length > 0 && (
                      <button className={styles.attentionRow} data-type="disputed" onClick={goDisputed}>
                        <div className={styles.attentionAccent} data-type="disputed" />
                        <div className={styles.attentionInfo}>
                          <div className={styles.attentionLabel}>Disputed Settlements</div>
                          <div className={styles.attentionDesc}>
                            {formatUGX(summary?.totalDisputed || 0)} across {scopedDisputedAgents.length} agents
                          </div>
                        </div>
                        <div className={styles.attentionCount} data-type="disputed">{summary?.countDisputed || 0}</div>
                        <span aria-hidden="true" style={{ color: 'var(--color-gray)', flexShrink: 0 }}>{Icons.chev}</span>
                      </button>
                    )}

                  </motion.div>
                )}

                {/* ─── RUN DETAIL VIEW (distributor) ─────────────────── */}
                {view === 'run-detail' && currentRun && (
                  <motion.div key="run-detail" {...viewAnim}>
                    <div className={styles.runHeader}>
                      <div className={styles.runHeaderRow}>
                        <div className={styles.runHeaderStat}>
                          <span className={styles.runMetricLabel}>Total</span>
                          <span className={styles.runHeaderValue}>{formatUGX(currentRun.totalAmount)}</span>
                        </div>
                        <div className={styles.runHeaderStat}>
                          <span className={styles.runMetricLabel}>Commissions</span>
                          <span className={styles.runHeaderValue}>{currentRun.commissionCount.toLocaleString()}</span>
                        </div>
                        <div className={styles.runHeaderStat}>
                          <span className={styles.runMetricLabel}>Approved</span>
                          <span className={styles.runHeaderValue}>{currentRun.branchApprovedCount} / {currentRun.branchCount}</span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.section}>
                      <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Branches in this run</span>
                      </div>
                      {runBranches.map((row) => (
                        <button
                          key={row.branchId}
                          className={styles.runBranchRow}
                          onClick={() => goRunBranchDetail(row.branchId)}
                        >
                          <div className={styles.runBranchMain}>
                            <div className={styles.runBranchName}>{row.branchName}</div>
                            <div className={styles.runBranchSub}>
                              {row.branchId} · {row.count} commission{row.count === 1 ? '' : 's'}
                              {row.reviewedAt ? ` · approved ${formatDate(row.reviewedAt)}` : ''}
                              {row.releasedAt ? ` · released ${formatDate(row.releasedAt)}` : ''}
                            </div>
                          </div>
                          <div className={styles.runBranchAmount}>{formatUGX(row.amount)}</div>
                          <span className={styles.runStateBadge} data-state={row.state}>
                            {row.state}
                          </span>
                          <span className={styles.runBranchChev} aria-hidden="true">{Icons.chev}</span>
                        </button>
                      ))}
                    </div>

                    <button
                      className={styles.settleAllBtn}
                      onClick={openBulkReleaseModal}
                      disabled={!currentRun.canReleaseAny}
                    >
                      {Icons.wallet}
                      {currentRun.canReleaseAny
                        ? `Release ${currentRun.branchApprovedCount} approved · ${formatUGX(currentRun.approvedAmount || 0)}`
                        : 'No branches ready to release'}
                    </button>
                  </motion.div>
                )}

                {/* ─── RUN BRANCH DETAIL (distributor) ───────────────── */}
                {view === 'run-branch-detail' && currentRun && selectedRunBranchId && (() => {
                  const branchRow = runBranches.find((b) => b.branchId === selectedRunBranchId);
                  if (!branchRow) return null;
                  const canReleaseThis = branchRow.state === 'approved';
                  return (
                    <motion.div key="run-branch-detail" {...viewAnim}>
                      <div className={styles.runHeader}>
                        <div className={styles.runHeaderRow}>
                          <div className={styles.runHeaderStat}>
                            <span className={styles.runMetricLabel}>Branch total</span>
                            <span className={styles.runHeaderValue}>{formatUGX(branchRow.amount)}</span>
                          </div>
                          <div className={styles.runHeaderStat}>
                            <span className={styles.runMetricLabel}>Commissions</span>
                            <span className={styles.runHeaderValue}>{branchRow.count.toLocaleString()}</span>
                          </div>
                          <div className={styles.runHeaderStat}>
                            <span className={styles.runMetricLabel}>State</span>
                            <span className={styles.runHeaderValue}>{RUN_STATE_LABEL[branchRow.state] || branchRow.state}</span>
                          </div>
                        </div>
                      </div>

                      <div className={styles.section}>
                        <div className={styles.sectionHeader}>
                          <span className={styles.sectionTitle}>Agents in this branch</span>
                        </div>
                        {runBranchAgents.length === 0 ? (
                          <div className={styles.empty}>No commissions in this branch for this run</div>
                        ) : (
                          runBranchAgents.map((agent) => (
                            <div key={agent.agentId} className={styles.agentBlock}>
                              <div className={styles.agentBlockHead}>
                                <div className={styles.agentAvatar}>{getInitials(agent.agentName)}</div>
                                <div className={styles.agentInfo}>
                                  <div className={styles.agentName}>{agent.agentName}</div>
                                  <div className={styles.agentBranch}>
                                    {agent.employeeId || agent.agentId} · {agent.count} commission{agent.count === 1 ? '' : 's'}
                                  </div>
                                </div>
                                <div className={styles.agentBlockAmount}>{formatUGX(agent.amount)}</div>
                              </div>
                              <div className={styles.agentLineList}>
                                {agent.commissions.map((c) => (
                                  <div key={c.id} className={styles.agentLineRow}>
                                    <span className={styles.agentLineName}>{c.subscriberName}</span>
                                    <span className={styles.agentLineAmount}>{formatUGX(c.amount)}</span>
                                    <span className={styles.runStateBadge} data-state={c.status === 'in_run' ? 'branch_review' : c.status === 'released' || c.status === 'confirmed' ? 'released' : 'cancelled'}>
                                      {c.status.replace('_', ' ')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <button
                        className={styles.settleAllBtn}
                        onClick={() => openBranchReleaseModal(branchRow.branchId)}
                        disabled={!canReleaseThis}
                      >
                        {Icons.wallet}
                        {branchRow.state === 'released'
                          ? 'Already released'
                          : canReleaseThis
                            ? `Release this branch (${formatUGX(branchRow.amount)})`
                            : 'Waiting for branch sign-off'}
                      </button>
                    </motion.div>
                  );
                })()}

                {/* ─── BRANCH REVIEW VIEW ────────────────────────────── */}
                {view === 'branch-review' && branchReview && (
                  <motion.div key="branch-review" {...viewAnim}>
                    <div className={styles.runHeader}>
                      <div className={styles.runHeaderRow}>
                        <div className={styles.runHeaderStat}>
                          <span className={styles.runMetricLabel}>Pending review</span>
                          <span className={styles.runHeaderValue}>{branchPendingLines.length}</span>
                        </div>
                        <div className={styles.runHeaderStat}>
                          <span className={styles.runMetricLabel}>On hold</span>
                          <span className={styles.runHeaderValue}>{branchHeldLines.length}</span>
                        </div>
                        <div className={styles.runHeaderStat}>
                          <span className={styles.runMetricLabel}>Branch total</span>
                          <span className={styles.runHeaderValue}>{formatUGX(branchSliceTotal)}</span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.section}>
                      <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Lines in this run</span>
                      </div>
                      {branchReview.lines.map((line) => (
                        <div key={line.id} className={styles.txRow}>
                          <div className={styles.txName}>
                            <div>{line.subscriberName}</div>
                            <div style={{ fontSize: '10px', color: 'var(--color-gray)', marginTop: '2px' }}>
                              {line.id} · agent {line.agentId}
                            </div>
                            {line.status === 'held' && line.holdReason && (
                              <div style={{ fontSize: '10px', color: 'var(--color-status-warning)', marginTop: '2px' }}>
                                Held: {line.holdReason}
                              </div>
                            )}
                          </div>
                          <div className={styles.txAmount} data-status={line.status === 'in_run' ? 'due' : 'paid'}>
                            {formatUGX(line.amount)}
                          </div>
                          <div className={styles.txActions}>
                            {line.status === 'in_run' && (
                              <>
                                <button
                                  className={styles.holdBtn}
                                  onClick={() => openLineAction('hold', line)}
                                  aria-label={`Hold ${line.subscriberName}`}
                                  title="Hold for next run"
                                >
                                  Hold
                                </button>
                                <button
                                  className={styles.rejectBtn}
                                  onClick={() => openLineAction('dispute', line)}
                                  aria-label={`Flag dispute on ${line.subscriberName}`}
                                  title="Flag a dispute"
                                >
                                  {Icons.reject}
                                </button>
                              </>
                            )}
                            {line.status === 'held' && (
                              <button
                                className={styles.approveBtn}
                                onClick={() => branchApproveLineMutation.mutate(line.id)}
                                aria-label={`Restore ${line.subscriberName}`}
                                title="Restore into run"
                              >
                                {Icons.approve}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {branchReview.reviewState !== 'approved' && (
                      <button
                        className={styles.settleAllBtn}
                        onClick={handleBranchSignOff}
                        disabled={branchApproveAllMutation.isPending || markReviewedMutation.isPending}
                      >
                        {Icons.approve}
                        Submit branch sign-off
                      </button>
                    )}
                  </motion.div>
                )}

                {/* ─── RUNS HISTORY VIEW ─────────────────────────────── */}
                {view === 'runs-history' && (
                  <motion.div key="runs-history" {...viewAnim}>
                    <div className={styles.section}>
                      {pastRuns.length === 0 ? (
                        <div className={styles.empty}>No runs yet</div>
                      ) : (
                        pastRuns.map((run) => (
                          <div key={run.id} className={styles.runRow}>
                            <div className={styles.runRowMain}>
                              <div className={styles.runRowTitle}>{formatRunRange(run.openedAt, run.closesAt)}</div>
                              <div className={styles.runRowSub}>
                                {run.commissionCount.toLocaleString()} commission{run.commissionCount === 1 ? '' : 's'}
                                {run.releasedAt ? ` · released ${formatDate(run.releasedAt)}` : ''}
                              </div>
                            </div>
                            <div className={styles.runRowAmount}>{formatUGX(run.totalAmount)}</div>
                            <span className={styles.runStateBadge} data-state={run.state}>
                              {RUN_STATE_LABEL[run.state] || run.state}
                            </span>
                          </div>
                        ))
                      )}
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
                            <div className={styles.agentBranch}>{agent.branchName}{agent.employeeId ? ` · ${agent.employeeId}` : ''}</div>
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
                  </motion.div>
                )}

                {/* ─── AGENT DETAIL VIEW ─────────────────────────────── */}
                {view === 'agent-detail' && agentDetail && (
                  <motion.div key="agent-detail" {...viewAnim}>
                    <div className={styles.detailHeader}>
                      <div className={styles.detailAvatar}>{getInitials(agentDetail.agentName)}</div>
                      <div className={styles.detailInfo}>
                        <div className={styles.detailName}>{agentDetail.agentName}</div>
                        <div className={styles.detailBranch}>{agentDetail.branchName}{agentDetail.employeeId ? ` · ${agentDetail.employeeId}` : ''}</div>
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
                          <div className={styles.txBadge} data-confirmed={tx.status === 'confirmed'}>
                            {tx.status === 'confirmed' ? 'Confirmed' : 'Awaiting agent'}
                          </div>
                        </div>
                      ))}
                      {agentDetail.paidTransactions.length > 5 && (
                        <div className={styles.sectionAction}>
                          +{agentDetail.paidTransactions.length - 5} more transactions
                        </div>
                      )}
                    </div>

                    <div className={styles.section}>
                      <div className={styles.sectionHeader}>
                        <div>
                          <span className={styles.sectionTitle}>Outstanding</span>
                          <span className={styles.sectionCount}> — {formatUGX(agentDetail.totalDue)}</span>
                        </div>
                      </div>
                      {agentDetail.dueTransactions.slice(0, 5).map((tx) => (
                        <div key={tx.id} className={styles.txRow}>
                          <div className={styles.txDate}>{formatDate(tx.dueDate)}</div>
                          <div className={styles.txName}>{tx.subscriberName}</div>
                          <div className={styles.txAmount} data-status="due">{formatUGX(tx.amount)}</div>
                          <div className={styles.txBadge} data-confirmed={tx.status === 'in_run'}>
                            {tx.status === 'in_run' ? 'In current run' : tx.status === 'held' ? 'On hold' : `${tx.daysToDate >= 0 ? `${tx.daysToDate}d` : `${Math.abs(tx.daysToDate)}d overdue`}`}
                          </div>
                        </div>
                      ))}
                      {agentDetail.dueTransactions.length > 5 && (
                        <div className={styles.sectionAction}>
                          +{agentDetail.dueTransactions.length - 5} more outstanding
                        </div>
                      )}
                    </div>

                    <button
                      className={styles.downloadBtn}
                      onClick={handleAgentDetailDownload}
                      aria-label="Download commission ledger as CSV"
                      type="button"
                    >
                      {Icons.download}
                      Download
                    </button>
                  </motion.div>
                )}

                {/* ─── SUBSCRIBERS VIEW ──────────────────────────────── */}
                {view === 'subscribers' && (
                  <motion.div key="subscribers" {...viewAnim}>
                    <div className={styles.filterPills}>
                      <button className={styles.filterPill} data-active={!subFilter} onClick={() => setSubFilter(null)}>All</button>
                      <button className={styles.filterPill} data-active={subFilter === 'active'} onClick={() => setSubFilter('active')}>Active</button>
                      <button className={styles.filterPill} data-active={subFilter === 'dormant'} onClick={() => setSubFilter('dormant')}>Dormant</button>
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
                              <div className={styles.agentBranch}>{agent.branchName}{agent.employeeId ? ` · ${agent.employeeId}` : ''}</div>
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
                            <span className={styles.floatingCount}>{selectedIds.size}</span> agents
                          </div>
                          <div className={styles.floatingActions}>
                            <button
                              className={styles.floatingApprove}
                              onClick={() => {
                                const disputes = filteredDisputed
                                  .filter((a) => selectedIds.has(a.agentId))
                                  .flatMap((a) => a.disputes);
                                openResolutionModal('approve', disputes, `across ${selectedIds.size} agent${selectedIds.size === 1 ? '' : 's'}`);
                                clearSelection();
                              }}
                            >
                              {Icons.approve} Approve
                            </button>
                            <button
                              className={styles.floatingReject}
                              onClick={() => {
                                const disputes = filteredDisputed
                                  .filter((a) => selectedIds.has(a.agentId))
                                  .flatMap((a) => a.disputes);
                                openResolutionModal('reject', disputes, `across ${selectedIds.size} agent${selectedIds.size === 1 ? '' : 's'}`);
                                clearSelection();
                              }}
                            >
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
                        <div className={styles.detailBranch}>{selectedDisputeAgent.branchName}{selectedDisputeAgent.employeeId ? ` · ${selectedDisputeAgent.employeeId}` : ''}</div>
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

                    {selectedDisputeAgent.disputes.length > 1 && (
                      <div className={styles.bulkActions}>
                        <button
                          className={styles.bulkApproveBtn}
                          onClick={() => openResolutionModal(
                            'approve',
                            selectedDisputeAgent.disputes,
                            `all ${selectedDisputeAgent.disputes.length} disputes for ${selectedDisputeAgent.agentName}`
                          )}
                        >
                          {Icons.approve}
                          Approve all ({selectedDisputeAgent.disputes.length})
                        </button>
                        <button
                          className={styles.bulkRejectBtn}
                          onClick={() => openResolutionModal(
                            'reject',
                            selectedDisputeAgent.disputes,
                            `all ${selectedDisputeAgent.disputes.length} disputes for ${selectedDisputeAgent.agentName}`
                          )}
                        >
                          {Icons.reject}
                          Reject all ({selectedDisputeAgent.disputes.length})
                        </button>
                      </div>
                    )}

                    <div className={styles.section}>
                      <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Disputed Commissions</span>
                      </div>
                      {selectedDisputeAgent.disputes.map((d) => (
                        <div key={d.id} className={styles.txRow}>
                          <div className={styles.txDate}>
                            {d.disputedAt ? `Filed ${formatDate(d.disputedAt)}` : `Due ${formatDate(d.dueDate)}`}
                            {d.disputedBy && (
                              <div style={{ fontSize: '10px', color: 'var(--color-gray)', marginTop: '2px' }}>
                                by {d.disputedBy}
                                {d.previousStatus === 'released' || d.previousStatus === 'confirmed' ? ' · post-payment' : ''}
                              </div>
                            )}
                          </div>
                          <div className={styles.txName}>
                            <div>{d.subscriberName}</div>
                            <div style={{ fontSize: '10px', color: 'var(--color-status-poor)', marginTop: '2px' }}>{d.reason}</div>
                          </div>
                          <div className={styles.txAmount} style={{ color: 'var(--color-status-poor)' }}>{formatUGX(d.amount)}</div>
                          <div className={styles.txActions}>
                            <button
                              className={styles.approveBtn}
                              onClick={() => openResolutionModal('approve', [d], `the dispute on ${d.subscriberName}`)}
                              aria-label={`Approve ${d.subscriberName}`}
                            >
                              {Icons.approve}
                            </button>
                            <button
                              className={styles.rejectBtn}
                              onClick={() => openResolutionModal('reject', [d], `the dispute on ${d.subscriberName}`)}
                              aria-label={`Reject ${d.subscriberName}`}
                            >
                              {Icons.reject}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Resolution Modal — single + bulk dispute approve/reject */}
            <AnimatePresence>
              {resolutionTarget && (() => {
                const isApprove = resolutionTarget.action === 'approve';
                const total = resolutionTarget.ids.length;
                const pre = resolutionTarget.prePaymentCount || 0;
                const post = resolutionTarget.postPaymentCount || 0;
                const noun = total === 1 ? 'dispute' : `${total} disputes`;
                const verb = isApprove ? 'Approve' : 'Reject';
                const title = `${verb} ${noun}`;
                const subtitle = isApprove
                  ? `Side with the agent on ${resolutionTarget.contextLabel}.`
                  : `Decline ${resolutionTarget.contextLabel}.`;

                // Consequence sentences — only emit the ones that apply to this batch.
                const sentences = [];
                if (isApprove) {
                  if (pre > 0) {
                    sentences.push(
                      <span key="pre">
                        <strong>{pre === total ? 'These' : pre}</strong>
                        {' '}{pre === 1 ? 'commission goes' : 'commissions go'} back to <em>Owed</em> and pay out in the next settlement run — approving here doesn&apos;t move money on its own.
                      </span>
                    );
                  }
                  if (post > 0) {
                    sentences.push(
                      <span key="post">
                        <strong>{post === total ? 'These' : post}</strong>
                        {' '}{post === 1 ? 'is a post-payment claim' : 'are post-payment claims'} — the original release record stands; record any off-ledger re-issue (e.g. MTN MM-XXXX) in the outcome reason.
                      </span>
                    );
                  }
                } else {
                  if (pre > 0) {
                    sentences.push(
                      <span key="pre">
                        <strong>{pre === total ? 'These' : pre}</strong>
                        {' '}{pre === 1 ? 'commission will be voided' : 'commissions will be voided'} (status → <em>rejected</em>). The agent will not be paid for {pre === 1 ? 'it' : 'them'}.
                      </span>
                    );
                  }
                  if (post > 0) {
                    sentences.push(
                      <span key="post">
                        <strong>{post === total ? 'These' : post}</strong>
                        {' '}{post === 1 ? 'is a post-payment claim' : 'are post-payment claims'} — the release record stays on file; the outcome reason should explain why the dispute was denied.
                      </span>
                    );
                  }
                }

                const placeholder = isApprove
                  ? (post > 0
                      ? 'e.g. Confirmed legitimate; commission re-issued via MTN MM-9931'
                      : 'e.g. Confirmed; restored to Owed for next run')
                  : (post > 0
                      ? 'e.g. Payment proof on record (MM-7782); dispute denied'
                      : 'e.g. Claim could not be substantiated; commission voided');

                return (
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
                        <div className={styles.modalTitle}>{title}</div>
                        <div className={styles.modalSubtitle}>{subtitle}</div>
                      </div>
                      <div className={styles.modalBody}>
                        <div className={styles.modalConsequence} data-action={resolutionTarget.action}>
                          <div className={styles.modalConsequenceLabel}>What happens</div>
                          {sentences.map((s, i) => (
                            <p key={i} className={styles.modalConsequenceLine}>{s}</p>
                          ))}
                        </div>
                        <label className={styles.modalLabel} htmlFor="resolution-reason">
                          Outcome reason
                        </label>
                        <textarea
                          id="resolution-reason"
                          className={styles.modalTextarea}
                          rows={3}
                          value={resolutionReason}
                          onChange={(e) => setResolutionReason(e.target.value)}
                          placeholder={placeholder}
                          maxLength={400}
                          autoFocus
                        />
                        <div className={styles.modalHint}>
                          Stored on every affected commission so the agent and audit trail can see why.
                        </div>
                      </div>
                      <div className={styles.modalActions}>
                        <button className={styles.modalBackBtn} onClick={() => setResolutionTarget(null)}>
                          Cancel
                        </button>
                        <button
                          className={styles.modalConfirmBtn}
                          onClick={submitResolution}
                          disabled={
                            !resolutionReason.trim() ||
                            approveDisputeMutation.isPending ||
                            rejectDisputeMutation.isPending ||
                            bulkApproveMutation.isPending ||
                            bulkRejectMutation.isPending
                          }
                        >
                          {isApprove ? `Confirm ${verb.toLowerCase()}` : `Confirm ${verb.toLowerCase()}`}
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                );
              })()}
            </AnimatePresence>

            {/* Branch line action modal — Hold or Dispute with reason capture */}
            <AnimatePresence>
              {lineActionTarget && (
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
                      <div className={styles.modalTitle}>
                        {lineActionTarget.action === 'hold' ? 'Hold this line' : 'Flag a dispute'}
                      </div>
                      <div className={styles.modalSubtitle}>
                        {lineActionTarget.action === 'hold'
                          ? `It will roll into the next run. ${lineActionTarget.line.subscriberName} · ${formatUGX(lineActionTarget.line.amount)}`
                          : `Distributor will review. ${lineActionTarget.line.subscriberName} · ${formatUGX(lineActionTarget.line.amount)}`}
                      </div>
                    </div>
                    <div className={styles.modalBody}>
                      <label className={styles.modalLabel} htmlFor="line-action-reason">
                        Reason
                      </label>
                      <textarea
                        id="line-action-reason"
                        className={styles.modalTextarea}
                        rows={3}
                        value={lineActionReason}
                        onChange={(e) => setLineActionReason(e.target.value)}
                        placeholder={lineActionTarget.action === 'hold'
                          ? 'e.g. Subscriber records being verified; should pay next cycle'
                          : 'e.g. Suspect duplicate; agent ID does not match KYC'}
                        maxLength={400}
                        autoFocus
                      />
                    </div>
                    <div className={styles.modalActions}>
                      <button className={styles.modalBackBtn} onClick={() => setLineActionTarget(null)}>
                        Cancel
                      </button>
                      <button
                        className={styles.modalConfirmBtn}
                        onClick={submitLineAction}
                        disabled={
                          !lineActionReason.trim() ||
                          branchHoldLineMutation.isPending ||
                          branchDisputeLineMutation.isPending
                        }
                      >
                        {lineActionTarget.action === 'hold' ? 'Hold line' : 'File dispute'}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Release Modal — handles both bulk-approved and per-branch */}
            <AnimatePresence>
              {releaseModalOpen && currentRun && (() => {
                const branchRow = releaseScope === 'branch' && selectedRunBranchId
                  ? runBranches.find((b) => b.branchId === selectedRunBranchId)
                  : null;
                const isBranchScope = releaseScope === 'branch' && branchRow;
                const approvedRows = runBranches.filter((b) => b.state === 'approved');
                const approvedTotal = approvedRows.reduce((s, r) => s + r.amount, 0);
                const approvedCount = approvedRows.reduce((s, r) => s + r.count, 0);
                const isBusy = releaseRunMutation.isPending || releaseBranchMutation.isPending;
                return (
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
                        <div className={styles.modalTitle}>
                          {isBranchScope ? `Release ${branchRow.branchName}` : 'Release approved branches'}
                        </div>
                        <div className={styles.modalSubtitle}>
                          {isBranchScope
                            ? 'Confirm you have transferred funds for this branch only.'
                            : 'Confirm you have transferred funds for every approved branch. Pending branches will stay open.'}
                        </div>
                      </div>
                      <div className={styles.modalBody}>
                        <div className={styles.modalSummary}>
                          <div className={styles.modalSummaryLabel}>Total to release</div>
                          <div className={styles.modalSummaryValue}>
                            {formatUGX(isBranchScope ? branchRow.amount : approvedTotal)}
                          </div>
                        </div>
                        <div className={styles.modalSummary}>
                          <div className={styles.modalSummaryLabel}>Commissions</div>
                          <div className={styles.modalSummaryValue}>
                            {isBranchScope ? branchRow.count : approvedCount}
                          </div>
                        </div>
                        <div className={styles.modalSummary}>
                          <div className={styles.modalSummaryLabel}>
                            {isBranchScope ? 'Branch' : 'Approved branches'}
                          </div>
                          <div className={styles.modalSummaryValue}>
                            {isBranchScope ? branchRow.branchId : approvedRows.length}
                          </div>
                        </div>
                      </div>
                      <div className={styles.modalActions}>
                        <button className={styles.modalBackBtn} onClick={() => setReleaseModalOpen(false)}>
                          Back
                        </button>
                        <button
                          className={styles.modalConfirmBtn}
                          onClick={handleReleaseConfirm}
                          disabled={isBusy}
                        >
                          {isBusy ? 'Releasing…' : 'Confirm release'}
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                );
              })()}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
