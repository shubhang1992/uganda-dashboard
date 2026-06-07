// Employer hero banner — the Overview centerpiece. Originally cloned from
// `branch-dashboard/overview/BranchHealthScore.jsx` (indigo dome, alerts row +
// Copilot strip + split-mode reflow), then reframed for the employer role.
//
// An employer is a FUNDER, not a saver, so the hero leads with money put in +
// people covered rather than a subscriber-style health gauge:
//   * Centrepiece — total contributions to date + a mini bar-trend of recent
//     runs' grand totals (replaces the old participation gauge). The column
//     where the gauge sat is now an empty slot reserved for a later
//     leaderboard chip (a separate phase owns that).
//   * Funder tiles — this month's contribution (newest run + delta vs prior),
//     staff funded, avg contribution / employee, and run cadence.
//   * Metric tiles / alerts open the employer slide-in panels (employees /
//     runs / insurance) via `useEmployerPanel`, not the branch report hub.
//   * Activity feed is built from the contribution-run history + most-recent
//     enrolments (the employer has no agent leaderboard).
//
// Data arrives via the employer hooks (employees / runs / metrics) — this
// component never imports `employerSeed` directly (CLAUDE.md §4.1).

import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../../utils/motion';

import { formatUGX, formatNumber } from '../../utils/currency';
import { formatDate, formatRelativeTime } from '../../utils/date';
import { getChatResponse } from '../../services/chat';
import { useToast } from '../../contexts/ToastContext';
import { useEmployerScope } from '../../contexts/EmployerScopeContext';
import { useEmployerPanel } from '../../contexts/EmployerPanelContext';
import NotificationBell from '../../components/notifications/NotificationBell';
import styles from './EmployerHealthScore.module.css';

/* ── Derived metrics ─────────────────────────────────────────────────────────
   The funder hero leads with money + people, so the only derivations it needs
   are the staff-funded counts and the average contribution per head. The one
   subscriber-style figure still computed here is `participationRate`, used
   solely by the Copilot strip's insight (a deliberate carry-over — the strip is
   kept verbatim); none of the hero tiles surface it any longer. */
function deriveMetrics(metrics, employees) {
  const headcount = metrics.headcount || employees.length || 0;
  const active = metrics.active || 0;
  const totalContributions = metrics.totalContributions || 0;
  // Average contribution per head across the whole roster (funder lens), guarded
  // against a divide-by-zero on an empty company.
  const avgContribution = headcount > 0 ? totalContributions / headcount : 0;

  // "Participating" = active staff whose contribution config funds a non-zero
  // amount (an active employer-only or co-contribution member). Suspended staff
  // and zero-config rows don't count. Consumed only by the Copilot strip.
  const contributing = employees.filter(
    (e) => e.status === 'active' && contributesSomething(e),
  ).length;
  const participationRate = headcount > 0 ? (contributing / headcount) * 100 : 0;

  return {
    headcount,
    active,
    avgContribution,
    participationRate,
  };
}

/** A member "contributes" if they have a non-zero own monthly saving. */
function contributesSomething(emp) {
  return Number(emp.monthlyContribution ?? 0) > 0;
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

/* ── Mini bar-trend (centrepiece) ────────────────────────────────────────────
   A compact column chart of the most recent runs' grand totals, oldest → newest
   so the eye reads left-to-right toward the latest run. Mirrors the
   EmployerOperations bar idiom (track + indigo→teal gradient fill, Framer
   animate-in) but as vertical columns sized for the dark indigo hero. Each
   column's height is proportional to its grandTotal vs the window max. */
function MiniBarTrend({ runs }) {
  // Last 6 runs, flipped to chronological order (runs arrive newest-first).
  const series = useMemo(() => runs.slice(0, 6).reverse(), [runs]);
  const max = useMemo(
    () => series.reduce((m, r) => Math.max(m, r.grandTotal || 0), 0) || 1,
    [series],
  );

  if (series.length === 0) return null;

  return (
    <div className={styles.trend} role="img" aria-label={`Recent contribution runs — ${series.length} runs`}>
      {series.map((run, i) => {
        const pct = Math.max(((run.grandTotal || 0) / max) * 100, 4);
        const isLatest = i === series.length - 1;
        return (
          <div key={run.id} className={styles.trendCol}>
            <div className={styles.trendTrack}>
              <motion.div
                className={styles.trendFill}
                data-latest={isLatest || undefined}
                initial={{ height: 0 }}
                animate={{ height: `${pct}%` }}
                transition={{ duration: 0.7, delay: 0.3 + i * 0.06, ease: EASE_OUT_EXPO }}
              />
            </div>
            <span className={styles.trendLabel}>{run.periodLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Leaderboard chip (col 1) ────────────────────────────────────────────────
   Fills the slot the participation gauge vacated. A funder cares where their
   monthly contribution ranks against peers, so the column leads with the
   employer's own rank ("You're #3 of 12 this month") + a compact strip of the
   ranks immediately around them (and #1, for context). Fed by
   `getEmployerLeaderboard` — already sorted best-first with 1-based ranks; this
   component is pure presentation. Empty leaderboard → renders nothing so the
   slot stays clean. */
function LeaderboardChip({ leaderboard }) {
  // The employer's own row anchors everything (rank chip + which strip rows to
  // show). Bail out cleanly if the data isn't ready or "you" is missing.
  const you = useMemo(() => leaderboard.find((e) => e.isYou), [leaderboard]);

  // The few rows worth showing in the ~160px column: #1 (the leader, for
  // aspiration) plus the immediate neighbours around "you" (above / you / below).
  // De-duped + re-sorted by rank so #1 never doubles up when you're near the top.
  const strip = useMemo(() => {
    if (!you) return [];
    const byRank = new Map(leaderboard.map((e) => [e.rank, e]));
    const wanted = new Set([1, you.rank - 1, you.rank, you.rank + 1]);
    return [...wanted]
      .map((r) => byRank.get(r))
      .filter(Boolean)
      .sort((a, b) => a.rank - b.rank);
  }, [leaderboard, you]);

  if (!you) return null;

  const total = leaderboard.length;
  const delta = you.deltaRanks || 0;

  return (
    <motion.div
      className={styles.leaderboard}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2, ease: EASE_OUT_EXPO }}
      aria-label={`You're ranked number ${you.rank} of ${total} by this month's contribution`}
    >
      <div className={styles.leaderHead}>
        <span className={styles.leaderEyebrow}>Monthly leaderboard</span>
        <div className={styles.leaderRankRow}>
          <span className={styles.leaderRank}>#{you.rank}</span>
          {delta > 0 && (
            <span className={styles.leaderDelta} aria-label={`Up ${delta} ${delta === 1 ? 'place' : 'places'}`}>
              <span aria-hidden="true">▲</span>{delta}
            </span>
          )}
        </div>
        <span className={styles.leaderSub}>of {formatNumber(total)} this month</span>
      </div>

      <ul className={styles.leaderStrip} aria-label="Nearby ranks">
        {strip.map((row, i) => (
          <motion.li
            key={row.rank}
            className={styles.leaderRow}
            data-you={row.isYou || undefined}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.35 + i * 0.06, ease: EASE_OUT_EXPO }}
          >
            <span className={styles.leaderRowRank}>{row.rank}</span>
            <span className={styles.leaderRowName}>
              {row.isYou ? 'You' : row.name}
            </span>
            <span className={styles.leaderRowTotal}>{formatUGX(row.monthlyTotal, { compact: true })}</span>
          </motion.li>
        ))}
      </ul>
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

export default function EmployerHealthScore({ metrics = {}, employees = [], runs = [], leaderboard = [], employer, user, split = false }) {
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
  const events = useMemo(() => generateActivity(runs, employees), [runs, employees]);
  const insights = useMemo(() => generateInsights(metrics, derived, runs), [metrics, derived, runs]);
  const alerts = useMemo(() => computeAlerts(metrics, runs), [metrics, runs]);

  // ── Centrepiece: total contributions to date + the run window it spans ──
  const totalContributions = metrics.totalContributions || 0;
  // Oldest run = last element (runs arrive newest-first); its month anchors the
  // "since …" sublabel. Guarded against empty runs.
  const oldestRun = runs.length ? runs[runs.length - 1] : null;
  const sinceLabel = oldestRun
    ? formatDate(oldestRun.runAt, { variant: 'short-month-year' })
    : null;

  // ── This month's contribution ──
  // Key off the NEWEST run, not a calendar-month lookup: the seed runs predate
  // the real clock, so a literal "is this run in the current month?" check would
  // read zero. The latest run IS "this month's" contribution for the demo.
  const latest = runs[0];
  const prevRun = runs[1];
  const thisMonth = latest?.grandTotal ?? 0;
  // Signed delta vs the prior run (period-over-period); omitted when no prior.
  const monthDelta =
    latest && prevRun && prevRun.grandTotal
      ? Math.round(((latest.grandTotal - prevRun.grandTotal) / prevRun.grandTotal) * 100)
      : null;

  // ── Run cadence ── employer.payrollCadence is 'monthly', so the next run is
  // one month after the last. Guarded for an employer with no runs yet.
  const lastRunAt = latest?.runAt ?? null;
  const nextRunLabel = lastRunAt
    ? formatDate(
        new Date(new Date(lastRunAt).getFullYear(), new Date(lastRunAt).getMonth() + 1, 1),
        { variant: 'short-month-year' },
      )
    : null;

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

      {/* ── Top section: Leaderboard slot + Funding centrepiece + Activity ── */}
      <div className={styles.topGrid}>
        {/* Col 1: the monthly-contributions leaderboard chip. Replaces the
            participation gauge removed earlier (an employer is a funder, not a
            saver). Renders nothing when the leaderboard hasn't loaded, keeping
            the slot clean while preserving the three-column rhythm. */}
        <div className={styles.leaderSlot}>
          {leaderboard.length > 0 && <LeaderboardChip leaderboard={leaderboard} />}
        </div>

        {/* Col 2: Funding centrepiece + funder tiles (cards open the matching panel) */}
        <div className={styles.metricsSection}>
          {/* Centrepiece — total contributions to date + mini bar-trend */}
          <button type="button" className={`${styles.centrepiece} ${styles.metricCard}`} onClick={() => openPanel('runs')}>
            <span className={styles.metricLabel}>Total contributions to date</span>
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
            <MiniBarTrend runs={runs} />
          </button>

          {/* Funder tiles */}
          <div className={styles.tileGrid}>
            <button type="button" className={`${styles.metricBlock} ${styles.metricCard}`} onClick={() => openPanel('runs')}>
              <span className={styles.metricLabel}>This month&apos;s contribution</span>
              <div className={styles.metricRow}>
                <span className={styles.metricValueMd}>{formatUGX(thisMonth)}</span>
                {monthDelta != null && (
                  <span className={styles.changeBadge} data-positive={monthDelta >= 0}>
                    <svg aria-hidden="true" viewBox="0 0 10 10" width="8" height="8"><path d={monthDelta >= 0 ? 'M5 2l3.5 5H1.5z' : 'M5 8L1.5 3h7z'} fill="currentColor" /></svg>
                    {Math.abs(monthDelta)}%
                  </span>
                )}
              </div>
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
            <button type="button" className={`${styles.metricBlock} ${styles.metricCard}`} onClick={() => openPanel('runs')}>
              <span className={styles.metricLabel}>Run cadence</span>
              {latest ? (
                <>
                  <span className={styles.metricValueSm}>
                    Last run {formatDate(latest.runAt)}
                    <span className={styles.metricInlineDot} aria-hidden="true">·</span>
                    {formatRelativeTime(latest.runAt)}
                  </span>
                  {nextRunLabel && <span className={styles.metricSub}>Next ~{nextRunLabel}</span>}
                </>
              ) : (
                <span className={styles.metricValueSm}>No runs yet</span>
              )}
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
