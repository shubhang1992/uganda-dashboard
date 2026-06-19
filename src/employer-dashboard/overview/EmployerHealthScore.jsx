// Employer hero banner — the Overview centerpiece. Originally cloned from
// `branch-dashboard/overview/BranchHealthScore.jsx` (indigo dome, alerts row +
// Copilot strip + split-mode reflow), then reframed for the employer role.
//
// An employer is a FUNDER, not a saver, so the hero leads with money put in +
// people covered rather than a subscriber-style health gauge:
//   * Centrepiece — total contributions to date (a single clean hero figure).
//   * Monthly standing — col 1 hosts the employer's league rank among peers,
//     rendered in the Branch dashboard's score-gauge language (shared ScoreGauge).
//   * Funder tiles — next contribution (newest run amount + due label), staff
//     funded, avg contribution / employee, and pending KYC.
//   * Metric tiles / alerts open the employer slide-in panels (employees /
//     runs / KYC) via `useEmployerPanel`, not the branch report hub.
//   * Recent-activity feed is built from the contribution-run history + most-
//     recent enrolments (the employer has no agent leaderboard).
//
// Data arrives via the employer hooks (employees / runs / metrics) — this
// component never imports `employerSeed` directly (CLAUDE.md §4.1).

import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { formatUGX, formatNumber } from '../../utils/currency';
import { formatDate, formatRelativeTime } from '../../utils/date';
import { getEmployerChatResponse } from '../../services/chat';
import { useToast } from '../../contexts/ToastContext';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import {
  deriveEmployerMetrics,
  buildEmployerCopilotContext,
} from './employerCopilotContext';
import NotificationBell from '../../components/notifications/NotificationBell';
import ScoreGauge from '../../components/ScoreGauge';
import styles from './EmployerHealthScore.module.css';

/* ── Derived metrics ─────────────────────────────────────────────────────────
   The funder hero leads with money + people, so the only derivations it needs
   are the staff-funded counts and the average contribution per head. The one
   subscriber-style figure still computed here is `participationRate`, used
   solely by the Copilot strip's insight. The derivation + the copilot-context
   builder now live in ./employerCopilotContext (shared verbatim with the desktop
   Ask-AI panel) so the two surfaces never drift. */

/* ── Insights (Copilot strip) ───────────────────────────────────────────────── */
function generateInsights(metrics, derived, runs, pendingKyc) {
  const insights = [];

  const part = Math.round(derived.participationRate);
  if (part >= 90) insights.push({ type: 'positive', text: `${part}% of active staff contributing`, query: 'How many staff are contributing?' });
  else if (part >= 70) insights.push({ type: 'warning', text: `${part}% of active staff contributing — room to grow`, query: 'How many staff are contributing?' });
  else insights.push({ type: 'negative', text: `${part}% of active staff contributing — low`, query: 'How many staff are contributing?' });

  if (pendingKyc > 0) insights.push({ type: 'warning', text: `${pendingKyc} awaiting sign-up`, query: 'Who is pending KYC?' });

  if (metrics.suspended > 0) insights.push({ type: 'warning', text: `${metrics.suspended} inactive`, query: 'Show inactive staff' });

  const latest = runs[0];
  if (latest) insights.push({ type: 'positive', text: `Last run: ${formatUGX(latest.grandTotal)} (${latest.periodLabel})`, query: 'Show the last contribution run' });

  return insights.slice(0, 4);
}

/* ── Monthly standing (col 1) ─────────────────────────────────────────────────
   Replaces the peer leaderboard list. A funder cares where their monthly
   contribution ranks against peers — but the raw competitor amounts were noise.
   This mirrors the Branch dashboard's score gauge: the shared radial arc fills to
   the employer's standing (percentile) among peers, the centre shows their rank,
   and a badge below shows this month's movement. Fed by `getEmployerLeaderboard`
   — already sorted best-first with 1-based ranks; pure presentation. Empty
   leaderboard → renders nothing so the slot stays clean. */
function MonthlyStanding({ leaderboard }) {
  // The employer's own row carries the rank + this-month delta. Bail cleanly if
  // the data isn't ready or "you" is missing.
  const you = useMemo(() => leaderboard.find((e) => e.isYou), [leaderboard]);
  if (!you) return null;

  const total = leaderboard.length;
  const delta = you.deltaRanks || 0;
  // Standing percentile drives the arc fill: rank 1 of N → 100%, rank N of N →
  // ~1/N. A higher rank visibly fills more of the gauge.
  const standing = total > 0 ? ((total - you.rank + 1) / total) * 100 : 0;
  const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const moved = Math.abs(delta);
  const deltaText = dir === 'up'
    ? `Up ${moved} this month`
    : dir === 'down'
      ? `Down ${moved} this month`
      : 'Holding steady';

  return (
    <motion.div
      className={styles.standing}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2, ease: EASE_OUT_EXPO }}
      aria-label={`Ranked number ${you.rank} of ${formatNumber(total)} employers by this month's contribution — ${deltaText.toLowerCase()}`}
    >
      <div className={styles.standingGaugeWrap}>
        <ScoreGauge value={standing} size={148} />
        <div className={styles.standingCenter}>
          <motion.span
            className={styles.standingRank}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.8, ease: EASE_OUT_EXPO }}
          >
            #{you.rank}
          </motion.span>
          <span className={styles.standingOf}>of {formatNumber(total)}</span>
        </div>
      </div>
      <span className={styles.standingLabel}>Monthly standing</span>
      <div className={styles.standingDelta} data-dir={dir}>
        {dir !== 'flat' && (
          <span className={styles.standingDeltaIcon} aria-hidden="true">{dir === 'up' ? '▲' : '▼'}</span>
        )}
        <span className={styles.standingDeltaText}>{deltaText}</span>
      </div>
    </motion.div>
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
      text: `${emp.name.split(' ')[0]} enrolled as a member`,
      time: emp.joinedDate,
    });
  });

  return events
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 8);
}

/* ── Alerts row ──────────────────────────────────────────────────────────────
   Up to 3 equal buttons; each opens the relevant employer panel. */
function computeAlerts(metrics, runs, pendingKyc, insCfg) {
  // A run is "due" when the latest run isn't in the current calendar month
  // (demo heuristic — the employer funds monthly). Anchored to the real clock.
  const latest = runs[0];
  const now = new Date();
  const runThisMonth =
    latest &&
    new Date(latest.runAt).getMonth() === now.getMonth() &&
    new Date(latest.runAt).getFullYear() === now.getFullYear();
  const runDue = !runThisMonth;

  // Insurance is company-wide (all-or-nothing): the 3rd tile surfaces the group
  // cover and opens the Insurance panel — there is no per-member "suspended"
  // control for an employer (the member owns their dormant account, not us).
  const cover = Number(insCfg?.groupCoverAmount) || 0;
  const insEnabled = insCfg?.insuranceEnabled ?? cover > 0;

  return [
    {
      value: runDue ? 'Due' : 'On track',
      label: 'Contribution run',
      sub: latest ? `Last: ${latest.periodLabel}` : 'No runs yet',
      severity: runDue ? 'warning' : 'ok',
      action: 'runs',
    },
    {
      value: pendingKyc,
      label: 'Pending KYC',
      sub: pendingKyc > 0 ? 'Awaiting sign-up' : 'No pending invites',
      severity: pendingKyc > 0 ? 'warning' : 'ok',
      action: 'kyc',
    },
    {
      value: insEnabled ? formatUGX(cover, { compact: true }) : 'Off',
      label: 'Insurance',
      sub: insEnabled ? 'Cover per member' : 'Not set up',
      severity: 'neutral',
      action: 'insurance',
    },
  ];
}

export default function EmployerHealthScore({ metrics = {}, employees = [], runs = [], leaderboard = [], pendingInvites = [], employer, user, split = false }) {
  const { employerId } = useEmployerScope();
  const {
    setEmployeesOpen,
    setRunsOpen,
    setKycOpen,
    setInsuranceOpen,
    closeAllPanels,
  } = useEmployerPanel();
  const { addToast } = useToast();

  function openPanel(action) {
    closeAllPanels();
    if (action === 'employees') setEmployeesOpen(true);
    else if (action === 'runs') setRunsOpen(true);
    else if (action === 'kyc') setKycOpen(true);
    else if (action === 'insurance') setInsuranceOpen(true);
  }

  // Pending KYC = people the employer invited who haven't completed sign-up yet
  // (the only real "awaiting verification" data — members who finished signup are
  // always KYC-complete). Drives the hero tile, the Copilot insight, and the panel.
  const pendingKyc = pendingInvites.length;

  const derived = useMemo(() => deriveEmployerMetrics(metrics, employees), [metrics, employees]);
  const events = useMemo(() => generateActivity(runs, employees), [runs, employees]);
  const insights = useMemo(() => generateInsights(metrics, derived, runs, pendingKyc), [metrics, derived, runs, pendingKyc]);
  const alerts = useMemo(() => computeAlerts(metrics, runs, pendingKyc, employer?.defaultContributionConfig), [metrics, runs, pendingKyc, employer]);

  // ── Centrepiece: total contributions to date + the run window it spans ──
  const totalContributions = metrics.totalContributions || 0;
  // Oldest run = last element (runs arrive newest-first); its month anchors the
  // "since …" sublabel. Guarded against empty runs.
  const oldestRun = runs.length ? runs[runs.length - 1] : null;
  const sinceLabel = oldestRun
    ? formatDate(oldestRun.runAt, { variant: 'short-month-year' })
    : null;

  // ── Next contribution amount ──
  // Key off the NEWEST run, not a calendar-month lookup: the seed runs predate
  // the real clock, so a literal "is this run in the current month?" check would
  // read zero. The latest run's total is the forward estimate (the next run
  // re-derives per active member) surfaced as the upcoming contribution.
  const latest = runs[0];
  const thisMonth = latest?.grandTotal ?? 0;

  // ── Next contribution ── employer.payrollCadence is 'monthly', so the next run
  // is one month after the last. Guarded for an employer with no runs yet.
  const lastRunAt = latest?.runAt ?? null;
  const nextRunLabel = lastRunAt
    ? formatDate(
        new Date(new Date(lastRunAt).getFullYear(), new Date(lastRunAt).getMonth() + 1, 1),
        { variant: 'short-month-year' },
      )
    : null;
  // "Due now" when the latest run isn't in the current calendar month — same
  // heuristic the alerts row uses (computeAlerts), surfaced for the hero tile.
  const runDue =
    !latest ||
    new Date(latest.runAt).getMonth() !== new Date().getMonth() ||
    new Date(latest.runAt).getFullYear() !== new Date().getFullYear();

  // Copilot answer context — the employer's OWN figures, fed to the local
  // employer responder so every reply is truthful (no distributor-network noise,
  // and "Who is pending KYC?" resolves against the real pending-invite list).
  const copilotAnswerCtx = useMemo(
    () => buildEmployerCopilotContext({ employer, derived, metrics, pendingKyc, pendingInvites, runs }),
    [employer, derived, metrics, pendingKyc, pendingInvites, runs],
  );

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
    getEmployerChatResponse(msg, copilotAnswerCtx)
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

      {/* ── Top section: Leaderboard slot + Funding centrepiece + Activity ── */}
      <div className={styles.topGrid}>
        {/* Col 1: monthly standing gauge — the employer's rank among peers shown
            in the Branch dashboard's score-gauge language (a funder cares where
            their contribution ranks, not the raw competitor amounts). Renders
            nothing when the leaderboard hasn't loaded, keeping the slot clean
            while preserving the three-column rhythm. */}
        <div className={styles.leaderSlot}>
          {leaderboard.length > 0 && <MonthlyStanding leaderboard={leaderboard} />}
        </div>

        {/* Col 2: Funding centrepiece + funder tiles (cards open the matching panel) */}
        <div className={styles.metricsSection}>
          {/* Centrepiece — total contributions to date */}
          <button type="button" className={`${styles.centrepiece} ${styles.metricCard}`} onClick={() => openPanel('runs')}>
            <span className={styles.metricLabel}>Total contributions to date (employee + employer)</span>
            <motion.span className={styles.centreValue}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3, ease: EASE_OUT_EXPO }}>
              {formatUGX(totalContributions)}
            </motion.span>
            <span className={styles.centreSub}>
              {runs.length > 0
                ? `across ${formatNumber(runs.length)} run${runs.length === 1 ? '' : 's'}${sinceLabel ? ` since ${sinceLabel}` : ''}`
                : 'No contribution runs yet'}
            </span>
          </button>

          {/* Funder tiles */}
          <div className={styles.tileGrid}>
            <button type="button" className={`${styles.metricBlock} ${styles.metricCard}`} onClick={() => openPanel('runs')}>
              <span className={styles.metricLabel}>Next Contribution</span>
              <span className={styles.metricValueMd}>{formatUGX(thisMonth)}</span>
              <span className={styles.metricSub}>{runDue ? 'Due now' : nextRunLabel ? `Due ~${nextRunLabel}` : 'No runs yet'}</span>
            </button>
            <button type="button" className={`${styles.metricBlock} ${styles.metricCard}`} onClick={() => openPanel('employees')}>
              <span className={styles.metricLabel}>Staff</span>
              <div className={styles.metricRow}>
                <span className={styles.metricValueMd}>{formatNumber(derived.active)}</span>
                <span className={styles.metricSub}>of {formatNumber(derived.headcount)}</span>
              </div>
            </button>
            <button type="button" className={`${styles.metricBlock} ${styles.metricCard}`} onClick={() => openPanel('employees')}>
              <span className={styles.metricLabel}>Avg / Employee</span>
              <span className={styles.metricValueMd}>{formatUGX(derived.avgContribution)}</span>
            </button>
            <button type="button" className={`${styles.metricBlock} ${styles.metricCard}`} onClick={() => openPanel('kyc')}>
              <span className={styles.metricLabel}>Pending KYC</span>
              <span className={styles.metricValueMd}>{formatNumber(pendingKyc)}</span>
              <span className={styles.metricSub}>{pendingKyc > 0 ? 'Awaiting sign-up' : 'All onboarded'}</span>
            </button>
          </div>
        </div>

        {/* Col 3: Activity */}
        <div className={styles.activitySection}>
          <div className={styles.activityHeader}>
            <span className={styles.activityTitle}>Recent Activity</span>
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
                    {['Who is pending KYC?', 'Funding split?', 'Group insurance?'].map((q) => (
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
