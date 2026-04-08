import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard } from '../../contexts/DashboardContext';
import { useCurrentEntity } from '../../hooks/useEntity';
import { getChatResponse } from '../../services/chat';
import { EASE_OUT_EXPO as EASE } from '../../utils/finance';
import styles from './MetricsRow.module.css';

const SUGGESTIONS = ['Top agents?', 'Coverage by region?', 'Active subscribers?', 'Gender split?'];

// ── Chat Card ──
function ChatCard({ open, onToggle }) {
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
    getChatResponse(msg).then((response) => {
      setTimeout(() => {
        setIsTyping(false);
        setMessages((prev) => [...prev, { role: 'assistant', text: response }]);
      }, 900);
    });
  }

  return (
    <motion.div className={styles.chatCard} data-collapsed={!open} variants={item}>
      <button className={styles.chatHeader} onClick={onToggle} type="button" aria-expanded={open}>
        <div className={styles.chatHeaderLeft}>
          <div className={styles.chatDot} />
          <span className={styles.chatTitle}>Talk to your data</span>
        </div>
        <svg aria-hidden="true" className={styles.cardToggle} data-open={open} width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M4 5.5l3 3 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className={styles.cardBody}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
          >
            <div className={styles.chatMessages} ref={listRef} aria-live="polite" aria-relevant="additions">
              {messages.map((m, i) => (
                <div key={i} className={styles.chatMsg} data-role={m.role}>
                  <div className={styles.chatBubble} data-role={m.role}>{m.text}</div>
                </div>
              ))}
              {isTyping && (
                <div className={styles.chatMsg} data-role="assistant">
                  <div className={styles.chatBubble} data-role="assistant" aria-label="Typing">
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
                placeholder="Ask about your data\u2026"
                aria-label="Chat message"
                name="chat"
                autoComplete="off"
              />
              <button className={styles.chatSend} onClick={() => handleSend()} disabled={!input.trim()} aria-label="Send message">
                <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="12" height="12"><path d="M2 8l12-6-6 12V8H2z" fill="currentColor"/></svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Charts ──
function DonutChart({ ratio }) {
  if (!ratio) return null;
  const r = 24;
  const circ = 2 * Math.PI * r;
  const male = (ratio.male / 100) * circ;
  const female = (ratio.female / 100) * circ;
  const other = ((ratio.other || 0) / 100) * circ;
  return (
    <svg viewBox="0 0 64 64" className={styles.donut} role="img" aria-label="Gender distribution chart">
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-lavender)" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-indigo)" strokeWidth="7"
        strokeDasharray={`${male} ${circ - male}`} transform="rotate(-90 32 32)" strokeLinecap="round" />
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-teal)" strokeWidth="7"
        strokeDasharray={`${female} ${circ - female}`} strokeDashoffset={`${-male}`}
        transform="rotate(-90 32 32)" strokeLinecap="round" />
      {other > 0 && (
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-status-warning)" strokeWidth="7"
          strokeDasharray={`${other} ${circ - other}`} strokeDashoffset={`${-(male + female)}`}
          transform="rotate(-90 32 32)" strokeLinecap="round" />
      )}
    </svg>
  );
}

function AgeBarChart({ distribution }) {
  if (!distribution) return null;
  const entries = Object.entries(distribution);
  const max = Math.max(...entries.map(([, v]) => v));
  return (
    <div className={styles.ageBars} role="img" aria-label="Age distribution chart">
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
const item = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } };

export default function MetricsRow() {
  const { level, selectedIds } = useDashboard();
  const { data: entity } = useCurrentEntity(level, selectedIds);
  const metrics = entity?.metrics;
  const [expanded, setExpanded] = useState(null);

  // Cards auto-collapse at overview levels, expand when drilling deeper
  // Each card toggles independently; key-based re-mount resets on navigation
  const [chatOpen, setChatOpen] = useState(level !== 'country' && level !== 'region');
  const [demoOpen, setDemoOpen] = useState(level !== 'country' && level !== 'region');

  function toggleExpand(card) {
    setExpanded((prev) => prev === card ? null : card);
  }

  if (!metrics) return null;
  const totalSubs = metrics.totalSubscribers || 0;

  return (
    <motion.div
      className={styles.row}
      variants={container}
      initial="hidden"
      animate="show"
      key={level + JSON.stringify(selectedIds)}
    >
      {/* Card 1: AI Data Assistant */}
      <ChatCard open={chatOpen} onToggle={() => setChatOpen(!chatOpen)} />

      {/* Card 2: Demographics (expandable) */}
      <motion.div className={styles.card} variants={item} data-expanded={expanded === 'demographics'} data-collapsed={!demoOpen}>
        <button className={styles.cardHeaderToggle} onClick={() => setDemoOpen(!demoOpen)} type="button" aria-expanded={demoOpen}>
          <h3 className={styles.cardTitle}>Demographics</h3>
          <svg aria-hidden="true" className={styles.cardToggle} data-open={demoOpen} width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M4 5.5l3 3 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <AnimatePresence initial={false}>
          {demoOpen && (
            <motion.div
              className={styles.cardBody}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              <div className={styles.detailsBtnRow}>
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
                    {(metrics.genderRatio?.other || 0) > 0 && (
                      <span className={styles.legendItem}>
                        <span className={styles.legendDot} style={{ background: 'var(--color-status-warning)' }} />
                        Other {metrics.genderRatio.other}%
                      </span>
                    )}
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
                    <div className={styles.expandSubtitle}>Gender (count)</div>
                    <div className={styles.expandGrid}>
                      <div className={styles.expandItem}>
                        <span className={styles.expandNum}>{Math.round(totalSubs * (metrics.genderRatio?.male || 0) / 100).toLocaleString()}</span>
                        <span className={styles.expandLabel}>Male</span>
                      </div>
                      <div className={styles.expandItem}>
                        <span className={styles.expandNum}>{Math.round(totalSubs * (metrics.genderRatio?.female || 0) / 100).toLocaleString()}</span>
                        <span className={styles.expandLabel}>Female</span>
                      </div>
                      <div className={styles.expandItem}>
                        <span className={styles.expandNum}>{Math.round(totalSubs * (metrics.genderRatio?.other || 0) / 100).toLocaleString()}</span>
                        <span className={styles.expandLabel}>Other</span>
                      </div>
                      <div className={styles.expandItem}>
                        <span className={styles.expandNum}>{totalSubs.toLocaleString()}</span>
                        <span className={styles.expandLabel}>Total</span>
                      </div>
                    </div>
                    <div className={styles.expandSubtitle}>Age distribution (count)</div>
                    <div className={styles.expandGrid}>
                      {Object.entries(metrics.ageDistribution || {}).map(([bracket, count]) => (
                        <div key={bracket} className={styles.expandItem}>
                          <span className={styles.expandNum}>{count.toLocaleString()}</span>
                          <span className={styles.expandLabel}>{bracket}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

    </motion.div>
  );
}
