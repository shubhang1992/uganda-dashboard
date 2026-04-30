import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../../utils/finance';
import { getSubscriberChatResponse } from '../../../services/chat';
import styles from './CoPilotWidget.module.css';

const SUGGESTIONS = [
  'When can I retire?',
  'Am I saving enough?',
  'How do withdrawals work?',
  'How is my balance calculated?',
];

export default function CoPilotWidget() {
  const [input, setInput] = useState('');
  const [exchange, setExchange] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const inputRef = useRef(null);
  const aliveRef = useRef(true);
  const timerRef = useRef(null);

  useEffect(() => () => {
    aliveRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  async function ask(text) {
    const trimmed = text.trim();
    if (!trimmed || isThinking) return;
    setExchange({ question: trimmed, answer: null });
    setInput('');
    setIsThinking(true);
    const reply = await getSubscriberChatResponse(trimmed);
    if (!aliveRef.current) return;
    timerRef.current = setTimeout(() => {
      if (!aliveRef.current) return;
      setExchange({ question: trimmed, answer: reply });
      setIsThinking(false);
    }, 480);
  }

  function handleSubmit(e) {
    e.preventDefault();
    ask(input);
  }

  function reset() {
    setExchange(null);
    setInput('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <section className={styles.card} aria-labelledby="copilot-title">
      <header className={styles.head}>
        <span className={styles.avatar} aria-hidden="true">
          <span className={styles.avatarRing} />
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <path
              d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"
              fill="currentColor"
            />
            <path
              d="M19 14l.7 1.8L21.5 16.5 19.7 17.2 19 19l-.7-1.8L16.5 16.5l1.8-.7L19 14z"
              fill="currentColor"
            />
          </svg>
        </span>
        <div className={styles.headText}>
          <span className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden="true" />
            Co-Pilot
          </span>
          <h3 id="copilot-title" className={styles.title}>Ask anything</h3>
          <p className={styles.sub}>Your AI savings assistant</p>
        </div>
      </header>

      <AnimatePresence initial={false} mode="wait">
        {exchange ? (
          <motion.div
            key="exchange"
            className={styles.exchange}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
          >
            <div className={styles.userBubble}>
              <span className={styles.bubbleLabel}>You</span>
              <span className={styles.bubbleText}>{exchange.question}</span>
            </div>

            <div className={styles.aiBubble}>
              <span className={styles.bubbleLabel}>Co-Pilot</span>
              {exchange.answer ? (
                <motion.span
                  className={styles.bubbleText}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                >
                  {exchange.answer}
                </motion.span>
              ) : (
                <span className={styles.typing} aria-label="Thinking">
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                </span>
              )}
            </div>

            {exchange.answer && (
              <button
                type="button"
                className={styles.resetBtn}
                onClick={reset}
              >
                Ask another
                <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" fill="none">
                  <path d="M9 3.5v3h-3M9 3.5l-2.6 2.6a3.5 3.5 0 11-1 2.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="suggestions"
            className={styles.suggestions}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
          >
            {SUGGESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                className={styles.pill}
                onClick={() => ask(q)}
              >
                {q}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <form className={styles.composer} onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          name="message"
          autoComplete="off"
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about savings, withdrawals, retirement…"
          aria-label="Ask your co-pilot"
          disabled={isThinking}
        />
        <button
          type="submit"
          className={styles.send}
          disabled={!input.trim() || isThinking}
          aria-label="Send"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none">
            <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </form>
    </section>
  );
}
