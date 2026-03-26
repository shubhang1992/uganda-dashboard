import { motion } from 'framer-motion';
import { useDashboard } from '../../contexts/DashboardContext';
import { COUNTRY, getEntityById } from '../../data/mockData';
import styles from './MetricsRow.module.css';

const EASE = [0.16, 1, 0.3, 1];

function getCurrentMetrics(level, selectedIds) {
  if (level === 'country') return COUNTRY.metrics;
  const id = selectedIds[level];
  const entity = getEntityById(level, id);
  return entity?.metrics || COUNTRY.metrics;
}

function DonutChart({ ratio }) {
  if (!ratio) return null;
  const r = 24;
  const circ = 2 * Math.PI * r;
  const male = (ratio.male / 100) * circ;
  const female = (ratio.female / 100) * circ;
  return (
    <svg viewBox="0 0 64 64" className={styles.donut}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-lavender)" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-indigo)" strokeWidth="7"
        strokeDasharray={`${male} ${circ - male}`} transform="rotate(-90 32 32)" strokeLinecap="round" />
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-teal)" strokeWidth="7"
        strokeDasharray={`${female} ${circ - female}`} strokeDashoffset={`${-male}`}
        transform="rotate(-90 32 32)" strokeLinecap="round" />
    </svg>
  );
}

function AgeBarChart({ distribution }) {
  if (!distribution) return null;
  const entries = Object.entries(distribution);
  const max = Math.max(...entries.map(([, v]) => v));
  return (
    <div className={styles.ageBars}>
      {entries.map(([label, value]) => (
        <div key={label} className={styles.ageBar}>
          <div className={styles.ageBarFill} style={{ height: `${(value / max) * 100}%` }} />
          <span className={styles.ageLabel}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function Sparkline({ data }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100;
  const h = 32;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 6) - 3;
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={styles.sparkline}>
      <defs>
        <linearGradient id="sparkG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-indigo)" />
          <stop offset="100%" stopColor="var(--color-indigo)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`0,${h} ${points.join(' ')} ${w},${h}`} fill="url(#sparkG)" opacity="0.08" />
      <polyline points={points.join(' ')} fill="none" stroke="var(--color-indigo)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const item = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } };

export default function MetricsRow() {
  const { level, selectedIds } = useDashboard();
  const metrics = getCurrentMetrics(level, selectedIds);

  return (
    <motion.div
      className={styles.row}
      variants={container}
      initial="hidden"
      animate="show"
      key={level + JSON.stringify(selectedIds)}
    >
      {/* Card 1: Financials overview with sparkline */}
      <motion.div className={styles.card} variants={item}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Financials</h3>
          <span className={styles.seeAll}>Details</span>
        </div>
        <div className={styles.financialBody}>
          <Sparkline data={metrics.monthlyContributions} />
          <div className={styles.financialStats}>
            <div className={styles.fStat}>
              <span className={styles.fLabel}>Contributions</span>
              <span className={styles.fValue} data-positive="true">
                {((metrics.totalContributions || 0) / 1e9).toFixed(1)}B
              </span>
            </div>
            <div className={styles.fStat}>
              <span className={styles.fLabel}>Withdrawals</span>
              <span className={styles.fValue}>
                {((metrics.totalWithdrawals || 0) / 1e9).toFixed(1)}B
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Card 2: Demographics — combined gender + age */}
      <motion.div className={styles.card} variants={item}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Demographics</h3>
          <span className={styles.seeAll}>Details</span>
        </div>
        <div className={styles.demoBody}>
          <div className={styles.demoLeft}>
            <DonutChart ratio={metrics.genderRatio} />
            <div className={styles.demoLegend}>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: 'var(--color-indigo)' }} />
                Male {metrics.genderRatio?.male}%
              </span>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: 'var(--color-teal)' }} />
                Female {metrics.genderRatio?.female}%
              </span>
            </div>
          </div>
          <div className={styles.demoRight}>
            <AgeBarChart distribution={metrics.ageDistribution} />
          </div>
        </div>
      </motion.div>

      {/* Card 3: Coverage & Activity */}
      <motion.div className={styles.card} variants={item}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Coverage & Activity</h3>
          <span className={styles.seeAll}>Details</span>
        </div>
        <div className={styles.coverageBody}>
          {/* Coverage ring */}
          <div className={styles.coverageRing}>
            <svg viewBox="0 0 72 72" className={styles.ringChart}>
              <circle cx="36" cy="36" r="28" fill="none" stroke="var(--color-lavender)" strokeWidth="6" />
              <circle cx="36" cy="36" r="28" fill="none" stroke="var(--color-indigo)" strokeWidth="6"
                strokeDasharray={`${(metrics.coverageRate / 100) * 2 * Math.PI * 28} ${2 * Math.PI * 28}`}
                transform="rotate(-90 36 36)" strokeLinecap="round" />
              <text x="36" y="34" textAnchor="middle" className={styles.ringValue}>{metrics.coverageRate}%</text>
              <text x="36" y="44" textAnchor="middle" className={styles.ringSub}>Coverage</text>
            </svg>
          </div>
          {/* Quick stats */}
          <div className={styles.coverageStats}>
            <div className={styles.covStat}>
              <span className={styles.covNum}>{metrics.activeRate}%</span>
              <span className={styles.covLabel}>Active rate</span>
            </div>
            <div className={styles.covStat}>
              <span className={styles.covNum}>{metrics.complaintsCount ?? 0}</span>
              <span className={styles.covLabel}>Complaints</span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
