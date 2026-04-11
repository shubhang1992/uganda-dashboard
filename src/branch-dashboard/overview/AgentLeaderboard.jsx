import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { fmtShort, EASE_OUT_EXPO } from '../../utils/finance';
import { perfLevel, getInitials } from '../../utils/dashboard';
import styles from './AgentLeaderboard.module.css';

const SORT_OPTIONS = [
  { key: 'contributions', label: 'Contributions' },
  { key: 'subscribers', label: 'Subscribers' },
  { key: 'activeRate', label: 'Active Rate' },
];

function sortAgents(agents, sortKey) {
  return [...agents].sort((a, b) => {
    const am = a.metrics || {};
    const bm = b.metrics || {};
    switch (sortKey) {
      case 'contributions': return (bm.totalContributions || 0) - (am.totalContributions || 0);
      case 'subscribers': return (bm.totalSubscribers || 0) - (am.totalSubscribers || 0);
      case 'activeRate': return (bm.activeRate || 0) - (am.activeRate || 0);
      default: return 0;
    }
  });
}

function getBarValue(agent, sortKey) {
  const m = agent.metrics || {};
  switch (sortKey) {
    case 'contributions': return m.totalContributions || 0;
    case 'subscribers': return m.totalSubscribers || 0;
    case 'activeRate': return m.activeRate || 0;
    default: return 0;
  }
}

function formatBarLabel(value, sortKey) {
  if (sortKey === 'contributions') return fmtShort(value);
  if (sortKey === 'subscribers') return value.toLocaleString();
  return `${Math.round(value)}%`;
}

const MEDAL_COLORS = ['#E6A817', '#8A90A6', '#CD7F32'];
const COMPACT_COUNT = 5;

function MiniGauge({ pct, size = 24 }) {
  const r = (size - 3) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const perf = perfLevel(pct);
  const color = perf === 'high' ? '#2E8B57' : perf === 'mid' ? '#E6A817' : '#DC3545';

  return (
    <div className={styles.miniGauge} style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(41,40,103,0.06)" strokeWidth="2.5" />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ - dash}
          transform={`rotate(-90 ${size/2} ${size/2})`}
        />
      </svg>
      <span className={styles.miniGaugePct}>{Math.round(pct)}</span>
    </div>
  );
}

export default function AgentLeaderboard({ agents }) {
  const [sortKey, setSortKey] = useState('contributions');
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(() => sortAgents(agents, sortKey), [agents, sortKey]);
  const maxVal = useMemo(() => {
    if (!sorted.length) return 1;
    return getBarValue(sorted[0], sortKey) || 1;
  }, [sorted, sortKey]);

  const visible = expanded ? sorted : sorted.slice(0, COMPACT_COUNT);
  const hasMore = sorted.length > COMPACT_COUNT;

  return (
    <motion.div
      className={styles.card}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3, ease: EASE_OUT_EXPO }}
    >
      <div className={styles.header}>
        <h3 className={styles.title}>Agent Performance</h3>
        <select
          className={styles.sortSelect}
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value)}
          aria-label="Sort by"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>By {o.label}</option>
          ))}
        </select>
      </div>

      <div className={styles.list}>
        {visible.map((agent, i) => {
          const m = agent.metrics || {};
          const val = getBarValue(agent, sortKey);
          const pct = (val / maxVal) * 100;
          const isTop3 = i < 3;

          return (
            <div key={agent.id} className={styles.agentRow} data-top={isTop3}>
              <div className={styles.rankCol}>
                {isTop3 ? (
                  <span className={styles.medal} style={{ background: MEDAL_COLORS[i] }}>{i + 1}</span>
                ) : (
                  <span className={styles.rank}>{i + 1}</span>
                )}
              </div>

              <span className={styles.avatar} data-gender={agent.gender}>{getInitials(agent.name)}</span>

              <div className={styles.agentInfo}>
                <span className={styles.agentName}>{agent.name}</span>
                <div className={styles.barRow}>
                  <div className={styles.barTrack}>
                    <motion.div
                      className={styles.barFill} data-tier={isTop3 ? 'top' : 'normal'}
                      initial={{ width: 0 }} animate={{ width: `${Math.max(pct, 3)}%` }}
                      transition={{ duration: 0.5, delay: 0.05 * i, ease: EASE_OUT_EXPO }}
                    />
                  </div>
                  <span className={styles.barLabel}>{formatBarLabel(val, sortKey)}</span>
                </div>
              </div>

              <MiniGauge pct={m.activeRate || 0} />
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button className={styles.expandBtn} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : `Show all ${sorted.length}`}
          <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}>
            <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </button>
      )}
    </motion.div>
  );
}
