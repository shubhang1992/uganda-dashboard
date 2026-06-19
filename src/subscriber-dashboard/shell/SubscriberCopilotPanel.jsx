import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { getSubscriberChatResponse } from '../../services/chat';
import { useToast } from '../../contexts/ToastContext';
import styles from './SubscriberCopilotPanel.module.css';

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

// Prompt chips shown when the conversation is empty. Identical to the mobile
// CoPilotWidget's SUGGESTIONS so the two surfaces offer the same starting points.
const SUGGESTIONS = [
  'When can I retire?',
  'Am I saving enough?',
  'How do withdrawals work?',
  'How is my balance calculated?',
];

/**
 * SubscriberCopilotPanel — the right-side AI chat panel for the subscriber
 * DESKTOP shell. Replaces the embedded Ask Pensa AI card on the Home overview:
 * it's opened on demand from the "Ask AI" button in SubscriberDesktopShell,
 * slides in as the shell's third grid column (the overview reflows beside it),
 * and holds a multi-turn conversation.
 *
 * Mirrors AgentCopilotPanel's structure (do not import it), but the replies come
 * from the SAME canonical source the mobile CoPilotWidget uses
 * (`getSubscriberChatResponse` — the mocked subscriber co-pilot, demo scope), so
 * the desktop and mobile assistants never give different answers.
 *
 * Stays MOUNTED across open/close (the column width hides it) so the
 * conversation survives toggling; `inert` + aria-hidden remove it from the tab
 * order + a11y tree while collapsed.
 */
export default function SubscriberCopilotPanel({ open, onClose, panelId }) {
  const reduceMotion = useReducedMotion();
  const { addToast } = useToast();

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

  async function ask(text) {
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
    try {
      const reply = await getSubscriberChatResponse(trimmed);
      if (!aliveRef.current) return;
      // Small deliberate beat so the typing indicator reads as "thinking"
      // (matches the mobile CoPilotWidget cadence).
      timerRef.current = setTimeout(() => {
        if (!aliveRef.current) return;
        setMessages((prev) =>
          prev.map((msg) => (msg.id === pendingId ? { ...msg, text: reply, pending: false } : msg)),
        );
        setThinking(false);
        requestAnimationFrame(() => inputRef.current?.focus());
      }, 480);
    } catch (err) {
      if (!aliveRef.current) return;
      // Drop the unanswered exchange and surface the failure as a toast — same
      // recovery the mobile CoPilotWidget uses.
      setMessages((prev) => prev.filter((msg) => msg.id !== userId && msg.id !== pendingId));
      setThinking(false);
      addToast('error', err?.message || 'Ask AI is unavailable — please try again.');
    }
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
                Ask me anything about your savings, contributions, withdrawals, or insurance.
              </p>
              <ul className={styles.chips}>
                {SUGGESTIONS.map((q) => (
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
          <div className={styles.composerInput}>
            <input
              ref={inputRef}
              type="text"
              name="message"
              autoComplete="off"
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your savings…"
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
          </div>
        </form>
      </div>
    </aside>
  );
}
