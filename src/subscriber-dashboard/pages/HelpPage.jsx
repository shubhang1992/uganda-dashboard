import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useCurrentSubscriber } from '../../hooks/useSubscriber';
import { getSubscriberChatResponse } from '../../services/chat';
import {
  SUPPORT_WHATSAPP_URL,
  SUPPORT_WHATSAPP_DISPLAY,
  SUPPORT_EMAIL,
} from '../../config/env';
import PageHeader from '../shell/PageHeader';
import styles from './HelpPage.module.css';

const FAQS = [
  {
    id: 'withdraw',
    q: 'How do I withdraw from my Emergency bucket?',
    a: 'Open Withdraw on your home screen, choose the Emergency bucket, enter the amount, and pick a reason. Funds arrive within 2 business days.',
  },
  {
    id: 'retirement',
    q: 'When can I access my retirement savings?',
    a: 'Retirement savings unlock at age 60. Before then, use your Emergency bucket for hardship withdrawals.',
  },
  {
    id: 'change-split',
    q: 'Can I change my retirement/emergency split?',
    a: 'Yes — go to Save → Set up schedule (or the calendar icon on the contribution card). Changes apply to future contributions only.',
  },
  {
    id: 'nominees',
    q: 'How do I update my nominees?',
    a: 'Open Settings → Nominees, add or edit entries, then save. Shares must total 100%.',
  },
  {
    id: 'insurance-claim',
    q: 'How long does an insurance claim take?',
    a: 'A case officer reviews each claim within 3 business days. You’ll receive an SMS + email update at each stage.',
  },
  {
    id: 'agent',
    q: 'Who is my assigned agent?',
    a: 'Your agent is shown on the Agent page from your home screen. You can call, email, or message them directly.',
  },
];

const STORAGE_KEY = 'up-sub-help-messages';

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

export default function HelpPage() {
  const navigate = useNavigate();
  const { data: sub } = useCurrentSubscriber();
  const subId = sub?.id;

  const [view, setView] = useState('home'); // home | chat
  const [openFaq, setOpenFaq] = useState(null);
  const [query, setQuery] = useState('');

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const listRef = useRef(null);

  // Adjust state during render — the React 19-supported pattern for deriving
  // state from props without an effect. See react.dev "You Might Not Need an Effect".
  if (subId && !seeded) {
    setSeeded(true);
    const persisted = loadMessages(subId);
    if (persisted && persisted.length > 0) {
      setMessages(persisted);
    } else {
      setMessages([{ role: 'assistant', text: 'Hi, how can we help today?', at: 0 }]);
    }
  }

  useEffect(() => {
    if (subId && messages.length > 0) persistMessages(subId, messages);
  }, [subId, messages]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, isTyping, view]);

  function send(text) {
    const msg = (text || input).trim();
    if (!msg) return;
    setMessages((prev) => [...prev, { role: 'user', text: msg, at: Date.now() }]);
    setInput('');
    setIsTyping(true);
    getSubscriberChatResponse(msg).then((response) => {
      setTimeout(() => {
        setIsTyping(false);
        setMessages((prev) => [...prev, { role: 'assistant', text: response, at: Date.now() }]);
      }, 900);
    });
  }

  const filteredFaqs = useMemo(() => {
    if (!query) return FAQS;
    const q = query.toLowerCase();
    return FAQS.filter((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q));
  }, [query]);

  function handleBack() {
    if (view === 'chat') return setView('home');
    navigate('/dashboard');
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={view === 'home' ? 'How can we help?' : 'Live support chat'}
        subtitle={
          view === 'home' ? 'Find answers, contact support, or message your agent'
          : 'Universal Pensions assistant · responds instantly'
        }
        onBack={handleBack}
      />

      <div className={styles.body}>
        <AnimatePresence mode="wait" initial={false}>
          {view === 'home' && (
            <motion.div
              key="home"
              className={styles.step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
            >
              <div className={styles.searchWrap}>
                <svg aria-hidden="true" className={styles.searchIcon} viewBox="0 0 24 24" fill="none" width="18" height="18">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75"/>
                  <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                </svg>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search help, e.g. 'how to withdraw'"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search help"
                />
              </div>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Get in touch</h2>
                <div className={styles.contactGrid}>
                  <button type="button" className={styles.contactCard} onClick={() => setView('chat')}>
                    <span className={styles.contactIcon} data-tone="indigo">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                        <path d="M4 14v-3a8 8 0 1116 0v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                        <rect x="2.5" y="14" width="4.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.75"/>
                        <rect x="17" y="14" width="4.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.75"/>
                      </svg>
                    </span>
                    <span className={styles.contactText}>
                      <span className={styles.contactLabel}>Live support chat</span>
                      <span className={styles.contactHelper}>Instant assistant · 24/7</span>
                    </span>
                    <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" className={styles.contactArrow}>
                      <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  </button>

                  <a className={styles.contactCard} href="tel:0800100200">
                    <span className={styles.contactIcon} data-tone="green">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                        <path d="M5 4h4l2 5-3 2a12 12 0 006 6l2-3 5 2v4a2 2 0 01-2 2A17 17 0 013 6a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <span className={styles.contactText}>
                      <span className={styles.contactLabel}>Call us</span>
                      <span className={styles.contactHelper}>0800-100-200 · toll free</span>
                    </span>
                    <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" className={styles.contactArrow}>
                      <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  </a>

                  <a className={styles.contactCard} href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer">
                    <span className={styles.contactIcon} data-tone="teal">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                        <path d="M3 21l2-6a9 9 0 113 3l-5 3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
                        <path d="M8 12c0 2.2 1.8 4 4 4h1l1.5-2H14a2 2 0 01-2-2v-.5l-2-1.5H9a1 1 0 00-1 1v1z" fill="currentColor"/>
                      </svg>
                    </span>
                    <span className={styles.contactText}>
                      <span className={styles.contactLabel}>WhatsApp</span>
                      <span className={styles.contactHelper}>{SUPPORT_WHATSAPP_DISPLAY}</span>
                    </span>
                    <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" className={styles.contactArrow}>
                      <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  </a>

                  <a className={styles.contactCard} href={`mailto:${SUPPORT_EMAIL}`}>
                    <span className={styles.contactIcon} data-tone="amber">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.75"/>
                        <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <span className={styles.contactText}>
                      <span className={styles.contactLabel}>Email us</span>
                      <span className={styles.contactHelper}>{SUPPORT_EMAIL}</span>
                    </span>
                    <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" className={styles.contactArrow}>
                      <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  </a>
                </div>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Popular questions</h2>
                <ul className={styles.faqList}>
                  {filteredFaqs.map((f) => (
                    <li key={f.id} className={styles.faqRow} data-open={openFaq === f.id || undefined}>
                      <button
                        type="button"
                        className={styles.faqHead}
                        onClick={() => setOpenFaq(openFaq === f.id ? null : f.id)}
                        aria-expanded={openFaq === f.id}
                      >
                        <span className={styles.faqQ}>{f.q}</span>
                        <svg aria-hidden="true" className={styles.faqChev} data-open={openFaq === f.id} viewBox="0 0 12 12" width="12" height="12" fill="none">
                          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <AnimatePresence initial={false}>
                        {openFaq === f.id && (
                          <motion.div
                            className={styles.faqBody}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                          >
                            <p className={styles.faqA}>{f.a}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </li>
                  ))}
                  {filteredFaqs.length === 0 && (
                    <li className={styles.faqEmpty}>No matching help topics.</li>
                  )}
                </ul>
              </section>

              <button type="button" className={styles.agentLink} onClick={() => navigate('/dashboard/agent')}>
                <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none">
                  <circle cx="8" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M3 14a5 5 0 0110 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span>Got an assigned agent? Message them directly</span>
                <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" fill="none">
                  <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </motion.div>
          )}

          {view === 'chat' && (
            <motion.div
              key="chat"
              className={styles.chat}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
            >
              <div className={styles.messages} ref={listRef} aria-live="polite">
                {messages.map((m, i) => (
                  <div key={i} className={styles.msg} data-role={m.role}>
                    {m.role === 'assistant' && (
                      <div className={styles.avatar} aria-hidden="true">
                        <svg viewBox="0 0 16 16" width="10" height="10" fill="none">
                          <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </div>
                    )}
                    <div className={styles.bubble} data-role={m.role}>{m.text}</div>
                  </div>
                ))}
                {isTyping && (
                  <div className={styles.msg} data-role="assistant">
                    <div className={styles.avatar} aria-hidden="true">
                      <svg viewBox="0 0 16 16" width="10" height="10" fill="none">
                        <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
                      </svg>
                    </div>
                    <div className={styles.bubble} data-role="assistant">
                      <span className={styles.typing}><span /><span /><span /></span>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {view === 'chat' && (
        <footer className={styles.footer}>
          <input
            type="text"
            className={styles.inputField}
            placeholder="Type your message…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
            aria-label="Type a message"
          />
          <button
            type="button"
            className={styles.sendBtn}
            disabled={!input.trim()}
            onClick={() => send()}
            aria-label="Send"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="14" height="14"><path d="M2 8l12-6-6 12V8H2z" fill="currentColor"/></svg>
          </button>
        </footer>
      )}
    </div>
  );
}
