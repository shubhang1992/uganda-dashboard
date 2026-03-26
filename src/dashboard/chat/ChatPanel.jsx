import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO as EASE } from '../../utils/finance';
import styles from './ChatPanel.module.css';

const SUGGESTIONS = [
  'How many active subscribers do we have?',
  'Which region has the highest coverage?',
  'Show me top performing agents',
  'What is the gender split in Northern region?',
];

const MOCK_RESPONSES = {
  default: "I'm the Universal Pensions data assistant. In production, I'll be connected to your live database to answer questions about subscribers, agents, contributions, and more. Try asking me anything about your network!",
  subscribers: "You currently have 2,000 subscribers across 4 regions. 82% are active, with the highest concentration in the Central region (Kampala, Wakiso, Mukono). The subscriber base has been growing at approximately 3.8% month-over-month.",
  coverage: "The Northern region has the highest coverage rate at 62%, followed by Central at 58%. Overall country-level coverage stands at 67%. Western region has the most room for growth.",
  agents: "Your top performing agents are: Sarah Nambi (Kampala Main, 92% performance), Moses Okello (Gulu Central, 89%), and Grace Achieng (Lira, 87%). Average agent performance across the network is 78%.",
  gender: "The gender split across the Northern region is 56% male, 42% female, and 2% other. This is slightly more male-skewed than the national average of 52% male, 46% female.",
};

function getMockResponse(message) {
  const lower = message.toLowerCase();
  if (lower.includes('subscriber') || lower.includes('active')) return MOCK_RESPONSES.subscribers;
  if (lower.includes('coverage') || lower.includes('highest')) return MOCK_RESPONSES.coverage;
  if (lower.includes('agent') || lower.includes('perform')) return MOCK_RESPONSES.agents;
  if (lower.includes('gender') || lower.includes('split')) return MOCK_RESPONSES.gender;
  return MOCK_RESPONSES.default;
}

export default function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi! I'm your data assistant. Ask me anything about your pension network." },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  function handleSend(text) {
    const msg = text || input.trim();
    if (!msg) return;

    setMessages((prev) => [...prev, { role: 'user', text: msg }]);
    setInput('');
    setIsTyping(true);

    // Simulate AI response delay
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [...prev, { role: 'assistant', text: getMockResponse(msg) }]);
    }, 1100);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* Toggle button */}
      <motion.button
        className={styles.toggleBtn}
        onClick={() => setIsOpen(!isOpen)}
        whileTap={{ scale: 0.95 }}
        data-open={isOpen}
      >
        {isOpen ? (
          <svg viewBox="0 0 20 20" fill="none" width="20" height="20">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="none" width="20" height="20">
            <path d="M2 6a4 4 0 014-4h8a4 4 0 014 4v5a4 4 0 01-4 4H8l-4 3v-3a4 4 0 01-2-3.5V6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            <circle cx="7" cy="8.5" r="1" fill="currentColor"/>
            <circle cx="10" cy="8.5" r="1" fill="currentColor"/>
            <circle cx="13" cy="8.5" r="1" fill="currentColor"/>
          </svg>
        )}
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className={styles.panel}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            {/* Header */}
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <div className={styles.aiDot} />
                <div>
                  <span className={styles.headerTitle}>Data Assistant</span>
                  <span className={styles.headerSub}>Ask about your network</span>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className={styles.messages} ref={listRef} aria-live="polite" aria-relevant="additions">
              {messages.map((msg, i) => (
                <div key={i} className={styles.msg} data-role={msg.role}>
                  <div className={styles.msgBubble} data-role={msg.role}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className={styles.msg} data-role="assistant">
                  <div className={styles.msgBubble} data-role="assistant" aria-label="Typing">
                    <span className={styles.typingDots}>
                      <span /><span /><span />
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Suggestions */}
            {messages.length <= 1 && (
              <div className={styles.suggestions}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} className={styles.suggestion} onClick={() => handleSend(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className={styles.inputArea}>
              <input
                ref={inputRef}
                className={styles.input}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your data..."
              />
              <button
                className={styles.sendBtn}
                onClick={() => handleSend()}
                disabled={!input.trim()}
              >
                <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
                  <path d="M3 10l14-7-7 14v-7H3z" fill="currentColor"/>
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
