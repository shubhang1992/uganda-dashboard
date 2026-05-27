// Flow spec: KYC failure surfaces exposed via the `x-qa-force` mechanism.
//
// Frontend sets `localStorage['upensions_<stage>_force']`; src/services/kyc.js
// reads it under `IS_DEV` and forwards `X-QA-Force: <value>` to /api/kyc/*
// (the Supabase-on path, which is the dev-env default per CLAUDE.md §10a).
// Each fail branch lands the wizard in a distinct UI state.
//
// DEFERRED via test.skip (Phase 9): reaching AmlStep + LivenessStep needs the
// full signup walkthrough, but e2e/helpers/signup.ts is DO-NOT-MODIFY per the
// 3F brief. A force-aware variant of that helper is the right vehicle.

import { test, expect, type Page } from '@playwright/test';
import { disableAnimations } from '../../fixtures/motion';

const SAMPLE_ID = {
  name: 'id.jpg',
  mimeType: 'image/jpeg',
  // 32 KiB > the 20 KiB client-side floor in mockAssessImageQuality.
  buffer: Buffer.alloc(32 * 1024, 0xff),
};

async function setForce(page: Page, stage: string, value: string) {
  await page.addInitScript(([s, v]) => {
    window.localStorage.setItem(`upensions_${s}_force`, v);
  }, [stage, value]);
}

test.describe('signup → KYC force-failure surfaces', () => {
  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
  });

  test('id-quality fail-blur surfaces "photo is blurry" guidance', async ({ page }) => {
    await setForce(page, 'id_quality', 'fail-blur');
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: /scan both sides/i })).toBeVisible();

    await page.setInputFiles('#id-upload-front', SAMPLE_ID);
    // Forced blur-fail → quality?.pass=false → IdUploadStep.jsx:274 issueBox.
    await expect(page.getByText(/photo is blurry/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /^continue$/i })).toBeDisabled();
  });

  test('nira-verify partial surfaces the double-check panel', async ({ page }) => {
    await setForce(page, 'nira', 'partial');
    await page.goto('/signup');

    await page.setInputFiles('#id-upload-front', SAMPLE_ID);
    await page.setInputFiles('#id-upload-back', SAMPLE_ID);
    const cont = page.getByRole('button', { name: /^continue$/i });
    await expect(cont).toBeEnabled({ timeout: 30_000 });
    await cont.click();

    await expect(page.getByRole('heading', { name: /check your details/i })).toBeVisible({ timeout: 30_000 });
    await page.locator('input[name="phone"]').fill(`7${String(Date.now()).slice(-7)}0`);
    await page.locator('#nin').fill('CF12345678ABCD');
    await page.locator('#district').click();
    await page.locator('#district').fill('Kampala');
    await page.getByRole('option', { name: 'Kampala', exact: true }).click();
    await page.locator('#occupation').selectOption('farmer');
    await page.locator('#password').fill('Demo1234');
    await page.locator('#confirm-password').fill('Demo1234');
    await page.getByRole('button', { name: /^continue$/i }).click();

    // NiraStep with `result==='partial'` renders this heading (NiraStep.jsx:135).
    await expect(
      page.getByRole('heading', { name: /we need to double-check one thing/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test.skip('aml-screen flagged routes to "Your account is under review"', () => {
    // TODO(Phase 9): AmlStep sits behind 5 wizard steps. e2e/helpers/signup.ts
    // is DO-NOT-MODIFY per the 3F brief — a force-aware fork is the next step.
  });

  test.skip('face-match liveness-fail surfaces "Verification paused"', () => {
    // TODO(Phase 9): same reason as the aml-screen skip — LivenessStep needs
    // the force override applied mid-walkthrough by a forked helper.
  });
});
