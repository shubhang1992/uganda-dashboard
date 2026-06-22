import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';
import { useAgentScope } from '../../contexts/AgentScopeContext';
import { useAgentSubscribers } from '../../hooks/useAgent';
import { useEntityCommissionSummary } from '../../hooks/useCommission';
import { buildAgentCopilotReply, AGENT_COPILOT_SUGGESTIONS } from '../home/agentCopilotReply';
import BottomSheet from './BottomSheet';
import sheet from './agentSheets.module.css';

const SparkIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M12 2l1.5 5L19 8.5 13.5 10 12 15l-1.5-5L5 8.5 10.5 7z" />
  </svg>
);
const SendIcon = (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * AgentAskAISheet — the Co-Pilot bottom sheet opened from the mobile app bar. A
 * multi-turn chat backed by the SAME canonical answer source as the desktop
 * "Ask AI" panel and the mobile home Co-Pilot widget (`buildAgentCopilotReply`,
 * demo-scope keyword matcher) so every agent assistant surface agrees. The reply
 * is synchronous; a short delay simulates "thinking" to match the other surfaces.
 */
export default function AgentAskAISheet({ open, onClose }) {
  const reduce = useReducedMotion();
  const { agentId } = useAgentScope();
  const { data: subscribers = [] } = useAgentSubscribers(agentId);
  const { data: commissions } = useEntityCommissionSummary('agent', agentId);

  const [messages, setMessages] = useState([]); // { id, role: 'user'|'ai', text, pending? }
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);

  const inputRef = useRef(null);
  const endRef = useRef(null);
  const aliveRef = useRef(true);
  const timerRef = useRef(null);
  const idRef = useRef(0);
  const nextId = () => {
    idRef.current += 1;
    return idRef.current;
  };

  useEffect(
    () => () => {
      aliveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  function ask(text) {
    const trimmed = (text || '').trim();
    if (!trimmed || thinking) return;
    const userId = nextId();
    const pendingId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', text: trimmed },
      { id: pendingId, role: 'ai', text: '', pending: true },
    ]);
    setInput('');
    setThinking(true);
    const reply = buildAgentCopilotReply(trimmed, { subscribers, commissions });
    timerRef.current = setTimeout(() => {
      if (!aliveRef.current) return;
      setMessages((prev) =>
        prev.map((msg) => (msg.id === pendingId ? { ...msg, text: reply, pending: false } : msg)),
      );
      setThinking(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }, 480);
  }

  function handleSubmit(e) {
    e.preventDefault();
    ask(input);
  }

  const empty = messages.length === 0;

  const composer = (
    <form className={sheet.composer} onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        type="text"
        name="message"
        autoComplete="off"
        className={sheet.input}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask about your book…"
        aria-label="Ask your Co-Pilot"
        disabled={thinking}
      />
      <button type="submit" className={sheet.send} disabled={!input.trim() || thinking} aria-label="Send">
        {SendIcon}
      </button>
    </form>
  );

  return (
    <BottomSheet open={open} onClose={onClose} title="Co-Pilot" icon={SparkIcon} height="84%" footer={composer}>
      {empty ? (
        <div className={sheet.welcome}>
          <p className={sheet.welcomeTitle}>Ask anything about your portfolio</p>
          <p className={sheet.welcomeText}>
            Your AI helper for subscribers, payouts, onboarding and insurance.
          </p>
          <ul className={sheet.chips}>
            {AGENT_COPILOT_SUGGESTIONS.map((q) => (
              <li key={q}>
                <button type="button" className={sheet.chip} onClick={() => ask(q)}>
                  {q}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className={sheet.messages}>
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.li
                key={msg.id}
                className={`${sheet.msg} ${msg.role === 'user' ? sheet.msgUser : sheet.msgAi}`}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={reduce ? undefined : { opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
              >
                {msg.role === 'ai' && <span className={sheet.msgLabel}>Co-Pilot</span>}
                {msg.pending ? (
                  <span className={sheet.typing} aria-label="Thinking">
                    <span className={sheet.typingDot} />
                    <span className={sheet.typingDot} />
                    <span className={sheet.typingDot} />
                  </span>
                ) : (
                  <span className={sheet.bubble}>{msg.text}</span>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
          <div ref={endRef} />
        </ul>
      )}
    </BottomSheet>
  );
}
