// Flow spec: branch admin creates a new agent via the slide-in CreateAgent panel.
//
// What this exercises:
//   1. Branch persona auth via storageState (no UI login).
//   2. Sidebar → Agents popover → "Create New Agent" launches CreateAgent.
//   3. Step 1 (Agent Details) form fill — name, phone, gender are required;
//      email + ID are optional. Phone goes through isValidUGPhone (9-digit
//      local, prefix in {70,71,74,75,76,77,78}).
//   4. Step 2 (Review) confirm → mutation goes through useCreateAgent →
//      entities.createAgent → supabase.from('agents').insert(...).
//   5. DB verification — row exists, branch_id matches the persona's branch.
//   6. Cleanup — delete the inserted agent row by phone.
//
// Why this flow:
//   • CreateAgent is the only "write a new entity" surface in the branch
//     dashboard, and it goes straight from form → useMutation → Postgres
//     (no RPC, no intermediate API route). It's a clean test of the
//     React-Query-→-Supabase chain under a branch JWT.
//   • Mirrors subscriber-edit-profile.spec.ts (the canonical flow template):
//     storageState auth, waitForResponse on the write call, DB assert,
//     afterEach cleanup via supabaseAdmin.
//
// Service-role notes:
//   • supabaseAdmin (db.ts) bypasses RLS — used in Node only, never the page.
//   • Cleanup happens unconditionally in afterEach so a failed test still
//     drops the row. The phone is unique-per-test (Date.now() suffix) so
//     stale rows from earlier failed runs can be re-cleaned via the same
//     phone match.
//
// Persona:
//   • PERSONA_FOR.branch.entityId === 'b-kam-015' (Kampala Central) — used
//     to assert branch_id landed correctly via BranchScopeContext.

import { test, expect } from '@playwright/test';
import { storageStatePathFor, PERSONA_FOR } from '../../fixtures/auth';
import { disableAnimations } from '../../fixtures/motion';
import { supabaseAdmin, rowExists, getRow } from '../../fixtures/db';
import { selectors } from '../../helpers/selectors';

test.use({ storageState: storageStatePathFor('branch') });
test.setTimeout(45_000);

const BRANCH_ID = PERSONA_FOR.branch.entityId; // 'b-kam-015'

type AgentRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  branch_id: string;
  gender: string | null;
};

test.describe('branch → create agent (UI + DB)', () => {
  // Unique 9-digit Uganda local phone — '70' prefix (valid carrier) + 7
  // digits from the timestamp. Stored in DB as the 9-digit local form
  // (CreateAgent passes the raw state value to the mutation; no +256
  // prefix is prepended before the insert).
  const uniquePhone = `70${String(Date.now()).slice(-7)}`;
  const testName = `E2E Agent ${Date.now()}`;
  const testEmail = `e2e-agent-${Date.now()}@example.com`;

  test.afterEach(async () => {
    // Always remove the row we created — keeps reruns clean even after a
    // failed assertion. No FK fanout: nothing references the new agent yet
    // because the spec doesn't create subscribers/transactions under it.
    const { error } = await supabaseAdmin
      .from('agents')
      .delete()
      .eq('phone', uniquePhone);
    expect(error, `cleanup: deleting agent by phone ${uniquePhone}`).toBeNull();
  });

  test('submitting the form inserts an agent scoped to the branch', async ({ page }) => {
    await disableAnimations(page);

    // Listen for the POST /rest/v1/agents response before we trigger the
    // mutation — that's the authoritative "row hit the DB" signal.
    const insertPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/rest/v1/agents') &&
        res.request().method() === 'POST' &&
        res.status() === 201,
      { timeout: 20_000 },
    );

    await page.goto('/dashboard');

    // The branch shell mounts the sidebar with the Agents icon (aria-label
    // "Agents"). Clicking it toggles the popover with two items:
    // "Create New Agent" and "View Existing Agents".
    await selectors.dashboardShell.agentsTab(page).first().click();
    await page.getByRole('button', { name: /create new agent/i }).click();

    // Wait for the slide-in panel header.
    await expect(page.getByRole('heading', { level: 2, name: /create new agent/i })).toBeVisible();

    // ── Step 1: Agent Details ────────────────────────────────────────────
    await page.locator('#ca-fullName').fill(testName);
    // Phone input strips non-digits and caps at 9 chars; we already pass a
    // clean 9-digit local number.
    await page.locator('#ca-phone').fill(uniquePhone);
    await page.locator('#ca-email').fill(testEmail);
    await page.locator('#ca-gender').selectOption('male');

    await page.getByRole('button', { name: /continue/i }).click();

    // ── Step 2: Review → Create ──────────────────────────────────────────
    await expect(page.getByRole('heading', { level: 4, name: /agent details/i })).toBeVisible();
    const createBtn = page.getByRole('button', { name: /^create agent$/i });
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    // Wait for the POST → 201. .ok() covers 2xx but we already matched 201
    // in the predicate, so this is belt-and-braces.
    const insertResponse = await insertPromise;
    expect(insertResponse.ok()).toBe(true);

    // Success screen appears once the mutation resolves.
    await expect(page.getByRole('heading', { level: 3, name: /^agent created$/i })).toBeVisible();

    // [DB] Verify the row exists and was scoped to the branch persona.
    expect(await rowExists('agents', { phone: uniquePhone })).toBe(true);
    const row = await getRow<AgentRow>('agents', { phone: uniquePhone });
    expect(row, `inserted agent row should exist for phone ${uniquePhone}`).not.toBeNull();
    expect(row!.branch_id).toBe(BRANCH_ID);
    expect(row!.name).toBe(testName);
    expect(row!.email).toBe(testEmail);
    expect(row!.gender).toBe('male');
    // eslint-disable-next-line no-console
    console.log(
      `[db] agents row inserted: id=${row!.id} phone=${row!.phone} branch=${row!.branch_id}`,
    );
  });
});
