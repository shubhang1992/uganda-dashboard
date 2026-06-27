import { useMemo, useState } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useChildren, useChildrenMetrics, useBranchPendingContributions } from '../../hooks/useEntity';
import { useToast } from '../../contexts/ToastContext';
import { formatNumber } from '../../utils/currency';
import ErrorCard from '../../components/feedback/ErrorCard';
import Modal from '../../components/Modal';
import { PageHead, MetricRow, Tile, Card, SectionHead, Avatar, Btn } from '../../employer-dashboard/desktop/ui';
import { employeesIcon, pendingIcon } from '../../employer-dashboard/desktop/icons';
import ui from '../../employer-dashboard/desktop/ui.module.css';
import styles from './AttentionAgentsDesktop.module.css';

/* Mirrors AttentionAgentsMobile's META so the two surfaces stay in lockstep.
   `inactiveAgents` never reaches here — its row links straight to the roster. */
const META = {
  dormant: {
    title: 'Dormant subscribers',
    lead: 'Members who have stopped contributing recently. Nudge the agents below to re-engage them.',
    col: 'Dormant',
    tileLabel: 'Dormant members',
    unit: (n) => `${formatNumber(n)} dormant member${n === 1 ? '' : 's'}`,
    draft: (first, n) =>
      `Hi ${first}, ${n} subscriber${n === 1 ? '' : 's'} on your book ${n === 1 ? 'has' : 'have'} gone dormant (no recent contributions). Please reach out this week to re-engage them.`,
  },
  overdue: {
    title: 'Overdue contributions',
    lead: 'Active members who are past their scheduled payment date. Nudge the agents below to follow up.',
    col: 'Overdue',
    tileLabel: 'Overdue contributions',
    unit: (n) => `${formatNumber(n)} overdue this cycle`,
    draft: (first, n) =>
      `Hi ${first}, ${n} of your member${n === 1 ? '' : 's'} ${n === 1 ? 'is' : 'are'} past their scheduled contribution date. Please follow up so they stay on track.`,
  },
};

/**
 * AttentionAgentsDesktop — desktop (>=1024px) twin of AttentionAgentsMobile,
 * routed at /dashboard/attention/:type. Lists the AGENTS responsible for the
 * issue (dormant / overdue), ranked by affected-member count, each with a Nudge
 * action that opens the shared Modal composer (prefilled, toast on send — demo
 * scope, no SMS). Same data sources as the mobile page: dormant from the rollup
 * metrics, overdue from get_branch_pending_contributions.
 */
export default function AttentionAgentsDesktop() {
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
      <div className={ui.stack}>
        <ErrorCard title="We couldn't load this list" onRetry={() => { refetchAgents(); refetchPending(); }} />
      </div>
    );
  }

  return (
    <div className={ui.stack}>
      <PageHead eyebrow="Needs attention" title={meta.title} sub={meta.lead} />

      <MetricRow cols={2}>
        <Tile
          accent="amber"
          icon={pendingIcon(18)}
          label={meta.tileLabel}
          value={formatNumber(total)}
          sub={type === 'overdue' ? 'Active members past due' : 'Not contributing recently'}
        />
        <Tile
          accent="indigo"
          icon={employeesIcon(18)}
          label="Agents to nudge"
          value={formatNumber(rows.length)}
          sub={rows.length ? 'Ranked by affected members' : 'Nobody to follow up with'}
        />
      </MetricRow>

      <Card>
        <SectionHead title="Agents to follow up" />
        {isLoading && rows.length === 0 ? (
          <p className={styles.empty}>Loading…</p>
        ) : rows.length === 0 ? (
          <p className={styles.empty}>
            All clear — no {type === 'overdue' ? 'overdue contributions' : 'dormant subscribers'} across your agents right now.
          </p>
        ) : (
          <div className={ui.tableCard}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th className={ui.num}>{meta.col}</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.agentId} className={ui.rowInteractive}>
                    <td>
                      <Link to={`/dashboard/agents/${r.agentId}`} className={`${styles.who} ${styles.rowLink}`}>
                        <Avatar name={r.name} />
                        <span>
                          <span className={styles.whoName}>{r.name}</span>
                          <span className={styles.whoMeta}>{meta.unit(r.count)}</span>
                        </span>
                      </Link>
                    </td>
                    <td className={ui.num}>{formatNumber(r.count)}</td>
                    <td className={styles.actionCell}>
                      <Btn variant="secondary" size="sm" onClick={() => openNudge(r)} aria-label={`Nudge ${r.name}`}>
                        Nudge
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!nudge} onClose={() => setNudge(null)} title={nudge ? `Nudge ${nudge.name}` : 'Nudge'} size="sm">
        <div className={styles.modal}>
          <div className={styles.modalTitle}>Nudge {nudge?.name}</div>
          <div className={styles.modalSub}>{nudge ? meta.unit(nudge.count) : ''}</div>

          <label className={styles.modalLabel} htmlFor="nudge-msg-desktop">Message</label>
          <textarea
            id="nudge-msg-desktop"
            className={styles.textarea}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
          />
          <p className={styles.note}>
            Sends an in-app reminder to {nudge?.name?.split(' ')[0] || 'the agent'}. Demo only — no SMS is sent.
          </p>

          <div className={styles.modalActions}>
            <Btn variant="ghost" onClick={() => setNudge(null)}>Cancel</Btn>
            <Btn variant="primary" onClick={sendNudge}>Send nudge</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
