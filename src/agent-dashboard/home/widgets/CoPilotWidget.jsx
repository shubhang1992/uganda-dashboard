/**
 * Agent Co-Pilot widget — keyword-anchored chat affordance on the agent home
 * screen. Answers portfolio questions synchronously from already-fetched
 * subscriber + commission data (no remote LLM call).
 *
 * INTENTIONAL DUPLICATION with `src/subscriber-dashboard/home/widgets/CoPilotWidget.jsx`.
 * Audit F26 reviewed extracting a shared `CopilotShell`; we kept both files in
 * place because the divergences are larger than the shared chrome:
 *   - CSS modules diverge (this file uses `.eyebrowSpark`, `.suggestionBtn`,
 *     `.suggestionDot`, `.suggestionItem`; subscriber uses `.avatar`,
 *     `.avatarRing`, `.glowA/B`, `.composerIcon`, `.headText`, `.eyebrowDot`,
 *     `.pills/.pill`, `.suggestionsLabel`) — different role-appropriate
 *     aesthetics, not stylistic accidents.
 *   - Header DOM differs (inline eyebrow + simpler structure here; avatar +
 *     glow elements + headText wrapper on the subscriber side).
 *   - Composer differs (no leading sparkle icon here; subscriber has one).
 *   - Suggestions DOM differs (ul/li with dot separators here; pills-grid
 *     on the subscriber side).
 *   - Reply logic differs in shape — sync keyword matcher with no error path
 *     here; async service call + try/catch + toast errors on the subscriber
 *     side.
 * A shared shell would have to standardise the CSS contract (visual change)
 * or pass classNames/slot content through, adding more glue than it removes.
 * Keep the two files in lockstep visually only where it makes design sense.
 */
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGX } from '../../../utils/finance';
import { useAgentSubscribers } from '../../../hooks/useAgent';
import { useEntityCommissionSummary } from '../../../hooks/useCommission';
import styles from './CoPilotWidget.module.css';

const SUGGESTIONS = [
  'How many subscribers do I have?',
  "What's owed to me?",
  'Who joined this month?',
];

function buildReply(message, { subscribers, commissions }) {
  const m = (message || '').toLowerCase();
  const total = subscribers?.length || 0;
  const activeCount = subscribers?.filter((s) => s.isActive).length || 0;
  const dormantCount = total - activeCount;
  const due = commissions?.totalDue || 0;
  const paid = commissions?.totalPaid || 0;
  const countDue = commissions?.countDue || 0;

  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const thisMonth = subscribers?.filter((s) => s.registeredDate && new Date(s.registeredDate).getTime() >= cutoff).length || 0;

  if (m.includes('subscriber') || m.includes('how many')) {
    return `You have ${total} subscriber${total === 1 ? '' : 's'} in your portfolio. ${thisMonth} joined this month.`;
  }
  if (m.includes('active') || m.includes('dormant') || m.includes('inactive')) {
    return `${activeCount} of your subscribers are active and ${dormantCount} are dormant. Open the Subscribers page to filter them.`;
  }
  if (m.includes('commission') || m.includes('owe') || m.includes('pay') || m.includes('settle') || m.includes('payout')) {
    return `You've earned ${formatUGX(paid)} so far. ${formatUGX(due)} is still due across ${countDue} record${countDue === 1 ? '' : 's'} — they'll roll into your next payout cycle automatically.`;
  }
  if (m.includes('this month') || m.includes('joined') || m.includes('new')) {
    return thisMonth > 0
      ? `${thisMonth} subscriber${thisMonth === 1 ? '' : 's'} joined this month. Tap "Subscribers" to see them all.`
      : `Nobody's joined this month yet. Tap "Onboard" to add your next one.`;
  }
  if (m.includes('top') || m.includes('focus') || m.includes('priority')) {
    return `Focus on dormant subscribers and any due commissions. Onboarding keeps the pipeline healthy.`;
  }
  if (m.includes('hi') || m.includes('hello') || m.includes('hey')) {
    return `Hi! Ask about your subscribers, payouts, or recent onboarding.`;
  }
  return `I can help with subscriber counts, active/dormant status, and commission status. Try one of the suggestions below.`;
}

export default function CoPilotWidget({ agentId }) {
  const [input, setInput] = useState('');
  const [exchange, setExchange] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const inputRef = useRef(null);
  const aliveRef = useRef(true);
  const timerRef = useRef(null);

  const { data: subscribers = [] } = useAgentSubscribers(agentId);
  const { data: commissions } = useEntityCommissionSummary('agent', agentId);

  useEffect(() => () => {
    aliveRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  function ask(text) {
    const trimmed = text.trim();
    if (!trimmed || isThinking) return;
    setExchange({ question: trimmed, answer: null });
    setInput('');
    setIsThinking(true);
    const reply = buildReply(trimmed, { subscribers, commissions });
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
    <section className={styles.card} aria-labelledby="agent-copilot-title">
      <header className={styles.head}>
        <span className={styles.eyebrow}>
          <svg className={styles.eyebrowSpark} viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
            <path d="M8 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" fill="currentColor"/>
          </svg>
          Co-Pilot
        </span>
        <h3 id="agent-copilot-title" className={styles.title}>
          Ask anything about your portfolio
        </h3>
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
              <button type="button" className={styles.resetBtn} onClick={reset}>
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
        <input
          ref={inputRef}
          type="text"
          name="message"
          autoComplete="off"
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about subscribers, payouts, onboarding…"
          aria-label="Ask your co-pilot"
          disabled={isThinking}
        />
        <button type="submit" className={styles.send} disabled={!input.trim() || isThinking} aria-label="Send">
          <span className={styles.sendLabel}>Ask</span>
          <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none">
            <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </form>

      {!exchange && (
        <ul className={styles.suggestions}>
          {SUGGESTIONS.map((q, i) => (
            <li key={q} className={styles.suggestionItem}>
              {i > 0 && <span className={styles.suggestionDot} aria-hidden="true">·</span>}
              <button
                type="button"
                className={styles.suggestionBtn}
                onClick={() => ask(q)}
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
