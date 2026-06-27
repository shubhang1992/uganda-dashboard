import { useMemo, useState } from 'react';
import { NavLink, useParams, Navigate } from 'react-router-dom';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useChildren, useChildrenMetrics, useBranchPendingContributions } from '../../hooks/useEntity';
import { useToast } from '../../contexts/ToastContext';
import { formatNumber } from '../../utils/currency';
import ErrorCard from '../../components/feedback/ErrorCard';
import BottomSheet from '../shell/BottomSheet';
import styles from './branchMobile.module.css';

/* The two member-issue types this page handles. `inactiveAgents` routes straight
   to the roster (see attentionRouteMobile), so it never reaches here. */
const META = {
  dormant: {
    title: 'Dormant subscribers',
    lead: 'Members who have stopped contributing recently. Nudge the agents below to re-engage them.',
    unit: (n) => `${formatNumber(n)} dormant member${n === 1 ? '' : 's'}`,
    draft: (first, n) =>
      `Hi ${first}, ${n} subscriber${n === 1 ? '' : 's'} on your book ${n === 1 ? 'has' : 'have'} gone dormant (no recent contributions). Please reach out this week to re-engage ${n === 1 ? 'them' : 'them'}.`,
  },
  overdue: {
    title: 'Overdue contributions',
    lead: 'Active members who are past their scheduled payment date. Nudge the agents below to follow up.',
    unit: (n) => `${formatNumber(n)} overdue this cycle`,
    draft: (first, n) =>
      `Hi ${first}, ${n} of your member${n === 1 ? '' : 's'} ${n === 1 ? 'is' : 'are'} past ${n === 1 ? 'their' : 'their'} scheduled contribution date. Please follow up so they stay on track.`,
  },
};

const ClockIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>
);
const SendIcon = (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
  </svg>
);

const initialsOf = (name) =>
  (name || '?').split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

/**
 * AttentionAgentsMobile — the branch admin PHONE drill-down behind the Home
 * "Needs attention" rows (route /dashboard/attention/:type). The branch role
 * supervises agents, so instead of a flat member list it shows the AGENTS
 * responsible for the issue, ranked by how many of their members are affected,
 * each with a Nudge action. Nudging opens a prefilled composer and (demo scope —
 * no real SMS) confirms with a toast, mirroring the agent→subscriber nudge.
 *
 * `dormant` derives per-agent counts from the existing rollup metrics
 * (totalSubscribers × activeRate); `overdue` reads the per-agent breakdown from
 * the get_branch_pending_contributions RPC via useBranchPendingContributions.
 */
export default function AttentionAgentsMobile() {
  const { type } = useParams();
  const { branchId } = useBranchScope();
  const { addToast } = useToast();

  const meta = META[type];

  const {
    data: agentsRaw = [], isLoading: agentsLoading, isError: agentsError, refetch: refetchAgents,
  } = useChildren('branch', branchId);
  const { data: agentMetricsMap = {} } = useChildrenMetrics('branch', branchId);
  const {
    data: pending, isLoading: pendingLoading, isError: pendingError, refetch: refetchPending,
  } = useBranchPendingContributions(branchId);

  const rows = useMemo(() => {
    if (type === 'overdue') {
      return (pending?.byAgent ?? [])
        .filter((r) => r.pending > 0)
        .map((r) => ({ agentId: r.agentId, name: r.agentName, count: r.pending }))
        .sort((a, b) => b.count - a.count);
    }
    // dormant: per-agent inactive-member count from rollup metrics.
    return agentsRaw
      .map((a) => {
        const m = agentMetricsMap[a.id] ?? a.metrics ?? {};
        const total = m.totalSubscribers || 0;
        const active = Math.round(total * ((m.activeRate || 0) / 100));
        return { agentId: a.id, name: a.name, count: Math.max(0, total - active) };
      })
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [type, pending, agentsRaw, agentMetricsMap]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.count, 0), [rows]);

  // Nudge composer state — the agent row being nudged + the editable draft.
  const [nudge, setNudge] = useState(null);
  const [draft, setDraft] = useState('');
  const openNudge = (row) => {
    setDraft(meta.draft(row.name.split(' ')[0], row.count));
    setNudge(row);
  };
  const sendNudge = () => {
    addToast('success', `Nudge sent to ${nudge.name}`);
    setNudge(null);
  };

  if (!meta) return <Navigate to="/dashboard" replace />;

  const isLoading = type === 'overdue' ? pendingLoading : agentsLoading;
  const isError = type === 'overdue' ? pendingError || agentsError : agentsError;

  if (isError) {
    return (
      <ErrorCard
        title="We couldn't load this list"
        onRetry={() => { refetchAgents(); refetchPending(); }}
      />
    );
  }
  if (isLoading && rows.length === 0) {
    return <div className={styles.loading}><div className={styles.spinner} /></div>;
  }

  return (
    <>
      {/* Lead — what this is + the branch total */}
      <section className={styles.callout} aria-label={meta.title}>
        <span className={styles.calloutIc} aria-hidden="true">{ClockIcon}</span>
        <div>
          <b>{formatNumber(total)} {type === 'overdue' ? 'overdue' : 'dormant'} · {rows.length} agent{rows.length === 1 ? '' : 's'} to nudge</b>
          <p>{meta.lead}</p>
        </div>
      </section>

      {/* Agents responsible, ranked */}
      <section className={styles.card} aria-label={`Agents — ${meta.title}`}>
        <header className={styles.cardHd}><h3>Agents to follow up</h3></header>
        {rows.length === 0 ? (
          <p className={styles.scoreNote}>
            All clear — no {type === 'overdue' ? 'overdue contributions' : 'dormant subscribers'} across your agents right now.
          </p>
        ) : (
          rows.map((r) => (
            <div className={styles.comRow} key={r.agentId}>
              <div className={styles.comTop}>
                <NavLink
                  to={`/dashboard/agents/${r.agentId}`}
                  className={styles.av}
                  aria-label={`Open ${r.name}`}
                >
                  {initialsOf(r.name)}
                </NavLink>
                <NavLink
                  to={`/dashboard/agents/${r.agentId}`}
                  className={styles.comTopCt}
                  style={{ textDecoration: 'none' }}
                >
                  <b>{r.name}</b>
                  <small>{meta.unit(r.count)}</small>
                </NavLink>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSec}`}
                  style={{ padding: '9px 15px', fontSize: 13 }}
                  onClick={() => openNudge(r)}
                  aria-label={`Nudge ${r.name}`}
                >
                  Nudge
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      {/* Nudge composer */}
      <BottomSheet
        open={!!nudge}
        onClose={() => setNudge(null)}
        title={nudge ? `Nudge ${nudge.name}` : 'Nudge'}
        icon={SendIcon}
        height="60%"
        footer={
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPri} ${styles.btnBlock}`}
            onClick={sendNudge}
          >
            {SendIcon} Send nudge
          </button>
        }
      >
        <label className={styles.fl} htmlFor="nudge-msg">Message</label>
        <textarea
          id="nudge-msg"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          style={{
            width: '100%',
            border: '1px solid var(--color-lavender)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            lineHeight: 1.5,
            color: 'var(--color-slate)',
            background: 'var(--color-cloud)',
            resize: 'none',
          }}
        />
        <p className={styles.scoreNote}>
          Sends an in-app reminder to {nudge?.name?.split(' ')[0] || 'the agent'}. Demo only — no SMS is sent.
        </p>
      </BottomSheet>
    </>
  );
}
