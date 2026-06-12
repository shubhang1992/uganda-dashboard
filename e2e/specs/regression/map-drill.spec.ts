// Map drill-down regression spec (distributor + admin) — pins audit §7f.
//
// §7f ACTUAL root cause (fixed in commit bc3312f): clicking a region/district
// polygon stopped drilling down because react-leaflet binds each <GeoJSON>
// onEachFeature click handler exactly ONCE per layer. When the GeoJSON paints
// before the entity hooks (useAllEntities) resolve — the geojson fetch and the
// data queries race — that one-time-bound handler captures an EMPTY name→id map.
// Hover still fires (DOM mouseover, no lookup needed), but on click the polygon's
// region/district NAME never resolves to an id, so drillDown(...) is never called
// and the URL never advances. The fix reads the name→id map through an
// always-current ref (regionNameToIdRef.current / districtNameToIdRef.current in
// UgandaMap.jsx) so the click handler sees the resolved entities even though it
// was bound while the map was still empty. (An EARLIER audit pass MISDIAGNOSED
// this as a "stale Leaflet projection / invalidateSize" hit-testing bug — it is
// NOT; the projection is fine, the captured lookup table was the empty one.)
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
// CATCHING A REVERT: because the bug makes the FIRST real click silently no-op
// (empty map → no drillDown), the regression value is asserting that ONE genuine
// click drills. We wait for the polygon to render, then perform a single real
// .click() (no force, no retry loop) and assert the URL advances. If the ref fix
// is reverted, that first click resolves no id and the URL never changes, so the
// waitForURL times out and the test fails — which a re-clicking poll would mask.

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
 * Click a Leaflet polygon ONCE and assert the URL advances to `expectSegment`.
 *
 * The single-click discipline is the whole point of the regression: with the ref
 * fix in place the first genuine click resolves the polygon name → id and drills,
 * so the URL advances. If the bc3312f ref fix is reverted, the click handler holds
 * an empty name→id map, drillDown never fires, and this waitForURL times out — the
 * failure we want. A re-clicking poll would paper over that, so we deliberately do
 * NOT retry the click and do NOT pass force:true (the click must hit-test a real,
 * visible, settled polygon).
 */
async function clickPolygonUntilUrl(
  page: Page,
  expectSegment: 'regions' | 'districts',
  label: string,
): Promise<void> {
  const pathLocator = page.locator(INTERACTIVE_PATH).first();
  // Wait for at least one interactive polygon to render and settle before clicking.
  await expect(pathLocator, `${label}: an interactive polygon should render`).toBeVisible({
    timeout: 20_000,
  });

  // ONE real click — no force, no retry. The drill must happen on the first click.
  await pathLocator.click();

  // Assert the URL advances. If the ref fix is gone, drillDown never runs and this
  // times out (the regression caught), instead of being masked by a re-click loop.
  await page.waitForURL(`**/dashboard/${expectSegment}/**`, { timeout: 15_000 });
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
      // A single real click on a region polygon must advance the URL to
      // /dashboard/regions/<id> — the §7f ref fix has to resolve name → id.
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
