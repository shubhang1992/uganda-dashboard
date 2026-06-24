/**
 * branchCopilotContext.js — derives the Branch Copilot answer context from the
 * branch's own live, RLS-scoped figures, so every reply is truthful for THIS
 * branch (not the whole network like the admin-flavoured getChatResponse).
 *
 * Mirrors employerCopilotContext.js. Reuses branchOverviewDerive so the copilot
 * and the Overview page agree on the score, attention items, and top agent.
 *
 * The output of buildBranchCopilotContext is fed straight to
 * getBranchChatResponse(message, ctx) (src/services/chat.js).
 */

import {
  deriveMetrics,
  calcScore,
  scoreLabel,
  monthlyContribStat,
  topAgent,
} from './branchOverviewDerive';

/**
 * @param {object} args
 * @param {object} args.branch            - useEntity('branch', branchId) result
 * @param {object} args.metrics           - useEntityMetrics('branch', branchId) result
 * @param {Array}  args.agents            - merged useChildren + useChildrenMetrics
 * @param {object} args.commissionSummary - useEntityCommissionSummary result
 */
export function buildBranchCopilotContext({ branch, metrics = {}, agents = [], commissionSummary } = {}) {
  const derived = deriveMetrics(metrics, agents);
  const score = calcScore(derived);
  const month = monthlyContribStat(metrics);
  const top = topAgent(agents);
  return {
    branchName: branch?.name || 'your branch',
    score,
    label: scoreLabel(score),
    totalSubscribers: derived.totalSubs,
    activeSubscribers: derived.activeSubs,
    dormant: derived.dormant,
    kycIssues: (metrics.kycPending || 0) + (metrics.kycIncomplete || 0),
    totalAgents: agents.length,
    activeAgents: derived.activeAgents,
    topAgentName: top?.name || null,
    topAgentMultiple: top?.multiple || 0,
    aum: metrics.aum || 0,
    contributionsThisMonth: month.current,
    contribChangePct: month.changePct,
    settlementRate: commissionSummary?.settlementRate || 0,
    genderRatio: metrics.genderRatio || {},
  };
}

// Suggestion chips for the desktop Branch Copilot — each maps to a keyword
// branch in mockBranchChatResponse (src/services/chat.js) so the demo answers.
export const BRANCH_COPILOT_SUGGESTIONS = [
  'Who are my top agents this month?',
  'How many dormant subscribers can I reactivate?',
  "What's the gender split of my subscribers?",
  'Show me commissions still due this cycle',
  "What's our branch health score?",
];
