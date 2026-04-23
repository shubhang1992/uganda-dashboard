import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO, formatUGXExact, formatUGX } from '../../utils/finance';
import { useDashboard } from '../../contexts/DashboardContext';
import { getSubscriberChatResponse } from '../../services/chat';
import styles from './BalanceHero.module.css';

const HIDE_STORAGE_KEY = 'up-sub-balance-hidden';

function pad(n) { return String(n).padStart(2, '0'); }
function formatAccountNumber(id) {
  if (!id) return 'UG•••••••';
  const digits = id.replace(/\D/g, '').padStart(8, '0');
  return `UG-${digits.slice(0, 4)}-${digits.slice(4)}`;
}
function formatToday() {
  return new Date().toLocaleDateString('en-UG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
function formatUnitDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatUnitTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
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

/* ── SVG donut: two slices (retirement / emergency) with animated sweep */
function Donut({ retirementPct, emergencyPct, hide }) {
  const size = 184, stroke = 18;
  const r = (size - stroke) / 2;
  const cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;

  // Slice lengths (as fractions of the circle)
  const retirementLen = (retirementPct / 100) * circumference;
  const emergencyLen = (emergencyPct / 100) * circumference;

  return (
    <div className={styles.donutWrap} aria-label={`${retirementPct}% retirement, ${emergencyPct}% emergency`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={styles.donut}>
        <defs>
          <linearGradient id="donut-ret" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#A5B4FC" />
            <stop offset="100%" stopColor="var(--color-positive-soft)" />
          </linearGradient>
          <linearGradient id="donut-emg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5EEAD4" />
            <stop offset="100%" stopColor="var(--color-accent-mint)" />
          </linearGradient>
          <filter id="donut-glow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        {/* track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        {/* retirement arc — starts at top, rotates clockwise */}
        <motion.circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke="url(#donut-ret)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${retirementLen} ${circumference - retirementLen}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          filter="url(#donut-glow)"
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${retirementLen} ${circumference - retirementLen}` }}
          transition={{ duration: 1.4, delay: 0.3, ease: EASE_OUT_EXPO }}
        />
        {/* emergency arc — starts where retirement ends */}
        <motion.circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke="url(#donut-emg)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${emergencyLen} ${circumference - emergencyLen}`}
          transform={`rotate(${-90 + (retirementPct / 100) * 360} ${cx} ${cy})`}
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${emergencyLen} ${circumference - emergencyLen}` }}
          transition={{ duration: 1.2, delay: 0.8, ease: EASE_OUT_EXPO }}
        />
      </svg>
      <div className={styles.donutCenter}>
        <span className={styles.donutRatio}>{hide ? '••' : retirementPct}<span className={styles.donutSep}>/</span>{hide ? '••' : emergencyPct}</span>
        <span className={styles.donutLabel}>Split</span>
      </div>
    </div>
  );
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
    closeAllPanels,
  } = useDashboard();

  const totalBalance = subscriber?.netBalance || 0;
  const retirementBalance = subscriber?.retirementBalance || 0;
  const emergencyBalance = subscriber?.emergencyBalance || 0;
  const totalInvested = subscriber?.totalContributions || 0;
  const gain = totalBalance - totalInvested;
  const gainPct = totalInvested > 0 ? (gain / totalInvested) * 100 : 0;
  const gainPositive = gain >= 0;
  const schedule = subscriber?.contributionSchedule;
  const retirementPct = schedule?.retirementPct ?? 80;
  const emergencyPct = schedule?.emergencyPct ?? (100 - retirementPct);
  const nextAmount = schedule?.amount || 0;

  const countedBalance = useCountUp(hide ? 0 : totalBalance, 1300, inView);

  const accountNum = formatAccountNumber(subscriber?.id);
  const firstName = (user?.name || subscriber?.name || 'there').split(' ')[0];

  function handleTopUp() {
    closeAllPanels();
    setContributeOpen(true);
  }
  function handleAdjustSplit() {
    closeAllPanels();
    setContributionSettingsOpen(true);
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
          <span className={styles.heroSub}>
            {formatToday()}
            <span className={styles.heroDot} aria-hidden="true">·</span>
            Member ID {accountNum}
          </span>
        </div>
        <span className={styles.heroBadge}>
          <span className={styles.heroBadgeDot} aria-hidden="true" />
          Active
        </span>
      </div>

      {/* ── Top grid: Balance ◦ Donut ── */}
      <div className={styles.topGrid}>
        {/* Left: balance */}
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

          <div className={styles.inlineStats}>
            <div className={styles.inlineStat}>
              <span className={styles.inlineStatLabel}>Invested</span>
              <span className={styles.inlineStatValue}>{hide ? '••••' : formatUGX(totalInvested)}</span>
            </div>
            <div className={styles.inlineStatDivider} aria-hidden="true" />
            <div className={styles.inlineStat}>
              <span className={styles.inlineStatLabel}>Current</span>
              <span className={styles.inlineStatValue}>{hide ? '••••' : formatUGX(totalBalance)}</span>
            </div>
            <div className={styles.inlineStatDivider} aria-hidden="true" />
            <div className={styles.inlineStat}>
              <span className={styles.inlineStatLabel}>Growth</span>
              {hide ? (
                <span className={styles.inlineStatValue}>••••</span>
              ) : (
                <span className={styles.growthValue} data-positive={gainPositive}>
                  <span className={styles.growthAmt}>
                    {gainPositive ? '+' : '−'}{formatUGX(Math.abs(gain))}
                  </span>
                  <span className={styles.growthPct}>
                    {gainPositive ? '+' : '−'}{Math.abs(gainPct).toFixed(1)}%
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className={styles.asOf}>
            <span className={styles.asOfDot} />
            Values updated {formatUnitDate(subscriber?.unitValueAsOf)} · {formatUnitTime(subscriber?.unitValueAsOf)}
          </div>

          <div className={styles.ctaRow}>
            <button type="button" className={styles.ctaPrimary} onClick={handleTopUp}>
              <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              </svg>
              Top up savings
            </button>
            <button type="button" className={styles.ctaSecondary} onClick={handleAdjustSplit}>
              Adjust split
            </button>
          </div>
        </div>

        {/* Right: donut + split breakdown */}
        <div className={styles.donutCol}>
          <Donut retirementPct={retirementPct} emergencyPct={emergencyPct} hide={hide} />
          <div className={styles.legend}>
            <motion.div
              className={styles.legendRow}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.9, ease: EASE_OUT_EXPO }}
            >
              <span className={styles.legendDot} data-tone="retirement" aria-hidden="true" />
              <div className={styles.legendText}>
                <span className={styles.legendLabel}>Retirement</span>
                <span className={styles.legendPct}>{retirementPct}%</span>
              </div>
              <span className={styles.legendAmt}>{hide ? '••••' : formatUGX(retirementBalance)}</span>
            </motion.div>
            <motion.div
              className={styles.legendRow}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 1.0, ease: EASE_OUT_EXPO }}
            >
              <span className={styles.legendDot} data-tone="emergency" aria-hidden="true" />
              <div className={styles.legendText}>
                <span className={styles.legendLabel}>Emergency</span>
                <span className={styles.legendPct}>{emergencyPct}%</span>
              </div>
              <span className={styles.legendAmt}>{hide ? '••••' : formatUGX(emergencyBalance)}</span>
            </motion.div>
          </div>
        </div>
      </div>

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
