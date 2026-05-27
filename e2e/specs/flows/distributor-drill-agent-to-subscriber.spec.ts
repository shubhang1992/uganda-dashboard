// Flow spec — distributor drill-down: agent → subscriber.
//
// QA finding being pinned: AgentDetail (rendered inside ViewAgents or as a
// nested view inside the ViewBranches panel) has no affordance to drill
// further into the subscriber list scoped to that agent. The data lives in
// Supabase (subscribers.agent_id), but the panel pulls the global list with
// no parent filter.
//
// Fix surface area (do NOT modify in this pass):
//   • src/dashboard/agent/ViewAgents.jsx — AgentDetail needs a CTA
//   • src/dashboard/subscriber/ViewSubscribers.jsx — needs agent_id scope
//   • src/contexts/DashboardNavContext.jsx — parsePath needs an
//     agents/:id/subscribers segment
//
// Expected outcome TODAY: FAIL.

import { test, expect, type Page } from '@playwright/test';
import { storageStatePathFor } from '../../fixtures/auth';
import { disableAnimations } from '../../fixtures/motion';
import { supabaseAdmin } from '../../fixtures/db';
import { selectors } from '../../helpers/selectors';

test.use({ storageState: storageStatePathFor('distributor') });
test.setTimeout(60_000);

async function pickAgentWithSubscribers(): Promise<{ agentId: string; expectedCount: number }> {
  // We need an agent that has at least one subscriber. Pull a window of
  // subscribers and pick the first agent_id we see; then count its set.
  const { data, error } = await supabaseAdmin
    .from('subscribers')
    .select('agent_id')
    .limit(200);
  if (error) throw new Error(`pickAgentWithSubscribers: ${error.message}`);
  const rows = (data ?? []) as { agent_id: string | null }[];
  const agentId = rows.map((r) => r.agent_id).find((id): id is string => Boolean(id));
  expect(agentId, 'expected to find at least one agent with subscribers in seed').toBeTruthy();

  const { count, error: cErr } = await supabaseAdmin
    .from('subscribers')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', agentId!);
  if (cErr) throw new Error(`pickAgentWithSubscribers count: ${cErr.message}`);
  return { agentId: agentId!, expectedCount: count ?? 0 };
}

async function openAgentDetail(page: Page, agentId: string) {
  await page.goto(`/dashboard/agents/${agentId}`);
  await expect(page).toHaveURL(new RegExp(`/dashboard/agents/${agentId}$`));
  await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
}

test.describe('distributor → drill agent → subscriber', () => {
  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
  });

  test('AgentDetail exposes a "View subscribers" CTA', async ({ page }) => {
    const { agentId } = await pickAgentWithSubscribers();
    await openAgentDetail(page, agentId);

    const testIdCta = page.getByTestId('agent-view-subscribers');
    const accessibleCta = selectors.agentDetail.viewSubscribersCta(page);
    await expect(
      accessibleCta.or(testIdCta).first(),
      'AgentDetail should expose a "View subscribers" button (data-testid="agent-view-subscribers" or aria-label matching /view subscribers/i)',
    ).toBeVisible({ timeout: 15_000 });
  });

  test('clicking the agent CTA opens a subscriber list scoped to the agent', async ({ page }) => {
    const { agentId, expectedCount } = await pickAgentWithSubscribers();
    expect(
      expectedCount,
      `seed sanity: agent ${agentId} should have at least one subscriber`,
    ).toBeGreaterThan(0);

    await openAgentDetail(page, agentId);

    const cta = selectors.agentDetail.viewSubscribersCta(page)
      .or(page.getByTestId('agent-view-subscribers'))
      .first();
    await cta.click({ timeout: 15_000 });

    await expect(
      page,
      'URL should reach /dashboard/agents/:id/subscribers after CTA click',
    ).toHaveURL(new RegExp(`/dashboard/agents/${agentId}/subscribers$`), { timeout: 10_000 });

    const header = page.getByText(/Showing\s+[\d,\s.]+\s+of\s+([\d,\s.]+)\s+subscribers/i).first();
    await expect(header, 'subscriber count header should render').toBeVisible({ timeout: 15_000 });
    const headerText = await header.innerText();
    const reportedTotal = Number(headerText.match(/of\s+([\d,\s.]+)/i)?.[1].replace(/[^\d]/g, '') ?? '0');
    expect(
      reportedTotal,
      `ViewSubscribers "of N" should equal authoritative agent-scoped count ${expectedCount}; got ${reportedTotal} (header: ${JSON.stringify(headerText)})`,
    ).toBe(expectedCount);
  });

  test('no subscriber from outside the agent leaks into the scoped list', async ({ page }) => {
    const { agentId } = await pickAgentWithSubscribers();
    await openAgentDetail(page, agentId);

    const cta = selectors.agentDetail.viewSubscribersCta(page)
      .or(page.getByTestId('agent-view-subscribers'))
      .first();
    await cta.click({ timeout: 15_000 });

    const { data: outsiders, error } = await supabaseAdmin
      .from('subscribers')
      .select('id,name,agent_id')
      .neq('agent_id', agentId)
      .limit(1);
    if (error) throw new Error(`leak-check seed: ${error.message}`);
    const outsider = (outsiders ?? [])[0] as { id: string; name: string } | undefined;
    expect(outsider, 'expected to find at least one subscriber outside this agent').toBeTruthy();

    await expect(
      page.getByText(outsider!.name, { exact: true }),
      `subscriber "${outsider!.name}" (id ${outsider!.id}) is from outside agent ${agentId} and must not appear in the scoped panel`,
    ).toHaveCount(0);
  });
});
