import { useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useEntity, useChildren, useEntityMetrics, useChildrenMetrics, useBranchPendingContributions } from '../../hooks/useEntity';
import { useBranchTicketMetrics } from '../../hooks/useTickets';
import { formatNumber } from '../../utils/currency';
import ErrorCard from '../../components/feedback/ErrorCard';
import { computeAttention, attentionRouteMobile } from '../overview/branchOverviewDerive';
import styles from './branchMobile.module.css';

const ChevIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);
const AnalyticsIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-6" />
  </svg>
);
const CommissionsIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <rect x="2.5" y="6" width="19" height="13" rx="2" /><path d="M2.5 10h19" strokeLinecap="round" />
  </svg>
);
const SupportIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const SettingsIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 2.6 7" />
  </svg>
);
const AttentionIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" />
  </svg>
);
const BellIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);
const LockIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

/**
 * BranchHubMobile — the "Branch" bottom-tab hub (route `/dashboard/menu`). No
 * desktop counterpart: the desktop shell uses a sidebar. Renders the approved
 * mockup's "Branch" profile screen — a grad identity card (branch + manager +
 * tags), a 2×2 destinations grid (Analytics / Commissions / Support / Settings),
 * a card of setting rows (Needs attention from computeAttention → its real route,
 * a cosmetic Notifications toggle, Password & security → Settings), a sign-out
 * button, and a version line. Real branch + ticket-metric + attention data.
 */
export default function BranchHubMobile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { branchId } = useBranchScope();

  const { data: branch, isLoading, isError, error, refetch } = useEntity('branch', branchId);
  const { data: metrics = {} } = useEntityMetrics('branch', branchId);
  const { data: agentsRaw = [], isError: agentsError, refetch: refetchAgents } = useChildren('branch', branchId);
  const { data: agentMetricsMap = {} } = useChildrenMetrics('branch', branchId);
  const { data: ticketMetrics } = useBranchTicketMetrics(branchId);
  const { data: pending } = useBranchPendingContributions(branchId);

  const agents = useMemo(
    () => agentsRaw.map((a) => ({ ...a, metrics: agentMetricsMap[a.id] ?? a.metrics })),
    [agentsRaw, agentMetricsMap],
  );

  const attention = useMemo(
    () => computeAttention(metrics, agents, { overdue: pending?.total || 0 }),
    [metrics, agents, pending],
  );

  if (isError || agentsError || (!branch && !isLoading)) {
    return (
      <ErrorCard
        title="We couldn't load your branch"
        message={error}
        onRetry={() => { refetch(); refetchAgents(); }}
      />
    );
  }

  if (isLoading && !branch) {
    return <div className={styles.loading}><div className={styles.spinner} /></div>;
  }

  const branchName = branch?.name || 'Branch';
  const managerName = branch?.managerName || user?.name || 'Branch Admin';
  const initials = branchName
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'B';

  const openTickets = ticketMetrics?.openCount ?? ticketMetrics?.open ?? 0;

  // Needs-attention summary line — from real attention rows (dormant + overdue).
  const dormant = attention.find((a) => a.type === 'dormant')?.value || 0;
  const overdue = attention.find((a) => a.type === 'overdue')?.value || 0;
  const attentionSub = `${formatNumber(dormant)} dormant · ${formatNumber(overdue)} overdue`;

  const handleSignOut = () => {
    logout();
    navigate('/');
  };

  return (
    <>
      {/* IDENTITY */}
      <section className={`${styles.card} ${styles.cardGrad}`} aria-label="Branch profile">
        <div className={styles.acct}>
          <div className={styles.acctAv} aria-hidden="true">{initials}</div>
          <div>
            <div className={styles.acctNm}>{branchName}</div>
            <div className={styles.acctMt}>{managerName} · Branch Admin</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <span className={styles.tag} style={{ color: 'var(--color-indigo)' }}>Branch Admin</span>
          <span className={styles.tag}>{formatNumber(agents.length)} agent{agents.length === 1 ? '' : 's'}</span>
        </div>
      </section>

      {/* DESTINATIONS — 2×2 */}
      <div className={styles.tiles}>
        <NavLink to="/dashboard/analytics" className={styles.tile} aria-label="Analytics">
          <span className={styles.tileIc} aria-hidden="true">{AnalyticsIcon}</span>
          <span><b>Analytics</b><small>Subs · agents · commissions</small></span>
        </NavLink>
        <NavLink to="/dashboard/commissions" className={styles.tile} aria-label="Commissions">
          <span className={styles.tileIc} aria-hidden="true">{CommissionsIcon}</span>
          <span><b>Commissions</b><small>Agent payouts</small></span>
        </NavLink>
        <NavLink to="/dashboard/support" className={styles.tile} aria-label={`Support${openTickets > 0 ? `, ${openTickets} open tickets` : ''}`}>
          <span className={styles.tileIc} aria-hidden="true">{SupportIcon}</span>
          <span><b>Support</b><small>Ticket oversight</small></span>
          {openTickets > 0 && <span className={styles.tileCnt}>{formatNumber(openTickets)}</span>}
        </NavLink>
        <NavLink to="/dashboard/settings" className={styles.tile} aria-label="Settings">
          <span className={styles.tileIc} aria-hidden="true">{SettingsIcon}</span>
          <span><b>Settings</b><small>Branch profile</small></span>
        </NavLink>
      </div>

      {/* SETTING ROWS */}
      <section className={styles.card} aria-label="Branch settings">
        <NavLink
          to={attentionRouteMobile('dormant')}
          className={styles.setRow}
          aria-label={`Needs attention: ${attentionSub}`}
        >
          <span className={`${styles.setRowIc} ${styles.tintAmber}`} aria-hidden="true">{AttentionIcon}</span>
          <span className={styles.setRowT}>
            <b>Needs attention</b>
            <small>{attentionSub}</small>
          </span>
          <span className={styles.chev}>{ChevIcon}</span>
        </NavLink>

        <div className={styles.setRow}>
          <span className={`${styles.setRowIc} ${styles.tintSoft}`} aria-hidden="true">{BellIcon}</span>
          <span className={styles.setRowT}>
            <b>Notifications</b>
            <small>Enrolments, commissions, contributions</small>
          </span>
          <button
            type="button"
            className={`${styles.swt} ${styles.swtOn}`}
            role="switch"
            aria-checked="true"
            aria-label="Notifications enabled"
          />
        </div>

        <NavLink to="/dashboard/settings" className={styles.setRow} aria-label="Password and security">
          <span className={`${styles.setRowIc} ${styles.tintIndigo}`} aria-hidden="true">{LockIcon}</span>
          <span className={styles.setRowT}>
            <b>Password &amp; security</b>
            <small>Change your sign-in password</small>
          </span>
          <span className={styles.chev}>{ChevIcon}</span>
        </NavLink>
      </section>

      <button type="button" className={styles.signout} onClick={handleSignOut}>
        Sign out
      </button>
      <div className={styles.ver}>Universal Pensions · Branch Admin · v2.4.0</div>
    </>
  );
}
