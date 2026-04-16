import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatUGX, fmtShort, EASE_OUT_EXPO } from '../../utils/finance';
import { getInitials } from '../../utils/dashboard';
import { useDashboard } from '../../contexts/DashboardContext';
import styles from './OperationsSection.module.css';

const SORT_OPTIONS = [
  { key: 'contributions', label: 'Contributions' },
  { key: 'subscribers', label: 'Subscribers' },
  { key: 'activeRate', label: 'Active Rate' },
];

const MEDAL_COLORS = ['#FBBF24', '#94A3B8', '#CD7F32'];
const AGE_KEYS = ['18-25', '26-35', '36-45', '46-55', '56+'];
const AGE_COLORS = ['#2F8F9D', '#5E63A8', '#8A90A6', '#292867', '#1B1A4A'];

function sortAgents(agents, key) {
  return [...agents].sort((a, b) => {
    const am = a.metrics || {}, bm = b.metrics || {};
    if (key === 'contributions') return (bm.totalContributions || 0) - (am.totalContributions || 0);
    if (key === 'subscribers') return (bm.totalSubscribers || 0) - (am.totalSubscribers || 0);
    return (bm.activeRate || 0) - (am.activeRate || 0);
  });
}

function getVal(agent, key) {
  const m = agent.metrics || {};
  if (key === 'contributions') return m.totalContributions || 0;
  if (key === 'subscribers') return m.totalSubscribers || 0;
  return m.activeRate || 0;
}

function fmtVal(v, key) {
  if (key === 'contributions') return fmtShort(v);
  if (key === 'subscribers') return v.toLocaleString();
  return `${Math.round(v)}%`;
}

export default function OperationsSection({ agents = [], commissionSummary, metrics = {} }) {
  const { setCommissionsOpen, setViewAgentsOpen, setDrillTargetAgentId, closeAllPanels } = useDashboard();
  const [sortKey, setSortKey] = useState('contributions');
  const [tab, setTab] = useState('commissions');

  const { totalPaid = 0, totalDue = 0, totalDisputed = 0, settlementRate = 0 } = commissionSummary || {};

  const sorted = useMemo(() => sortAgents(agents, sortKey), [agents, sortKey]);
  const maxVal = sorted.length ? (getVal(sorted[0], sortKey) || 1) : 1;

  const { gender, ageData } = useMemo(() => {
    let male = 0, female = 0;
    const ageBuckets = [0, 0, 0, 0, 0];
    agents.forEach((agent) => {
      const m = agent.metrics || {};
      const gr = m.genderRatio || {};
      male += gr.male || 0;
      female += gr.female || 0;
      const ad = m.ageDistribution || {};
      AGE_KEYS.forEach((key, i) => { ageBuckets[i] += ad[key] || 0; });
    });
    const t = male + female || 1;
    return {
      gender: { male, female, malePct: Math.round((male / t) * 100), femalePct: Math.round((female / t) * 100), total: male + female },
      ageData: ageBuckets,
    };
  }, [agents]);

  const ageMax = Math.max(...ageData, 1);
  const commTotal = totalPaid + totalDue + totalDisputed || 1;
  const paidPct = (totalPaid / commTotal) * 100;
  const duePct = (totalDue / commTotal) * 100;
  const disputedPct = (totalDisputed / commTotal) * 100;

  function openAgent(agentId) {
    closeAllPanels();
    setDrillTargetAgentId?.(agentId);
    setViewAgentsOpen(true);
  }

  function openAllAgents() {
    closeAllPanels();
    setDrillTargetAgentId?.(null);
    setViewAgentsOpen(true);
  }

  function openCommissions() {
    closeAllPanels();
    setCommissionsOpen(true);
  }

  return (
    <motion.div className={styles.grid}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15, ease: EASE_OUT_EXPO }}
    >
      {/* ── Left: Agent Leaderboard ── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.headerLeft}>
            <h3 className={styles.cardTitle}>Your Team</h3>
            <span className={styles.cardBadge}>{agents.length} agents</span>
          </div>
          <div className={styles.headerRight}>
            <select className={styles.sortSelect} value={sortKey}
              onChange={(e) => setSortKey(e.target.value)} aria-label="Sort by">
              {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <button className={styles.viewAllBtn} onClick={openAllAgents}>
              View All
              <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10">
                <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </button>
          </div>
        </div>

        <div className={styles.agentList}>
          {sorted.map((agent, i) => {
            const val = getVal(agent, sortKey);
            const pct = (val / maxVal) * 100;
            const isTop3 = i < 3;

            return (
              <motion.button
                type="button"
                key={agent.id}
                className={styles.agentRow}
                onClick={() => openAgent(agent.id)}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.05 + 0.03 * i, ease: EASE_OUT_EXPO }}
              >
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
                      <motion.div className={styles.barFill} data-top={isTop3}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(pct, 3)}%` }}
                        transition={{ duration: 0.6, delay: 0.1 + 0.04 * i, ease: EASE_OUT_EXPO }}
                      />
                    </div>
                    <span className={styles.barLabel}>{fmtVal(val, sortKey)}</span>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── Right: Tabbed Commissions / Demographics ── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.tabs} role="tablist">
            <button
              className={styles.tabBtn}
              data-active={tab === 'commissions'}
              onClick={() => setTab('commissions')}
              role="tab"
              aria-selected={tab === 'commissions'}
            >
              Commissions
            </button>
            <button
              className={styles.tabBtn}
              data-active={tab === 'demographics'}
              onClick={() => setTab('demographics')}
              role="tab"
              aria-selected={tab === 'demographics'}
            >
              Demographics
            </button>
          </div>
          {tab === 'commissions' && (
            <button className={styles.viewAllBtn} onClick={openCommissions}>
              View All
              <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10">
                <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </button>
          )}
          {tab === 'demographics' && (
            <span className={styles.cardBadge}>{gender.total.toLocaleString()} subscribers</span>
          )}
        </div>

        <AnimatePresence mode="wait">
          {tab === 'commissions' && (
            <motion.div
              key="commissions"
              className={styles.tabBody}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
            >
              <div className={styles.settlementRow}>
                <div className={styles.settlementHeadline}>
                  <span className={styles.settlementValue}>{Math.round(settlementRate)}%</span>
                  <span className={styles.settlementLabel}>settlement rate</span>
                </div>
                <div className={styles.totalAmount}>
                  <span className={styles.totalLabel}>Total</span>
                  <span className={styles.totalValue}>{formatUGX(commTotal === 1 ? 0 : commTotal)}</span>
                </div>
              </div>

              <div className={styles.stackedBar}>
                {totalPaid > 0 && <motion.div className={styles.stackedSegment} data-type="settled"
                  initial={{ width: 0 }} animate={{ width: `${paidPct}%` }}
                  transition={{ duration: 0.7, delay: 0.2, ease: EASE_OUT_EXPO }} />}
                {totalDue > 0 && <motion.div className={styles.stackedSegment} data-type="due"
                  initial={{ width: 0 }} animate={{ width: `${duePct}%` }}
                  transition={{ duration: 0.7, delay: 0.3, ease: EASE_OUT_EXPO }} />}
                {totalDisputed > 0 && <motion.div className={styles.stackedSegment} data-type="disputed"
                  initial={{ width: 0 }} animate={{ width: `${disputedPct}%` }}
                  transition={{ duration: 0.7, delay: 0.4, ease: EASE_OUT_EXPO }} />}
              </div>

              <div className={styles.commissionStats}>
                <div className={styles.commissionStat}>
                  <span className={styles.statDot} data-type="settled" />
                  <span className={styles.statLabel}>Settled</span>
                  <span className={styles.statValue}>{formatUGX(totalPaid)}</span>
                </div>
                <div className={styles.commissionStat}>
                  <span className={styles.statDot} data-type="due" />
                  <span className={styles.statLabel}>Due</span>
                  <span className={styles.statValue}>{formatUGX(totalDue)}</span>
                </div>
                <div className={styles.commissionStat}>
                  <span className={styles.statDot} data-type="disputed" />
                  <span className={styles.statLabel}>Disputed</span>
                  <span className={styles.statValue}>{formatUGX(totalDisputed)}</span>
                </div>
              </div>
            </motion.div>
          )}

          {tab === 'demographics' && (
            <motion.div
              key="demographics"
              className={styles.tabBody}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
            >
              <div className={styles.genderSection}>
                <div className={styles.genderRow}>
                  <span className={styles.genderLabel}>Male</span>
                  <div className={styles.genderTrack}>
                    <motion.div className={styles.genderFill} data-gender="male"
                      initial={{ width: 0 }} animate={{ width: `${gender.malePct}%` }}
                      transition={{ duration: 0.6, delay: 0.1, ease: EASE_OUT_EXPO }} />
                  </div>
                  <span className={styles.genderPct}>{gender.malePct}%</span>
                </div>
                <div className={styles.genderRow}>
                  <span className={styles.genderLabel}>Female</span>
                  <div className={styles.genderTrack}>
                    <motion.div className={styles.genderFill} data-gender="female"
                      initial={{ width: 0 }} animate={{ width: `${gender.femalePct}%` }}
                      transition={{ duration: 0.6, delay: 0.15, ease: EASE_OUT_EXPO }} />
                  </div>
                  <span className={styles.genderPct}>{gender.femalePct}%</span>
                </div>
              </div>

              <div className={styles.ageSection}>
                <span className={styles.ageTitle}>Age Distribution</span>
                <div className={styles.ageBars}>
                  {ageData.map((v, i) => (
                    <div key={i} className={styles.ageRow}>
                      <span className={styles.ageKey}>{AGE_KEYS[i]}</span>
                      <div className={styles.ageTrack}>
                        <motion.div className={styles.ageFill}
                          style={{ background: AGE_COLORS[i] }}
                          initial={{ width: 0 }}
                          animate={{ width: `${(v / ageMax) * 100}%` }}
                          transition={{ duration: 0.5, delay: 0.2 + 0.05 * i, ease: EASE_OUT_EXPO }} />
                      </div>
                      <span className={styles.ageVal}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
