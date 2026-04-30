import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useCurrentSubscriber, useSubscriberAgent } from '../../hooks/useSubscriber';
import { getAgentReply } from '../../services/chat';
import { getInitials } from '../../utils/dashboard';
import PageHeader from '../shell/PageHeader';
import styles from './AgentPage.module.css';

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

export default function AgentPage() {
  const { data: sub } = useCurrentSubscriber();
  const subId = sub?.id;
  const { data: agent } = useSubscriberAgent(subId);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const listRef = useRef(null);

  const [seedKey, setSeedKey] = useState(null);
  const targetKey = subId && agent ? `${subId}:${agent.id}` : null;
  if (targetKey && targetKey !== seedKey) {
    setSeedKey(targetKey);
    const persisted = loadMessages(subId);
    if (persisted && persisted.length > 0) {
      setMessages(persisted);
    } else {
      const firstName = (agent.name || '').split(' ')[0];
      setMessages([
        {
          role: 'agent',
          text: `Hi, I'm ${firstName} — your assigned agent at ${agent.branchName}. Reach out any time about contributions, withdrawals, claims, or anything else.`,
          at: 0,
        },
      ]);
    }
  }

  useEffect(() => {
    if (subId && messages.length > 0) persistMessages(subId, messages);
  }, [subId, messages]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, isTyping]);

  const send = useCallback((text) => {
    const msg = (text || input).trim();
    if (!msg || !agent) return;
    setMessages((prev) => [...prev, { role: 'user', text: msg, at: Date.now() }]);
    setInput('');
    setIsTyping(true);
    getAgentReply(msg, agent).then((response) => {
      setTimeout(() => {
        setIsTyping(false);
        setMessages((prev) => [...prev, { role: 'agent', text: response, at: Date.now() }]);
      }, 1100);
    });
  }, [agent, input]);

  const initials = getInitials(agent?.name || '');
  const ratingLabel = agent?.rating ? `${agent.rating.toFixed(1)} ★` : null;
  const responseLabel = agent?.avgResponseHours
    ? `~${agent.avgResponseHours < 1 ? '<1' : Math.round(agent.avgResponseHours)}h reply`
    : null;

  return (
    <div className={styles.page}>
      <PageHeader title={agent?.name || 'Your agent'} subtitle={agent?.branchName ? `${agent.branchName} branch` : null} />

      <div className={styles.body}>
        {!agent ? (
          <div className={styles.loading}>
            <span className={styles.spinner} aria-hidden="true" />
          </div>
        ) : (
          <motion.div
            className={styles.step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
          >
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
                    <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none">
                      <path d="M3 2h2.5l1.2 3-1.6 1.1a8 8 0 003.8 3.8L10 8.3l3 1.2V12a1.5 1.5 0 01-1.5 1.5A11 11 0 011.5 3.5 1.5 1.5 0 013 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                    </svg>
                    Call
                  </a>
                </li>
                <li>
                  <a className={styles.contactBtn} href={`mailto:${agent.email}`} aria-label={`Email ${agent.name}`}>
                    <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none">
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

            <section className={styles.chat}>
              <div className={styles.chatHead}>
                <span className={styles.chatTitle}>Send a message</span>
                <span className={styles.chatHint}>Replies in {responseLabel ?? 'a few hours'}</span>
              </div>

              <div className={styles.messages} ref={listRef} aria-live="polite" aria-relevant="additions">
                {messages.map((m, i) => (
                  <div key={i} className={styles.msg} data-role={m.role}>
                    {m.role === 'agent' && (
                      <span className={styles.msgAvatar} aria-hidden="true">{initials}</span>
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
          </motion.div>
        )}
      </div>

      {agent && (
        <footer className={styles.footer}>
          <input
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
    </div>
  );
}
