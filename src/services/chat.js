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
