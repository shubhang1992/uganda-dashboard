import { motion } from 'framer-motion';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { EASE_OUT_EXPO } from '../../utils/finance';
import styles from './KpiCard.module.css';

function RadialGauge({ pct, color = '#2E8B57', size = 48 }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className={styles.gaugeWrap} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(41,40,103,0.06)"
          strokeWidth="4"
        />
        {/* Fill */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${circ}`}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - dash }}
          transition={{ duration: 1, delay: 0.3, ease: EASE_OUT_EXPO }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={styles.gaugePct}>{Math.round(pct)}%</span>
    </div>
  );
}

export default function KpiCard({ icon, label, value, sub, delay = 0, sparkData, sparkColor, trend, gauge }) {
  return (
    <motion.div
      className={styles.card}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE_OUT_EXPO }}
    >
      <div className={styles.topRow}>
        {gauge
          ? <RadialGauge pct={gauge.pct} color={gauge.color} />
          : <div className={styles.iconWrap}>{icon}</div>
        }
        {trend != null && (
          <span className={styles.trendBadge} data-positive={trend >= 0}>
            <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10">
              <path
                d={trend >= 0 ? 'M6 2l4 5H2z' : 'M6 10l4-5H2z'}
                fill="currentColor"
              />
            </svg>
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <span className={styles.label}>{label}</span>
      {!gauge && <span className={styles.value}>{value}</span>}
      {sub && <span className={styles.sub}>{sub}</span>}
      {sparkData && sparkData.length > 1 && (
        <div className={styles.sparkWrap}>
          <ResponsiveContainer width="100%" height={36}>
            <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${label.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sparkColor || '#5E63A8'} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={sparkColor || '#5E63A8'} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={sparkColor || '#5E63A8'}
                strokeWidth={1.5}
                fill={`url(#spark-${label.replace(/\s/g, '')})`}
                dot={false}
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
}
