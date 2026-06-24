import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { useBranchScope } from '../../contexts/BranchScopeContext';
import { useToast } from '../../contexts/ToastContext';
import { useEntity, useChildren, useEntityMetrics, useChildrenMetrics } from '../../hooks/useEntity';
import { useEntityCommissionSummary } from '../../hooks/useCommission';
import { getBranchChatResponse } from '../../services/chat';
import { buildBranchCopilotContext, BRANCH_COPILOT_SUGGESTIONS } from '../overview/branchCopilotContext';
import { sparkIcon, closeIcon, sendIcon } from '../../employer-dashboard/desktop/icons';
import styles from './BranchCopilotPanel.module.css';

/**
 * BranchCopilotPanel — the right-side AI chat panel for the branch DESKTOP shell.
 * Mirrors EmployerCopilotPanel structurally (third grid column, stays mounted,
 * `inert` when closed, Esc-to-close); answers come from getBranchChatResponse
 * over the branch's OWN RLS-scoped figures (shared context builder), so they
 * stay scoped to this branch rather than the whole network.
 */
export default function BranchCopilotPanel({ open, onClose, panelId }) {
  const reduceMotion = useReducedMotion();
  const { branchId } = useBranchScope();
  const { addToast } = useToast();

  // Same hooks the Overview fetches — TanStack Query dedupes into the shared
  // caches, so this adds no extra round-trips on a warm dashboard.
  const { data: branch } = useEntity('branch', branchId);
  const { data: metrics = {} } = useEntityMetrics('branch', branchId);
  const { data: agentsRaw = [] } = useChildren('branch', branchId);
  const { data: agentMetricsMap = {} } = useChildrenMetrics('branch', branchId);
  const { data: commissionSummary } = useEntityCommissionSummary('branch', branchId);

  const ctx = useMemo(() => {
    const agents = agentsRaw.map((a) => ({ ...a, metrics: agentMetricsMap[a.id] ?? a.metrics }));
    return buildBranchCopilotContext({ branch, metrics, agents, commissionSummary });
  }, [branch, metrics, agentsRaw, agentMetricsMap, commissionSummary]);

  const [messages, setMessages] = useState([]); // { id, role:'user'|'ai', text, pending? }
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

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

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
    getBranchChatResponse(trimmed, ctx)
      .then((reply) => {
        timerRef.current = setTimeout(() => {
          if (!aliveRef.current) return;
          setMessages((prev) =>
            prev.map((msg) => (msg.id === pendingId ? { ...msg, text: reply, pending: false } : msg)),
          );
          setThinking(false);
          requestAnimationFrame(() => inputRef.current?.focus());
        }, 600);
      })
      .catch((err) => {
        if (!aliveRef.current) return;
        setThinking(false);
        setMessages((prev) => prev.filter((msg) => msg.id !== pendingId));
        addToast('error', err?.message || 'Copilot is unavailable — please try again.');
      });
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
      aria-label="Branch AI assistant"
      aria-hidden={open ? undefined : 'true'}
      inert={!open}
    >
      <div className={styles.inner}>
        <header className={styles.head}>
          <span className={styles.headTitle}>
            <span className={styles.headIcon}>{sparkIcon(16)}</span>
            Branch Copilot
          </span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close AI assistant">
            {closeIcon(18)}
          </button>
        </header>

        <div className={styles.thread} ref={threadRef}>
          {empty ? (
            <div className={styles.welcome}>
              <p className={styles.welcomeTitle}>Hi, I&apos;m your Branch Copilot.</p>
              <p className={styles.welcomeText}>
                Ask me anything about your agents, subscribers, contributions, commissions, KYC,
                or branch health.
              </p>
              <ul className={styles.chips}>
                {BRANCH_COPILOT_SUGGESTIONS.map((q) => (
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
                    {msg.role === 'ai' && <span className={styles.msgLabel}>Copilot</span>}
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
            placeholder="Ask about your branch…"
            aria-label="Ask the branch AI assistant"
            disabled={thinking}
          />
          <button
            type="submit"
            className={styles.send}
            disabled={!input.trim() || thinking}
            aria-label="Send"
          >
            {sendIcon(14)}
          </button>
        </form>
      </div>
    </aside>
  );
}
