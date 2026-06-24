/**
 * branchOverviewDerive.js — pure branch-overview derivations, lifted (by copy)
 * from BranchHealthScore.jsx so the DESKTOP Overview page and the desktop Branch
 * Copilot share one truthful source. The mobile hero (BranchHealthScore.jsx)
 * keeps its own identical copy untouched — this module exists so the desktop
 * surfaces never re-implement the score/insight/alert math inconsistently.
 *
 * All inputs come from existing hooks:
 *   - metrics: useEntityMetrics('branch', branchId)
 *   - agents:  useChildren + useChildrenMetrics merged (see BranchOverview.jsx)
 *   - commissionSummary: useEntityCommissionSummary('branch', branchId)
 */

import { formatUGX } from '../../utils/currency';

/* ── Derived metrics (verbatim from BranchHealthScore.deriveMetrics) ── */
export function deriveMetrics(metrics = {}, agents = []) {
  const totalSubs = metrics.totalSubscribers || 0;
  const activeSubs = Math.round(totalSubs * ((metrics.activeRate || 0) / 100));
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
  const activeAgents = agents.filter((a) => a.status === 'active').length;
  const agentActivity = (activeAgents / totalAgents) * 100;
  return {
    totalSubs,
    activeSubs,
    dormant: totalSubs - activeSubs,
    retentionRate,
    avgPerSub,
    avgMonthlyGrowth,
    agentActivity,
    activeAgents,
  };
}

/* ── Score (verbatim from BranchHealthScore.calcScore) ── */
export function calcScore(derived) {
  const { retentionRate, avgPerSub, avgMonthlyGrowth, agentActivity } = derived;
  const avgContribScore = Math.min(100, (avgPerSub / 500_000) * 100);
  const growthScore = Math.min(100, Math.max(0, (avgMonthlyGrowth / 5) * 50 + 50));
  const total = Math.round(
    retentionRate * 0.30 + avgContribScore * 0.25 + agentActivity * 0.25 + growthScore * 0.20,
  );
  return Math.min(100, Math.max(0, total));
}

export function scoreLabel(s) {
  if (s >= 85) return 'Excellent';
  if (s >= 70) return 'Good';
  if (s >= 50) return 'Fair';
  return 'Needs Attention';
}

/* ── This-month contribution stat (matches the mobile hero's currMonth/prev) ── */
export function monthlyContribStat(metrics = {}) {
  const mc = metrics.monthlyContributions || [];
  const current = mc[11] || 0;
  const prev = mc[10] || 0;
  const changePct = prev ? Math.round(((current - prev) / prev) * 100) : 0;
  // Year-over-year: first vs last month in the 12-element window.
  const first = mc.find((v) => v > 0) || 0;
  const yoyPct = first ? Math.round(((current - first) / first) * 100) : 0;
  return { current, prev, changePct, yoyPct, series: mc };
}

/* ── Insights (verbatim from BranchHealthScore.generateInsights) ── */
export function generateInsights(metrics = {}, agents = []) {
  const insights = [];
  if (agents.length > 1) {
    const sorted = [...agents].sort(
      (a, b) => (b.metrics?.totalContributions || 0) - (a.metrics?.totalContributions || 0),
    );
    const top = sorted[0];
    const avg = agents.reduce((s, a) => s + (a.metrics?.totalContributions || 0), 0) / agents.length;
    if (avg > 0 && (top.metrics?.totalContributions || 0) / avg >= 1.3) {
      insights.push({
        type: 'positive',
        text: `${top.name.split(' ')[0]} leads with ${((top.metrics?.totalContributions || 0) / avg).toFixed(1)}x avg`,
        query: 'Top agents?',
      });
    }
  }
  const ar = metrics.activeRate || 0;
  if (ar >= 75) insights.push({ type: 'positive', text: `${Math.round(ar)}% retention — strong`, query: 'Active subscribers?' });
  else if (ar >= 50) insights.push({ type: 'warning', text: `${Math.round(ar)}% retention — needs work`, query: 'Active subscribers?' });
  else insights.push({ type: 'negative', text: `${Math.round(ar)}% retention — critical`, query: 'Active subscribers?' });

  const inactive = agents.filter((a) => a.status === 'inactive');
  if (inactive.length > 0) insights.push({ type: 'warning', text: `${inactive.length} agent${inactive.length > 1 ? 's' : ''} inactive`, query: 'Top agents?' });

  const mc = metrics.monthlyContributions || [];
  const curr = mc[11] || 0, prev = mc[10] || 0;
  if (prev > 0) {
    const pct = Math.round(((curr - prev) / prev) * 100);
    if (Math.abs(pct) > 3) insights.push({ type: pct > 0 ? 'positive' : 'negative', text: `Collections ${pct > 0 ? '+' : ''}${pct}% MoM`, query: 'Show monthly trend' });
  }
  return insights.slice(0, 4);
}

/* ── Activity feed (verbatim from BranchHealthScore.generateActivity, minus the
 *    Math.random jitter so the desktop feed is stable across re-renders). `now`
 *    defaults to Date.now() inside the helper — kept out of the render path so
 *    the component stays pure (matches the mobile hero's pattern). ── */
export function generateActivity(agents = [], now = Date.now()) {
  const base = now || 0;
  const events = [];
  agents.forEach((agent, ai) => {
    const m = agent.metrics || {};
    for (let i = 0; i < Math.min(m.newSubscribersToday || 0, 2); i++) {
      events.push({
        id: `reg-${agent.id}-${i}`,
        type: 'registration',
        text: `New subscriber via ${agent.name.split(' ')[0]}`,
        time: base - (ai * 2 + i) * 3600_000,
      });
    }
    if ((m.dailyContributions || 0) > 0) {
      events.push({
        id: `contrib-${agent.id}`,
        type: 'contribution',
        text: `${agent.name.split(' ')[0]} collected ${formatUGX(m.dailyContributions)}`,
        time: base - (ai * 2 + 1) * 3600_000,
      });
    }
  });
  return events.sort((a, b) => b.time - a.time).slice(0, 8);
}

/* ── Needs-attention (Dormant + KYC only — the desktop mockup intentionally drops
 *    the commission "Settled" tile that the mobile hero still shows). ── */
export function computeAttention(metrics = {}) {
  const totalSubs = metrics.totalSubscribers || 0;
  const activeSubs = Math.round(totalSubs * ((metrics.activeRate || 0) / 100));
  const dormant = totalSubs - activeSubs;
  const kycIssues = (metrics.kycPending || 0) + (metrics.kycIncomplete || 0);
  return [
    {
      value: dormant,
      label: 'Dormant subscribers',
      sub: 'Not contributing recently',
      severity: dormant > 0 ? 'warning' : 'ok',
      reportId: 'all-subscribers',
    },
    {
      value: kycIssues,
      label: 'KYC issues',
      sub: 'Pending or incomplete verification',
      severity: kycIssues > 0 ? 'alert' : 'ok',
      reportId: 'kyc-compliance',
    },
  ];
}

/** Top-contributing agent + how many × the branch average (for copilot answers). */
export function topAgent(agents = []) {
  if (!agents.length) return null;
  const sorted = [...agents].sort(
    (a, b) => (b.metrics?.totalContributions || 0) - (a.metrics?.totalContributions || 0),
  );
  const top = sorted[0];
  const avg = agents.reduce((s, a) => s + (a.metrics?.totalContributions || 0), 0) / agents.length;
  const multiple = avg > 0 ? (top.metrics?.totalContributions || 0) / avg : 0;
  return {
    name: top.name,
    contributions: top.metrics?.totalContributions || 0,
    multiple,
  };
}
