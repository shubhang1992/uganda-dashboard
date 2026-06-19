/**
 * Agent Co-Pilot reply logic — a synchronous, keyword-anchored matcher that
 * answers portfolio questions from already-fetched subscriber + commission data
 * (no remote LLM call; demo scope). Extracted here so the desktop "Ask AI" chat
 * panel (AgentCopilotPanel) and any future caller share ONE source of truth for
 * the demo answers. The mobile CoPilotWidget keeps its own local copy by design
 * (see the F26 duplication note in that file).
 */
import { formatUGX } from '../../utils/currency';
import { deriveMonthAnchors, isOnboardedSince, isInsured } from './agentHomeSummary';

/** Prompt chips shown when the conversation is empty. */
export const AGENT_COPILOT_SUGGESTIONS = [
  'How many subscribers do I have?',
  "What's owed to me?",
  'Who joined this month?',
  'How many are insured?',
];

/**
 * Build a demo reply string for `message` from the agent's portfolio data.
 * @param {string} message — the user's question.
 * @param {{ subscribers?: Array, commissions?: object }} data
 * @returns {string}
 */
export function buildAgentCopilotReply(message, { subscribers, commissions } = {}) {
  const m = (message || '').toLowerCase();
  const list = Array.isArray(subscribers) ? subscribers : [];
  const total = list.length;
  const activeCount = list.filter((s) => s.isActive).length;
  const dormantCount = total - activeCount;
  const due = commissions?.totalDue || 0;
  const paid = commissions?.totalPaid || 0;
  const countDue = commissions?.countDue || 0;

  const { onboardStart } = deriveMonthAnchors(list);
  const thisMonth = list.filter((s) => isOnboardedSince(s, onboardStart)).length;
  const insured = list.filter(isInsured).length;
  const uninsured = total - insured;

  if (m.includes('insur') || m.includes('cover') || m.includes('policy')) {
    if (total === 0) return "You don't have any subscribers yet, so there's no insurance to report.";
    return `${insured} of your ${total} subscriber${total === 1 ? '' : 's'} have active cover, and ${uninsured} are uninsured. Open the insurance card on your Home to nudge the uninsured ones.`;
  }
  if (m.includes('subscriber') || m.includes('how many') || m.includes('members') || m.includes('book')) {
    return `You have ${total} subscriber${total === 1 ? '' : 's'} in your portfolio. ${thisMonth} joined this month.`;
  }
  if (m.includes('active') || m.includes('dormant') || m.includes('inactive')) {
    return `${activeCount} of your subscribers are active and ${dormantCount} are dormant. Open the Subscribers page to filter them.`;
  }
  if (m.includes('commission') || m.includes('owe') || m.includes('pay') || m.includes('settle') || m.includes('payout') || m.includes('earn')) {
    return `You've earned ${formatUGX(paid)} so far. ${formatUGX(due)} is still to be paid to you across ${countDue} record${countDue === 1 ? '' : 's'} — it'll be settled when your distributor next pays out.`;
  }
  if (m.includes('this month') || m.includes('joined') || m.includes('new') || m.includes('onboard')) {
    return thisMonth > 0
      ? `${thisMonth} subscriber${thisMonth === 1 ? '' : 's'} joined this month. Open "Subscribers" to see them all.`
      : `Nobody's joined this month yet. Use "Onboard" to sign up your next member.`;
  }
  if (m.includes('top') || m.includes('focus') || m.includes('priority') || m.includes('what should')) {
    return `Focus on dormant subscribers and any commission that's due to you. Onboarding new members keeps your pipeline healthy.`;
  }
  if (m.includes('hi') || m.includes('hello') || m.includes('hey') || m.includes('thank')) {
    return `Hi! I can help with your subscribers, payouts, onboarding, and insurance. What would you like to know?`;
  }
  return `I can help with subscriber counts, active/dormant status, commission status, onboarding, and insurance. Try one of the suggestions below.`;
}
