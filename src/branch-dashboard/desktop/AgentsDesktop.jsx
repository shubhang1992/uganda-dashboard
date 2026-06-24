import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useEntity, useChildren, useChildrenMetrics } from '../../hooks/useEntity';
import { formatUGXShort, formatNumber } from '../../utils/currency';
import ErrorCard from '../../components/feedback/ErrorCard';
import { PageHead, MetricRow, Tile, Card, SectionHead, StatusBadge, Avatar, Btn } from '../../employer-dashboard/desktop/ui';
import { employeesIcon, walletIcon, coinsIcon, pendingIcon, handAddIcon, backIcon } from '../../employer-dashboard/desktop/icons';
import { topAgent } from '../overview/branchOverviewDerive';
import CreateAgentForm from '../agent/CreateAgentForm';
import BulkOnboardAgents from '../agent/BulkOnboardAgents';
import ui from '../../employer-dashboard/desktop/ui.module.css';
import styles from './AgentsDesktop.module.css';

function tenureLabel(a) {
  if (typeof a.tenureMonths === 'number') return `${a.tenureMonths} mo`;
  return '—';
}

export default function AgentsDesktop() {
  const { branchId } = useBranchScope();
  const { data: branch } = useEntity('branch', branchId);
  const {
    data: agentsRaw = [], isLoading, isError, error, refetch,
  } = useChildren('branch', branchId);
  const { data: agentMetricsMap = {} } = useChildrenMetrics('branch', branchId);

  const agents = useMemo(
    () => agentsRaw.map((a) => ({ ...a, metrics: agentMetricsMap[a.id] ?? a.metrics })),
    [agentsRaw, agentMetricsMap],
  );

  const [mode, setMode] = useState('list'); // 'list' | 'create'
  const [createTab, setCreateTab] = useState('single'); // 'single' | 'bulk'

  const stats = useMemo(() => {
    const active = agents.filter((a) => a.status === 'active').length;
    const inactive = agents.length - active;
    const enrolled = agents.reduce((s, a) => s + (a.metrics?.totalSubscribers || 0), 0);
    const rated = agents.filter((a) => (a.metrics?.totalSubscribers || 0) > 0);
    const avgActive = rated.length
      ? Math.round(rated.reduce((s, a) => s + (a.metrics?.activeRate || 0), 0) / rated.length)
      : 0;
    return { active, inactive, enrolled, avgActive, top: topAgent(agents) };
  }, [agents]);

  if (isError) {
    return <ErrorCard title="We couldn't load your agents" message={error} onRetry={refetch} />;
  }

  if (mode === 'create') {
    return (
      <div className={ui.stack}>
        <button type="button" className={styles.backlink} onClick={() => setMode('list')}>
          {backIcon(18)} Agents
        </button>
        <PageHead
          eyebrow="New agent"
          title={`Add agents to ${branch?.name || 'your branch'}`}
          sub="Add one agent, or bulk-onboard many from an Excel/CSV upload. They receive SMS login details and can start enrolling subscribers right away."
        />
        <div className={styles.modeTabs} role="tablist" aria-label="Onboarding method">
          <button type="button" role="tab" aria-selected={createTab === 'single'} className={styles.modeTab} data-active={createTab === 'single' || undefined} onClick={() => setCreateTab('single')}>
            Single agent
          </button>
          <button type="button" role="tab" aria-selected={createTab === 'bulk'} className={styles.modeTab} data-active={createTab === 'bulk' || undefined} onClick={() => setCreateTab('bulk')}>
            Bulk upload
          </button>
        </div>
        {createTab === 'single' ? (
          <CreateAgentForm
            branchId={branchId}
            branchName={branch?.name}
            onCancel={() => setMode('list')}
            onCreated={() => setMode('list')}
          />
        ) : (
          <BulkOnboardAgents
            branchId={branchId}
            onCancel={() => setMode('list')}
            onDone={() => setMode('list')}
          />
        )}
      </div>
    );
  }

  return (
    <div className={ui.stack}>
      <PageHead
        eyebrow="Team"
        title="Agents"
        sub={`${formatNumber(agents.length)} agents · ${formatNumber(stats.active)} active · enrolling ${formatNumber(stats.enrolled)} subscribers between them`}
      />

      <MetricRow cols={4}>
        <Tile accent="indigo" icon={employeesIcon(18)} label="Total agents" value={formatNumber(agents.length)} sub={`${formatNumber(stats.active)} active${stats.inactive > 0 ? ` · ${formatNumber(stats.inactive)} inactive` : ''}`} />
        <Tile accent="teal" icon={walletIcon(18)} label="Subscribers enrolled" value={formatNumber(stats.enrolled)} sub={stats.active ? `Avg ${formatNumber(Math.round(stats.enrolled / stats.active))} per active agent` : 'No active agents yet'} />
        <Tile accent="green" icon={coinsIcon(18)} label="Top performer" value={stats.top?.name?.split(' ')[0] || '—'} sub={stats.top && stats.top.multiple >= 1.1 ? `${stats.top.multiple.toFixed(1)}× branch average` : 'Contributions leader'} />
        <Tile accent="indigoSoft" icon={pendingIcon(18)} label="Avg active rate" value={`${stats.avgActive}%`} sub="Across enrolling agents" />
      </MetricRow>

      <Card>
        <SectionHead
          title="Agent roster"
          action={
            <Btn variant="primary" onClick={() => setMode('create')}>
              {handAddIcon(16)} Add agent
            </Btn>
          }
        />
        {isLoading && !agents.length ? (
          <p className={styles.whoMeta} style={{ padding: 'var(--space-4)' }}>Loading agents…</p>
        ) : agents.length === 0 ? (
          <p className={styles.whoMeta} style={{ padding: 'var(--space-4)' }}>No agents yet — add your first agent to start enrolling subscribers.</p>
        ) : (
          <div className={ui.tableCard}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Phone</th>
                  <th className={ui.num}>Subscribers</th>
                  <th className={ui.num}>Contributions</th>
                  <th className={ui.num}>Tenure</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => {
                  const m = a.metrics || {};
                  const active = a.status === 'active';
                  const meta = active ? (a.specialties?.[0] || 'Field agent') : 'Inactive';
                  return (
                    <tr key={a.id} className={ui.rowInteractive}>
                      <td>
                        <Link to={`/dashboard/agents/${a.id}`} className={`${styles.who} ${styles.rowLink}`}>
                          <Avatar name={a.name} />
                          <span>
                            <span className={styles.whoName}>{a.name}</span>
                            <span className={styles.whoMeta}>{meta}</span>
                          </span>
                        </Link>
                      </td>
                      <td className={styles.phone}>{a.phone || '—'}</td>
                      <td className={ui.num}>{formatNumber(m.totalSubscribers || 0)}</td>
                      <td className={ui.num}>{formatUGXShort(m.totalContributions || 0)}</td>
                      <td className={ui.num}>{tenureLabel(a)}</td>
                      <td><StatusBadge tone={active ? 'active' : 'inactive'}>{active ? 'Active' : 'Inactive'}</StatusBadge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
