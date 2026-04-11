import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getChatResponse } from '../../services/chat';
import { EASE_OUT_EXPO } from '../../utils/finance';
import styles from './ChatCard.module.css';

const SUGGESTIONS = [
  { text: 'Who are my top agents?', icon: 'agents' },
  { text: 'How many active subscribers?', icon: 'subs' },
  { text: 'What is the gender split?', icon: 'gender' },
  { text: 'Show monthly trend', icon: 'trend' },
  { text: 'Coverage by region?', icon: 'region' },
  { text: 'Commission summary', icon: 'commission' },
];

export default function ChatCard() {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'I can help you understand your branch data. Ask me anything — subscriber trends, agent performance, demographics, or financial metrics.' },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
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
    setShowSuggestions(false);
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
      {/* Left: Branding + Suggestions */}
      <div className={styles.left}>
        <div className={styles.brandHeader}>
          <span className={styles.statusDot} />
          <span className={styles.brandTitle}>Talk to your data</span>
        </div>
        <p className={styles.brandDesc}>
          Get instant answers about your branch performance, subscriber trends, and agent metrics.
        </p>

        {showSuggestions && (
          <div className={styles.suggestions}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s.text}
                className={styles.suggestBtn}
                onClick={() => handleSend(s.text)}
              >
                <span className={styles.suggestText}>{s.text}</span>
                <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" className={styles.suggestArrow}>
                  <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </button>
            ))}
          </div>
        )}

        {!showSuggestions && (
          <button className={styles.resetBtn} onClick={() => { setShowSuggestions(true); }}>
            <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none">
              <path d="M2 8a6 6 0 1111.47-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M14 2v4h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Suggested questions
          </button>
        )}
      </div>

      {/* Right: Chat interface */}
      <div className={styles.right}>
        <div className={styles.messages} ref={listRef} aria-live="polite" aria-relevant="additions">
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
            placeholder="Ask about your branch data\u2026"
            aria-label="Chat message"
            name="branch-chat"
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
