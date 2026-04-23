import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import { useCurrentSubscriber } from '../../hooks/useSubscriber';
import { getSubscriberChatResponse } from '../../services/chat';
import styles from './HelpDeskPanel.module.css';

const CONTACTS = [
  {
    id: 'agent',
    label: 'Talk to an agent',
    helper: 'Live agent, 8am–8pm',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
        <path d="M4 14v-3a8 8 0 1116 0v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <rect x="2.5" y="14" width="4.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.75"/>
        <rect x="17" y="14" width="4.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.75"/>
      </svg>
    ),
    action: 'chat',
  },
  {
    id: 'call',
    label: 'Call us',
    helper: '0800-100-200 (toll free)',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
        <path d="M5 4h4l2 5-3 2a12 12 0 006 6l2-3 5 2v4a2 2 0 01-2 2A17 17 0 013 6a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
      </svg>
    ),
    href: 'tel:0800100200',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp us',
    helper: '+256 700 123 456',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
        <path d="M3 21l2-6a9 9 0 113 3l-5 3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
        <path d="M8 12c0 2.2 1.8 4 4 4h1l1.5-2H14a2 2 0 01-2-2v-.5l-2-1.5H9a1 1 0 00-1 1v1z" fill="currentColor"/>
      </svg>
    ),
    href: 'https://wa.me/256700123456',
  },
  {
    id: 'email',
    label: 'Email us',
    helper: 'support@upensions.ug',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.75"/>
        <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    href: 'mailto:support@upensions.ug',
  },
];

const FAQS = [
  {
    id: 'withdraw',
    q: 'How do I withdraw from my Emergency bucket?',
    a: 'Tap Withdraw on your dashboard, pick the Emergency bucket, enter the amount, and choose a reason. Funds arrive within 2 business days.',
  },
  {
    id: 'retirement',
    q: 'When can I access my retirement savings?',
    a: 'Retirement savings unlock at age 60. Before then, use your Emergency bucket for hardship withdrawals.',
  },
  {
    id: 'change-split',
    q: 'Can I change my retirement/emergency split?',
    a: 'Yes. Head to your dashboard → Adjust split, or Settings → Contribution schedule. Changes apply to future contributions only.',
  },
  {
    id: 'nominees',
    q: 'How do I update my nominees?',
    a: 'Open Update nominees from the dashboard, add or edit entries, then save. Shares must total 100%.',
  },
  {
    id: 'insurance-claim',
    q: 'How long does an insurance claim take?',
    a: 'A case officer reviews each claim within 3 business days. You\u2019ll receive an SMS + email update at each stage.',
  },
];

const STORAGE_KEY = 'up-sub-help-messages';

function loadMessages(subId) {
  if (typeof window === 'undefined' || !subId) return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}-${subId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function persistMessages(subId, messages) {
  if (typeof window === 'undefined' || !subId) return;
  try {
    window.localStorage.setItem(`${STORAGE_KEY}-${subId}`, JSON.stringify(messages));
  } catch { /* ignore */ }
}

export default function HelpDeskPanel({ splitMode = false }) {
  const { helpOpen, setHelpOpen } = useDashboard();
  const { data: sub } = useCurrentSubscriber();
  const subId = sub?.id;

  const [view, setView] = useState('home'); // home | conversation | article
  const [openFaq, setOpenFaq] = useState(null);
  const [articleId, setArticleId] = useState(null);
  const [query, setQuery] = useState('');

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (helpOpen && subId) {
      const persisted = loadMessages(subId);
      if (persisted && persisted.length > 0) {
        setMessages(persisted);
      } else {
        setMessages([
          { role: 'assistant', text: 'Hi, how can we help today?', at: Date.now() },
        ]);
      }
    }
  }, [helpOpen, subId]);

  useEffect(() => {
    if (subId && messages.length > 0) persistMessages(subId, messages);
  }, [subId, messages]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, isTyping, view]);

  useEffect(() => {
    if (helpOpen) return;
    const t = setTimeout(() => {
      setView('home');
      setOpenFaq(null);
      setArticleId(null);
      setQuery('');
      setInput('');
    }, 400);
    return () => clearTimeout(t);
  }, [helpOpen]);

  useEffect(() => {
    if (!helpOpen) return;
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (view !== 'home') setView('home');
      else setHelpOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [helpOpen, setHelpOpen, view]);

  function send(text) {
    const msg = text || input.trim();
    if (!msg) return;
    const at = Date.now();
    setMessages((prev) => [...prev, { role: 'user', text: msg, at }]);
    setInput('');
    setIsTyping(true);
    getSubscriberChatResponse(msg).then((response) => {
      setTimeout(() => {
        setIsTyping(false);
        setMessages((prev) => [...prev, { role: 'assistant', text: response, at: Date.now() }]);
      }, 900);
    });
  }

  function handleContactClick(contact) {
    if (contact.action === 'chat') {
      setView('conversation');
    }
    // external hrefs handled by <a>
  }

  const filteredFaqs = useMemo(() => {
    if (!query) return FAQS;
    const q = query.toLowerCase();
    return FAQS.filter((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q));
  }, [query]);

  const openArticle = useMemo(() => FAQS.find((f) => f.id === articleId), [articleId]);

  return (
    <>
      <AnimatePresence>
        {helpOpen && !splitMode && (
          <motion.div
            key="help-backdrop"
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setHelpOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {helpOpen && (
          <motion.div
            key="help-panel"
            className={styles.panel}
            data-split-mode={splitMode || undefined}
            initial={{ x: '100%' }}
            animate={{ x: 0, transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            exit={{ x: '100%', transition: { duration: 0.55, ease: EASE_OUT_EXPO } }}
            role="dialog"
            aria-labelledby="help-title"
            aria-modal="true"
          >
            <header className={styles.header}>
              {view !== 'home' ? (
                <button className={styles.backBtn} onClick={() => setView('home')} aria-label="Back">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                    <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ) : (
                <button className={styles.closeBtn} onClick={() => setHelpOpen(false)} aria-label="Close">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
              <div className={styles.headerText}>
                <span className={styles.eyebrow}>Help desk</span>
                <h2 id="help-title" className={styles.title}>
                  {view === 'home' && 'How can we help?'}
                  {view === 'conversation' && 'Chat with us'}
                  {view === 'article' && openArticle?.q}
                </h2>
              </div>
            </header>

            <div className={styles.body}>
              <AnimatePresence mode="wait" initial={false}>
                {view === 'home' && (
                  <motion.div
                    key="home"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                    className={styles.step}
                  >
                    {/* Search bar */}
                    <div className={styles.searchWrap}>
                      <svg aria-hidden="true" className={styles.searchIcon} viewBox="0 0 24 24" fill="none" width="18" height="18">
                        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75"/>
                        <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                      </svg>
                      <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Search help, e.g. &#39;how to withdraw&#39;"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Search help"
                      />
                    </div>

                    {/* Contacts */}
                    <section className={styles.section}>
                      <h3 className={styles.sectionTitle}>Get in touch</h3>
                      <div className={styles.contactGrid}>
                        {CONTACTS.map((c) => {
                          const Comp = c.href ? 'a' : 'button';
                          return (
                            <Comp
                              key={c.id}
                              type={c.href ? undefined : 'button'}
                              href={c.href}
                              target={c.href?.startsWith('http') ? '_blank' : undefined}
                              rel={c.href?.startsWith('http') ? 'noreferrer' : undefined}
                              className={styles.contactCard}
                              onClick={c.action ? () => handleContactClick(c) : undefined}
                            >
                              <span className={styles.contactIcon}>{c.icon}</span>
                              <span className={styles.contactText}>
                                <span className={styles.contactLabel}>{c.label}</span>
                                <span className={styles.contactHelper}>{c.helper}</span>
                              </span>
                              <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" className={styles.contactArrow}>
                                <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                              </svg>
                            </Comp>
                          );
                        })}
                      </div>
                    </section>

                    {/* FAQs */}
                    <section className={styles.section}>
                      <h3 className={styles.sectionTitle}>Popular questions</h3>
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

                    {/* Footer link */}
                    <div className={styles.nearby}>
                      <div className={styles.nearbyText}>
                        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none">
                          <path d="M12 22s8-8 8-13a8 8 0 10-16 0c0 5 8 13 8 13z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
                          <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.75"/>
                        </svg>
                        <span>Find a nearby branch</span>
                      </div>
                      <span className={styles.nearbyHint}>314 locations across Uganda</span>
                    </div>
                  </motion.div>
                )}

                {view === 'conversation' && (
                  <motion.div
                    key="convo"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                    className={styles.convoStep}
                  >
                    <div className={styles.convoBanner}>
                      <span className={styles.convoDot} />
                      An agent will reply within ~2 minutes · 8am–8pm
                    </div>

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

                    <div className={styles.inputRow}>
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
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
