import { useMemo } from 'react';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useEntityCommissionSummary, useAgentCommissionList } from '../../hooks/useCommission';
import { formatUGXShort, formatNumber } from '../../utils/currency';
import ErrorCard from '../../components/feedback/ErrorCard';
import { PageHead, MetricRow, Tile, Card, SectionHead, StatusBadge, Avatar } from '../../employer-dashboard/desktop/ui';
import { checkIcon, pendingIcon, analyticsIcon } from '../../employer-dashboard/desktop/icons';
import ui from '../../employer-dashboard/desktop/ui.module.css';
import styles from './CommissionsDesktop.module.css';

function settlementPct(paid, due) {
  const total = paid + due;
  return total > 0 ? Math.round((paid / total) * 100) : 0;
}

export default function CommissionsDesktop() {
  const { branchId } = useBranchScope();
  const { data: summary, isError: summaryError, error, refetch } = useEntityCommissionSummary('branch', branchId);
  const { data: agentList = [], isLoading, isError: listError, refetch: refetchList } = useAgentCommissionList(null);

  const rows = useMemo(
    () => agentList.filter((a) => a.branchId === branchId),
    [agentList, branchId],
  );

  if (summaryError || listError) {
    return (
      <ErrorCard
        title="We couldn't load commissions"
        message={error}
        onRetry={() => { refetch(); refetchList(); }}
      />
    );
  }

  const totalPaid = summary?.totalPaid || 0;
  const totalDue = summary?.totalDue || 0;
  const rate = Math.round(summary?.settlementRate || 0);

  return (
    <div className={ui.stack}>
      <PageHead
        eyebrow="Payouts"
        title="Commissions"
        sub={`${rate}% settlement rate this cycle · paid vs due across your agents`}
      />

      <MetricRow cols={3}>
        <Tile accent="green" icon={checkIcon(18)} label="Settled this cycle" value={formatUGXShort(totalPaid)} sub={`Paid across ${formatNumber(rows.filter((r) => r.totalPaid > 0).length)} agents`} />
        <Tile accent="amber" icon={pendingIcon(18)} label="Due next run" value={formatUGXShort(totalDue)} sub="Pending settlement" />
        <Tile accent="indigo" icon={analyticsIcon(18)} label="Settlement rate" value={`${rate}%`} sub="Paid ÷ (paid + due)" />
      </MetricRow>

      <Card>
        <SectionHead title="By agent" tag="Paid vs due" />
        {isLoading && !rows.length ? (
          <p className={styles.note}>Loading commissions…</p>
        ) : rows.length === 0 ? (
          <p className={styles.note}>No commission activity for this branch yet.</p>
        ) : (
          <div className={ui.tableCard}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th className={ui.num}>Paid</th>
                  <th className={ui.num}>Due</th>
                  <th>Settlement</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = settlementPct(r.totalPaid, r.totalDue);
                  const onTrack = pct >= 75;
                  return (
                    <tr key={r.agentId} className={ui.rowInteractive}>
                      <td>
                        <span className={styles.who}>
                          <Avatar name={r.agentName} />
                          <span className={styles.whoName}>{r.agentName}</span>
                        </span>
                      </td>
                      <td className={ui.num}>{formatUGXShort(r.totalPaid)}</td>
                      <td className={ui.num}>{formatUGXShort(r.totalDue)}</td>
                      <td>
                        <span className={styles.miniBar}><i style={{ width: `${pct}%` }} /></span>
                        {pct}%
                      </td>
                      <td>
                        <StatusBadge tone={onTrack ? 'active' : 'open'}>{onTrack ? 'On track' : 'Partial'}</StatusBadge>
                      </td>
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
