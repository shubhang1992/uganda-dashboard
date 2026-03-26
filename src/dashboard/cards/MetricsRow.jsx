import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard } from '../../contexts/DashboardContext';
import { COUNTRY, getEntityById, formatUGX } from '../../data/mockData';
import styles from './MetricsRow.module.css';

const EASE = [0.16, 1, 0.3, 1];

function getCurrentMetrics(level, selectedIds) {
  if (level === 'country') return COUNTRY.metrics;
  const id = selectedIds[level];
  const entity = getEntityById(level, id);
  return entity?.metrics || COUNTRY.metrics;
}

// ── Mock AI ──
const SUGGESTIONS = ['Top agents?', 'Coverage by region?', 'Active subscribers?', 'Gender split?'];

const MOCK_RESPONSES = {
  default: "I can help you analyse your pension network data. Ask about subscribers, agents, coverage, or contributions!",
  agent: "Top 3 agents: Sarah Nambi (92%), Moses Okello (89%), Grace Achieng (87%). Average performance: 78%.",
  coverage: "Coverage: Northern 62%, Central 58%, Eastern 55%, Western 52%. Overall: 67%.",
  subscriber: "2,000 subscribers. 82% active. Growth: 3.8% MoM. Central leads with 680.",
  gender: "Gender: 52% male, 46% female, 2% other. Eastern has the most balanced split.",
};

function getMockResponse(msg) {
  const l = msg.toLowerCase();
  if (l.includes('agent') || l.includes('top')) return MOCK_RESPONSES.agent;
  if (l.includes('coverage') || l.includes('region')) return MOCK_RESPONSES.coverage;
  if (l.includes('subscriber') || l.includes('active')) return MOCK_RESPONSES.subscriber;
  if (l.includes('gender') || l.includes('split')) return MOCK_RESPONSES.gender;
  return MOCK_RESPONSES.default;
}

// ── Chat Card ──
function ChatCard() {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Ask me anything about your network data.' },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, isTyping]);

  function handleSend(text) {
    const msg = text || input.trim();
    if (!msg) return;
    setMessages((prev) => [...prev, { role: 'user', text: msg }]);
    setInput('');
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [...prev, { role: 'assistant', text: getMockResponse(msg) }]);
    }, 900);
  }

  return (
    <div className={styles.chatCard}>
      <div className={styles.chatHeader}>
        <div className={styles.chatDot} />
        <span className={styles.chatTitle}>Data Assistant</span>
      </div>
      <div className={styles.chatMessages} ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={styles.chatMsg} data-role={m.role}>
            <div className={styles.chatBubble} data-role={m.role}>{m.text}</div>
          </div>
        ))}
        {isTyping && (
          <div className={styles.chatMsg} data-role="assistant">
            <div className={styles.chatBubble} data-role="assistant">
              <span className={styles.typingDots}><span /><span /><span /></span>
            </div>
          </div>
        )}
      </div>
      {messages.length <= 1 && (
        <div className={styles.chatSuggestions}>
          {SUGGESTIONS.map((s) => (
            <button key={s} className={styles.chatSuggest} onClick={() => handleSend(s)}>{s}</button>
          ))}
        </div>
      )}
      <div className={styles.chatInput}>
        <input
          className={styles.chatField}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
          placeholder="Ask about your data..."
        />
        <button className={styles.chatSend} onClick={() => handleSend()} disabled={!input.trim()}>
          <svg viewBox="0 0 16 16" fill="none" width="12" height="12"><path d="M2 8l12-6-6 12V8H2z" fill="currentColor"/></svg>
        </button>
      </div>
    </div>
  );
}

// ── Charts ──
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
  const w = 140;
  const h = 40;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 6) - 3;
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={styles.sparkline}>
      <defs>
        <linearGradient id="spG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-indigo)" />
          <stop offset="100%" stopColor="var(--color-indigo)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`0,${h} ${points.join(' ')} ${w},${h}`} fill="url(#spG)" opacity="0.08" />
      <polyline points={points.join(' ')} fill="none" stroke="var(--color-indigo)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const item = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } };

export default function MetricsRow() {
  const { level, selectedIds } = useDashboard();
  const metrics = getCurrentMetrics(level, selectedIds);
  const [expanded, setExpanded] = useState(null); // 'demographics' | 'coverage' | null

  function toggleExpand(card) {
    setExpanded((prev) => prev === card ? null : card);
  }

  const totalSubs = metrics.totalSubscribers || 0;
  const activeSubs = Math.round(totalSubs * (metrics.activeRate / 100));
  const inactiveSubs = totalSubs - activeSubs;

  return (
    <motion.div
      className={styles.row}
      variants={container}
      initial="hidden"
      animate="show"
      key={level + JSON.stringify(selectedIds)}
    >
      {/* Card 1: AI Data Assistant */}
      <motion.div variants={item} style={{ flex: 1 }}>
        <ChatCard />
      </motion.div>

      {/* Card 2: Demographics (expandable) */}
      <motion.div className={styles.card} variants={item} data-expanded={expanded === 'demographics'}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Demographics</h3>
          <button className={styles.detailsBtn} onClick={() => toggleExpand('demographics')}>
            {expanded === 'demographics' ? 'Collapse' : 'Details'}
          </button>
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
        <AnimatePresence>
          {expanded === 'demographics' && (
            <motion.div
              className={styles.expandedContent}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <div className={styles.expandDivider} />
              <div className={styles.expandGrid}>
                <div className={styles.expandItem}>
                  <span className={styles.expandNum}>{metrics.genderRatio?.other || 0}%</span>
                  <span className={styles.expandLabel}>Other gender</span>
                </div>
                <div className={styles.expandItem}>
                  <span className={styles.expandNum}>{totalSubs.toLocaleString()}</span>
                  <span className={styles.expandLabel}>Total subscribers</span>
                </div>
                {Object.entries(metrics.ageDistribution || {}).map(([bracket, count]) => (
                  <div key={bracket} className={styles.expandItem}>
                    <span className={styles.expandNum}>{count}</span>
                    <span className={styles.expandLabel}>Age {bracket}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Card 3: Coverage (expandable) */}
      <motion.div className={styles.card} variants={item} data-expanded={expanded === 'coverage'}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Coverage & Activity</h3>
          <button className={styles.detailsBtn} onClick={() => toggleExpand('coverage')}>
            {expanded === 'coverage' ? 'Collapse' : 'Details'}
          </button>
        </div>
        <div className={styles.coverageBody}>
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
          <div className={styles.coverageStats}>
            <div className={styles.covStat}>
              <span className={styles.covNum}>{metrics.activeRate}%</span>
              <span className={styles.covLabel}>Active rate</span>
            </div>
            <div className={styles.covStat}>
              <span className={styles.covNum}>{activeSubs.toLocaleString()}</span>
              <span className={styles.covLabel}>Active subs</span>
            </div>
          </div>
        </div>
        <AnimatePresence>
          {expanded === 'coverage' && (
            <motion.div
              className={styles.expandedContent}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <div className={styles.expandDivider} />
              <div className={styles.expandSection}>
                <span className={styles.expandSectionTitle}>Contribution trend (12 months)</span>
                <Sparkline data={metrics.monthlyContributions} />
              </div>
              <div className={styles.expandGrid}>
                <div className={styles.expandItem}>
                  <span className={styles.expandNum}>{inactiveSubs.toLocaleString()}</span>
                  <span className={styles.expandLabel}>Inactive subs</span>
                </div>
                <div className={styles.expandItem}>
                  <span className={styles.expandNum}>{metrics.complaintsCount ?? 0}</span>
                  <span className={styles.expandLabel}>Complaints</span>
                </div>
                <div className={styles.expandItem}>
                  <span className={styles.expandNum}>{formatUGX(metrics.totalContributions)}</span>
                  <span className={styles.expandLabel}>Contributions</span>
                </div>
                <div className={styles.expandItem}>
                  <span className={styles.expandNum}>{formatUGX(metrics.totalWithdrawals)}</span>
                  <span className={styles.expandLabel}>Withdrawals</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
