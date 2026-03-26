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

function Sparkline({ data }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 120;
  const h = 40;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 8) - 4;
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={styles.sparkline}>
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-indigo)" />
          <stop offset="100%" stopColor="var(--color-indigo)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={`0,${h} ${points.join(' ')} ${w},${h}`}
        fill="url(#sparkGrad)"
        opacity="0.1"
      />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="var(--color-indigo)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DonutChart({ ratio }) {
  if (!ratio) return null;
  const r = 28;
  const circ = 2 * Math.PI * r;
  const male = (ratio.male / 100) * circ;
  const female = (ratio.female / 100) * circ;
  return (
    <svg viewBox="0 0 80 80" className={styles.donut}>
      <circle cx="40" cy="40" r={r} fill="none" stroke="var(--color-lavender)" strokeWidth="8" />
      <circle
        cx="40" cy="40" r={r}
        fill="none" stroke="var(--color-indigo)" strokeWidth="8"
        strokeDasharray={`${male} ${circ - male}`}
        transform="rotate(-90 40 40)"
        strokeLinecap="round"
      />
      <circle
        cx="40" cy="40" r={r}
        fill="none" stroke="var(--color-teal)" strokeWidth="8"
        strokeDasharray={`${female} ${circ - female}`}
        strokeDashoffset={`${-male}`}
        transform="rotate(-90 40 40)"
        strokeLinecap="round"
      />
      <text x="40" y="38" textAnchor="middle" className={styles.donutLabel} fill="var(--color-indigo)">{ratio.male}%</text>
      <text x="40" y="50" textAnchor="middle" className={styles.donutSub} fill="var(--color-gray)">Male</text>
    </svg>
  );
}

function AgeBarChart({ distribution }) {
  if (!distribution) return null;
  const entries = Object.entries(distribution);
  const max = Math.max(...entries.map(([, v]) => v));
  return (
    <div className={styles.ageChart}>
      {entries.map(([label, value]) => (
        <div key={label} className={styles.ageBar}>
          <div className={styles.ageBarFill} style={{ height: `${(value / max) * 100}%` }} />
          <span className={styles.ageLabel}>{label}</span>
        </div>
      ))}
    </div>
  );
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const item = { hidden: { opacity: 0, y: 30 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } };

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
      <motion.div className={styles.card} variants={item}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Contribution Trend</h3>
          <span className={styles.seeAll}>See all</span>
        </div>
        <Sparkline data={metrics.monthlyContributions} />
        <p className={styles.cardDesc}>Monthly contribution trend over 12 months</p>
      </motion.div>

      <motion.div className={styles.card} variants={item}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Gender Ratio</h3>
          <span className={styles.seeAll}>See all</span>
        </div>
        <DonutChart ratio={metrics.genderRatio} />
        <p className={styles.cardDesc}>Subscriber gender distribution</p>
      </motion.div>

      <motion.div className={styles.card} variants={item}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Age Distribution</h3>
          <span className={styles.seeAll}>See all</span>
        </div>
        <AgeBarChart distribution={metrics.ageDistribution} />
        <p className={styles.cardDesc}>Subscriber age brackets</p>
      </motion.div>
    </motion.div>
  );
}
