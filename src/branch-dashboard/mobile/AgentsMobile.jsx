import { useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useChildren, useChildrenMetrics } from '../../hooks/useEntity';
import { formatUGXShort, formatNumber } from '../../utils/currency';
import ErrorCard from '../../components/feedback/ErrorCard';
import { topAgent } from '../overview/branchOverviewDerive';
import styles from './branchMobile.module.css';

const SearchIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4-4" strokeLinecap="round" />
  </svg>
);
const PlusIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const initialsOf = (name) =>
  (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

/* Data-honest agent classification.
   Real agents carry status ∈ {active, inactive} only (no `onboarding` source).
   We treat a non-active agent that has enrolled ZERO subscribers as genuinely
   "Onboarding" (awaiting first activity); a non-active agent that already has
   subscribers is "Inactive". */
function classify(a) {
  if (a.status === 'active') return 'active';
  if ((a.metrics?.totalSubscribers || 0) === 0) return 'onboarding';
  return 'inactive';
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'top', label: 'Top performers' },
];

/**
 * AgentsMobile — branch admin PHONE roster. Mirrors AgentsDesktop's data wiring
 * (useChildren + useChildrenMetrics merged) and renders the approved mockup
 * "Agents" screen: grad hero (team counts + top performer), a two-up KPI strip
 * (subscribers enrolled / avg active rate), an Add-agent CTA, a local-state
 * search + cosmetic filter pills, then a card of tappable agent rows.
 */
export default function AgentsMobile() {
  const navigate = useNavigate();
  const { branchId } = useBranchScope();
  const {
    data: agentsRaw = [], isLoading, isError, error, refetch,
  } = useChildren('branch', branchId);
  const { data: agentMetricsMap = {}, refetch: refetchMetrics } = useChildrenMetrics('branch', branchId);

  const agents = useMemo(
    () => agentsRaw.map((a) => ({ ...a, metrics: agentMetricsMap[a.id] ?? a.metrics, _cls: classify({ ...a, metrics: agentMetricsMap[a.id] ?? a.metrics }) })),
    [agentsRaw, agentMetricsMap],
  );

  const stats = useMemo(() => {
    const active = agents.filter((a) => a._cls === 'active').length;
    const onboarding = agents.filter((a) => a._cls === 'onboarding').length;
    const inactive = agents.filter((a) => a._cls === 'inactive').length;
    const enrolled = agents.reduce((s, a) => s + (a.metrics?.totalSubscribers || 0), 0);
    const rated = agents.filter((a) => (a.metrics?.totalSubscribers || 0) > 0);
    const avgActive = rated.length
      ? Math.round(rated.reduce((s, a) => s + (a.metrics?.activeRate || 0), 0) / rated.length)
      : 0;
    return {
      active, onboarding, inactive, enrolled, avgActive, top: topAgent(agents),
    };
  }, [agents]);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const topName = stats.top?.name;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents.filter((a) => {
      if (q && !(`${a.name || ''} ${a.phone || ''}`.toLowerCase().includes(q))) return false;
      if (filter === 'active') return a._cls === 'active';
      if (filter === 'onboarding') return a._cls === 'onboarding';
      if (filter === 'top') return topName && a.name === topName;
      return true;
    });
  }, [agents, query, filter, topName]);

  if (isError) {
    return (
      <ErrorCard
        title="We couldn't load your agents"
        message={error}
        onRetry={() => { refetch(); refetchMetrics(); }}
      />
    );
  }

  if (isLoading && !agents.length) {
    return <div className={styles.loading}><div className={styles.spinner} /></div>;
  }

  return (
    <>
      {/* HERO — team summary */}
      <section className={`${styles.card} ${styles.cardGrad}`} style={{ textAlign: 'center' }} aria-label="Your team">
        <div className={styles.eyebrow}>Your team</div>
        <div className={styles.heroVal} style={{ fontSize: 30, marginTop: 4 }}>
          {formatNumber(agents.length)} agent{agents.length === 1 ? '' : 's'}
        </div>
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 14, marginTop: 9, fontSize: 12.5, flexWrap: 'wrap',
        }}>
          <span style={{ color: 'var(--color-green-ink, #1F6B41)', fontWeight: 700 }}>{formatNumber(stats.active)} active</span>
          {stats.onboarding > 0 && (
            <span style={{ color: 'var(--color-amber-ink, #8A6209)', fontWeight: 700 }}>{formatNumber(stats.onboarding)} onboarding</span>
          )}
          {stats.inactive > 0 && (
            <span style={{ color: 'var(--color-gray)', fontWeight: 700 }}>{formatNumber(stats.inactive)} inactive</span>
          )}
          <span style={{ color: 'var(--color-gray)' }}>{formatNumber(stats.enrolled)} enrolled</span>
        </div>
        {stats.top && stats.top.multiple >= 1.1 && (
          <div style={{ marginTop: 11, fontSize: 11.5, color: 'var(--color-gray)' }}>
            Top performer · <b style={{ color: 'var(--color-indigo)', fontWeight: 700 }}>{stats.top.name}</b> · {stats.top.multiple.toFixed(1)}× branch avg
          </div>
        )}
      </section>

      {/* KPI strip */}
      <section className={styles.kpi2} aria-label="Roster metrics">
        <div className={styles.kpiC}>
          <div className={styles.lbl}>Subscribers enrolled</div>
          <div className={styles.v}>{formatNumber(stats.enrolled)}</div>
          <div style={{ fontSize: 10.5, color: 'var(--color-gray)', marginTop: 2 }}>
            {stats.active ? `Avg ${formatNumber(Math.round(stats.enrolled / stats.active))} per active agent` : 'No active agents yet'}
          </div>
        </div>
        <div className={styles.kpiC}>
          <div className={styles.lbl}>Avg active rate</div>
          <div className={`${styles.v} ${styles.grow}`}>{stats.avgActive}%</div>
          <div style={{ fontSize: 10.5, color: 'var(--color-gray)', marginTop: 2 }}>Branch benchmark</div>
        </div>
      </section>

      {/* Add agent CTA */}
      <div className={styles.btnRow}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPri}`}
          onClick={() => navigate('/dashboard/agents/new')}
          aria-label="Add agent"
        >
          {PlusIcon}Add agent
        </button>
      </div>

      {/* Search */}
      <div className={styles.search}>
        {SearchIcon}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search agent name or phone"
          aria-label="Search agents by name or phone"
        />
      </div>

      {/* Filter pills */}
      <div className={styles.actHead} role="tablist" aria-label="Filter agents">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={`${styles.fpill} ${filter === f.id ? styles.fpillOn : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Roster */}
      <section className={styles.card} style={{ paddingTop: 4, paddingBottom: 4 }} aria-label="Agent roster">
        {visible.length === 0 ? (
          <p className={styles.scoreNote} style={{ padding: '14px 0' }}>
            {agents.length === 0
              ? 'No agents yet — add your first agent to start enrolling subscribers.'
              : 'No agents match your search.'}
          </p>
        ) : (
          visible.map((a) => {
            const m = a.metrics || {};
            const cls = a._cls;
            const subs = m.totalSubscribers || 0;
            const meta = cls === 'onboarding'
              ? 'Awaiting first login'
              : `${a.specialties?.[0] || 'Field agent'} · ${formatNumber(subs)} subs`;
            const pillTone = cls === 'active' ? styles.ok : cls === 'onboarding' ? styles.warn : styles.off;
            const pillLabel = cls === 'active' ? 'Active' : cls === 'onboarding' ? 'Onboarding' : 'Inactive';
            return (
              <NavLink to={`/dashboard/agents/${a.id}`} key={a.id} className={styles.lrow}>
                <span
                  className={styles.av}
                  aria-hidden="true"
                  style={cls === 'onboarding'
                    ? { background: 'color-mix(in srgb, var(--color-amber) 16%, transparent)', color: 'var(--color-amber-ink, #8A6209)' }
                    : undefined}
                >
                  {initialsOf(a.name)}
                </span>
                <span className={styles.lMid}>
                  <b>{a.name}</b>
                  <small>{meta}</small>
                </span>
                <span className={styles.lEnd}>
                  <span className={`${styles.pill} ${pillTone}`}><i />{pillLabel}</span>
                  <span className={styles.lAmt} style={{ fontSize: 12, color: subs ? undefined : 'var(--color-gray)' }}>
                    {subs ? formatUGXShort(m.totalContributions || 0) : '—'}
                  </span>
                </span>
              </NavLink>
            );
          })
        )}
      </section>
    </>
  );
}
