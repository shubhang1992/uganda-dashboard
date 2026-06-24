import { useMemo, useState } from 'react';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useBranchTickets, useBranchTicketMetrics, useTicketThread } from '../../hooks/useTickets';
import { formatNumber } from '../../utils/currency';
import ErrorCard from '../../components/feedback/ErrorCard';
import EmptyState from '../../components/EmptyState';
import { PillChip, PillChipGroup } from '../../components/PillChip';
import TicketListRow from '../../components/tickets/TicketListRow';
import ThreadView from '../../components/tickets/ThreadView';
import { PageHead, MetricRow, Tile, Card, SectionHead } from '../../employer-dashboard/desktop/ui';
import { supportIcon, checkIcon, pendingIcon } from '../../employer-dashboard/desktop/icons';
import ui from '../../employer-dashboard/desktop/ui.module.css';
import styles from './SupportDesktop.module.css';

const STATUS_PILLS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
];

export default function SupportDesktop() {
  const { branchId } = useBranchScope();
  const { data: metrics } = useBranchTicketMetrics(branchId);
  const { data: tickets = [], isLoading, isError, error, refetch } = useBranchTickets(branchId);

  const [statusFilter, setStatusFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [selected, setSelected] = useState(null); // TicketSummary being read

  const { data: thread, isLoading: threadLoading, isError: threadError, error: threadErr, refetch: refetchThread } = useTicketThread(selected?.id);

  const agentNames = useMemo(() => {
    const map = {};
    (metrics?.byAgent ?? []).forEach((a) => { map[a.agentId] = a.name; });
    return map;
  }, [metrics]);

  const agentOptions = useMemo(
    () => (metrics?.byAgent ?? []).map((a) => ({ value: a.agentId, label: a.name })),
    [metrics],
  );

  const filtered = useMemo(() => {
    let list = tickets;
    if (statusFilter !== 'all') list = list.filter((t) => t.status === statusFilter);
    if (agentFilter !== 'all') list = list.filter((t) => t.agentId === agentFilter);
    return list;
  }, [tickets, statusFilter, agentFilter]);

  if (isError) {
    return <ErrorCard title="We couldn't load support tickets" message={error} onRetry={refetch} />;
  }

  // Read-only oversight thread — branch passes no composer / header actions, so
  // ThreadView renders the transcript without any reply affordance.
  if (selected) {
    return (
      <div className={ui.stack}>
        <ThreadView
          ticket={selected}
          messages={thread?.messages || []}
          currentRole="branch"
          participantLabel={agentNames[selected.agentId] ? `Agent: ${agentNames[selected.agentId]}` : 'Read-only oversight'}
          onBack={() => setSelected(null)}
          loading={threadLoading}
          error={threadError ? threadErr : undefined}
          onRetry={refetchThread}
        />
      </div>
    );
  }

  return (
    <div className={ui.stack}>
      <PageHead
        eyebrow="Oversight"
        title="Support"
        sub={`${formatNumber(metrics?.openCount ?? 0)} open tickets across this branch · read-only oversight`}
      />

      <MetricRow cols={3}>
        <Tile accent="amber" icon={supportIcon(18)} label="Open" value={formatNumber(metrics?.openCount ?? 0)} sub="Awaiting resolution" />
        <Tile accent="green" icon={checkIcon(18)} label="Closed" value={formatNumber(metrics?.closedCount ?? 0)} sub="Resolved" />
        <Tile accent="indigoSoft" icon={pendingIcon(18)} label="Unanswered" value={formatNumber(metrics?.unansweredCount ?? 0)} sub="No agent reply yet" />
      </MetricRow>

      <Card>
        <SectionHead title="Tickets" tag="View-only" />
        <div className={styles.toolbar}>
          <PillChipGroup label="Filter by status" layout="row">
            {STATUS_PILLS.map((p) => (
              <PillChip key={p.value} selected={statusFilter === p.value} onClick={() => setStatusFilter(p.value)}>
                {p.label}
              </PillChip>
            ))}
          </PillChipGroup>
          <select
            className={styles.agentSelect}
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            aria-label="Filter by agent"
          >
            <option value="all">All agents</option>
            {agentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {isLoading && !tickets.length ? (
          <p className={styles.note}>Loading tickets…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No tickets to show"
            body="Support conversations raised by subscribers in this branch will appear here."
          />
        ) : (
          <div className={styles.list}>
            {filtered.map((t) => (
              <TicketListRow
                key={t.id}
                ticket={t}
                subtitle={agentNames[t.agentId] ? `Agent: ${agentNames[t.agentId]}` : 'Branch ticket'}
                onClick={() => setSelected(t)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
