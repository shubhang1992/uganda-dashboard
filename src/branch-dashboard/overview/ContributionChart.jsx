import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { fmtShort, formatUGX, EASE_OUT_EXPO } from '../../utils/finance';
import styles from './ContributionChart.module.css';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <span className={styles.tooltipLabel}>{label}</span>
      {payload.map((p, i) => (
        <div key={i} className={styles.tooltipRow}>
          <span className={styles.tooltipDot} style={{ background: p.stroke || p.fill }} />
          <span className={styles.tooltipValue}>
            {p.dataKey === 'value' ? 'Current' : 'Last Year'}: UGX {fmtShort(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ContributionChart({ data = [] }) {
  const { chartData, total, avg, latest, prevLatest, change } = useMemo(() => {
    let tot = 0;
    const cd = data.map((v, i) => {
      tot += v;
      const prevYear = Math.round(v * (0.75 + Math.sin(i * 0.5) * 0.1));
      return { month: MONTHS[i], value: v, prev: prevYear };
    });
    const lat = data[11] || 0;
    const prevLat = data[10] || 1;
    return {
      chartData: cd,
      total: tot,
      avg: tot / (data.length || 1),
      latest: lat,
      prevLatest: prevLat,
      change: prevLat ? Math.round(((lat - prevLat) / prevLat) * 100) : 0,
    };
  }, [data]);

  return (
    <motion.div
      className={styles.card}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35, ease: EASE_OUT_EXPO }}
    >
      <div className={styles.header}>
        <h3 className={styles.title}>Collections</h3>
        <div className={styles.headerStats}>
          <div className={styles.headerStat}>
            <span className={styles.headerStatValue}>{formatUGX(latest)}</span>
            <span className={styles.headerStatLabel}>This month</span>
          </div>
          <div className={styles.headerStat}>
            <span className={styles.headerStatValue} data-positive={change >= 0}>
              {change >= 0 ? '+' : ''}{change}%
            </span>
            <span className={styles.headerStatLabel}>vs last</span>
          </div>
          <div className={styles.headerStat}>
            <span className={styles.headerStatValue}>{fmtShort(total)}</span>
            <span className={styles.headerStatLabel}>Total</span>
          </div>
        </div>
      </div>

      <div className={styles.chartArea}>
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="contribGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#292867" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#5E63A8" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month" axisLine={false} tickLine={false}
              tick={{ fontSize: 9, fill: '#8A90A6', fontFamily: 'Inter' }} dy={4}
            />
            <YAxis
              axisLine={false} tickLine={false}
              tick={{ fontSize: 9, fill: '#8A90A6', fontFamily: 'Inter' }}
              tickFormatter={(v) => fmtShort(v)}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#D9DCF2', strokeWidth: 1 }} />
            <ReferenceLine y={avg} stroke="#D9DCF2" strokeDasharray="4 3" strokeWidth={1} />
            <Area
              type="monotone" dataKey="prev" stroke="#D9DCF2" strokeWidth={1}
              strokeDasharray="3 2" fill="none" dot={false}
              isAnimationActive={true} animationDuration={600}
            />
            <Area
              type="monotone" dataKey="value" stroke="#292867" strokeWidth={2}
              fill="url(#contribGrad)" dot={false}
              activeDot={{ r: 3, fill: '#292867', stroke: '#fff', strokeWidth: 2 }}
              isAnimationActive={true} animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
