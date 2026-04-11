import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getChatResponse } from '../../services/chat';
import { formatUGX, EASE_OUT_EXPO } from '../../utils/finance';
import styles from './BranchCopilot.module.css';

/* ── Auto-generate insights from branch data ── */
function generateInsights(metrics, agents) {
  const insights = [];

  if (agents.length > 1) {
    const sorted = [...agents].sort((a, b) =>
      (b.metrics?.totalContributions || 0) - (a.metrics?.totalContributions || 0)
    );
    const top = sorted[0];
    const avg = agents.reduce((s, a) => s + (a.metrics?.totalContributions || 0), 0) / agents.length;
    const topContrib = top.metrics?.totalContributions || 0;
    if (avg > 0 && topContrib / avg >= 1.3) {
      insights.push({
        type: 'positive',
        text: `${top.name.split(' ')[0]} collected ${(topContrib / avg).toFixed(1)}x the branch average`,
        query: `Tell me about ${top.name.split(' ')[0]}'s performance`,
      });
    }
  }

  const activeRate = metrics.activeRate || 0;
  if (activeRate >= 75) {
    insights.push({ type: 'positive', text: `Active rate at ${Math.round(activeRate)}% — above target`, query: 'Active subscribers?' });
  } else if (activeRate >= 50) {
    insights.push({ type: 'warning', text: `Active rate at ${Math.round(activeRate)}% — needs attention`, query: 'Active subscribers?' });
  } else {
    insights.push({ type: 'negative', text: `Active rate dropped to ${Math.round(activeRate)}%`, query: 'Active subscribers?' });
  }

  const inactiveAgents = agents.filter(a => a.status === 'inactive');
  if (inactiveAgents.length > 0) {
    insights.push({
      type: 'warning',
      text: `${inactiveAgents.length} agent${inactiveAgents.length > 1 ? 's' : ''} inactive — ${inactiveAgents.map(a => a.name.split(' ')[0]).join(', ')}`,
      query: 'Top agents?',
    });
  }

  const mc = metrics.monthlyContributions || [];
  const curr = mc[11] || 0;
  const prev = mc[10] || 0;
  if (prev > 0) {
    const pctChange = Math.round(((curr - prev) / prev) * 100);
    if (Math.abs(pctChange) > 3) {
      insights.push({
        type: pctChange > 0 ? 'positive' : 'negative',
        text: `Collections ${pctChange > 0 ? 'up' : 'down'} ${Math.abs(pctChange)}% — ${formatUGX(curr)} this month`,
        query: 'Show monthly trend',
      });
    }
  }

  return insights.slice(0, 4);
}

export default function BranchCopilot({ metrics, agents }) {
  const insights = useMemo(() => generateInsights(metrics, agents), [metrics, agents]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const listRef = useRef(null);
  const hasConversation = messages.length > 0;

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
    <motion.div
      className={styles.card}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35, ease: EASE_OUT_EXPO }}
    >
      {/* Left: Insights + Prompts */}
      <div className={styles.left}>
        <div className={styles.header}>
          <span className={styles.dot} />
          <div className={styles.headerText}>
            <span className={styles.title}>Branch Copilot</span>
            <span className={styles.subtitle}>AI-powered insights</span>
          </div>
        </div>

        <div className={styles.insightsList}>
          {insights.map((insight, i) => (
            <motion.button
              key={i}
              className={styles.insightChip}
              data-type={insight.type}
              onClick={() => handleSend(insight.query)}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.4 + i * 0.06, ease: EASE_OUT_EXPO }}
            >
              <span className={styles.insightDot} data-type={insight.type} />
              <span className={styles.insightText}>{insight.text}</span>
              <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" className={styles.insightArrow}>
                <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </motion.button>
          ))}
        </div>

        <div className={styles.quickActions}>
          <span className={styles.quickLabel}>Ask about</span>
          <div className={styles.quickPills}>
            {['Top agents?', 'Gender split?', 'Coverage by region?'].map((q) => (
              <button key={q} className={styles.quickPill} onClick={() => handleSend(q)}>{q}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Chat */}
      <div className={styles.right}>
        <div className={styles.chatArea} ref={listRef}>
          {!hasConversation && !isTyping && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none">
                  <path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.557 1.522 4.814 3.889 6.158l-.597 2.727 3.071-1.69A10.97 10.97 0 0012 17.23c4.97 0 9-3.185 9-7.115S16.97 3 12 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <circle cx="8" cy="10" r="1" fill="currentColor"/>
                  <circle cx="12" cy="10" r="1" fill="currentColor"/>
                  <circle cx="16" cy="10" r="1" fill="currentColor"/>
                </svg>
              </div>
              <span className={styles.emptyText}>Click an insight or ask a question</span>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={styles.msg} data-role={m.role}>
              {m.role === 'assistant' && (
                <div className={styles.msgAvatar}>
                  <svg aria-hidden="true" viewBox="0 0 16 16" width="10" height="10" fill="none">
                    <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
              )}
              <div className={styles.bubble} data-role={m.role}>{m.text}</div>
            </div>
          ))}
          {isTyping && (
            <div className={styles.msg} data-role="assistant">
              <div className={styles.msgAvatar}>
                <svg aria-hidden="true" viewBox="0 0 16 16" width="10" height="10" fill="none">
                  <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div className={styles.bubble} data-role="assistant">
                <span className={styles.typingDots}><span /><span /><span /></span>
              </div>
            </div>
          )}
        </div>

        <div className={styles.inputRow}>
          <input
            className={styles.field}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
            placeholder="Ask about your branch\u2026"
            aria-label="Chat message"
            name="branch-copilot"
            autoComplete="off"
          />
          <button className={styles.send} onClick={() => handleSend()} disabled={!input.trim()} aria-label="Send message">
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="14" height="14"><path d="M2 8l12-6-6 12V8H2z" fill="currentColor"/></svg>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
