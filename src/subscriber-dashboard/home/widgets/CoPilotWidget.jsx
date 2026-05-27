/**
 * Subscriber Co-Pilot widget — keyword-anchored chat affordance on the
 * subscriber home screen.
 *
 * INTENTIONAL DUPLICATION with `src/agent-dashboard/home/widgets/CoPilotWidget.jsx`.
 * Audit F26 reviewed extracting a shared `CopilotShell`; we kept both files in
 * place because the divergences are larger than the shared chrome:
 *   - CSS modules diverge (this file uses `.avatar`, `.avatarRing`, `.glowA/B`,
 *     `.composerIcon`, `.headText`, `.eyebrowDot`, `.pills/.pill`,
 *     `.suggestionsLabel`; agent uses `.eyebrowSpark`, `.suggestionBtn`,
 *     `.suggestionDot`, `.suggestionItem`) — different role-appropriate
 *     aesthetics, not stylistic accidents.
 *   - Header DOM differs (avatar + glow elements + headText wrapper here;
 *     inline eyebrow + simpler structure on the agent side).
 *   - Composer differs (this side has a sparkle icon prefix; agent does not).
 *   - Suggestions DOM differs (pills-grid here; ul/li with dot separators
 *     on the agent side).
 *   - Reply logic differs in shape — async service call + try/catch + toast
 *     errors here; sync keyword matcher with no error path on the agent side.
 * A shared shell would have to standardise the CSS contract (visual change)
 * or pass classNames/slot content through, adding more glue than it removes.
 * Keep the two files in lockstep visually only where it makes design sense.
 */
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../../utils/finance';
import { getSubscriberChatResponse } from '../../../services/chat';
import { useToast } from '../../../contexts/ToastContext';
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
  const { addToast } = useToast();
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
    try {
      const reply = await getSubscriberChatResponse(trimmed);
      if (!aliveRef.current) return;
      timerRef.current = setTimeout(() => {
        if (!aliveRef.current) return;
        setExchange({ question: trimmed, answer: reply });
        setIsThinking(false);
      }, 480);
    } catch (err) {
      if (!aliveRef.current) return;
      setIsThinking(false);
      setExchange(null);
      addToast('error', err?.message || 'Co-Pilot is unavailable — please try again.');
    }
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
      <span className={styles.glowA} aria-hidden="true" />
      <span className={styles.glowB} aria-hidden="true" />

      <header className={styles.head}>
        <span className={styles.avatar} aria-hidden="true">
          <span className={styles.avatarRing} />
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
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
          <h3 id="copilot-title" className={styles.title}>Ask anything about your savings</h3>
        </div>
      </header>

      <AnimatePresence initial={false}>
        {exchange && (
          <motion.div
            key="exchange"
            className={styles.exchange}
            initial={{ opacity: 0, y: 6 }}
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
        )}
      </AnimatePresence>

      <form className={styles.composer} onSubmit={handleSubmit}>
        <span className={styles.composerIcon} aria-hidden="true">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <path d="M8 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" fill="currentColor" opacity="0.85"/>
            <path d="M12.5 9l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4.4-1.1z" fill="currentColor" opacity="0.7"/>
          </svg>
        </span>
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
          <span className={styles.sendLabel}>Ask</span>
          <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none">
            <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </form>

      {!exchange && (
        <div className={styles.suggestions}>
          <span className={styles.suggestionsLabel}>Try asking</span>
          <div className={styles.pills}>
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
          </div>
        </div>
      )}
    </section>
  );
}
