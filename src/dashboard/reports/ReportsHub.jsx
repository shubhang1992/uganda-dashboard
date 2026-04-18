import { useMemo, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO, formatUGX, fmtShort } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useCountry, useEntity, useChildren, useAllEntities } from '../../hooks/useEntity';
import styles from './ReportsHub.module.css';

/* ─── Lazy-load individual report views ──────────────────────────────── */

const REPORT_VIEWS = {
  'distribution-summary': lazy(() => import('./views/DistributionSummary')),
  'all-branches': lazy(() => import('./views/AllBranches')),
  'all-agents': lazy(() => import('./views/AllAgents')),
  'all-subscribers': lazy(() => import('./views/AllSubscribers')),
  'contributions-collections': lazy(() => import('./views/ContributionsCollections')),
  'withdrawals-payouts': lazy(() => import('./views/WithdrawalsPayouts')),
  'branch-performance': lazy(() => import('./views/BranchPerformance')),
  'agent-performance': lazy(() => import('./views/AgentPerformance')),
  'subscriber-growth': lazy(() => import('./views/SubscriberGrowth')),
  'subscriber-demographics': lazy(() => import('./views/SubscriberDemographics')),
  'kyc-compliance': lazy(() => import('./views/KycCompliance')),
};

function ReportLoading() {
  return (
    <div className={styles.reportLoading}>
      <div className={styles.loadingSpinner} />
    </div>
  );
}

/* ─── Router ─────────────────────────────────────────────────────────── */

export default function ReportsHub({ panelMode, onSelectReport }) {
  const { reportId } = useDashboard();

  // In panel mode, the parent ViewReports handles report routing
  if (panelMode) {
    return <ReportsIndex panelMode onSelectReport={onSelectReport} />;
  }

  if (reportId && REPORT_VIEWS[reportId]) {
    const ReportComponent = REPORT_VIEWS[reportId];
    return (
      <Suspense fallback={<ReportLoading />}>
        <ReportComponent />
      </Suspense>
    );
  }

  return <ReportsIndex />;
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

function pctChange(curr, prev) {
  if (!prev) return 0;
  return Math.round(((curr - prev) / prev) * 100);
}

function TrendArrow({ value }) {
  if (value === 0) return null;
  const up = value > 0;
  return (
    <span className={styles.trend} data-dir={up ? 'up' : 'down'}>
      <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
        {up
          ? <path d="M5 8V2M5 2L2 5M5 2l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          : <path d="M5 2v6M5 8L2 5M5 8l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        }
      </svg>
      {Math.abs(value)}%
    </span>
  );
}

function MiniSparkline({ data, color = 'var(--color-indigo)', w = 100, h = 40 }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - ((v - min) / (max - min || 1)) * (h - 4) - 2}`).join(' ');
  return (
    <svg width={w} height={h} className={styles.sparkline} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(data.length - 1) * step} cy={h - ((data[data.length - 1] - min) / (max - min || 1)) * (h - 4) - 2} r="3" fill={color} />
    </svg>
  );
}

function MiniDonut({ value, color = 'var(--color-indigo)', size = 36, trackColor = 'var(--color-lavender)', textColor = 'var(--color-slate)' }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={styles.donut} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth="3.5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="3.5"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dy="0.35em"
        fill={textColor} fontSize={Math.max(size * 0.22, 10)} fontWeight="700" fontFamily="var(--font-body)">
        {value}%
      </text>
    </svg>
  );
}

function MiniBar({ segments, height = 6 }) {
  return (
    <div className={styles.miniBar} style={{ height }}>
      {segments.map((s, i) => (
        <div key={i} style={{ width: `${s.pct}%`, background: s.color, borderRadius: i === 0 ? '3px 0 0 3px' : i === segments.length - 1 ? '0 3px 3px 0' : 0 }} />
      ))}
    </div>
  );
}

function CardArrow() {
  return (
    <span className={styles.cardArrow} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}

/* ─── Animation ──────────────────────────────────────────────────────── */

const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.1 } } };
const fadeUp = { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT_EXPO } } };
const fadeIn = { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT_EXPO } } };

/* ─── Hub Index ──────────────────────────────────────────────────────── */

const BRANCH_EXCLUDED_REPORTS = new Set([
  'distribution-summary',
  'all-branches',
  'branch-performance',
]);

function ReportsIndex({ panelMode, onSelectReport }) {
  const navigate = useNavigate();
  const { branchId } = useBranchScope();
  const isBranch = !!branchId;
  const { data: country } = useCountry();
  const { data: regions = [] } = useAllEntities('region');
  const { data: branch } = useEntity('branch', branchId);
  const { data: branchAgents = [] } = useChildren('branch', branchId);
  const m = isBranch ? branch?.metrics : country?.metrics;

  const go = (id) => {
    if (panelMode && onSelectReport) onSelectReport(id);
    else navigate(`/dashboard/reports/${id}`);
  };

  const contribTrend = m ? pctChange(m.monthlyContributions?.[11], m.monthlyContributions?.[10]) : 0;
  const subsTrend = m ? pctChange(m.newSubscribersThisMonth, m.prevNewSubscribersThisMonth) : 0;
  const withdrawalRatio = m && m.totalContributions ? Math.round((m.totalWithdrawals / m.totalContributions) * 100) : 0;

  const topRegion = useMemo(() => {
    if (!regions.length) return null;
    return [...regions].sort((a, b) => (b.metrics?.aum || 0) - (a.metrics?.aum || 0))[0];
  }, [regions]);

  const topAgent = useMemo(() => {
    if (!isBranch || !branchAgents.length) return null;
    return [...branchAgents].sort((a, b) => (b.metrics?.totalContributions || 0) - (a.metrics?.totalContributions || 0))[0];
  }, [isBranch, branchAgents]);

  if (!m) {
    return <div className={styles.reportLoading}><div className={styles.loadingSpinner} /></div>;
  }

  return (
    <div className={panelMode ? styles.hubPanel : styles.hub}>
      <div className={styles.inner}>

        {/* ── Page header (hidden in panel mode — panel has its own header) ── */}
        {!panelMode && (
          <motion.div className={styles.pageHeader} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}>
            <h1 className={styles.pageTitle}>Reports</h1>
            <p className={styles.pageSubtitle}>{isBranch ? 'Branch overview and analytics' : 'Network overview and analytics'}</p>
          </motion.div>
        )}

        {/* ── Report Sections ── */}
        <motion.div className={styles.sections} variants={stagger} initial="hidden" animate="visible">

          {/* ── Overview ── */}
          {!isBranch && (
          <motion.section className={styles.section} variants={fadeUp}>
            <div className={styles.sectionHead} style={{ '--section-accent': '#292867' }}>
              <h2 className={styles.sectionTitle}>Overview</h2>
            </div>
            <button className={styles.featuredCard} onClick={() => go('distribution-summary')}>
              <div className={styles.featuredBody}>
                <div className={styles.featuredText}>
                  <span className={styles.featuredLabel}>Distribution Summary</span>
                  <span className={styles.featuredDesc}>Regional breakdown of subscribers, AUM, contributions, and active rates across the entire network</span>
                </div>
                <div className={styles.featuredMetrics}>
                  {regions.slice(0, 4).map((r) => (
                    <div key={r.id} className={styles.regionPill}>
                      <span className={styles.regionName}>{r.name}</span>
                      <span className={styles.regionVal}>{fmtShort(r.metrics?.aum || 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <CardArrow />
            </button>
          </motion.section>
          )}

          {/* ── Directory ── */}
          <motion.section className={styles.section} variants={fadeUp}>
            <div className={styles.sectionHead} style={{ '--section-accent': '#2F8F9D' }}>
              <h2 className={styles.sectionTitle}>Directory</h2>
              <span className={styles.sectionCount}>3 reports</span>
            </div>
            <div className={styles.grid3}>
              {[
                !isBranch && { id: 'all-branches', label: 'Branches', count: m.totalBranches, icon: 'building', color: '#2F8F9D',
                  detail: `${m.totalAgents} agents across 4 regions` },
                { id: 'all-agents', label: 'Agents', count: m.totalAgents, icon: 'users', color: '#2F8F9D',
                  detail: `Avg ${Math.round(m.totalSubscribers / m.totalAgents)} subscribers per agent` },
                { id: 'all-subscribers', label: 'Subscribers', count: m.totalSubscribers, icon: 'user', color: '#2F8F9D',
                  detail: `${m.genderRatio?.female || 0}% female · ${m.activeRate}% active` },
              ].filter(Boolean).map((card) => (
                <motion.button key={card.id} className={styles.dirCard} onClick={() => go(card.id)} variants={fadeIn}
                  whileHover={{ y: -2 }} whileTap={{ scale: 0.985 }} transition={{ duration: 0.2 }}>
                  <div className={styles.dirTop}>
                    <span className={styles.dirIcon} style={{ background: `${card.color}10`, color: card.color }} aria-hidden="true">
                      {ICONS[card.icon]}
                    </span>
                    <CardArrow />
                  </div>
                  <span className={styles.dirCount}>{card.count?.toLocaleString()}</span>
                  <span className={styles.dirLabel}>{card.label}</span>
                  <span className={styles.dirDetail}>{card.detail}</span>
                </motion.button>
              ))}
            </div>
          </motion.section>

          {/* ── Financial ── */}
          <motion.section className={styles.section} variants={fadeUp}>
            <div className={styles.sectionHead} style={{ '--section-accent': '#2E8B57' }}>
              <h2 className={styles.sectionTitle}>Financial</h2>
              <span className={styles.sectionCount}>2 reports</span>
            </div>
            <div className={styles.grid2}>
              <motion.button className={styles.finCard} onClick={() => go('contributions-collections')} variants={fadeIn}
                whileHover={{ y: -2 }} whileTap={{ scale: 0.985 }} transition={{ duration: 0.2 }}>
                <div className={styles.finHeader}>
                  <span className={styles.finLabel}>Contributions & Collections</span>
                  <CardArrow />
                </div>
                <div className={styles.finMain}>
                  <div className={styles.finMetric}>
                    <span className={styles.finValue}>{formatUGX(m.totalContributions)}</span>
                    <TrendArrow value={contribTrend} />
                  </div>
                  <MiniSparkline data={m.monthlyContributions} color="#2E8B57" w={120} h={44} />
                </div>
                <div className={styles.finFooter}>
                  <span>Daily {formatUGX(m.dailyContributions)}</span>
                  <span className={styles.finDivider} />
                  <span>Weekly {formatUGX(m.weeklyContributions)}</span>
                </div>
              </motion.button>

              <motion.button className={styles.finCard} onClick={() => go('withdrawals-payouts')} variants={fadeIn}
                whileHover={{ y: -2 }} whileTap={{ scale: 0.985 }} transition={{ duration: 0.2 }}>
                <div className={styles.finHeader}>
                  <span className={styles.finLabel}>Withdrawals & Payouts</span>
                  <CardArrow />
                </div>
                <div className={styles.finMain}>
                  <div className={styles.finMetric}>
                    <span className={styles.finValue}>{formatUGX(m.totalWithdrawals)}</span>
                  </div>
                  <div className={styles.ratioRing}>
                    <MiniDonut value={withdrawalRatio} color="var(--color-status-warning)" size={52} />
                    <span className={styles.ratioLabel}>W/C ratio</span>
                  </div>
                </div>
                <div className={styles.finFooter}>
                  <span>Daily {formatUGX(m.dailyWithdrawals)}</span>
                  <span className={styles.finDivider} />
                  <span>Monthly {formatUGX(m.monthlyWithdrawals)}</span>
                </div>
              </motion.button>
            </div>
          </motion.section>

          {/* ── Performance ── */}
          <motion.section className={styles.section} variants={fadeUp}>
            <div className={styles.sectionHead} style={{ '--section-accent': '#E6A817' }}>
              <h2 className={styles.sectionTitle}>Performance</h2>
              <span className={styles.sectionCount}>{isBranch ? '1 report' : '2 reports'}</span>
            </div>
            <div className={isBranch ? styles.grid1 : styles.grid2}>
              {!isBranch && (
              <motion.button className={styles.perfCard} onClick={() => go('branch-performance')} variants={fadeIn}
                whileHover={{ y: -2 }} whileTap={{ scale: 0.985 }} transition={{ duration: 0.2 }}>
                <div className={styles.perfTop}>
                  <span className={styles.perfIcon} style={{ background: 'rgba(230,168,23,0.08)', color: '#B8860B' }} aria-hidden="true">
                    {ICONS['bar-chart']}
                  </span>
                  <CardArrow />
                </div>
                <div className={styles.perfBody}>
                  <span className={styles.perfLabel}>Branch Performance</span>
                  <span className={styles.perfDesc}>Ranked by contributions, growth, and active subscriber rates</span>
                </div>
                {topRegion && (
                  <div className={styles.perfMeta}>
                    <span className={styles.perfMetaLabel}>Top region</span>
                    <span className={styles.perfMetaValue}>{topRegion.name}</span>
                  </div>
                )}
              </motion.button>
              )}

              <motion.button className={styles.perfCard} onClick={() => go('agent-performance')} variants={fadeIn}
                whileHover={{ y: -2 }} whileTap={{ scale: 0.985 }} transition={{ duration: 0.2 }}>
                <div className={styles.perfTop}>
                  <span className={styles.perfIcon} style={{ background: 'rgba(230,168,23,0.08)', color: '#B8860B' }} aria-hidden="true">
                    {ICONS.activity}
                  </span>
                  <CardArrow />
                </div>
                <div className={styles.perfBody}>
                  <span className={styles.perfLabel}>Agent Performance</span>
                  <span className={styles.perfDesc}>Ranked by productivity, subscriber growth, and ratings</span>
                </div>
                <div className={styles.perfMeta}>
                  <span className={styles.perfMetaLabel}>{isBranch && topAgent ? 'Top agent' : 'Avg subs/agent'}</span>
                  <span className={styles.perfMetaValue}>
                    {isBranch && topAgent
                      ? topAgent.name
                      : (m.totalAgents ? Math.round(m.totalSubscribers / m.totalAgents) : 0)}
                  </span>
                </div>
              </motion.button>
            </div>
          </motion.section>

          {/* ── Insights ── */}
          <motion.section className={styles.section} variants={fadeUp}>
            <div className={styles.sectionHead} style={{ '--section-accent': '#5E63A8' }}>
              <h2 className={styles.sectionTitle}>Insights</h2>
              <span className={styles.sectionCount}>3 reports</span>
            </div>
            <div className={styles.grid3}>
              <motion.button className={styles.insightCard} onClick={() => go('subscriber-growth')} variants={fadeIn}
                whileHover={{ y: -2 }} whileTap={{ scale: 0.985 }} transition={{ duration: 0.2 }}>
                <div className={styles.insightHeader}>
                  <span className={styles.insightLabel}>Subscriber Growth</span>
                  <CardArrow />
                </div>
                <div className={styles.insightMain}>
                  <span className={styles.insightBig}>+{m.newSubscribersThisMonth?.toLocaleString()}</span>
                  <span className={styles.insightUnit}>this month</span>
                </div>
                <div className={styles.insightFooter}>
                  <span>+{m.newSubscribersThisWeek} this week</span>
                  <TrendArrow value={subsTrend} />
                </div>
              </motion.button>

              <motion.button className={styles.insightCard} onClick={() => go('subscriber-demographics')} variants={fadeIn}
                whileHover={{ y: -2 }} whileTap={{ scale: 0.985 }} transition={{ duration: 0.2 }}>
                <div className={styles.insightHeader}>
                  <span className={styles.insightLabel}>Demographics</span>
                  <CardArrow />
                </div>
                <div className={styles.insightMain}>
                  <MiniBar segments={[
                    { pct: m.genderRatio?.male || 0, color: 'var(--color-indigo)' },
                    { pct: m.genderRatio?.female || 0, color: 'var(--color-teal)' },
                    { pct: m.genderRatio?.other || 0, color: 'var(--color-lavender)' },
                  ]} height={10} />
                </div>
                <div className={styles.insightFooter}>
                  <span>{m.genderRatio?.male}% male · {m.genderRatio?.female}% female</span>
                </div>
              </motion.button>

              <motion.button className={styles.insightCard} onClick={() => go('kyc-compliance')} variants={fadeIn}
                whileHover={{ y: -2 }} whileTap={{ scale: 0.985 }} transition={{ duration: 0.2 }}>
                <div className={styles.insightHeader}>
                  <span className={styles.insightLabel}>KYC & Compliance</span>
                  <CardArrow />
                </div>
                <div className={styles.insightMain}>
                  <MiniDonut value={m.coverageRate} color="#5E63A8" size={52} />
                </div>
                <div className={styles.insightFooter}>
                  <span>{m.coverageRate}% coverage rate</span>
                </div>
              </motion.button>
            </div>
          </motion.section>

        </motion.div>
      </div>
    </div>
  );
}

/* ─── Icons ──────────────────────────────────────────────────────────── */

const ICONS = {
  building: (
    <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
      <path d="M3 21h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M5 21V7l7-4 7 4v14" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <rect x="9" y="13" width="6" height="8" rx="1" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
      <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="18" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M21 21v-1.5a3 3 0 00-3-3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5 21v-1a7 7 0 0114 0v1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  ),
  wallet: (
    <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
      <rect x="2" y="6" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M2 10h20" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="17" cy="15" r="1.5" fill="currentColor" />
    </svg>
  ),
  'bar-chart': (
    <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
      <rect x="3" y="12" width="4" height="9" rx="1" stroke="currentColor" strokeWidth="1.75" />
      <rect x="10" y="6" width="4" height="15" rx="1" stroke="currentColor" strokeWidth="1.75" />
      <rect x="17" y="3" width="4" height="18" rx="1" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
      <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};
