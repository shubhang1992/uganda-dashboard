// Chat service — mock AI responses built from actual computed data.
// When backend is ready, replace with real LLM + DB integration.

import { COUNTRY, REGIONS, AGENTS, BRANCHES } from '../data/mockData';
import { formatUGX } from '../utils/finance';

let _responses = null;

function buildResponses() {
  if (_responses) return _responses;

  const cm = COUNTRY.metrics;
  const branchCount = Object.keys(BRANCHES).length;

  const topAgents = Object.values(AGENTS)
    .sort((a, b) => b.performance - a.performance)
    .slice(0, 3);
  const avgPerf = Math.round(
    Object.values(AGENTS).reduce((s, a) => s + a.performance, 0) / Object.keys(AGENTS).length,
  );

  const regionsBySubscribers = Object.values(REGIONS)
    .map((r) => ({ name: r.name, coverage: r.metrics.coverageRate, subs: r.metrics.totalSubscribers }))
    .sort((a, b) => b.subs - a.subs);

  const mostBalanced = Object.values(REGIONS)
    .map((r) => ({ name: r.name, gap: Math.abs(r.metrics.genderRatio.male - r.metrics.genderRatio.female) }))
    .sort((a, b) => a.gap - b.gap)[0];

  _responses = {
    default:
      "I can help you analyse your pension network data. Ask about subscribers, agents, coverage, or contributions!",
    agent: `Top 3 agents by performance: ${topAgents.map((a) => `${a.name} (${a.performance}%)`).join(', ')}. Network average: ${avgPerf}%.`,
    coverage: `Coverage: ${Object.values(REGIONS).map((r) => `${r.name} ${r.metrics.coverageRate}%`).join(', ')}. National average: ${cm.coverageRate}%.`,
    subscriber: `${cm.totalSubscribers.toLocaleString()} subscribers across ${branchCount} branches. ${cm.activeRate}% active. ${regionsBySubscribers[0].name} region leads with ~${regionsBySubscribers[0].subs.toLocaleString()}.`,
    gender: `Gender: ${cm.genderRatio.male}% male, ${cm.genderRatio.female}% female, ${cm.genderRatio.other}% other. ${mostBalanced.name} region has the most balanced split.`,
  };

  return _responses;
}

/**
 * @endpoint POST /api/chat
 * @param {string} message - User's chat message
 * @returns {Promise<string>} AI-generated response text
 * @description Mock AI chat that returns pre-built responses based on keyword matching.
 *   In production, replace with LLM integration (e.g., Claude API) connected to the
 *   actual database for real-time data analysis. Keywords matched: agent/top, coverage/region,
 *   subscriber/active, gender/split.
 * @scope Distributor and Branch Admin (scoped to their data visibility).
 */
export async function getChatResponse(message) {
  // Future: api.post('/chat', { message })
  const responses = buildResponses();
  const l = message.toLowerCase();
  if (l.includes('agent') || l.includes('top')) return responses.agent;
  if (l.includes('coverage') || l.includes('region')) return responses.coverage;
  if (l.includes('subscriber') || l.includes('active')) return responses.subscriber;
  if (l.includes('gender') || l.includes('split')) return responses.gender;
  return responses.default;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Subscriber-facing copilot                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */

const subscriberChatResponses = {
  default:
    "I can help with your savings, contributions, withdrawals, insurance, and nominees. Try asking how to withdraw or change your split.",
  withdraw:
    "You can withdraw from your Emergency bucket any time. Retirement funds unlock at age 60. Tap the Withdraw button on your dashboard to begin.",
  contribute:
    "To add money, tap ‘Make a Contribution’ — you can use the default split (80/20) or customise just this top-up.",
  schedule:
    "Your schedule controls how often and how much you save. Head to Settings → Contribution schedule to change frequency, amount, or the retirement/emergency split.",
  nominee:
    "Nominees receive your savings or insurance benefit. You can change them any time under ‘Update nominees’. Shares must total 100%.",
  claim:
    "To file an insurance claim, open Insurance → Claims → ‘File a new claim’. Have the incident date and any supporting documents ready.",
  retirement:
    "Your retirement bucket compounds monthly. Increase your schedule or retirement % to grow your projected income.",
  emergency:
    "Your Emergency bucket is designed for hardship situations — medical, education, housing, or business. It’s withdrawable any time.",
  insurance:
    "Your baseline cover is UGX 1,000,000 for UGX 2,000 / month. Upgrade options are available under Insurance → Coverage.",
  split:
    "A balanced split is 80% retirement / 20% emergency. Adjust any time — the donut on your dashboard updates immediately.",
  balance:
    "Your total balance reflects contributions minus withdrawals, translated to units at the latest unit value.",
  help:
    "Our help desk is open 8am–8pm. You can call, message us on WhatsApp, or email support@upensions.ug.",
};

/** Mock subscriber-side AI response. Replace with LLM + personal data lookup. */
export async function getSubscriberChatResponse(message) {
  // Future: api.post('/subscriber/chat', { message })
  const l = (message || '').toLowerCase();
  if (l.includes('withdraw') || l.includes('take out')) return subscriberChatResponses.withdraw;
  if (l.includes('contribute') || l.includes('top up') || l.includes('top-up')) return subscriberChatResponses.contribute;
  if (l.includes('schedule') || l.includes('frequency') || l.includes('change my')) return subscriberChatResponses.schedule;
  if (l.includes('nominee') || l.includes('beneficiary')) return subscriberChatResponses.nominee;
  if (l.includes('claim')) return subscriberChatResponses.claim;
  if (l.includes('retire') || l.includes('pension')) return subscriberChatResponses.retirement;
  if (l.includes('emergency')) return subscriberChatResponses.emergency;
  if (l.includes('insurance') || l.includes('cover')) return subscriberChatResponses.insurance;
  if (l.includes('split') || l.includes('allocation')) return subscriberChatResponses.split;
  if (l.includes('balance')) return subscriberChatResponses.balance;
  if (l.includes('help') || l.includes('support')) return subscriberChatResponses.help;
  return subscriberChatResponses.default;
}
