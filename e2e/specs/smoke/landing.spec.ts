// Public landing-page smoke. No authentication — fresh session.

import { test, expect } from '@playwright/test';
import { disableAnimations } from '../../fixtures/motion';
import { selectors } from '../../helpers/selectors';

test.describe('landing public routes smoke', () => {
  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
  });

  test('home page renders hero', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Universal Pensions/i);
    await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('FAQ page renders', async ({ page }) => {
    const response = await page.goto('/faq');
    expect(response?.status()).toBe(200);
    await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: /faq|frequently/i })).toBeVisible();
  });

  test('Contact page renders', async ({ page }) => {
    const response = await page.goto('/contact');
    expect(response?.status()).toBe(200);
    await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: /contact|get in touch/i })).toBeVisible();
  });

  test('About page renders', async ({ page }) => {
    const response = await page.goto('/about');
    expect(response?.status()).toBe(200);
    await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: /about/i })).toBeVisible();
  });
});
