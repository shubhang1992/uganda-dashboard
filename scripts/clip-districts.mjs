/**
 * Clip district polygons to their parent region's land boundary.
 * Removes any district geometry that extends over water (lakes, etc.).
 *
 * Usage: node scripts/clip-districts.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { intersect, multiPolygon, polygon, featureCollection, feature } from '@turf/turf';

const DISTRICTS_PATH = 'public/uganda-districts.geojson';
const REGIONS_PATH = 'public/uganda-regions.geojson';

const districts = JSON.parse(readFileSync(DISTRICTS_PATH, 'utf-8'));
const regions = JSON.parse(readFileSync(REGIONS_PATH, 'utf-8'));

// Build a lookup: region name → turf feature
const regionMap = {};
for (const feat of regions.features) {
  regionMap[feat.properties.name] = feat;
}

let clipped = 0;
let unchanged = 0;
let failed = 0;

const clippedFeatures = [];

for (const dist of districts.features) {
  const regionName = dist.properties.region;
  const regionFeat = regionMap[regionName];

  if (!regionFeat) {
    console.warn(`No region found for district ${dist.properties.name} (region: ${regionName})`);
    clippedFeatures.push(dist);
    failed++;
    continue;
  }

  try {
    const result = intersect(featureCollection([dist, regionFeat]));

    if (result) {
      // Preserve original properties
      result.properties = { ...dist.properties };
      clippedFeatures.push(result);

      // Check if geometry actually changed
      const origCoordCount = JSON.stringify(dist.geometry.coordinates).length;
      const newCoordCount = JSON.stringify(result.geometry.coordinates).length;
      if (Math.abs(origCoordCount - newCoordCount) > 10) {
        clipped++;
        console.log(`  ✂ Clipped: ${dist.properties.name} (${regionName}) — ${origCoordCount} → ${newCoordCount} chars`);
      } else {
        unchanged++;
      }
    } else {
      // Intersection returned null — district is entirely outside region (shouldn't happen)
      console.warn(`  ⚠ No intersection for ${dist.properties.name} — keeping original`);
      clippedFeatures.push(dist);
      failed++;
    }
  } catch (err) {
    console.warn(`  ⚠ Error clipping ${dist.properties.name}: ${err.message} — keeping original`);
    clippedFeatures.push(dist);
    failed++;
  }
}

// Write back
const output = {
  type: 'FeatureCollection',
  features: clippedFeatures,
};

// Backup original
writeFileSync(DISTRICTS_PATH.replace('.geojson', '-original.geojson'), readFileSync(DISTRICTS_PATH));
console.log(`\nBacked up original to ${DISTRICTS_PATH.replace('.geojson', '-original.geojson')}`);

writeFileSync(DISTRICTS_PATH, JSON.stringify(output));
console.log(`Written clipped districts to ${DISTRICTS_PATH}`);
console.log(`\nResults: ${clipped} clipped, ${unchanged} unchanged, ${failed} failed/skipped`);
