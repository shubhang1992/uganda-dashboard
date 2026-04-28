import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import { useCurrentSubscriber, useSubscriberAgent } from '../../hooks/useSubscriber';
import { getAgentReply } from '../../services/chat';
import { getInitials } from '../../utils/dashboard';
import styles from './AgentContactPanel.module.css';

const STORAGE_KEY = 'up-sub-agent-messages';

function loadMessages(subId) {
  if (typeof window === 'undefined' || !subId) return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}-${subId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function persistMessages(subId, messages) {
  if (typeof window === 'undefined' || !subId) return;
  try {
    window.localStorage.setItem(`${STORAGE_KEY}-${subId}`, JSON.stringify(messages));
  } catch { /* ignore */ }
}

function formatTenure(months) {
  if (!Number.isFinite(months)) return '—';
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0 ? `${years} yr${years === 1 ? '' : 's'}` : `${years} yr ${rem} mo`;
}

function formatMsgTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' });
}

const SUGGESTED_QUERIES = [
  'How can I top up?',
  'I want to withdraw',
  'Update my nominees',
  'Can we meet this week?',
];

export default function AgentContactPanel({ splitMode = false }) {
  const { agentContactOpen, setAgentContactOpen } = useDashboard();
  const { data: sub } = useCurrentSubscriber();
  const subId = sub?.id;
  const { data: agent } = useSubscriberAgent(subId);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  // Seed the conversation with an introductory message from the agent.
  useEffect(() => {
    if (!agentContactOpen || !subId || !agent) return;
    const persisted = loadMessages(subId);
    if (persisted && persisted.length > 0) {
      setMessages(persisted);
      return;
    }
    const firstName = (agent.name || '').split(' ')[0];
    setMessages([
      {
        role: 'agent',
        text: `Hi, I'm ${firstName} — your assigned agent at ${agent.branchName}. Reach out any time about contributions, withdrawals, claims, or anything else.`,
        at: Date.now(),
      },
    ]);
  }, [agentContactOpen, subId, agent]);

  useEffect(() => {
    if (subId && messages.length > 0) persistMessages(subId, messages);
  }, [subId, messages]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, isTyping, agentContactOpen]);

  // Escape closes the panel.
  useEffect(() => {
    if (!agentContactOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') setAgentContactOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [agentContactOpen, setAgentContactOpen]);

  // Reset input state shortly after close.
  useEffect(() => {
    if (agentContactOpen) return;
    const t = setTimeout(() => setInput(''), 400);
    return () => clearTimeout(t);
  }, [agentContactOpen]);

  function send(text) {
    const msg = (text || input).trim();
    if (!msg || !agent) return;
    const at = Date.now();
    setMessages((prev) => [...prev, { role: 'user', text: msg, at }]);
    setInput('');
    setIsTyping(true);
    getAgentReply(msg, agent).then((response) => {
      setTimeout(() => {
        setIsTyping(false);
        setMessages((prev) => [...prev, { role: 'agent', text: response, at: Date.now() }]);
      }, 1100);
    });
  }

  const initials = getInitials(agent?.name || '');
  const ratingLabel = agent?.rating ? `${agent.rating.toFixed(1)} ★` : null;
  const responseLabel = agent?.avgResponseHours
    ? `~${agent.avgResponseHours < 1 ? '<1' : Math.round(agent.avgResponseHours)}h reply`
    : null;

  return (
    <>
      <AnimatePresence>
        {agentContactOpen && !splitMode && (
          <motion.div
            key="agent-backdrop"
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setAgentContactOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {agentContactOpen && (
          <motion.div
            key="agent-panel"
            className={styles.panel}
            data-split-mode={splitMode || undefined}
            initial={{ x: '100%' }}
            animate={{ x: 0, transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            exit={{ x: '100%', transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            role="dialog"
            aria-labelledby="agent-panel-title"
            aria-modal="true"
          >
            <header className={styles.header}>
              <button
                className={styles.closeBtn}
                onClick={() => setAgentContactOpen(false)}
                aria-label="Close"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                </svg>
              </button>
              <div className={styles.headerText}>
                <span className={styles.eyebrow}>Your agent</span>
                <h2 id="agent-panel-title" className={styles.title}>
                  {agent?.name || 'Loading…'}
                </h2>
              </div>
            </header>

            <div className={styles.body}>
              {!agent ? (
                <div className={styles.loading}>
                  <span className={styles.spinner} aria-hidden="true" />
                </div>
              ) : (
                <>
                  {/* ── Profile card ── */}
                  <section className={styles.profile}>
                    <div className={styles.profileTop}>
                      <span
                        className={styles.avatar}
                        data-status={agent.status === 'active' ? 'online' : 'offline'}
                        aria-hidden="true"
                      >
                        {initials}
                        <span className={styles.statusDot} />
                      </span>
                      <div className={styles.profileMain}>
                        <div className={styles.profileName}>{agent.name}</div>
                        <div className={styles.profileBranch}>
                          <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none">
                            <path d="M8 1.5L2 4v4c0 3 2.4 5.7 6 6.5 3.6-.8 6-3.5 6-6.5V4L8 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                          </svg>
                          {agent.branchName} branch
                        </div>
                        <div className={styles.profileBadges}>
                          {ratingLabel && (
                            <span className={styles.badge} data-tone="rating">{ratingLabel}</span>
                          )}
                          {responseLabel && (
                            <span className={styles.badge}>{responseLabel}</span>
                          )}
                          <span className={styles.badge}>
                            {formatTenure(agent.tenureMonths)} at UP
                          </span>
                        </div>
                      </div>
                    </div>

                    <ul className={styles.contactRow}>
                      <li>
                        <a className={styles.contactBtn} href={`tel:${agent.phone}`} aria-label={`Call ${agent.name}`}>
                          <svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13" fill="none">
                            <path d="M3 2h2.5l1.2 3-1.6 1.1a8 8 0 003.8 3.8L10 8.3l3 1.2V12a1.5 1.5 0 01-1.5 1.5A11 11 0 011.5 3.5 1.5 1.5 0 013 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                          </svg>
                          Call
                        </a>
                      </li>
                      <li>
                        <a className={styles.contactBtn} href={`mailto:${agent.email}`} aria-label={`Email ${agent.name}`}>
                          <svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13" fill="none">
                            <rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                            <path d="M2 4.5l6 4 6-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Email
                        </a>
                      </li>
                    </ul>

                    {(agent.specialties?.length > 0 || agent.languages?.length > 0) && (
                      <dl className={styles.profileMeta}>
                        {agent.specialties?.length > 0 && (
                          <div className={styles.metaRow}>
                            <dt>Specialties</dt>
                            <dd>{agent.specialties.join(' · ')}</dd>
                          </div>
                        )}
                        {agent.languages?.length > 0 && (
                          <div className={styles.metaRow}>
                            <dt>Languages</dt>
                            <dd>{agent.languages.join(', ')}</dd>
                          </div>
                        )}
                        {Number.isFinite(agent.subscribersManaged) && (
                          <div className={styles.metaRow}>
                            <dt>Looking after</dt>
                            <dd>{agent.subscribersManaged.toLocaleString()} savers</dd>
                          </div>
                        )}
                      </dl>
                    )}
                  </section>

                  {/* ── Conversation ── */}
                  <section className={styles.chat}>
                    <div className={styles.chatHead}>
                      <span className={styles.chatTitle}>Send a message</span>
                      <span className={styles.chatHint}>
                        Replies in {responseLabel ?? 'a few hours'}
                      </span>
                    </div>

                    <div
                      className={styles.messages}
                      ref={listRef}
                      aria-live="polite"
                      aria-relevant="additions"
                    >
                      {messages.map((m, i) => (
                        <div key={i} className={styles.msg} data-role={m.role}>
                          {m.role === 'agent' && (
                            <span className={styles.msgAvatar} aria-hidden="true">
                              {initials}
                            </span>
                          )}
                          <div className={styles.msgStack}>
                            <div className={styles.bubble} data-role={m.role}>{m.text}</div>
                            <span className={styles.msgTime}>{formatMsgTime(m.at)}</span>
                          </div>
                        </div>
                      ))}
                      {isTyping && (
                        <div className={styles.msg} data-role="agent">
                          <span className={styles.msgAvatar} aria-hidden="true">{initials}</span>
                          <div className={styles.bubble} data-role="agent">
                            <span className={styles.typing}><span /><span /><span /></span>
                          </div>
                        </div>
                      )}
                    </div>

                    {messages.length <= 1 && !isTyping && (
                      <div className={styles.suggestRow}>
                        {SUGGESTED_QUERIES.map((q) => (
                          <button
                            key={q}
                            type="button"
                            className={styles.suggestPill}
                            onClick={() => send(q)}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>

            {agent && (
              <footer className={styles.footer}>
                <input
                  ref={inputRef}
                  className={styles.inputField}
                  type="text"
                  placeholder={`Message ${(agent.name || '').split(' ')[0]}…`}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
                  aria-label={`Message ${agent.name}`}
                  name="agent-message"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className={styles.sendBtn}
                  onClick={() => send()}
                  disabled={!input.trim()}
                  aria-label="Send message"
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="14" height="14">
                    <path d="M2 8l12-6-6 12V8H2z" fill="currentColor" />
                  </svg>
                </button>
              </footer>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
