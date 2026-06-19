import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { useAgentSubscribers } from '../../hooks/useAgent';
import { useEntityCommissionSummary } from '../../hooks/useCommission';
import {
  buildAgentCopilotReply,
  AGENT_COPILOT_SUGGESTIONS,
} from '../home/agentCopilotReply';
import styles from './AgentCopilotPanel.module.css';

const SparkIcon = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
    <path d="M8 1.5l1.3 3.9 3.9 1.3-3.9 1.3L8 11.9 6.7 8 2.8 6.7 6.7 5.4 8 1.5z" fill="currentColor" />
  </svg>
);
const CloseIcon = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const SendIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
    <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * AgentCopilotPanel — the right-side AI chat panel for the agent DESKTOP shell.
 * Replaces the embedded Co-Pilot card on the Home overview: it's opened on
 * demand from the "Ask AI" button next to the notification bell, slides in as
 * the shell's third grid column (the overview reflows beside it), and holds a
 * multi-turn conversation.
 *
 * Answers are synchronous + data-driven (buildAgentCopilotReply over the agent's
 * already-fetched subscribers + commission summary — demo scope, no remote LLM).
 *
 * Stays MOUNTED across open/close (the column width hides it) so the
 * conversation survives toggling; `inert` + aria-hidden remove it from the tab
 * order + a11y tree while collapsed.
 */
export default function AgentCopilotPanel({ open, onClose, agentId, panelId }) {
  const reduceMotion = useReducedMotion();
  const { data: subscribers = [] } = useAgentSubscribers(agentId);
  const { data: commissions } = useEntityCommissionSummary('agent', agentId);

  const [messages, setMessages] = useState([]); // { id, role: 'user'|'ai', text, pending? }
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);

  const inputRef = useRef(null);
  const threadRef = useRef(null);
  const panelRef = useRef(null);
  const aliveRef = useRef(true);
  const timerRef = useRef(null);
  const idRef = useRef(0);
  const nextId = () => { idRef.current += 1; return idRef.current; };

  useEffect(() => () => {
    aliveRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  // Focus the composer when the panel opens; keep the thread pinned to the
  // latest message as the conversation grows.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Esc closes the panel when focus is anywhere inside it. Attached imperatively
  // to the aside (a non-interactive element) rather than via an onKeyDown prop so
  // it stays scoped to the panel subtree without an a11y lint flag.
  useEffect(() => {
    if (!open) return undefined;
    const node = panelRef.current;
    if (!node) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    }
    node.addEventListener('keydown', onKey);
    return () => node.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function ask(text) {
    const trimmed = (text || '').trim();
    if (!trimmed || thinking) return;
    const pendingId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'user', text: trimmed },
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

  return (
    <aside
      ref={panelRef}
      className={styles.panel}
      id={panelId}
      aria-label="AI assistant"
      aria-hidden={open ? undefined : 'true'}
      inert={!open}
    >
      <div className={styles.inner}>
        <header className={styles.head}>
          <span className={styles.headTitle}>
            <span className={styles.headIcon}>{SparkIcon}</span>
            Ask AI
          </span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close AI assistant">
            {CloseIcon}
          </button>
        </header>

        <div className={styles.thread} ref={threadRef}>
          {empty ? (
            <div className={styles.welcome}>
              <p className={styles.welcomeTitle}>Hi, I&apos;m your Co-Pilot.</p>
              <p className={styles.welcomeText}>
                Ask me anything about your subscribers, payouts, onboarding, or insurance.
              </p>
              <ul className={styles.chips}>
                {AGENT_COPILOT_SUGGESTIONS.map((q) => (
                  <li key={q}>
                    <button type="button" className={styles.chip} onClick={() => ask(q)}>
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ul className={styles.messages}>
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.li
                    key={msg.id}
                    className={`${styles.msg} ${msg.role === 'user' ? styles.msgUser : styles.msgAi}`}
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                    transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
                  >
                    {msg.role === 'ai' && <span className={styles.msgLabel}>Co-Pilot</span>}
                    {msg.pending ? (
                      <span className={styles.typing} aria-label="Thinking">
                        <span className={styles.typingDot} />
                        <span className={styles.typingDot} />
                        <span className={styles.typingDot} />
                      </span>
                    ) : (
                      <span className={styles.bubble}>{msg.text}</span>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <form className={styles.composer} onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            name="message"
            autoComplete="off"
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about subscribers, payouts…"
            aria-label="Ask the AI assistant"
            disabled={thinking}
          />
          <button
            type="submit"
            className={styles.send}
            disabled={!input.trim() || thinking}
            aria-label="Send"
          >
            {SendIcon}
          </button>
        </form>
      </div>
    </aside>
  );
}
