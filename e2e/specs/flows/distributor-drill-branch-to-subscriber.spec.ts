// Flow spec — distributor drill-down: branch → subscriber.
//
// QA finding being pinned (from the planning audit):
//   When a distributor drills into a branch, there is currently no UX path
//   from the branch detail to a subscriber list scoped to that branch. The
//   ViewSubscribers panel is global — it pulls every subscriber row (capped
//   at Supabase's 1 000 default page) and does NOT consume
//   selectedIds.branch / drillTargetBranchId from DashboardNavContext.
//
//   The fix surface area lives in:
//     • src/dashboard/branch/ViewBranches.jsx   — BranchDetail needs a CTA
//     • src/dashboard/subscriber/ViewSubscribers.jsx — needs parent scoping
//     • src/services/entities.js                 — getAllAtLevel filters nothing
//     • src/contexts/DashboardNavContext.jsx     — parsePath has no
//                                                  branches/:id/subscribers
//                                                  segment
//
// Expected outcome of this spec set TODAY: FAIL on every test below.
// When the gap is fixed, these tests should pass without modification —
// they pin the contract, not the current behaviour.

import { test, expect, type Page } from '@playwright/test';
import { storageStatePathFor } from '../../fixtures/auth';
import { disableAnimations } from '../../fixtures/motion';
import { supabaseAdmin } from '../../fixtures/db';
import { selectors } from '../../helpers/selectors';

test.use({ storageState: storageStatePathFor('distributor') });
test.setTimeout(60_000);

type Row = { id: string };
type AgentRow = { id: string; branch_id: string };

async function pickBranchWithAgents(): Promise<{ branchId: string; agentIds: string[] }> {
  // Pick a branch that actually has agents under it so the spec can compute
  // an expected subscriber count. We pull a small page of agents and group
  // them; the first branch with >= 1 agent wins. The seed has ~314 branches
  // and ~2,049 agents, so this is effectively always non-empty.
  const { data, error } = await supabaseAdmin
    .from('agents')
    .select('id,branch_id')
    .limit(500);
  if (error) throw new Error(`pickBranchWithAgents: ${error.message}`);
  const rows = (data ?? []) as AgentRow[];
  const grouped = new Map<string, string[]>();
  for (const a of rows) {
    if (!a.branch_id) continue;
    const list = grouped.get(a.branch_id) ?? [];
    list.push(a.id);
    grouped.set(a.branch_id, list);
  }
  const [branchId, agentIds] = [...grouped.entries()][0] ?? [];
  expect(branchId, 'expected to find at least one branch with agents in the seed').toBeTruthy();
  return { branchId: branchId!, agentIds: agentIds! };
}

async function countSubscribersForAgents(agentIds: string[]): Promise<number> {
  // Authoritative count of subscribers whose agent_id is in the branch's
  // agent set — this is what a correctly scoped branch→subscriber drill
  // should report.
  const { count, error } = await supabaseAdmin
    .from('subscribers')
    .select('*', { count: 'exact', head: true })
    .in('agent_id', agentIds);
  if (error) throw new Error(`countSubscribersForAgents: ${error.message}`);
  return count ?? 0;
}

async function openBranchDetail(page: Page, branchId: string) {
  // The URL /dashboard/branches/:id is the documented entry point — per
  // DashboardNavContext.parsePath this auto-opens the ViewBranches panel
  // with drillTargetBranchId set, taking us straight to BranchDetail.
  await page.goto(`/dashboard/branches/${branchId}`);
  await expect(page).toHaveURL(new RegExp(`/dashboard/branches/${branchId}$`));
  await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
}

test.describe('distributor → drill branch → subscriber', () => {
  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
  });

  test('BranchDetail exposes a "View subscribers" CTA', async ({ page }) => {
    // Contract: once a distributor reaches BranchDetail, there should be a
    // discoverable affordance that drills into the subscriber list scoped to
    // that branch. We accept either a data-testid hook OR an accessible
    // button label — the implementer can pick either.
    //
    // Why both: locking the spec to a single test-id prevents the
    // implementer from satisfying the contract with whichever option is
    // less invasive in the existing CSS Modules markup. The accessible
    // name is the primary correctness signal.
    const { branchId } = await pickBranchWithAgents();
    await openBranchDetail(page, branchId);

    const testIdCta = page.getByTestId('branch-view-subscribers');
    const accessibleCta = selectors.agentDetail.viewSubscribersCta(page);
    // First-class assertion — accessible name. Fails today; will pass when
    // the BranchDetail UI gains the CTA.
    await expect(
      accessibleCta.or(testIdCta).first(),
      'BranchDetail should expose a "View subscribers" button (data-testid="branch-view-subscribers" or aria-label matching /view subscribers/i)',
    ).toBeVisible({ timeout: 15_000 });
  });

  test('clicking the branch CTA opens a subscriber list scoped to the branch', async ({ page }) => {
    // Contract: clicking the branch-level "View subscribers" CTA should
    //   (a) take the URL to /dashboard/branches/:id/subscribers (the
    //       segment that DashboardNavContext.parsePath needs to learn
    //       about), and
    //   (b) open ViewSubscribers with a count matching the authoritative
    //       count of subscribers whose agent.branch_id === branchId.
    const { branchId, agentIds } = await pickBranchWithAgents();
    const expectedCount = await countSubscribersForAgents(agentIds);
    expect(
      expectedCount,
      `seed sanity: branch ${branchId} should have at least one subscriber under its agents`,
    ).toBeGreaterThan(0);

    await openBranchDetail(page, branchId);

    const cta = selectors.agentDetail.viewSubscribersCta(page)
      .or(page.getByTestId('branch-view-subscribers'))
      .first();
    await cta.click({ timeout: 15_000 });

    // (a) URL contract.
    await expect(
      page,
      'URL should reach /dashboard/branches/:id/subscribers after CTA click',
    ).toHaveURL(new RegExp(`/dashboard/branches/${branchId}/subscribers$`), { timeout: 10_000 });

    // (b) Count contract. ViewSubscribers header reads "Showing X of Y
    // subscribers"; when scoped to the branch, Y should equal the
    // authoritative count.
    const header = page.getByText(/Showing\s+[\d,\s.]+\s+of\s+([\d,\s.]+)\s+subscribers/i).first();
    await expect(header, 'subscriber count header should render').toBeVisible({ timeout: 15_000 });
    const headerText = await header.innerText();
    const reportedTotal = Number(headerText.match(/of\s+([\d,\s.]+)/i)?.[1].replace(/[^\d]/g, '') ?? '0');
    expect(
      reportedTotal,
      `ViewSubscribers "of N" should equal authoritative branch-scoped count ${expectedCount}; got ${reportedTotal} (header text: ${JSON.stringify(headerText)})`,
    ).toBe(expectedCount);
  });

  test('no subscriber from outside the branch leaks into the scoped list', async ({ page }) => {
    // Contract: every subscriber row visible in the branch-scoped panel
    // belongs to one of the branch's agents. Today the panel is the global
    // 30k list capped at 1 000 rows, so this will surface a leak.
    //
    // We pick a subscriber that is DEFINITELY out of the chosen branch's
    // scope (any subscriber whose agent_id is not in our agent set) and
    // assert their name does not appear in the panel.
    const { branchId, agentIds } = await pickBranchWithAgents();
    await openBranchDetail(page, branchId);

    const cta = selectors.agentDetail.viewSubscribersCta(page)
      .or(page.getByTestId('branch-view-subscribers'))
      .first();
    await cta.click({ timeout: 15_000 });

    // Find a subscriber NOT in this branch. `not.in(...)` keeps it simple.
    const { data: outsiders, error } = await supabaseAdmin
      .from('subscribers')
      .select('id,name,agent_id')
      .not('agent_id', 'in', `(${agentIds.map((id) => `"${id}"`).join(',')})`)
      .limit(1);
    if (error) throw new Error(`leak-check seed: ${error.message}`);
    const outsider = (outsiders ?? [])[0] as { id: string; name: string } | undefined;
    expect(outsider, 'expected to find at least one subscriber outside the branch').toBeTruthy();

    // The outsider's name must NOT be visible in the scoped panel. We give
    // the virtualizer a generous timeout because it lazy-renders rows on
    // scroll; if the panel is global, the name will appear once you scroll
    // past their row, but a `count() === 0` against the rendered tree
    // catches the leak when virtualization happens to surface the row.
    await expect(
      page.getByText(outsider!.name, { exact: true }),
      `subscriber "${outsider!.name}" (id ${outsider!.id}) is from outside branch ${branchId} and must not appear in the scoped panel`,
    ).toHaveCount(0);
  });
});
