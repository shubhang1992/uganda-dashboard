import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGXExact, formatUGX } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import { getSubscriberChatResponse } from '../../services/chat';
import styles from './BalanceHero.module.css';

const HIDE_STORAGE_KEY = 'up-sub-balance-hidden';

function formatSchedule(schedule) {
  if (!schedule?.nextDueDate) return 'Not scheduled';
  const d = new Date(schedule.nextDueDate);
  return d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ── Animated count-up: renders the same big display text via a number
   that eases from 0 → target. Pauses when `hide` is true. */
function useCountUp(target, duration = 1200, trigger = true) {
  const [value, setValue] = useState(0);
  const shouldAnimate = trigger && Number.isFinite(target) && target > 0;
  useEffect(() => {
    if (!shouldAnimate) return;
    let raf;
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, shouldAnimate]);
  return shouldAnimate ? value : 0;
}

/* Inline transaction-type icons for the activity strip. */
const TX_META = {
  contribution: {
    label: 'Contribution',
    tone: 'positive',
    d: 'M10 3v14M3 10h14',
  },
  withdrawal: {
    label: 'Withdrawal',
    tone: 'teal',
    d: 'M10 14V3M6 7l4-4 4 4',
  },
  premium: {
    label: 'Insurance premium',
    tone: 'amber',
    d: 'M10 2l6 2.5v4.5c0 4-2.5 7-6 8.5-3.5-1.5-6-4.5-6-8.5V4.5L10 2z',
  },
  claim: {
    label: 'Claim payout',
    tone: 'indigo',
    d: 'M3 4h14v12H3zM6 9h8M6 12h5',
  },
};

function formatTxDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short' });
}

export default function BalanceHero({ subscriber, user, split }) {
  const heroRef = useRef(null);
  const inView = useInView(heroRef, { once: true, amount: 0.35 });

  const [hide, setHide] = useState(() => {
    try { return window.localStorage.getItem(HIDE_STORAGE_KEY) === 'true'; } catch { return false; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(HIDE_STORAGE_KEY, String(hide)); } catch { /* ignore */ }
  }, [hide]);

  const {
    setContributeOpen,
    setContributionSettingsOpen,
    setWithdrawOpen,
    setInsuranceOpen,
    setInsuranceTab,
    setSubscriberReportsOpen,
    setReportContext,
    closeAllPanels,
  } = useDashboard();

  const totalBalance = subscriber?.netBalance || 0;
  const retirementBalance = subscriber?.retirementBalance || 0;
  const emergencyBalance = subscriber?.emergencyBalance || 0;
  const totalInvested = subscriber?.totalContributions || 0;
  const totalWithdrawals = subscriber?.totalWithdrawals || 0;
  const unitsHeld = subscriber?.unitsHeld || 0;
  const currentUnitValue = subscriber?.currentUnitValue || 0;
  // Investment growth = current value of all units bought ‑ money put in.
  // Today's balance only reflects what's left after withdrawals, so add them back.
  const gain = totalBalance + totalWithdrawals - totalInvested;
  const gainPct = totalInvested > 0 ? (gain / totalInvested) * 100 : 0;
  const gainPositive = gain >= 0;
  const schedule = subscriber?.contributionSchedule;
  const retirementPct = schedule?.retirementPct ?? 80;
  const emergencyPct = schedule?.emergencyPct ?? (100 - retirementPct);
  const nextAmount = schedule?.amount || 0;

  const formatUnits = (n) =>
    Number(n).toLocaleString('en-UG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const recentTransactions = (subscriber?.transactions || []).slice(0, 2);

  const countedBalance = useCountUp(hide ? 0 : totalBalance, 1300, inView);

  const firstName = (user?.name || subscriber?.name || 'there').split(' ')[0];

  function handleTopUp() {
    closeAllPanels();
    setContributeOpen(true);
  }
  function handleAdjustSplit() {
    closeAllPanels();
    setContributionSettingsOpen(true);
  }
  function handleWithdraw() {
    closeAllPanels();
    setWithdrawOpen(true);
  }
  function handleFileClaim() {
    closeAllPanels();
    setInsuranceTab('claims');
    setInsuranceOpen(true);
  }
  function handleViewAllTx() {
    closeAllPanels();
    setReportContext('all-transactions');
    setSubscriberReportsOpen(true);
  }

  /* ── Savings Copilot ── */
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatScrollRef = useRef(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, copilotOpen]);

  const insights = useMemo(() => {
    const items = [];
    if (schedule?.nextDueDate) {
      items.push({
        type: 'positive',
        text: `Next ${formatUGX(nextAmount)} contribution due ${formatSchedule(schedule)}`,
        query: 'When is my next contribution?',
      });
    }
    if (totalInvested > 0) {
      items.push({
        type: gainPositive ? 'positive' : 'warning',
        text: gainPositive
          ? `Your savings have grown ${gainPct.toFixed(1)}%`
          : `Your balance is down ${Math.abs(gainPct).toFixed(1)}%`,
        query: 'How is my balance calculated?',
      });
    }
    const nomineeCount = subscriber?.nominees?.pension?.length ?? 0;
    if (nomineeCount === 0) {
      items.push({
        type: 'warning',
        text: 'Add a beneficiary to secure your savings',
        query: 'How do I add a nominee?',
      });
    } else {
      items.push({
        type: 'positive',
        text: `${nomineeCount} beneficiar${nomineeCount === 1 ? 'y' : 'ies'} on file`,
        query: 'Change my nominees',
      });
    }
    return items;
  }, [schedule, nextAmount, totalInvested, gainPositive, gainPct, subscriber]);

  function handleSend(text) {
    const msg = (text ?? chatInput).trim();
    if (!msg) return;
    setMessages((prev) => [...prev, { role: 'user', text: msg }]);
    setChatInput('');
    setIsTyping(true);
    getSubscriberChatResponse(msg).then((response) => {
      setTimeout(() => {
        setIsTyping(false);
        setMessages((prev) => [...prev, { role: 'assistant', text: response }]);
      }, 600);
    });
  }

  return (
    <motion.div
      ref={heroRef}
      className={styles.hero}
      data-split={split || undefined}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
    >
      {/* Ambient light + grain */}
      <span className={styles.heroMesh} aria-hidden="true" />
      <span className={styles.heroGrain} aria-hidden="true" />

      {/* ── Header ── */}
      <div className={styles.heroHeader}>
        <div className={styles.heroId}>
          <span className={styles.heroEyebrow}>Your savings</span>
          <h1 className={styles.heroGreeting}>
            Good {hourGreeting()}, <span className={styles.heroGreetingName}>{firstName}</span>
          </h1>
        </div>
        <span className={styles.heroBadge}>
          <span className={styles.heroBadgeDot} aria-hidden="true" />
          Active
        </span>
      </div>

      {/* ── Balance + stats ── */}
      <div className={styles.topGrid}>
        <div className={styles.balanceCol}>
          <div className={styles.balanceHeaderRow}>
            <span className={styles.balanceLabel}>Total account balance</span>
            <button
              type="button"
              className={styles.eyeBtn}
              onClick={() => setHide((v) => !v)}
              aria-label={hide ? 'Show balance' : 'Hide balance'}
              aria-pressed={hide}
            >
              {hide ? (
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75"/>
                </svg>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" width="18" height="18">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M14.12 14.12a3 3 0 11-4.24-4.24" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                </svg>
              )}
            </button>
          </div>
          <div className={styles.balanceValue} aria-live="polite">
            {hide ? (
              <span className={styles.balanceMask}>UGX ••••••••</span>
            ) : (
              formatUGXExact(Math.round(countedBalance))
            )}
          </div>

          <ul className={styles.metricsRow}>
            <li className={styles.metricCell}>
              <span className={styles.metricKey}>Contribution</span>
              <span className={styles.metricValue}>
                {hide ? '••••' : formatUGXExact(totalInvested)}
              </span>
            </li>
            <li className={styles.metricCell}>
              <span className={styles.metricKey}>Units</span>
              <span className={styles.metricValue}>
                {hide ? '••••' : formatUnits(unitsHeld)}
              </span>
            </li>
            <li className={styles.metricCell}>
              <span className={styles.metricKey}>Unit value</span>
              <span className={styles.metricValue}>
                {hide ? '••••' : formatUGXExact(currentUnitValue)}
              </span>
            </li>
            <li className={styles.metricCell}>
              <span className={styles.metricKey}>Growth</span>
              <span className={styles.metricValue} data-tone={gainPositive ? 'positive' : 'warning'}>
                {hide ? (
                  '••••'
                ) : (
                  <>
                    {gainPositive ? '▲' : '▼'} {formatUGXExact(Math.abs(gain))}
                    {totalInvested > 0 && (
                      <span className={styles.metricDelta}>
                        {' '}({Math.abs(gainPct).toFixed(1)}%)
                      </span>
                    )}
                  </>
                )}
              </span>
            </li>
          </ul>

        </div>

      </div>

      {/* ── Split bar: inline horizontal, full-width ── */}
      <motion.div
        className={styles.splitInline}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.4, ease: EASE_OUT_EXPO }}
        aria-label={`Retirement ${retirementPct}%, emergency ${emergencyPct}%`}
      >
        <span className={styles.splitInlineSide}>
          <span className={styles.splitDot} data-tone="retirement" aria-hidden="true" />
          <span className={styles.splitInlineLabel}>Retirement</span>
          <span className={styles.splitInlinePct}>{retirementPct}%</span>
          <span className={styles.splitInlineAmt}>{hide ? '••••' : formatUGX(retirementBalance)}</span>
        </span>
        <span className={styles.splitInlineBar} aria-hidden="true">
          <motion.span
            className={styles.splitFillRet}
            initial={{ width: 0 }}
            animate={{ width: `${retirementPct}%` }}
            transition={{ duration: 0.9, delay: 0.45, ease: EASE_OUT_EXPO }}
          />
          <motion.span
            className={styles.splitFillEmg}
            initial={{ width: 0 }}
            animate={{ width: `${emergencyPct}%` }}
            transition={{ duration: 0.9, delay: 0.6, ease: EASE_OUT_EXPO }}
          />
        </span>
        <span className={styles.splitInlineSide} data-align="right">
          <span className={styles.splitDot} data-tone="emergency" aria-hidden="true" />
          <span className={styles.splitInlineLabel}>Emergency</span>
          <span className={styles.splitInlinePct}>{emergencyPct}%</span>
          <span className={styles.splitInlineAmt}>{hide ? '••••' : formatUGX(emergencyBalance)}</span>
        </span>
      </motion.div>

      {/* ── Action strip: primary pill + 3 quick tiles ── */}
      <motion.div
        className={styles.actionStrip}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.45, ease: EASE_OUT_EXPO }}
      >
        <button type="button" className={styles.actionPrimary} onClick={handleTopUp}>
          <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
          Top up savings
        </button>

        <div className={styles.quickTiles} role="group" aria-label="Quick actions">
          <button
            type="button"
            className={styles.quickTile}
            data-variant="next"
            onClick={handleAdjustSplit}
            aria-label={schedule?.nextDueDate ? 'Edit contribution schedule' : 'Set up a contribution schedule'}
          >
            <span className={styles.quickIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.75"/>
                <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              </svg>
            </span>
            <span className={styles.quickStack}>
              <span className={styles.quickEyebrow}>Next</span>
              {schedule?.nextDueDate ? (
                <span className={styles.quickValue}>
                  {hide ? '••••' : `${formatUGX(nextAmount)} · ${formatSchedule(schedule)}`}
                </span>
              ) : (
                <span className={styles.quickValue} data-muted="true">Not scheduled</span>
              )}
            </span>
          </button>

          <button type="button" className={styles.quickTile} onClick={handleWithdraw}>
            <span className={styles.quickIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                <path d="M12 3v12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                <path d="M7 8l5-5 5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              </svg>
            </span>
            <span className={styles.quickLabel}>Withdraw</span>
          </button>

          <button type="button" className={styles.quickTile} onClick={handleFileClaim}>
            <span className={styles.quickIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
                <path d="M12 9v4M12 16v.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              </svg>
            </span>
            <span className={styles.quickLabel}>File a claim</span>
          </button>
        </div>
      </motion.div>

      {/* ── Activity strip: most-recent transactions, inline ── */}
      <motion.div
        className={styles.activityStrip}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.55, ease: EASE_OUT_EXPO }}
      >
        <div className={styles.activityHead}>
          <span className={styles.activityEyebrow}>Recent activity</span>
          <button type="button" className={styles.activityViewAll} onClick={handleViewAllTx}>
            View all
            <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" fill="none">
              <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <div className={styles.activityEmpty}>No transactions yet.</div>
        ) : (
          <ul className={styles.txList}>
            {recentTransactions.map((tx) => {
              const meta = TX_META[tx.type] || TX_META.contribution;
              const isNegative = tx.amount < 0;
              const absAmt = Math.abs(tx.amount);
              return (
                <li key={tx.id} className={styles.txRow}>
                  <span className={styles.txIcon} data-tone={meta.tone} aria-hidden="true">
                    <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                      <path d={meta.d} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <div className={styles.txMain}>
                    <span className={styles.txLabel}>{meta.label}</span>
                    <span className={styles.txMeta}>
                      {formatTxDate(tx.date)}
                      <span className={styles.txDot} aria-hidden="true">·</span>
                      {tx.method}
                    </span>
                  </div>
                  <span className={styles.txAmount} data-negative={isNegative || undefined}>
                    {hide ? '••••' : `${isNegative ? '−' : '+'}${formatUGXExact(absAmt)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </motion.div>

      {/* ── Savings Copilot strip ── */}
      <div className={styles.copilotStrip}>
        <button
          type="button"
          className={styles.copilotToggle}
          onClick={() => setCopilotOpen((v) => !v)}
          aria-expanded={copilotOpen}
          aria-controls="savings-copilot-body"
        >
          <div className={styles.copilotLeft}>
            <span className={styles.copilotDot} aria-hidden="true" />
            <span className={styles.copilotTitle}>Savings Copilot</span>
            {!copilotOpen && (
              <div className={styles.insightChips}>
                {insights.map((ins, i) => (
                  <span key={i} className={styles.chip} data-type={ins.type}>
                    <span className={styles.chipDot} data-type={ins.type} aria-hidden="true" />
                    {ins.text}
                  </span>
                ))}
              </div>
            )}
          </div>
          <svg
            aria-hidden="true"
            className={styles.copilotChevron}
            data-open={copilotOpen}
            viewBox="0 0 14 14"
            width="14"
            height="14"
            fill="none"
          >
            <path d="M4 5.5l3 3 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <AnimatePresence initial={false}>
          {copilotOpen && (
            <motion.div
              id="savings-copilot-body"
              className={styles.copilotBody}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
            >
              <div className={styles.copilotGrid}>
                <div className={styles.copilotInsights}>
                  {insights.map((ins, i) => (
                    <button
                      key={i}
                      type="button"
                      className={styles.insightBtn}
                      onClick={() => handleSend(ins.query)}
                    >
                      <span className={styles.insightBtnDot} data-type={ins.type} aria-hidden="true" />
                      <span className={styles.insightBtnText}>{ins.text}</span>
                      <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" className={styles.insightBtnArrow}>
                        <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                    </button>
                  ))}
                  <div className={styles.quickRow}>
                    {['How do I withdraw?', 'Change my split', 'Insurance cover?'].map((q) => (
                      <button key={q} type="button" className={styles.quickPill} onClick={() => handleSend(q)}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.copilotChat}>
                  <div className={styles.chatMessages} ref={chatScrollRef} aria-live="polite" aria-relevant="additions">
                    {messages.length === 0 && !isTyping && (
                      <div className={styles.chatEmpty}>
                        <span className={styles.chatEmptyText}>Click an insight or ask about your savings</span>
                      </div>
                    )}
                    {messages.map((m, i) => (
                      <div key={i} className={styles.chatMsg} data-role={m.role}>
                        {m.role === 'assistant' && (
                          <div className={styles.chatAvatar} aria-hidden="true">
                            <svg viewBox="0 0 16 16" width="10" height="10" fill="none">
                              <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
                              <path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          </div>
                        )}
                        <div className={styles.chatBubble} data-role={m.role}>{m.text}</div>
                      </div>
                    ))}
                    {isTyping && (
                      <div className={styles.chatMsg} data-role="assistant">
                        <div className={styles.chatAvatar} aria-hidden="true">
                          <svg viewBox="0 0 16 16" width="10" height="10" fill="none">
                            <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </div>
                        <div className={styles.chatBubble} data-role="assistant">
                          <span className={styles.typingDots}><span /><span /><span /></span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className={styles.chatInputRow}>
                    <input
                      className={styles.chatField}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
                      placeholder="Ask about your savings…"
                      aria-label="Ask savings copilot"
                      name="savings-copilot"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className={styles.chatSend}
                      onClick={() => handleSend()}
                      disabled={!chatInput.trim()}
                      aria-label="Send message"
                    >
                      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="12" height="12">
                        <path d="M2 8l12-6-6 12V8H2z" fill="currentColor" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function hourGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
