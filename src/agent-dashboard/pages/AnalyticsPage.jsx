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
import { normalizeFrequency, FREQUENCY_LABEL } from '../../utils/finance';
import { formatUGX, formatNumber } from '../../utils/currency';
import ErrorCard from '../../components/feedback/ErrorCard';
import PageHeader from '../shell/PageHeader';
import styles from './AnalyticsPage.module.css';

const PALETTE = {
  indigo: '#292867',
  indigoSoft: '#5E63A8',
  lavender: '#D9DCF2',
  teal: '#2F8F9D',
  mint: '#2DD4BF',
  amber: '#FBBF24',
  positive: '#4ADE80',
  gridLine: 'rgba(41, 40, 103, 0.08)',
  text: '#2F3550',
  gray: '#8A90A6',
};

const AGE_BUCKETS = [
  { key: '<26', test: (a) => a < 26 },
  { key: '26–35', test: (a) => a >= 26 && a <= 35 },
  { key: '36–45', test: (a) => a >= 36 && a <= 45 },
  { key: '46–55', test: (a) => a >= 46 && a <= 55 },
  { key: '56+', test: (a) => a >= 56 },
];

const AMOUNT_BUCKETS = [
  { key: '< 10K', test: (a) => a < 10000 },
  { key: '10–25K', test: (a) => a >= 10000 && a < 25000 },
  { key: '25–50K', test: (a) => a >= 25000 && a < 50000 },
  { key: '50K+', test: (a) => a >= 50000 },
];

const FREQUENCY_ORDER = ['weekly', 'monthly', 'quarterly', 'half-yearly', 'annually'];

const MONTHS_BACK = 6;

function chartTooltip({ active, payload, label, valueFormatter }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className={styles.tooltip}>
      {label != null && <div className={styles.tooltipLabel}>{label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey || p.name} className={styles.tooltipRow}>
          <span className={styles.tooltipDot} style={{ background: p.color || p.fill }} />
          <span className={styles.tooltipName}>{p.name}</span>
          <span className={styles.tooltipValue}>
            {valueFormatter ? valueFormatter(p.value) : formatNumber(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const { agentId } = useAgentScope();
  const { data: subscribers = [], isLoading, isError, error, refetch } = useAgentSubscribers(agentId);
  const reduceMotion = useReducedMotion();

  const data = useMemo(() => deriveAnalytics(subscribers), [subscribers]);
  const total = subscribers.length;

  if (isLoading) {
    return (
      <div className={styles.page}>
        <PageHeader title="Analytics" subtitle="Loading insights…" fallback="/dashboard" />
        <div className={styles.skeletonGrid}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={styles.skeleton} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.page}>
        <PageHeader title="Analytics" fallback="/dashboard" />
        <div className={styles.empty}>
          <ErrorCard
            title="We couldn't load your analytics"
            message={error}
            onRetry={refetch}
          />
        </div>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className={styles.page}>
        <PageHeader title="Analytics" subtitle="No subscribers yet" fallback="/dashboard" />
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
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Analytics"
        subtitle={`Insights from your ${formatNumber(total)} subscriber${total === 1 ? '' : 's'}`}
        fallback="/dashboard"
      />

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
                    fill={PALETTE.mint}
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
  );
}

const GENDER_COLORS = [PALETTE.indigo, PALETTE.teal, PALETTE.lavender];
const axisTick = { fill: PALETTE.gray, fontSize: 11, fontFamily: 'var(--font-body)' };

function pct(part, whole) {
  if (!whole) return '0%';
  return `${Math.round((part / whole) * 100)}%`;
}

function deriveAnalytics(subscribers) {
  const gender = countByKey(subscribers, (s) => s.gender || 'other', { male: 0, female: 0, other: 0 });
  const genderData = [
    { name: 'Male', value: gender.male || 0 },
    { name: 'Female', value: gender.female || 0 },
    { name: 'Other', value: gender.other || 0 },
  ].filter((d) => d.value > 0);

  const age = AGE_BUCKETS.map((b) => ({
    key: b.key,
    value: subscribers.filter((s) => Number.isFinite(s.age) && b.test(s.age)).length,
  }));

  const freqMap = countByKey(subscribers, (s) => normalizeFrequency(s.contributionSchedule?.frequency) || 'monthly');
  const frequency = FREQUENCY_ORDER
    .map((k) => ({ key: k, label: FREQUENCY_LABEL[k], value: freqMap[k] || 0 }))
    .filter((d) => d.value > 0);

  const amount = AMOUNT_BUCKETS.map((b) => ({
    key: b.key,
    value: subscribers.filter((s) => b.test(s.contributionSchedule?.amount || 0)).length,
  }));

  const active = subscribers.filter((s) => s.isActive).length;
  const dormant = subscribers.length - active;

  const velocity = buildVelocity(subscribers, MONTHS_BACK);
  const velocityTotal = velocity.reduce((sum, v) => sum + v.value, 0);
  const lifetimeContribution = subscribers.reduce((sum, s) => sum + (s.totalContributions || 0), 0);

  return {
    gender: genderData,
    age,
    frequency,
    amount,
    active,
    dormant,
    velocity,
    velocityTotal,
    lifetimeContribution,
  };
}

function countByKey(items, getKey, seed = {}) {
  const acc = { ...seed };
  for (const item of items) {
    const k = getKey(item);
    acc[k] = (acc[k] || 0) + 1;
  }
  return acc;
}

function buildVelocity(subscribers, monthsBack) {
  const now = new Date();
  const buckets = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.push({
      key,
      label: d.toLocaleDateString('en-UG', { month: 'short' }),
      value: 0,
    });
  }
  const lookup = new Map(buckets.map((b) => [b.key, b]));
  for (const s of subscribers) {
    if (!s.registeredDate) continue;
    const slice = s.registeredDate.slice(0, 7);
    const bucket = lookup.get(slice);
    if (bucket) bucket.value += 1;
  }
  return buckets;
}
