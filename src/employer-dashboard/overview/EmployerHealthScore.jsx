// Employer hero banner — the Overview centerpiece. Cloned from
// `branch-dashboard/overview/BranchHealthScore.jsx` (same indigo dome, gauge,
// 3-column topGrid, alerts row + Copilot strip + split-mode reflow), recoloured
// and relabelled for the employer role.
//
// What changed vs the branch hero:
//   * Gauge is driven by a PARTICIPATION score (active staff actively
//     contributing vs headcount) instead of the branch composite.
//   * Metric cards / alerts open the employer slide-in panels (employees /
//     runs / insurance) via `useEmployerPanel`, not the branch report hub.
//   * Activity feed is built from the contribution-run history + most-recent
//     enrolments (the employer has no agent leaderboard).
//
// Data arrives via the employer hooks (employees / runs / metrics) — this
// component never imports `employerSeed` directly (CLAUDE.md §4.1).

import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/finance';
import { formatUGX, formatNumber } from '../../utils/currency';
import { formatDate, formatRelativeTime } from '../../utils/date';
import { getChatResponse } from '../../services/chat';
import { useToast } from '../../contexts/ToastContext';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import NotificationBell from '../../components/notifications/NotificationBell';
import styles from './EmployerHealthScore.module.css';

/* ── Derived metrics ─────────────────────────────────────────────────────────
   Everything the hero needs that isn't already in `metrics`: participation,
   averages, the employer-share split and a contributing-staff count. */
function deriveMetrics(metrics, employees) {
  const headcount = metrics.headcount || employees.length || 0;
  const active = metrics.active || 0;
  // "Participating" = active staff whose contribution config funds a non-zero
  // amount (an active employer-only or co-contribution member). Suspended staff
  // and zero-config rows don't count toward participation.
  const contributing = employees.filter(
    (e) => e.status === 'active' && contributesSomething(e),
  ).length;
  const participationRate = headcount > 0 ? (contributing / headcount) * 100 : 0;
  const activeRate = headcount > 0 ? (active / headcount) * 100 : 0;

  const totalBalance = metrics.totalBalance || 0;
  const avgBalance = headcount > 0 ? totalBalance / headcount : 0;

  const employerYtd = metrics.employerYtd || 0;
  const employeeYtd = metrics.employeeYtd || 0;
  const ytdTotal = employerYtd + employeeYtd;
  const employerShare = ytdTotal > 0 ? (employerYtd / ytdTotal) * 100 : 0;

  const insuredCount = metrics.insuredCount || 0;
  const insuredRate = headcount > 0 ? (insuredCount / headcount) * 100 : 0;

  return {
    headcount,
    active,
    contributing,
    participationRate,
    activeRate,
    avgBalance,
    employerShare,
    insuredRate,
    ytdTotal,
  };
}

/** A member contributes if their config yields a non-zero employer/employee half. */
function contributesSomething(emp) {
  const cfg = emp.contributionConfig ?? {};
  const employerHalf =
    cfg.employerAmount != null
      ? Number(cfg.employerAmount)
      : (emp.salary ?? 0) * Number(cfg.employerPct ?? 0) / 100;
  const employeeHalf =
    cfg.mode === 'co-contribution'
      ? cfg.employeeAmount != null
        ? Number(cfg.employeeAmount)
        : (emp.salary ?? 0) * Number(cfg.employeePct ?? 0) / 100
      : 0;
  return employerHalf + employeeHalf > 0;
}

/* ── Score ───────────────────────────────────────────────────────────────────
   A scheme-health score weighted toward participation — the single number the
   gauge shows. Composite: participation (50%), insured coverage (25%),
   active-staff rate (25%). Bounded 0-100. */
function calcScore(derived) {
  const total = Math.round(
    derived.participationRate * 0.5 +
      derived.insuredRate * 0.25 +
      derived.activeRate * 0.25,
  );
  return Math.min(100, Math.max(0, total));
}

function scoreLabel(s) {
  if (s >= 85) return 'Excellent';
  if (s >= 70) return 'Healthy';
  if (s >= 50) return 'Fair';
  return 'Needs Attention';
}

/* ── Insights (Copilot strip) ───────────────────────────────────────────────── */
function generateInsights(metrics, derived, runs) {
  const insights = [];

  const part = Math.round(derived.participationRate);
  if (part >= 90) insights.push({ type: 'positive', text: `${part}% of staff contributing`, query: 'How many staff are contributing?' });
  else if (part >= 70) insights.push({ type: 'warning', text: `${part}% participation — room to grow`, query: 'How many staff are contributing?' });
  else insights.push({ type: 'negative', text: `${part}% participation — low`, query: 'How many staff are contributing?' });

  const uninsured = (metrics.headcount || 0) - (metrics.insuredCount || 0);
  if (uninsured > 0) insights.push({ type: 'warning', text: `${uninsured} staff without insurance`, query: 'Who is uninsured?' });

  if (metrics.suspended > 0) insights.push({ type: 'warning', text: `${metrics.suspended} suspended`, query: 'Show suspended staff' });

  const latest = runs[0];
  if (latest) insights.push({ type: 'positive', text: `Last run: ${formatUGX(latest.grandTotal)} (${latest.periodLabel})`, query: 'Show the last contribution run' });

  return insights.slice(0, 4);
}

/* ── Gauge (cloned verbatim from BranchHealthScore) ─────────────────────────── */
function ScoreGauge({ score }) {
  const size = 160, cx = 80, cy = 80, r = 62, strokeW = 13;
  const startAngle = 135, sweepAngle = 270;
  const p2c = (a) => { const rad = (a * Math.PI) / 180; return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }; };
  const s = p2c(startAngle), e = p2c(startAngle + sweepAngle);
  const arcPath = `M ${s.x} ${s.y} A ${r} ${r} 0 1 1 ${e.x} ${e.y}`;
  const totalArc = 2 * Math.PI * r * (sweepAngle / 360);
  const gap = totalArc - (score / 100) * totalArc;
  const ticks = [0, 25, 50, 75, 100].map((pct) => {
    const angle = startAngle + (pct / 100) * sweepAngle;
    const inner = p2c(angle);
    const outerR = r + strokeW / 2 + 4;
    const rad = (angle * Math.PI) / 180;
    return { inner, outer: { x: cx + outerR * Math.cos(rad), y: cy + outerR * Math.sin(rad) }, pct };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={styles.gauge}>
      <defs>
        <linearGradient id="empScoreGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--color-alert)" /><stop offset="35%" stopColor="var(--color-amber)" />
          <stop offset="65%" stopColor="var(--color-accent-mint)" /><stop offset="100%" stopColor="var(--color-positive)" />
        </linearGradient>
        <filter id="empGlow"><feGaussianBlur stdDeviation="6" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <path d={arcPath} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={strokeW + 6} strokeLinecap="round" />
      <path d={arcPath} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={strokeW} strokeLinecap="round" />
      {ticks.map((t) => <line key={t.pct} x1={t.inner.x} y1={t.inner.y} x2={t.outer.x} y2={t.outer.y} stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" />)}
      <motion.path d={arcPath} fill="none" stroke="url(#empScoreGrad)" strokeWidth={strokeW} strokeLinecap="round" filter="url(#empGlow)"
        strokeDasharray={totalArc} initial={{ strokeDashoffset: totalArc }} animate={{ strokeDashoffset: gap }}
        transition={{ duration: 1.4, delay: 0.3, ease: EASE_OUT_EXPO }} />
    </svg>
  );
}

/* ── Activity feed ───────────────────────────────────────────────────────────
   Built from the run history (newest-first) + the most recently-enrolled staff.
   Seeded data is MOCK_NOW-anchored, so older items collapse to a short date via
   formatRelativeTime — honest for a demo (no fabricated "5m ago" timestamps). */
function generateActivity(runs, employees) {
  const events = [];

  runs.slice(0, 5).forEach((run) => {
    events.push({
      id: `run-${run.id}`,
      type: 'contribution',
      text: `${run.periodLabel} run · ${formatUGX(run.grandTotal)}`,
      time: run.runAt,
    });
  });

  const recentJoiners = [...employees]
    .filter((e) => e.joinedDate)
    .sort((a, b) => String(b.joinedDate).localeCompare(String(a.joinedDate)))
    .slice(0, 4);
  recentJoiners.forEach((emp) => {
    events.push({
      id: `join-${emp.id}`,
      type: 'registration',
      text: `${emp.name.split(' ')[0]} enrolled · ${emp.jobTitle}`,
      time: emp.joinedDate,
    });
  });

  return events
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 8);
}

/* ── Alerts row ──────────────────────────────────────────────────────────────
   Up to 3 equal buttons; each opens the relevant employer panel. */
function computeAlerts(metrics, runs) {
  const headcount = metrics.headcount || 0;
  const uninsured = Math.max(0, headcount - (metrics.insuredCount || 0));
  const suspended = metrics.suspended || 0;

  // A run is "due" when the latest run isn't in the current calendar month
  // (demo heuristic — the employer funds monthly). Anchored to the real clock.
  const latest = runs[0];
  const now = new Date();
  const runThisMonth =
    latest &&
    new Date(latest.runAt).getMonth() === now.getMonth() &&
    new Date(latest.runAt).getFullYear() === now.getFullYear();
  const runDue = !runThisMonth;

  return [
    {
      value: runDue ? 'Due' : 'On track',
      label: 'Contribution run',
      sub: latest ? `Last: ${latest.periodLabel}` : 'No runs yet',
      severity: runDue ? 'warning' : 'ok',
      action: 'runs',
    },
    {
      value: uninsured,
      label: 'Without insurance',
      sub: 'No active cover',
      severity: uninsured > 0 ? 'alert' : 'ok',
      action: 'insurance',
    },
    {
      value: suspended,
      label: 'Suspended',
      sub: 'Not contributing',
      severity: suspended > 0 ? 'warning' : 'ok',
      action: 'employees',
    },
  ];
}

export default function EmployerHealthScore({ metrics = {}, employees = [], runs = [], employer, user, split = false }) {
  const { employerId } = useEmployerScope();
  const {
    setEmployeesOpen,
    setRunsOpen,
    setInsuranceOpen,
    closeAllPanels,
  } = useEmployerPanel();
  const { addToast } = useToast();

  function openPanel(action) {
    closeAllPanels();
    if (action === 'employees') setEmployeesOpen(true);
    else if (action === 'runs') setRunsOpen(true);
    else if (action === 'insurance') setInsuranceOpen(true);
  }

  const derived = useMemo(() => deriveMetrics(metrics, employees), [metrics, employees]);
  const score = useMemo(() => calcScore(derived), [derived]);
  const events = useMemo(() => generateActivity(runs, employees), [runs, employees]);
  const insights = useMemo(() => generateInsights(metrics, derived, runs), [metrics, derived, runs]);
  const alerts = useMemo(() => computeAlerts(metrics, runs), [metrics, runs]);

  // "This period contributed" — the latest run's grand total + its split.
  const latest = runs[0];
  const thisPeriod = latest?.grandTotal ?? derived.ytdTotal;
  // Change vs the previous run (so the badge reflects period-over-period).
  const prevRun = runs[1];
  const periodChange =
    latest && prevRun && prevRun.grandTotal
      ? Math.round(((latest.grandTotal - prevRun.grandTotal) / prevRun.grandTotal) * 100)
      : 0;

  /* ── Copilot strip (wired to the chat mock, like the branch hero) ── */
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotUserToggled, setCopilotUserToggled] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [chatInputTouched, setChatInputTouched] = useState(false);
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, isTyping]);

  // Auto-open copilot in split view (unless the user took control) — derived
  // during render to avoid setState-in-effect (mirrors BranchHealthScore).
  const [lastSplit, setLastSplit] = useState(split);
  if (split !== lastSplit) {
    setLastSplit(split);
    if (!copilotUserToggled) setCopilotOpen(split);
  }

  function handleSend(text) {
    const msg = text || chatInput.trim();
    if (!msg) return;
    if (!copilotOpen) setCopilotOpen(true);
    setMessages((prev) => [...prev, { role: 'user', text: msg }]);
    setChatInput('');
    setIsTyping(true);
    getChatResponse(msg)
      .then((response) => {
        setTimeout(() => { setIsTyping(false); setMessages((prev) => [...prev, { role: 'assistant', text: response }]); }, 900);
      })
      .catch((err) => {
        setIsTyping(false);
        addToast('error', err?.message || 'Copilot is unavailable — please try again.');
      });
  }

  const companyName = employer?.name || 'Your company';
  const contactName = employer?.contactName || user?.name || 'there';

  return (
    <motion.div
      className={styles.hero}
      data-split={split || undefined}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
    >
      {/* ── Company identity header ── */}
      <div className={styles.heroHeader}>
        <div className={styles.heroId}>
          <span className={styles.heroEyebrow}>Company Overview</span>
          <h1 className={styles.heroBranchName}>{companyName}</h1>
          <span className={styles.heroWelcome}>
            Welcome back, {contactName}
            <span className={styles.heroDot} aria-hidden="true">·</span>
            {formatDate(new Date(), { variant: 'long' })}
          </span>
        </div>
        <div className={styles.heroActions}>
          {/* NotificationBell renders gracefully for role="employer": both the
              mock store and the Supabase `notifications` table have no employer
              recipients yet, so it reads an empty (badge-less) bell rather than
              erroring. See the Phase-2 report for the verification. */}
          {employerId && <NotificationBell role="employer" entityId={employerId} portal tone="onIndigo" />}
          <span className={styles.heroBadge}>
            <span className={styles.heroBadgeDot} aria-hidden="true" />
            Employer
          </span>
        </div>
      </div>

      {/* ── Top section: Score + Metrics + Activity ── */}
      <div className={styles.topGrid}>
        {/* Col 1: Participation score */}
        <div className={styles.scoreSection}>
          <div className={styles.gaugeWrap}>
            <ScoreGauge score={score} />
            <div className={styles.scoreCenter}>
              <motion.span className={styles.scoreNumber}
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.8, ease: EASE_OUT_EXPO }}>
                {score}
              </motion.span>
              <span className={styles.scoreQuality}>{scoreLabel(score)}</span>
            </div>
          </div>
          <span className={styles.scoreLabel}>Scheme Health</span>
          <div className={styles.rankBadge}>
            <span className={styles.rankNumber}>{Math.round(derived.participationRate)}%</span>
            <span className={styles.rankOf}>staff enrolled</span>
          </div>
        </div>

        {/* Col 2: Metrics (clickable cards open the matching panel) */}
        <div className={styles.metricsSection}>
          <button type="button" className={`${styles.metricBlock} ${styles.metricCard}`} onClick={() => openPanel('employees')}>
            <span className={styles.metricLabel}>Total Staff Balance</span>
            <span className={styles.metricValue}>{formatUGX(metrics.totalBalance || 0)}</span>
          </button>
          <div className={styles.metricPair}>
            <button type="button" className={`${styles.metricBlock} ${styles.metricCard}`} onClick={() => openPanel('employees')}>
              <span className={styles.metricLabel}>Employees</span>
              <div className={styles.metricRow}>
                <span className={styles.metricValueMd}>{formatNumber(metrics.headcount || 0)}</span>
                <span className={styles.metricSub}>{metrics.active || 0} active</span>
              </div>
            </button>
            <button type="button" className={`${styles.metricBlock} ${styles.metricCard}`} onClick={() => openPanel('runs')}>
              <span className={styles.metricLabel}>This Period</span>
              <div className={styles.metricRow}>
                <span className={styles.metricValueMd}>{formatUGX(thisPeriod)}</span>
                {prevRun && (
                  <span className={styles.changeBadge} data-positive={periodChange >= 0}>
                    <svg aria-hidden="true" viewBox="0 0 10 10" width="8" height="8"><path d={periodChange >= 0 ? 'M5 2l3.5 5H1.5z' : 'M5 8L1.5 3h7z'} fill="currentColor" /></svg>
                    {Math.abs(periodChange)}%
                  </span>
                )}
              </div>
            </button>
          </div>
          <div className={styles.kpiGrid}>
            <button type="button" className={`${styles.kpiItem} ${styles.metricCard}`} onClick={() => openPanel('employees')}>
              <span className={styles.kpiLabel}>Participation</span>
              <div className={styles.kpiRow}>
                <span className={styles.kpiValue}>{Math.round(derived.participationRate)}%</span>
                <div className={styles.kpiBar}><motion.div className={styles.kpiFill} data-variant="teal" initial={{ width: 0 }} animate={{ width: `${derived.participationRate}%` }} transition={{ duration: 0.8, delay: 0.4, ease: EASE_OUT_EXPO }} /></div>
              </div>
            </button>
            <button type="button" className={`${styles.kpiItem} ${styles.metricCard}`} onClick={() => openPanel('employees')}>
              <span className={styles.kpiLabel}>Avg / Employee</span>
              <span className={styles.kpiValue}>{formatUGX(derived.avgBalance)}</span>
            </button>
            <button type="button" className={`${styles.kpiItem} ${styles.metricCard}`} onClick={() => openPanel('runs')}>
              <span className={styles.kpiLabel}>Employer Share</span>
              <div className={styles.kpiRow}>
                <span className={styles.kpiValue}>{Math.round(derived.employerShare)}%</span>
                <div className={styles.kpiBar}><motion.div className={styles.kpiFill} data-variant="indigo" initial={{ width: 0 }} animate={{ width: `${derived.employerShare}%` }} transition={{ duration: 0.8, delay: 0.5, ease: EASE_OUT_EXPO }} /></div>
              </div>
            </button>
          </div>
        </div>

        {/* Col 3: Activity */}
        <div className={styles.activitySection}>
          <div className={styles.activityHeader}>
            <span className={styles.activityTitle}>Today&apos;s Snapshot</span>
            <span className={styles.activityLive} aria-label="Updated just now">
              <span className={styles.liveDot} aria-hidden="true" />
              Updated
            </span>
          </div>
          <div className={styles.activityFeed}>
            {events.length === 0 ? (
              <motion.div
                className={styles.activityEmpty}
                role="status"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.5, ease: EASE_OUT_EXPO }}
              >
                <span className={styles.activityEmptyIllustration} aria-hidden="true">
                  <svg viewBox="0 0 56 32" width="56" height="32" fill="none">
                    <path d="M2 24 Q10 14 18 22 T34 18 T54 22" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.45" />
                    <circle cx="14" cy="20" r="1.5" fill="currentColor" opacity="0.65" />
                    <circle cx="28" cy="16" r="1.5" fill="currentColor" opacity="0.5" />
                    <circle cx="44" cy="20" r="1.5" fill="currentColor" opacity="0.4" />
                  </svg>
                </span>
                <span className={styles.activityEmptyTitle}>No activity yet</span>
                <span className={styles.activityEmptySub}>
                  Enrolments and contribution runs will appear here as they happen.
                </span>
              </motion.div>
            ) : (
              events.map((event, i) => (
                <motion.div key={event.id} className={styles.activityItem}
                  initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.6 + i * 0.05, ease: EASE_OUT_EXPO }}>
                  <span className={styles.activityDot} data-type={event.type} />
                  <div className={styles.activityContent}>
                    <span className={styles.activityText}>{event.text}</span>
                    <span className={styles.activityTime}>{formatRelativeTime(event.time)}</span>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Alerts row ── */}
      <div className={styles.heroAlerts}>
        {alerts.map((alert, i) => (
          <motion.button
            key={alert.label}
            type="button"
            className={styles.heroAlert}
            data-severity={alert.severity}
            onClick={() => openPanel(alert.action)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 + i * 0.05, ease: EASE_OUT_EXPO }}
          >
            <span className={styles.heroAlertAccent} aria-hidden="true" />
            <span className={styles.heroAlertValue}>{alert.value}</span>
            <div className={styles.heroAlertText}>
              <span className={styles.heroAlertLabel}>{alert.label}</span>
              <span className={styles.heroAlertSub}>{alert.sub}</span>
            </div>
            <svg className={styles.heroAlertChevron} aria-hidden="true" viewBox="0 0 12 12" width="10" height="10">
              <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </motion.button>
        ))}
      </div>

      {/* ── Copilot strip ── */}
      <div className={styles.copilotStrip}>
        <button
          className={styles.copilotToggle}
          onClick={() => { setCopilotOpen(!copilotOpen); setCopilotUserToggled(true); }}
          aria-expanded={copilotOpen}
        >
          <div className={styles.copilotLeft}>
            <span className={styles.copilotDot} />
            <span className={styles.copilotTitle}>Employer Copilot</span>
            {!copilotOpen && (
              <div className={styles.insightChips}>
                {insights.map((ins, i) => (
                  <span key={i} className={styles.chip} data-type={ins.type}>
                    <span className={styles.chipDot} data-type={ins.type} />
                    {ins.text}
                  </span>
                ))}
              </div>
            )}
          </div>
          <svg aria-hidden="true" className={styles.copilotChevron} data-open={copilotOpen} viewBox="0 0 14 14" width="14" height="14" fill="none">
            <path d="M4 5.5l3 3 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <AnimatePresence initial={false}>
          {copilotOpen && (
            <motion.div
              className={styles.copilotBody}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
            >
              <div className={styles.copilotGrid}>
                {/* Left: clickable insights */}
                <div className={styles.copilotInsights}>
                  {insights.map((ins, i) => (
                    <button key={i} className={styles.insightBtn} data-type={ins.type} onClick={() => handleSend(ins.query)}>
                      <span className={styles.insightBtnDot} data-type={ins.type} />
                      <span className={styles.insightBtnText}>{ins.text}</span>
                      <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" className={styles.insightBtnArrow}>
                        <path d="M4.5 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                      </svg>
                    </button>
                  ))}
                  <div className={styles.quickRow}>
                    {['Staff balance?', 'Funding split?', 'Who is uninsured?'].map((q) => (
                      <button key={q} className={styles.quickPill} onClick={() => handleSend(q)}>{q}</button>
                    ))}
                  </div>
                </div>

                {/* Right: chat */}
                <div className={styles.copilotChat}>
                  <div className={styles.chatMessages} ref={chatRef}>
                    {messages.length === 0 && !isTyping && (
                      <div className={styles.chatEmpty}>
                        <span className={styles.chatEmptyText}>Click an insight or ask a question</span>
                      </div>
                    )}
                    {messages.map((m, i) => (
                      <div key={i} className={styles.chatMsg} data-role={m.role}>
                        {m.role === 'assistant' && (
                          <div className={styles.chatAvatar}>
                            <svg aria-hidden="true" viewBox="0 0 16 16" width="10" height="10" fill="none">
                              <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
                              <path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                          </div>
                        )}
                        <div className={styles.chatBubble} data-role={m.role}>{m.text}</div>
                      </div>
                    ))}
                    {isTyping && (
                      <div className={styles.chatMsg} data-role="assistant">
                        <div className={styles.chatAvatar}>
                          <svg aria-hidden="true" viewBox="0 0 16 16" width="10" height="10" fill="none">
                            <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </div>
                        <div className={styles.chatBubble} data-role="assistant"><span className={styles.typingDots}><span /><span /><span /></span></div>
                      </div>
                    )}
                  </div>
                  <div className={styles.chatInputRow}>
                    <motion.div
                      className={styles.chatFieldPulse}
                      animate={chatInputTouched ? {
                        boxShadow: '0 0 0 0 rgba(94,99,168,0)',
                        borderColor: 'rgba(94,99,168,0)',
                      } : {
                        boxShadow: [
                          '0 0 0 0 rgba(94,99,168,0)',
                          '0 0 0 6px rgba(94,99,168,0.55)',
                          '0 0 0 0 rgba(94,99,168,0)',
                        ],
                        borderColor: [
                          'rgba(94,99,168,0)',
                          'rgba(148,155,220,0.9)',
                          'rgba(94,99,168,0)',
                        ],
                      }}
                      transition={chatInputTouched ? { duration: 0.3 } : {
                        duration: 1.8,
                        repeat: Infinity,
                        repeatDelay: 1.0,
                        delay: 0.5,
                        ease: 'easeOut',
                      }}
                    >
                      <input className={styles.chatField} value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                        onFocus={() => setChatInputTouched(true)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
                        placeholder="Ask about your staff…" aria-label="Chat message" name="copilot" autoComplete="off" />
                    </motion.div>
                    <button className={styles.chatSend} onClick={() => handleSend()} disabled={!chatInput.trim()} aria-label="Send">
                      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="14" height="14"><path d="M2 8l12-6-6 12V8H2z" fill="currentColor"/></svg>
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
