import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import {
  ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useAgentSubscribers } from '../../hooks/useAgent';
import { formatUGX, formatNumber } from '../../utils/currency';
import ErrorCard from '../../components/feedback/ErrorCard';
import AgentMobileHero from '../shell/AgentMobileHero';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import AnalyticsDesktop from './AnalyticsDesktop';
import { deriveAnalytics, pct, MONTHS_BACK } from './analytics/deriveAnalytics';
import { PALETTE, GENDER_COLORS, axisTick, chartTooltip } from './analytics/chartConfig';
import styles from './AnalyticsPage.module.css';

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const { agentId } = useAgentScope();
  const { data: subscribers = [], isLoading, isError, error, refetch } = useAgentSubscribers(agentId);
  const reduceMotion = useReducedMotion();

  const data = useMemo(() => deriveAnalytics(subscribers), [subscribers]);
  const total = subscribers.length;

  const isDesktop = useIsDesktop();
  if (isDesktop) return <AnalyticsDesktop />;

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.body}>
          <div className={styles.skeletonGrid}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={styles.skeleton} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.page}>
        <div className={styles.body}>
          <div className={styles.empty}>
            <ErrorCard
              title="We couldn't load your analytics"
              message={error}
              onRetry={refetch}
            />
          </div>
        </div>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.body}>
          <div className={styles.empty}>
            <div className={styles.emptyIcon} aria-hidden="true">
              <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
                <path d="M8 38V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M8 38h32" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <rect x="14" y="22" width="6" height="12" rx="1" stroke="currentColor" strokeWidth="2"/>
                <rect x="24" y="14" width="6" height="20" rx="1" stroke="currentColor" strokeWidth="2"/>
                <rect x="34" y="26" width="6" height="8" rx="1" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </div>
            <h2 className={styles.emptyTitle}>Onboard your first subscriber</h2>
            <p className={styles.emptySub}>Insights about your book will appear here once you have at least one subscriber.</p>
            <button
              type="button"
              className={styles.emptyCta}
              onClick={() => navigate('/dashboard/onboard')}
            >
              Onboard a subscriber
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.body}>
      <AgentMobileHero
        eyebrow="Analytics"
        value={`${formatNumber(total)} subscriber${total === 1 ? '' : 's'}`}
      >
        <span style={{ color: 'var(--color-gray)' }}>insights from your book</span>
      </AgentMobileHero>

      <section className={styles.section} aria-labelledby="profile-mix-title">
        <header className={styles.sectionHead}>
          <span className={styles.eyebrow}>Profile mix</span>
          <h2 id="profile-mix-title" className={styles.sectionTitle}>Who you serve</h2>
        </header>
        <div className={styles.gridTwo}>
          <article className={styles.card}>
            <h3 className={styles.cardTitle}>Gender</h3>
            <div className={styles.chartWrap}>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={data.gender}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="85%"
                    stroke="#FFFFFF"
                    strokeWidth={2}
                    isAnimationActive={!reduceMotion}
                  >
                    {data.gender.map((entry, idx) => (
                      <Cell key={entry.name} fill={GENDER_COLORS[idx]} />
                    ))}
                  </Pie>
                  <Tooltip
                    cursor={false}
                    content={(p) => chartTooltip({ ...p, valueFormatter: (v) => `${formatNumber(v)} (${pct(v, total)})` })}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, color: PALETTE.text }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </article>
          <article className={styles.card}>
            <h3 className={styles.cardTitle}>Age</h3>
            <div className={styles.chartWrap}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.age} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
                  <CartesianGrid stroke={PALETTE.gridLine} vertical={false} />
                  <XAxis dataKey="key" tick={axisTick} tickLine={false} axisLine={{ stroke: PALETTE.gridLine }} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: PALETTE.lavender, opacity: 0.4 }}
                    content={(p) => chartTooltip({ ...p, valueFormatter: (v) => `${formatNumber(v)} (${pct(v, total)})` })}
                  />
                  <Bar
                    dataKey="value"
                    name="Subscribers"
                    fill={PALETTE.indigo}
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={!reduceMotion}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="saving-habits-title">
        <header className={styles.sectionHead}>
          <span className={styles.eyebrow}>Saving habits</span>
          <h2 id="saving-habits-title" className={styles.sectionTitle}>How they save</h2>
        </header>
        <div className={styles.gridTwo}>
          <article className={styles.card}>
            <h3 className={styles.cardTitle}>Frequency</h3>
            <div className={styles.chartWrap}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.frequency} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke={PALETTE.gridLine} horizontal={false} />
                  <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={axisTick} tickLine={false} axisLine={false} width={80} />
                  <Tooltip
                    cursor={{ fill: PALETTE.lavender, opacity: 0.4 }}
                    content={(p) => chartTooltip({ ...p, valueFormatter: (v) => `${formatNumber(v)} (${pct(v, total)})` })}
                  />
                  <Bar
                    dataKey="value"
                    name="Subscribers"
                    fill={PALETTE.indigoSoft}
                    radius={[0, 6, 6, 0]}
                    isAnimationActive={!reduceMotion}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
          <article className={styles.card}>
            <h3 className={styles.cardTitle}>Contribution amount</h3>
            <div className={styles.chartWrap}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.amount} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
                  <CartesianGrid stroke={PALETTE.gridLine} vertical={false} />
                  <XAxis dataKey="key" tick={axisTick} tickLine={false} axisLine={{ stroke: PALETTE.gridLine }} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: PALETTE.lavender, opacity: 0.4 }}
                    content={(p) => chartTooltip({ ...p, valueFormatter: (v) => `${formatNumber(v)} (${pct(v, total)})` })}
                  />
                  <Bar
                    dataKey="value"
                    name="Subscribers"
                    fill={PALETTE.teal}
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={!reduceMotion}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="engagement-title">
        <header className={styles.sectionHead}>
          <span className={styles.eyebrow}>Engagement</span>
          <h2 id="engagement-title" className={styles.sectionTitle}>Active vs dormant</h2>
        </header>
        <article className={styles.card}>
          <div className={styles.activeStats}>
            <div className={styles.activeStat}>
              <span className={styles.activeDot} data-tone="positive" />
              <span className={styles.activeLabel}>Active</span>
              <span className={styles.activeValue}>{formatNumber(data.active)}</span>
              <span className={styles.activePct}>{pct(data.active, total)}</span>
            </div>
            <div className={styles.activeStat}>
              <span className={styles.activeDot} data-tone="muted" />
              <span className={styles.activeLabel}>Dormant</span>
              <span className={styles.activeValue}>{formatNumber(data.dormant)}</span>
              <span className={styles.activePct}>{pct(data.dormant, total)}</span>
            </div>
          </div>
          <div
            className={styles.activeBar}
            role="img"
            aria-label={`${data.active} active and ${data.dormant} dormant subscribers`}
          >
            <span
              className={styles.activeBarFill}
              data-tone="positive"
              style={{ width: `${(data.active / total) * 100}%` }}
            />
            <span
              className={styles.activeBarFill}
              data-tone="muted"
              style={{ width: `${(data.dormant / total) * 100}%` }}
            />
          </div>
        </article>
      </section>

      <section className={styles.section} aria-labelledby="growth-title">
        <header className={styles.sectionHead}>
          <span className={styles.eyebrow}>Growth</span>
          <h2 id="growth-title" className={styles.sectionTitle}>Onboarding velocity</h2>
        </header>
        <article className={styles.card}>
          <div className={styles.chartWrap}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.velocity} margin={{ top: 8, right: 24, left: -8, bottom: 8 }}>
                <CartesianGrid stroke={PALETTE.gridLine} vertical={false} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: PALETTE.gridLine }} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ stroke: PALETTE.indigoSoft, strokeWidth: 1, strokeDasharray: '3 3' }}
                  content={(p) => chartTooltip({ ...p, valueFormatter: (v) => `${formatNumber(v)} new` })}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="New subscribers"
                  stroke={PALETTE.indigo}
                  strokeWidth={2.5}
                  dot={{ r: 4, stroke: PALETTE.indigoSoft, strokeWidth: 2, fill: '#FFFFFF' }}
                  activeDot={{ r: 6, stroke: PALETTE.indigo, strokeWidth: 2, fill: '#FFFFFF' }}
                  isAnimationActive={!reduceMotion}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <footer className={styles.cardFoot}>
            <span className={styles.cardFootLabel}>Last {MONTHS_BACK} months</span>
            <span className={styles.cardFootValue}>
              +{formatNumber(data.velocityTotal)} new ·{' '}
              {formatUGX(data.lifetimeContribution)} lifetime contributions
            </span>
          </footer>
        </article>
      </section>
      </div>
    </div>
  );
}
