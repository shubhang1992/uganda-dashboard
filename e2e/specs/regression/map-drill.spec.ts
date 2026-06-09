// Map drill-down regression spec (distributor + admin) — pins audit §7f.
//
// §7f root cause: clicking a region/district polygon stopped drilling down
// because Leaflet's pixel-projection origin goes STALE at the lazy+Suspense map
// mount, so click hit-testing (mouseEventToLayerPoint → _containsPoint) lands OFF
// the GeoJSON polygons — hover still fires (DOM mouseover) but the Leaflet click
// never reaches a polygon, so onRegionClick/onDistrictClick → drillDown(...) never
// runs. The fix is a hardened MapController invalidateSize() pass (raf + a
// deferred setTimeout + whenReady + a ResizeObserver) that re-measures the
// container so the projection is correct before the first interaction.
//
// UgandaMap.jsx is the SINGLE shared map mounted by BOTH DashboardShell
// (distributor) and AdminDashboardShell (admin), so this regression is global to
// every map-theme role — hence we parametrize over both roles here. This spec is
// the "optionally add a regression E2E clicking a known region path asserting the
// URL change" called for in §7f's fix spec step 3.
//
// The drill advances the URL: country (/dashboard) → /dashboard/regions/<id> →
// /dashboard/districts/<id> (LEVEL_TO_SEGMENT is PLURAL — src/constants/levels.js).
//
// PROJECTION-SETTLE NOTE: because the stale-projection window is exactly what
// §7f is about, we DO NOT click immediately on mount. We poll/retry the click
// with a generous timeout so the invalidateSize passes (raf + 250ms + whenReady)
// have settled the projection before the click is hit-tested. A single click on a
// not-yet-settled projection is the precise failure mode this guards.

import { test, expect, type Page } from '@playwright/test';
import { disableAnimations } from '../../fixtures/motion';
import { storageStatePathFor, type Role } from '../../fixtures/auth';
import { selectors } from '../../helpers/selectors';

// Both map-theme roles mount the same UgandaMap; the regression must hold for both.
const MAP_ROLES: Role[] = ['distributor', 'admin'];

// Interactive Leaflet GeoJSON polygons carry `.leaflet-interactive`. The region
// layer renders first (always loaded); the district layer renders after a region
// drill. We click the FIRST interactive path at each level.
const INTERACTIVE_PATH = '.leaflet-interactive';

/**
 * Click a Leaflet polygon and wait for the URL to advance to `expectSegment`,
 * retrying the click across the projection-settle window (§7f). Each attempt
 * re-clicks the first interactive path then polls the URL briefly; the outer
 * expect.poll bounds the whole settle window generously.
 */
async function clickPolygonUntilUrl(
  page: Page,
  expectSegment: 'regions' | 'districts',
  label: string,
): Promise<void> {
  const pathLocator = page.locator(INTERACTIVE_PATH).first();
  // Ensure at least one interactive polygon has rendered before we start.
  await expect(pathLocator, `${label}: an interactive polygon should render`).toBeVisible({
    timeout: 20_000,
  });

  await expect
    .poll(
      async () => {
        // Re-click on each poll tick: if the projection was stale on a prior
        // attempt (click landed off the polygon), a later attempt — after the
        // invalidateSize passes settle — lands on it and drills.
        try {
          await pathLocator.click({ force: true, timeout: 2_000 });
        } catch {
          /* polygon may be mid-reproject; the next tick retries */
        }
        return page.url();
      },
      {
        timeout: 25_000,
        message: `${label}: clicking a polygon should advance the URL to /${expectSegment}/`,
      },
    )
    .toContain(`/dashboard/${expectSegment}/`);
}

for (const role of MAP_ROLES) {
  test.describe(`map drill-down regression — ${role}`, () => {
    test.use({ storageState: storageStatePathFor(role) });
    test.setTimeout(60_000);

    test.beforeEach(async ({ page }) => {
      await disableAnimations(page);
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      // The shell mounted cleanly (no ErrorBoundary) before we touch the map.
      await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
    });

    test('clicking a region then a district drills country → region → district', async ({
      page,
    }) => {
      // Start at country level.
      await expect(page).toHaveURL(/\/dashboard\/?$/);

      // ── Region drill ────────────────────────────────────────────────────────
      // Click a region polygon; the URL must advance to /dashboard/regions/<id>.
      // The retry-poll absorbs the §7f projection-settle window.
      await clickPolygonUntilUrl(page, 'regions', `${role} region`);
      await expect(page).toHaveURL(/\/dashboard\/regions\/[^/]+/);

      // ── District drill ──────────────────────────────────────────────────────
      // The district GeoJSON renders after the region drill; click a district
      // polygon and confirm the URL advances to /dashboard/districts/<id>.
      await clickPolygonUntilUrl(page, 'districts', `${role} district`);
      await expect(page).toHaveURL(/\/dashboard\/districts\/[^/]+/);

      // No crash into the global fallback after the two drills.
      await expect(selectors.errorBoundary.fallback(page)).toHaveCount(0);
    });
  });
}
