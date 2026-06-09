// Chat service — wraps the `/api/chat` Vercel route. The route is
// JWT-optional: when a JWT is present the server flavors the reply by the
// claim role (admin/distributor/branch → admin flavor, agent → agent DM
// flavor, subscriber → subscriber co-pilot). When unauthenticated the server
// falls back to the `context` field on the body, which is what the
// subscriber co-pilot uses pre-sign-in.
//
// All three exported functions return a plain string (the reply). The route
// also returns a `suggestions` array, but every existing caller
// (`BranchHealthScore`, `MetricsRow`, `CoPilotWidget`, `AgentPage`,
// `HelpPage`) renders the response as a single chat bubble — they don't
// consume `.suggestions`. So we unwrap `.reply` at the boundary and keep the
// legacy string contract. If a caller ever needs the suggestions, expose a
// second function rather than widening this return type.
//
// Rollback:
//   When `IS_SUPABASE_ENABLED` is false (set `VITE_USE_SUPABASE=false`), each
//   function short-circuits to the legacy localStorage / keyword-matched
//   implementation so the rollback drill works without the API route.

import { api, IS_SUPABASE_ENABLED } from './api';
import { COUNTRY, REGIONS, AGENTS, BRANCHES } from '../data/mockData';
import { formatNumber, formatUGX } from '../utils/currency';

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
    subscriber: `${formatNumber(cm.totalSubscribers)} subscribers across ${branchCount} branches. ${cm.activeRate}% active. ${regionsBySubscribers[0].name} region leads with ~${formatNumber(regionsBySubscribers[0].subs)}.`,
    gender: `Gender: ${cm.genderRatio.male}% male, ${cm.genderRatio.female}% female, ${cm.genderRatio.other}% other. ${mostBalanced.name} region has the most balanced split.`,
  };

  return _responses;
}

/**
 * Post a message to `/api/chat` with the given context flag. Returns the
 * reply string; swallows + logs route failures so the chat UI shows a calm
 * fallback message instead of breaking. Used by all three public functions
 * below as a single integration point.
 */
async function postChat(message, context, fallback) {
  try {
    const res = await api.post('/chat', { message, context });
    if (res && typeof res.reply === 'string') return res.reply;
    return fallback;
  } catch (err) {
    if (typeof window !== 'undefined' && window?.console) {
      console.warn('[chat] /api/chat failed; falling back to mock copy.', err);
    }
    return fallback;
  }
}

/**
 * @endpoint POST /api/chat
 * @param {string} message - User's chat message
 * @returns {Promise<string>} AI-generated response text
 * @description Distributor/Branch/Admin "data assistant" flavor. The API
 *   route uses the JWT role to decide the flavor; we pass `context: 'admin'`
 *   so unauthenticated calls still get the admin flavor.
 * @scope Distributor and Branch Admin (scoped to their data visibility).
 */
export async function getChatResponse(message) {
  if (!IS_SUPABASE_ENABLED) return mockChatResponse(message);
  return postChat(message, 'admin', mockChatResponse(message));
}

/**
 * Employer "copilot" — keyword-matched answers grounded in the EMPLOYER's own
 * figures (passed in `ctx`), not the distributor network. A mock (CLAUDE.md
 * §10a), but truthful: it answers from real, RLS-scoped data the hero already
 * holds, so "Who is pending KYC?" returns the real pending-invite list rather
 * than the generic admin/network reply the shared `/api/chat` route gives. No
 * round-trip — the data is already client-side, and the route has no
 * employer-invite query to answer these questions anyway.
 *
 * @param {string} message
 * @param {object} ctx - { headcount, active, inactive, participationPct,
 *   pendingKyc, pendingNames[], fundingLabel, coverLabel, totalContributions,
 *   lastRunLabel } — all derived in EmployerHealthScore from live hooks.
 * @returns {Promise<string>}
 */
export async function getEmployerChatResponse(message, ctx = {}) {
  return mockEmployerChatResponse(message, ctx);
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

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Agent-side mock responses (for subscriber → agent direct messaging)        */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @endpoint POST /api/chat (context: 'agent')
 * @param {string} message
 * @param {{ name?: string }} [agent] - Used as a friendly first-name fallback
 *   when the API isn't yet personalised.
 * @returns {Promise<string>} Reply text.
 * @description Subscriber → agent DM. The real product will route messages
 *   into a person-to-person inbox; today the server returns a keyword-matched
 *   stock reply.
 */
export async function getAgentReply(message, agent) {
  const firstName = (agent?.name || 'your agent').split(' ')[0];
  if (!IS_SUPABASE_ENABLED) return mockAgentReply(message, firstName);
  return postChat(message, 'agent', mockAgentReply(message, firstName));
}

/**
 * @endpoint POST /api/chat (context: 'subscriber')
 * @param {string} message
 * @returns {Promise<string>}
 * @description Subscriber-facing co-pilot. Often called before sign-in, so we
 *   rely on the route's unauthenticated body-context fallback.
 */
export async function getSubscriberChatResponse(message) {
  if (!IS_SUPABASE_ENABLED) return mockSubscriberChatResponse(message);
  return postChat(message, 'subscriber', mockSubscriberChatResponse(message));
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Rollback mocks (used when IS_SUPABASE_ENABLED === false)                */
/* ──────────────────────────────────────────────────────────────────────── */

function mockChatResponse(message) {
  const responses = buildResponses();
  const l = (message || '').toLowerCase();
  if (l.includes('agent') || l.includes('top')) return responses.agent;
  if (l.includes('coverage') || l.includes('region')) return responses.coverage;
  if (l.includes('subscriber') || l.includes('active')) return responses.subscriber;
  if (l.includes('gender') || l.includes('split')) return responses.gender;
  return responses.default;
}

function mockEmployerChatResponse(message, ctx = {}) {
  const l = (message || '').toLowerCase();
  const {
    headcount = 0,
    active = 0,
    inactive = 0,
    participationPct = 0,
    pendingKyc = 0,
    pendingNames = [],
    fundingLabel = 'Company funding: not set',
    coverLabel = 'no group cover',
    totalContributions = 0,
    lastRunLabel = null,
  } = ctx;

  // Pending KYC = people invited who haven't completed sign-up (the real,
  // RLS-scoped invite list — not a member status).
  if (l.includes('kyc') || l.includes('pending') || l.includes('invite') || l.includes('sign-up') || l.includes('sign up')) {
    if (pendingKyc === 0) return 'Everyone you’ve invited has completed sign-up — no pending KYC right now.';
    const shown = pendingNames.slice(0, 5).join(', ');
    const more = pendingNames.length > 5 ? `, +${formatNumber(pendingNames.length - 5)} more` : '';
    const who = shown ? `: ${shown}${more}` : '';
    return `${formatNumber(pendingKyc)} ${pendingKyc === 1 ? 'person hasn’t' : 'people haven’t'} finished signing up${who}. Open Pending KYC to resend their invite links.`;
  }

  // Individual staff balances are private by design — decline honestly.
  if (l.includes('balance') || l.includes('savings') || l.includes('how much has')) {
    return 'Individual staff balances are private — you fund contributions, but each member’s personal savings aren’t visible to the employer.';
  }

  // Contribution runs / total funded.
  if (l.includes('run') || l.includes('total') || l.includes('funded') || l.includes('paid')) {
    return `You’ve funded ${formatUGX(totalContributions)} to date${lastRunLabel ? ` — your last run was ${lastRunLabel}` : ' (no runs yet)'}.`;
  }

  // Inactive staff.
  if (l.includes('inactive') || l.includes('suspend')) {
    return inactive > 0
      ? `${formatNumber(inactive)} of ${formatNumber(headcount)} staff are inactive — contribution runs skip them.`
      : `All ${formatNumber(headcount)} staff are active.`;
  }

  // Participation / contributing — measured against ACTIVE staff (matches the
  // hero's "% of active staff contributing" insight), so an inactive roster
  // doesn't read as low participation.
  if (l.includes('contribut') || l.includes('participat')) {
    return `${participationPct}% of your ${formatNumber(active)} active staff are contributing.`;
  }

  // Company funding model.
  if (l.includes('funding') || l.includes('split') || l.includes('match')) {
    return `${fundingLabel}. Each member can save their own amount on top of this.`;
  }

  // Group insurance (company-wide, all-or-nothing).
  if (l.includes('insurance') || l.includes('cover')) {
    return `Group life cover: ${coverLabel}. It’s company-wide — the same for every staff member, with no per-member opt-out.`;
  }

  // Headcount.
  if (l.includes('staff') || l.includes('employee') || l.includes('headcount') || l.includes('how many') || l.includes('people')) {
    return `You have ${formatNumber(headcount)} staff — ${formatNumber(active)} active${inactive > 0 ? `, ${formatNumber(inactive)} inactive` : ''}.`;
  }

  return 'I can answer about your staff, contribution runs, company funding, group insurance, and who’s pending KYC. Try “Who is pending KYC?” or “What’s our funding split?”.';
}

function mockAgentReply(message, firstName) {
  const l = (message || '').toLowerCase();
  if (l.includes('contribute') || l.includes('top up') || l.includes('top-up')) {
    return `Sure — easiest is to use the Top up button on your dashboard. If you'd prefer Mobile Money via me, send the amount and I'll send a payment prompt to your phone.`;
  }
  if (l.includes('withdraw')) {
    return `Got it. Emergency bucket withdrawals are usually 1–2 working days. I can walk you through the form, or process it on your behalf if you share the amount and reason.`;
  }
  if (l.includes('nominee') || l.includes('beneficiary')) {
    return `Happy to help update your nominees. We'll need each person's full name, NIN, and the share %. Shares must total 100%.`;
  }
  if (l.includes('schedule') || l.includes('frequency') || l.includes('split')) {
    return `Your contribution schedule can be changed any time. Want me to suggest a split based on your goals? Tell me how soon you'd want to retire or what you're saving for.`;
  }
  if (l.includes('insurance') || l.includes('claim')) {
    return `For insurance and claims I'll need a few details: type of claim, incident date, and any documents. I'll guide you through the rest.`;
  }
  if (l.includes('meet') || l.includes('visit') || l.includes('branch') || l.includes('appointment')) {
    return `Of course — I can meet you at the branch or come to your area. What day this week works for you?`;
  }
  if (l.includes('thanks') || l.includes('thank you')) {
    return `Always happy to help. Reach out any time on this thread or call my number on the profile.`;
  }
  if (l.includes('hi') || l.includes('hello') || l.includes('hey')) {
    return `Hi! ${firstName} here. How can I help you today?`;
  }
  return `Thanks for the message — I'll get back to you shortly. If it's urgent, you can also call me on the number above.`;
}

function mockSubscriberChatResponse(message) {
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
