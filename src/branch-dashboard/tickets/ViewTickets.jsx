import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { useDashboard } from '../../contexts/DashboardContext';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import {
  useBranchTickets,
  useBranchTicketMetrics,
  useTicketThread,
} from '../../hooks/useTickets';
import { TICKET_STATUS } from '../../data/ticketsSeed';
import { Icons } from '../../dashboard/shared/Icons';
import KpiCard from '../../dashboard/shared/KpiCard';
import { PillChip, PillChipGroup } from '../../components/PillChip';
import TicketListRow from '../../components/tickets/TicketListRow';
import ThreadView from '../../components/tickets/ThreadView';
import SkeletonRow from '../../components/SkeletonRow';
import EmptyState from '../../components/EmptyState';
import ErrorCard from '../../components/feedback/ErrorCard';
import styles from './ViewTickets.module.css';

// Status PillChip options. 'all' is a synthetic UI value (no status filter);
// the rest map onto the frozen TICKET_STATUS contract.
const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: TICKET_STATUS.OPEN, label: 'Open' },
  { value: TICKET_STATUS.CLOSED, label: 'Closed' },
];

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  ViewTickets — branch support oversight (VIEW-ONLY)                         */
/* ═══════════════════════════════════════════════════════════════════════════ */
/**
 * A read-only slide-in panel mirroring the branch ViewAgents idiom: backdrop +
 * panel Framer Motion, a `splitMode` prop that suppresses the backdrop so the
 * shell reflows beside the panel, Escape-to-close, a glassmorphic KpiCard row,
 * and a header-with-back. It surfaces this branch's agents' tickets plus
 * engagement metrics and lets a branch admin drill into any thread as a neutral
 * observer — never replying, closing, or reopening (no composer, no header
 * actions on the embedded ThreadView).
 */
export default function ViewTickets({ splitMode = false }) {
  const { viewTicketsOpen, setViewTicketsOpen } = useDashboard();
  const { branchId } = useBranchScope();

  const {
    data: metrics,
    isLoading: metricsLoading,
  } = useBranchTicketMetrics(branchId);

  const {
    data: tickets = [],
    isLoading: ticketsLoading,
    isError: ticketsError,
    error: ticketsErrorObj,
    refetch: refetchTickets,
  } = useBranchTickets(branchId);

  // View state: 'list' inbox or 'thread' read-only transcript.
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState(null);

  // Client-side filters (the hook is called WITHOUT filters so the cache key
  // stays stable; narrowing happens here in memory).
  const [statusFilter, setStatusFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');

  const bodyRef = useRef(null);

  // Thread for the drilled-in ticket (only fetched once a row is selected).
  const {
    data: thread,
    isLoading: threadLoading,
    isError: threadError,
    error: threadErrorObj,
    refetch: refetchThread,
  } = useTicketThread(view === 'thread' ? selectedId : null);

  // Cold-load guard — skeleton only on a true first fetch, never on background
  // polls once rows have shown.
  const isCold = ticketsLoading && tickets.length === 0;

  // Agent name lookup from the metrics rollup (the only source of agent names
  // in the oversight contract — TicketSummary carries agentId only).
  const agentNames = useMemo(() => {
    const map = {};
    (metrics?.byAgent ?? []).forEach((a) => { map[a.agentId] = a.name; });
    return map;
  }, [metrics]);

  // Per-agent filter options derived from metrics.byAgent.
  const agentOptions = useMemo(() => {
    const opts = (metrics?.byAgent ?? []).map((a) => ({ value: a.agentId, label: a.name }));
    return [{ value: 'all', label: 'All agents' }, ...opts];
  }, [metrics]);

  const filtered = useMemo(() => {
    let list = tickets;
    if (statusFilter !== 'all') {
      list = list.filter((t) => t.status === statusFilter);
    }
    if (agentFilter !== 'all') {
      list = list.filter((t) => t.agentId === agentFilter);
    }
    return list;
  }, [tickets, statusFilter, agentFilter]);

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id === selectedId) || null,
    [tickets, selectedId],
  );

  const handleClose = useCallback(() => {
    setViewTicketsOpen(false);
  }, [setViewTicketsOpen]);

  function handleSelect(ticket) {
    setSelectedId(ticket.id);
    setView('thread');
  }

  function handleBack() {
    setView('list');
    setSelectedId(null);
  }

  // Reset transient state shortly after the panel closes (after the exit anim).
  useEffect(() => {
    if (viewTicketsOpen) return;
    const t = setTimeout(() => {
      setView('list');
      setSelectedId(null);
      setStatusFilter('all');
      setAgentFilter('all');
    }, 400);
    return () => clearTimeout(t);
  }, [viewTicketsOpen]);

  // Scroll the body to the top on a view switch.
  useEffect(() => { bodyRef.current?.scrollTo(0, 0); }, [view]);

  // Escape closes the panel (matches the sibling panels).
  useEffect(() => {
    if (!viewTicketsOpen) return;
    function onKey(e) { if (e.key === 'Escape') handleClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [viewTicketsOpen, handleClose]);

  const headerTitle = view === 'thread' ? 'Conversation' : 'Support';
  const headerSubtitle =
    view === 'thread'
      ? 'Read-only oversight'
      : `${tickets.length} ${tickets.length === 1 ? 'ticket' : 'tickets'} across this branch`;

  const participantLabel = selectedTicket
    ? (agentNames[selectedTicket.agentId]
        ? `Agent: ${agentNames[selectedTicket.agentId]}`
        : `Agent: ${selectedTicket.agentId}`)
    : undefined;

  return (
    <>
      <AnimatePresence>
        {viewTicketsOpen && !splitMode && (
          <motion.div
            key="vt-backdrop"
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
        {viewTicketsOpen && (
          <motion.div
            key="vt-panel"
            className={styles.panel}
            data-split-mode={splitMode || undefined}
            initial={{ x: '100%' }}
            animate={{ x: 0, transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            exit={{ x: '100%', transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
          >
            {/* Header */}
            <div className={styles.header} data-view={view}>
              <div className={styles.headerTop}>
                {view === 'thread' && (
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

            {/* KPI row + filters (list view only) */}
            {view === 'list' && (
              <>
                <div className={styles.kpiRow}>
                  <KpiCard
                    icon={Icons.chart}
                    label="Open"
                    value={metricsLoading && !metrics ? '—' : metrics?.openCount ?? 0}
                  />
                  <KpiCard
                    icon={Icons.chart}
                    label="Closed"
                    value={metricsLoading && !metrics ? '—' : metrics?.closedCount ?? 0}
                  />
                  <KpiCard
                    icon={Icons.chart}
                    label="Avg first response"
                    value={metricsLoading && !metrics ? '—' : (metrics?.avgFirstResponseHours ?? 0)}
                    suffix="hrs"
                  />
                  <KpiCard
                    icon={Icons.chart}
                    label="Unanswered"
                    value={metricsLoading && !metrics ? '—' : metrics?.unansweredCount ?? 0}
                  />
                </div>

                <div className={styles.filters}>
                  <PillChipGroup label="Filter tickets by status" className={styles.statusGroup}>
                    {STATUS_OPTIONS.map((opt) => (
                      <PillChip
                        key={opt.value}
                        selected={statusFilter === opt.value}
                        onClick={() => setStatusFilter(opt.value)}
                      >
                        {opt.label}
                      </PillChip>
                    ))}
                  </PillChipGroup>

                  <label className={styles.agentSelectWrap}>
                    <span className={styles.agentSelectLabel}>Agent</span>
                    <select
                      className={styles.agentSelect}
                      value={agentFilter}
                      onChange={(e) => setAgentFilter(e.target.value)}
                      aria-label="Filter tickets by agent"
                    >
                      {agentOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            )}

            {/* Body */}
            <div className={styles.body} ref={bodyRef}>
              <AnimatePresence mode="wait">
                {view === 'list' && (
                  <motion.div
                    key="vt-list"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                  >
                    {isCold ? (
                      <div className={styles.listPad}>
                        <SkeletonRow count={6} label="Loading tickets" />
                      </div>
                    ) : ticketsError ? (
                      <div className={styles.stateWrap}>
                        <ErrorCard
                          title="We couldn't load tickets"
                          message={ticketsErrorObj}
                          onRetry={refetchTickets}
                        />
                      </div>
                    ) : filtered.length === 0 ? (
                      <div className={styles.stateWrap}>
                        {statusFilter === 'all' && agentFilter === 'all' ? (
                          <EmptyState
                            kind="no-data"
                            title="No tickets yet"
                            body="Support conversations raised by subscribers in this branch will appear here."
                          />
                        ) : (
                          <EmptyState
                            kind="no-match"
                            title="No tickets match"
                            body="Try a different status or agent filter."
                          />
                        )}
                      </div>
                    ) : (
                      <>
                        <div className={styles.listCount}>
                          Showing {filtered.length} of {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}
                        </div>
                        <ul className={styles.list}>
                          {filtered.map((ticket) => (
                            <li key={ticket.id}>
                              <TicketListRow
                                ticket={ticket}
                                onClick={handleSelect}
                                unreadFor="agent"
                                subtitle={agentNames[ticket.agentId] || ticket.agentId}
                              />
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </motion.div>
                )}

                {view === 'thread' && selectedId && (
                  <motion.div
                    key="vt-thread"
                    className={styles.threadWrap}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                  >
                    {/* Strictly read-only: no footer (composer) and no
                        headerActions (close/reopen). Oversight observes only. */}
                    <ThreadView
                      ticket={thread || selectedTicket}
                      messages={thread?.messages ?? []}
                      currentRole="branch"
                      participantLabel={participantLabel}
                      loading={threadLoading && !thread}
                      error={threadError ? threadErrorObj : undefined}
                      onRetry={refetchThread}
                    />
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
