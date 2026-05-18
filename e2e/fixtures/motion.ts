// Disable CSS transitions + animations in test mode to remove a common source
// of Playwright flake (framer-motion enter/exit, fade-ins, slide-overs).
//
// Use via:
//   test.beforeEach(async ({ page }) => { await disableAnimations(page); });

import type { Page } from '@playwright/test';

const NO_ANIMATIONS_CSS = `
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    transition-delay: 0ms !important;
    animation-duration: 0.01ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
  }
`;

export async function disableAnimations(page: Page): Promise<void> {
  await page.addInitScript((css) => {
    const inject = () => {
      if (document.head.querySelector('style[data-test-mode="no-animations"]')) return;
      const style = document.createElement('style');
      style.setAttribute('data-test-mode', 'no-animations');
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    };
    if (document.head) inject();
    else document.addEventListener('DOMContentLoaded', inject);
  }, NO_ANIMATIONS_CSS);
}
