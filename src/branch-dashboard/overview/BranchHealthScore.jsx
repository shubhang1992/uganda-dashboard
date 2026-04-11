import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatUGX, fmtShort, EASE_OUT_EXPO } from '../../utils/finance';
import { getChatResponse } from '../../services/chat';
import styles from './BranchHealthScore.module.css';

/* ── Derived metrics ── */
function deriveMetrics(metrics, agents) {
  const totalSubs = metrics.totalSubscribers || 0;
  const activeSubs = metrics.activeSubscribers || 0;
  const retentionRate = totalSubs > 0 ? (activeSubs / totalSubs) * 100 : 0;
  const totalContrib = agents.reduce((s, a) => s + (a.metrics?.totalContributions || 0), 0);
  const avgPerSub = totalSubs > 0 ? totalContrib / totalSubs : 0;
  const mc = metrics.monthlyContributions || [];
  let growthSum = 0, growthCount = 0;
  for (let i = 1; i < mc.length; i++) {
    if (mc[i - 1] > 0) { growthSum += ((mc[i] - mc[i - 1]) / mc[i - 1]) * 100; growthCount++; }
  }
  const avgMonthlyGrowth = growthCount > 0 ? growthSum / growthCount : 0;
  const totalAgents = agents.length || 1;
  const activeAgents = agents.filter(a => a.status === 'active').length;
  const agentActivity = (activeAgents / totalAgents) * 100;
  return { retentionRate, avgPerSub, avgMonthlyGrowth, agentActivity, activeAgents };
}

/* ── Score ── */
function calcScore(derived) {
  const { retentionRate, avgPerSub, avgMonthlyGrowth, agentActivity } = derived;
  const avgContribScore = Math.min(100, (avgPerSub / 500_000) * 100);
  const growthScore = Math.min(100, Math.max(0, (avgMonthlyGrowth / 5) * 50 + 50));
  const total = Math.round(retentionRate * 0.30 + avgContribScore * 0.25 + agentActivity * 0.25 + growthScore * 0.20);
  return {
    total: Math.min(100, Math.max(0, total)),
    breakdown: [
      { label: 'Retention', value: Math.round(retentionRate), color: '#4ADE80' },
      { label: 'Avg Contrib', value: Math.round(avgContribScore), color: '#818CF8' },
      { label: 'Agents', value: Math.round(agentActivity), color: '#2DD4BF' },
      { label: 'Growth', value: Math.round(growthScore), color: '#FBBF24' },
    ],
  };
}

function scoreLabel(s) {
  if (s >= 85) return 'Excellent';
  if (s >= 70) return 'Good';
  if (s >= 50) return 'Fair';
  return 'Needs Attention';
}

/* ── Insights ── */
function generateInsights(metrics, agents) {
  const insights = [];
  if (agents.length > 1) {
    const sorted = [...agents].sort((a, b) => (b.metrics?.totalContributions || 0) - (a.metrics?.totalContributions || 0));
    const top = sorted[0];
    const avg = agents.reduce((s, a) => s + (a.metrics?.totalContributions || 0), 0) / agents.length;
    if (avg > 0 && (top.metrics?.totalContributions || 0) / avg >= 1.3) {
      insights.push({ type: 'positive', text: `${top.name.split(' ')[0]} leads with ${((top.metrics?.totalContributions || 0) / avg).toFixed(1)}x avg`, query: 'Top agents?' });
    }
  }
  const ar = metrics.activeRate || 0;
  if (ar >= 75) insights.push({ type: 'positive', text: `${Math.round(ar)}% retention — strong`, query: 'Active subscribers?' });
  else if (ar >= 50) insights.push({ type: 'warning', text: `${Math.round(ar)}% retention — needs work`, query: 'Active subscribers?' });
  else insights.push({ type: 'negative', text: `${Math.round(ar)}% retention — critical`, query: 'Active subscribers?' });

  const inactive = agents.filter(a => a.status === 'inactive');
  if (inactive.length > 0) insights.push({ type: 'warning', text: `${inactive.length} agent${inactive.length > 1 ? 's' : ''} inactive`, query: 'Top agents?' });

  const mc = metrics.monthlyContributions || [];
  const curr = mc[11] || 0, prev = mc[10] || 0;
  if (prev > 0) {
    const pct = Math.round(((curr - prev) / prev) * 100);
    if (Math.abs(pct) > 3) insights.push({ type: pct > 0 ? 'positive' : 'negative', text: `Collections ${pct > 0 ? '+' : ''}${pct}% MoM`, query: 'Show monthly trend' });
  }
  return insights.slice(0, 4);
}

/* ── Gauge ── */
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
        <linearGradient id="scoreGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#F87171" /><stop offset="35%" stopColor="#FBBF24" />
          <stop offset="65%" stopColor="#2DD4BF" /><stop offset="100%" stopColor="#4ADE80" />
        </linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="6" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <path d={arcPath} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={strokeW + 6} strokeLinecap="round" />
      <path d={arcPath} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={strokeW} strokeLinecap="round" />
      {ticks.map((t) => <line key={t.pct} x1={t.inner.x} y1={t.inner.y} x2={t.outer.x} y2={t.outer.y} stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" />)}
      <motion.path d={arcPath} fill="none" stroke="url(#scoreGrad)" strokeWidth={strokeW} strokeLinecap="round" filter="url(#glow)"
        strokeDasharray={totalArc} initial={{ strokeDashoffset: totalArc }} animate={{ strokeDashoffset: gap }}
        transition={{ duration: 1.4, delay: 0.3, ease: EASE_OUT_EXPO }} />
    </svg>
  );
}

function BreakdownBar({ label, value, color }) {
  return (
    <div className={styles.breakdownItem}>
      <div className={styles.breakdownHeader}>
        <span className={styles.breakdownDot} style={{ background: color }} />
        <span className={styles.breakdownLabel}>{label}</span>
        <span className={styles.breakdownValue}>{value}</span>
      </div>
      <div className={styles.breakdownTrack}>
        <motion.div className={styles.breakdownFill} style={{ background: color }}
          initial={{ width: 0 }} animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, delay: 0.5, ease: EASE_OUT_EXPO }} />
      </div>
    </div>
  );
}

/* ── Activity ── */
function generateActivity(agents) {
  const events = []; const now = Date.now();
  agents.forEach((agent) => {
    const m = agent.metrics || {};
    for (let i = 0; i < Math.min(m.newSubscribersToday || 0, 2); i++)
      events.push({ id: `reg-${agent.id}-${i}`, type: 'registration', text: `New subscriber via ${agent.name.split(' ')[0]}`, time: now - Math.random() * 8 * 3600_000 });
    if ((m.dailyContributions || 0) > 0)
      events.push({ id: `contrib-${agent.id}`, type: 'contribution', text: `${agent.name.split(' ')[0]} collected ${formatUGX(m.dailyContributions)}`, time: now - Math.random() * 10 * 3600_000 });
  });
  return events.sort((a, b) => b.time - a.time).slice(0, 8);
}

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return 'now'; if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function formatBranchDate() {
  return new Date().toLocaleDateString('en-UG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function computeAlerts(metrics, commissionSummary) {
  const totalSubs = metrics.totalSubscribers || 0;
  const activeSubs = metrics.activeSubscribers || 0;
  const dormant = totalSubs - activeSubs;
  const kycIssues = (metrics.kycPending || 0) + (metrics.kycIncomplete || 0);
  const settlementRate = commissionSummary?.settlementRate || 0;
  const mc = metrics.monthlyContributions || [];
  const declining = mc.length >= 2 && mc[11] < mc[10]
    ? Math.round(((mc[10] - mc[11]) / (mc[10] || 1)) * totalSubs * 0.3)
    : 0;
  return [
    { value: dormant, label: 'Dormant', sub: 'Not contributing', severity: dormant > 0 ? 'warning' : 'ok' },
    { value: kycIssues, label: 'KYC Issues', sub: 'Pending or incomplete', severity: kycIssues > 0 ? 'alert' : 'ok' },
    { value: `${Math.round(settlementRate)}%`, label: 'Settled', sub: 'Commission rate', severity: 'neutral' },
    { value: declining, label: 'Declining', sub: 'Contribution dropping', severity: declining > 0 ? 'warning' : 'ok' },
  ];
}

export default function BranchHealthScore({ metrics, agents, branch, user, commissionSummary, split = false }) {
  const alerts = useMemo(() => computeAlerts(metrics, commissionSummary), [metrics, commissionSummary]);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatRef = useRef(null);

  const derived = useMemo(() => deriveMetrics(metrics, agents), [metrics, agents]);
  const score = useMemo(() => calcScore(derived), [derived]);
  const events = useMemo(() => generateActivity(agents), [agents]);
  const insights = useMemo(() => generateInsights(metrics, agents), [metrics, agents]);

  const mc = metrics.monthlyContributions || [];
  const currMonth = mc[11] || 0, prevMonth = mc[10] || 0;
  const contribChange = prevMonth ? Math.round(((currMonth - prevMonth) / prevMonth) * 100) : 0;

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, isTyping]);

  // Auto-open copilot when entering split view, collapse when leaving
  useEffect(() => {
    setCopilotOpen(split);
  }, [split]);

  function handleSend(text) {
    const msg = text || chatInput.trim();
    if (!msg) return;
    if (!copilotOpen) setCopilotOpen(true);
    setMessages((prev) => [...prev, { role: 'user', text: msg }]);
    setChatInput('');
    setIsTyping(true);
    getChatResponse(msg).then((response) => {
      setTimeout(() => { setIsTyping(false); setMessages((prev) => [...prev, { role: 'assistant', text: response }]); }, 900);
    });
  }

  return (
    <motion.div
      className={styles.hero}
      data-split={split || undefined}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
    >
      {/* ── Branch identity header ── */}
      <div className={styles.heroHeader}>
        <div className={styles.heroId}>
          <span className={styles.heroEyebrow}>Branch Overview</span>
          <h1 className={styles.heroBranchName}>{branch?.name}</h1>
          <span className={styles.heroWelcome}>
            Welcome back, {user?.name || 'Branch Admin'}
            <span className={styles.heroDot} aria-hidden="true">·</span>
            {formatBranchDate()}
          </span>
        </div>
        <span className={styles.heroBadge}>
          <span className={styles.heroBadgeDot} aria-hidden="true" />
          Branch Admin
        </span>
      </div>

      {/* ── Top section: Score + Metrics + Activity ── */}
      <div className={styles.topGrid}>
        {/* Col 1: Score */}
        <div className={styles.scoreSection}>
          <div className={styles.gaugeWrap}>
            <ScoreGauge score={branch?.score ?? score.total} />
            <div className={styles.scoreCenter}>
              <motion.span className={styles.scoreNumber}
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.8, ease: EASE_OUT_EXPO }}>
                {branch?.score ?? score.total}
              </motion.span>
              <span className={styles.scoreQuality}>{scoreLabel(branch?.score ?? score.total)}</span>
            </div>
          </div>
          <span className={styles.scoreLabel}>Branch Score</span>
          {branch?.districtRank && (
            <div className={styles.rankBadge}>
              <span className={styles.rankNumber}>#{branch.districtRank}</span>
              <span className={styles.rankOf}>of {branch.districtBranchCount} in district</span>
            </div>
          )}
          <div className={styles.breakdownGrid}>
            {score.breakdown.map((b) => <BreakdownBar key={b.label} {...b} />)}
          </div>
        </div>

        {/* Col 2: Metrics */}
        <div className={styles.metricsSection}>
          <div className={styles.metricBlock}>
            <span className={styles.metricLabel}>Assets Under Management</span>
            <span className={styles.metricValue}>{formatUGX(metrics.aum || 0)}</span>
          </div>
          <div className={styles.metricDivider} />
          <div className={styles.metricPair}>
            <div className={styles.metricBlock}>
              <span className={styles.metricLabel}>Subscribers</span>
              <div className={styles.metricRow}>
                <span className={styles.metricValueMd}>{(metrics.totalSubscribers || 0).toLocaleString()}</span>
                <span className={styles.metricSub}>{metrics.activeSubscribers || 0} active</span>
              </div>
            </div>
            <div className={styles.metricBlock}>
              <span className={styles.metricLabel}>Agents</span>
              <div className={styles.metricRow}>
                <span className={styles.metricValueMd}>{agents.length}</span>
                <span className={styles.metricSub}>{derived.activeAgents} active</span>
              </div>
            </div>
          </div>
          <div className={styles.metricDivider} />
          <div className={styles.metricBlock}>
            <span className={styles.metricLabel}>This Month</span>
            <div className={styles.metricRow}>
              <span className={styles.metricValueMd}>{formatUGX(currMonth)}</span>
              <span className={styles.changeBadge} data-positive={contribChange >= 0}>
                <svg aria-hidden="true" viewBox="0 0 10 10" width="8" height="8"><path d={contribChange >= 0 ? 'M5 2l3.5 5H1.5z' : 'M5 8L1.5 3h7z'} fill="currentColor" /></svg>
                {Math.abs(contribChange)}%
              </span>
            </div>
          </div>
          <div className={styles.metricDivider} />
          <div className={styles.kpiGrid}>
            <div className={styles.kpiItem}>
              <span className={styles.kpiLabel}>Retention</span>
              <div className={styles.kpiRow}>
                <span className={styles.kpiValue}>{Math.round(derived.retentionRate)}%</span>
                <div className={styles.kpiBar}><motion.div className={styles.kpiFill} data-variant="teal" initial={{ width: 0 }} animate={{ width: `${derived.retentionRate}%` }} transition={{ duration: 0.8, delay: 0.4, ease: EASE_OUT_EXPO }} /></div>
              </div>
            </div>
            <div className={styles.kpiItem}>
              <span className={styles.kpiLabel}>Avg / Subscriber</span>
              <span className={styles.kpiValue}>{formatUGX(derived.avgPerSub)}</span>
            </div>
            <div className={styles.kpiItem}>
              <span className={styles.kpiLabel}>Monthly Growth</span>
              <span className={styles.kpiValue} data-positive={derived.avgMonthlyGrowth >= 0}>{derived.avgMonthlyGrowth >= 0 ? '+' : ''}{derived.avgMonthlyGrowth.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* Col 3: Activity */}
        <div className={styles.activitySection}>
          <div className={styles.activityHeader}>
            <span className={styles.activityTitle}>Recent Activity</span>
            <span className={styles.activityLive}><span className={styles.liveDot} />Live</span>
          </div>
          <div className={styles.activityFeed}>
            {events.map((event, i) => (
              <motion.div key={event.id} className={styles.activityItem}
                initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.6 + i * 0.05, ease: EASE_OUT_EXPO }}>
                <span className={styles.activityDot} data-type={event.type} />
                <div className={styles.activityContent}>
                  <span className={styles.activityText}>{event.text}</span>
                  <span className={styles.activityTime}>{timeAgo(event.time)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Branch alerts row ── */}
      <div className={styles.heroAlerts}>
        {alerts.map((alert, i) => (
          <motion.div
            key={alert.label}
            className={styles.heroAlert}
            data-severity={alert.severity}
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
          </motion.div>
        ))}
      </div>

      {/* ── Copilot strip (collapsed = insight highlights, expanded = full chat) ── */}
      <div className={styles.copilotStrip}>
        <button className={styles.copilotToggle} onClick={() => setCopilotOpen(!copilotOpen)} aria-expanded={copilotOpen}>
          <div className={styles.copilotLeft}>
            <span className={styles.copilotDot} />
            <span className={styles.copilotTitle}>Branch Copilot</span>
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
                    {['Top agents?', 'Gender split?', 'Monthly trend?'].map((q) => (
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
                    <input className={styles.chatField} value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
                      placeholder="Ask about your branch\u2026" aria-label="Chat message" name="copilot" autoComplete="off" />
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
