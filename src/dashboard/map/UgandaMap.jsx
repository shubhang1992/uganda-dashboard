import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useDashboard } from '../../contexts/DashboardContext';
import { useAllEntities } from '../../hooks/useEntity';
import styles from './UgandaMap.module.css';

// ─── Constants ────────────────────────────────────────────────────────────────
const UGANDA_CENTER = [1.37, 32.3];
const UGANDA_BOUNDS = [[-1.5, 29.55], [4.25, 35.0]];

// Brand palette
const REGION_COLORS = {
  Central: { fill: '#5E63A8', glow: 'rgba(94, 99, 168, 0.35)' },
  Eastern: { fill: '#2F8F9D', glow: 'rgba(47, 143, 157, 0.35)' },
  Northern: { fill: '#3D3C80', glow: 'rgba(61, 60, 128, 0.35)' },
  Western: { fill: '#7B7FC4', glow: 'rgba(123, 127, 196, 0.35)' },
};

// ─── Soft bokeh glow icon — radial gradient halo at region centroids ─────────
function createGlowIcon(color, id, size = 180) {
  const gradId = `rg-${id}`;
  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <radialGradient id="${gradId}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
        <stop offset="30%" stop-color="${color}" stop-opacity="0.15"/>
        <stop offset="70%" stop-color="${color}" stop-opacity="0.04"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="url(#${gradId})" />
  </svg>`;
  return L.divIcon({
    html: svgStr,
    className: styles.glowIcon,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ─── Tile opacity controller ─────────────────────────────────────────────────
function TileOpacityController({ level }) {
  const map = useMap();
  useEffect(() => {
    const opacity = level === 'country' ? 0.2 : 0.08;
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        layer.setOpacity(opacity);
      }
    });
  }, [map, level]);
  return null;
}

// ─── Map controller ──────────────────────────────────────────────────────────
function MapController({ bounds, center, zoom, fitOptions }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      const opts = { padding: [50, 50], maxZoom: 10, duration: 0.8, ...fitOptions };
      map.fitBounds(bounds, opts);
    } else if (center && zoom) {
      map.flyTo(center, zoom, { duration: 0.8 });
    }
  }, [map, bounds, center, zoom, fitOptions]);
  return null;
}

// ─── Main component ──────────────────────────────────────────────────────────
function UgandaMap() {
  const { level, selectedIds, drillDown } = useDashboard();
  const [regionsGeo, setRegionsGeo] = useState(null);
  const [districtsGeo, setDistrictsGeo] = useState(null);
  const [geoError, setGeoError] = useState(null);
  // Entity data via hooks
  const { data: regionsArr = [] } = useAllEntities('region');
  const { data: districtsArr = [] } = useAllEntities('district');
  const { data: branchesArr = [] } = useAllEntities('branch');

  const REGIONS_MAP = useMemo(() => Object.fromEntries(regionsArr.map((r) => [r.id, r])), [regionsArr]);
  const DISTRICTS_MAP = useMemo(() => Object.fromEntries(districtsArr.map((d) => [d.id, d])), [districtsArr]);
  const BRANCHES_MAP = useMemo(() => Object.fromEntries(branchesArr.map((b) => [b.id, b])), [branchesArr]);
  const REGION_NAME_TO_ID = useMemo(() => Object.fromEntries(regionsArr.map((r) => [r.name, r.id])), [regionsArr]);
  const DISTRICT_NAME_TO_ID = useMemo(() => Object.fromEntries(districtsArr.map((d) => [d.name, d.id])), [districtsArr]);

  useEffect(() => {
    fetch('/uganda-regions.geojson')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setRegionsGeo)
      .catch((err) => { console.error('Failed to load regions GeoJSON:', err); setGeoError(err); });
    fetch('/uganda-districts.geojson')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setDistrictsGeo)
      .catch((err) => { console.error('Failed to load districts GeoJSON:', err); setGeoError(err); });
  }, []);

  const selectedRegionId = selectedIds.region;
  const selectedDistrictId = selectedIds.district;
  const selectedRegion = selectedRegionId ? REGIONS_MAP[selectedRegionId] : null;
  const selectedDistrict = selectedDistrictId ? DISTRICTS_MAP[selectedDistrictId] : null;

  const regionDistricts = useMemo(() => {
    if (!districtsGeo || !selectedRegion) return null;
    return {
      ...districtsGeo,
      features: districtsGeo.features.filter(
        (f) => f.properties.region === selectedRegion.name
      ),
    };
  }, [districtsGeo, selectedRegion]);

  const selectedDistrictGeo = useMemo(() => {
    if (!districtsGeo || !selectedDistrict) return null;
    const feat = districtsGeo.features.find(
      (f) => f.properties.name === selectedDistrict.name
    );
    if (!feat) return null;
    return { type: 'FeatureCollection', features: [feat] };
  }, [districtsGeo, selectedDistrict]);


  const mapView = useMemo(() => {
    // At branch/agent level, stay at district zoom — slide-in panel shows the data
    if ((level === 'branch' || level === 'agent') && selectedDistrict) {
      return { center: [selectedDistrict.center[1], selectedDistrict.center[0]], zoom: 10 };
    }
    if (level === 'district' && selectedDistrict) {
      return { center: [selectedDistrict.center[1], selectedDistrict.center[0]], zoom: 10 };
    }
    if (level === 'region' && selectedRegion) {
      if (regionDistricts && regionDistricts.features.length > 0) {
        const layer = L.geoJSON(regionDistricts);
        return { bounds: layer.getBounds() };
      }
      return { center: [selectedRegion.center[1], selectedRegion.center[0]], zoom: 8 };
    }
    return { bounds: UGANDA_BOUNDS, fitOptions: { paddingTopLeft: [340, 30], paddingBottomRight: [30, 60] } };
  }, [level, selectedRegion, selectedDistrict, regionDistricts]);

  // ─── Style functions ─────────────────────────────────────────────────────────

  // Base country fill — bright white land mass, strong contrast vs gray background
  const baseCountryStyle = useMemo(() => ({
    fillColor: '#f2f3f7',
    fillOpacity: 1,
    color: '#d0d3de',
    weight: 0.6,
    opacity: 0.5,
  }), []);

  // Region overlays — very subtle tints, glow dots provide the color
  const regionOverlayStyle = useCallback((feature) => {
    const name = feature.properties.name;
    const colors = REGION_COLORS[name] || { fill: '#5E63A8', glow: 'rgba(94,99,168,0.35)' };

    if (level === 'country') {
      return {
        fillColor: colors.fill,
        fillOpacity: 0.08,
        color: '#c8cad6',
        weight: 0.6,
        opacity: 0.4,
      };
    }

    const isSelected = selectedRegion && selectedRegion.name === name;
    return {
      fillColor: colors.fill,
      fillOpacity: isSelected ? 0.1 : 0.03,
      color: '#c8cad6',
      weight: isSelected ? 0.6 : 0.3,
      opacity: isSelected ? 0.4 : 0.15,
    };
  }, [level, selectedRegion]);

  const districtStyle = useCallback((feature) => {
    const name = feature.properties.name;
    const region = feature.properties.region;
    const colors = REGION_COLORS[region] || { fill: '#5E63A8', glow: 'rgba(94,99,168,0.35)' };
    const isSelected = selectedDistrict && selectedDistrict.name === name;

    // No fill — outlines only. Prevents district polygons from showing color over water.
    // The region overlay layer handles the area coloring.
    return {
      fillColor: 'transparent',
      fillOpacity: 0,
      color: isSelected ? colors.fill : '#a0a5bc',
      weight: isSelected ? 1.5 : 0.5,
      opacity: isSelected ? 0.5 : 0.3,
    };
  }, [selectedDistrict]);

  const selectedDistrictStyle = useCallback(() => ({
    fillColor: '#5E63A8',
    fillOpacity: 0.1,
    color: '#292867',
    weight: 2,
    opacity: 0.6,
  }), []);

  // ─── Hover — glow effect + fill brightening ──────────────────────────────────
  const highlightRegion = useCallback((e) => {
    const layer = e.target;
    const name = layer.feature.properties.name;
    const colors = REGION_COLORS[name] || { fill: '#5E63A8', glow: 'rgba(94,99,168,0.35)' };
    layer.setStyle({
      fillOpacity: 0.25,
      color: colors.fill,
      weight: 1.2,
      opacity: 0.4,
    });
    const el = layer.getElement();
    if (el) {
      el.style.filter = `drop-shadow(0 0 10px ${colors.glow})`;
    }
    layer.bringToFront();
  }, []);

  const highlightDistrict = useCallback((e) => {
    const layer = e.target;
    const region = layer.feature.properties.region;
    const colors = REGION_COLORS[region] || { fill: '#5E63A8', glow: 'rgba(94,99,168,0.35)' };
    layer.setStyle({
      fillColor: colors.fill,
      fillOpacity: 0.12,
      color: colors.fill,
      weight: 1.2,
      opacity: 0.5,
    });
    const el = layer.getElement();
    if (el) {
      el.style.filter = `drop-shadow(0 0 8px ${colors.glow})`;
    }
    layer.bringToFront();
  }, []);

  const resetHighlight = useCallback((e, styleFunc) => {
    const layer = e.target;
    layer.setStyle(styleFunc(layer.feature));
    const el = layer.getElement();
    if (el) {
      el.style.filter = '';
    }
  }, []);

  // ─── Event handlers ──────────────────────────────────────────────────────────
  const onRegionClick = useCallback((e) => {
    const name = e.target.feature.properties.name;
    const regionId = REGION_NAME_TO_ID[name];
    if (regionId) drillDown('region', regionId);
  }, [drillDown, REGION_NAME_TO_ID]);

  const onDistrictClick = useCallback((e) => {
    const name = e.target.feature.properties.name;
    const districtId = DISTRICT_NAME_TO_ID[name];
    if (districtId) drillDown('district', districtId);
  }, [drillDown, DISTRICT_NAME_TO_ID]);

  const onEachRegion = useCallback((feature, layer) => {
    layer.on({
      click: onRegionClick,
      mouseover: highlightRegion,
      mouseout: (e) => resetHighlight(e, regionOverlayStyle),
    });
    layer.bindTooltip(feature.properties.name, {
      sticky: true,
      className: styles.mapTooltip,
      direction: 'top',
      offset: [0, -10],
    });
  }, [onRegionClick, highlightRegion, resetHighlight, regionOverlayStyle]);

  const onEachDistrict = useCallback((feature, layer) => {
    layer.on({
      click: onDistrictClick,
      mouseover: highlightDistrict,
      mouseout: (e) => resetHighlight(e, districtStyle),
    });
    layer.bindTooltip(
      `<strong>${feature.properties.name}</strong><br/><span style="opacity:0.6">${feature.properties.region}</span>`,
      {
        sticky: true,
        className: styles.mapTooltip,
        direction: 'top',
        offset: [0, -10],
      }
    );
  }, [onDistrictClick, highlightDistrict, resetHighlight, districtStyle]);

  const regionKey = useMemo(
    () => `regions-${level}-${selectedRegionId || 'none'}`,
    [level, selectedRegionId]
  );
  const districtKey = useMemo(
    () => `districts-${selectedRegionId}-${selectedDistrictId || 'none'}`,
    [selectedRegionId, selectedDistrictId]
  );

  if (geoError && !regionsGeo && !districtsGeo) {
    return (
      <div className={styles.mapContainer} data-level={level}>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
          background: 'var(--map-bg)', color: 'var(--color-gray)', fontFamily: 'var(--font-body)',
        }}>
          <svg viewBox="0 0 24 24" fill="none" width="32" height="32">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
            <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
          <p style={{ fontSize: 'var(--text-sm)', margin: 0 }}>Map data could not be loaded</p>
          <button
            onClick={() => { setGeoError(null); window.location.reload(); }}
            style={{
              background: 'var(--color-indigo)', color: 'white', border: 'none',
              borderRadius: 'var(--radius-full)', padding: '0.5rem 1.25rem',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-xs)',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.mapContainer} data-level={level}>
      <MapContainer
        center={UGANDA_CENTER}
        zoom={7.5}
        className={styles.map}
        zoomControl={false}
        attributionControl={false}
        minZoom={6}
        maxZoom={16}
        maxBounds={[[-3, 28], [6, 37]]}
        maxBoundsViscosity={0.8}
        zoomDelta={0.5}
        zoomSnap={0.5}
        wheelPxPerZoomLevel={120}
      >
        {/* Tile layer — CartoDB Positron, very reduced */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          opacity={0.2}
        />

        <TileOpacityController level={level} />

        <MapController
          bounds={mapView.bounds}
          center={mapView.center}
          zoom={mapView.zoom}
          fitOptions={mapView.fitOptions}
        />

        {/* Layer 1: Base country fill — bright white land, covers water */}
        {regionsGeo && (
          <GeoJSON
            key="country-base"
            data={regionsGeo}
            style={() => baseCountryStyle}
            interactive={false}
          />
        )}

        {/* Layer 1b: Faint district outlines — adds geographic detail at country level */}
        {districtsGeo && level === 'country' && (
          <GeoJSON
            key="districts-bg"
            data={districtsGeo}
            style={() => ({
              fillColor: 'transparent',
              fillOpacity: 0,
              color: '#b0b5c8',
              weight: 0.3,
              opacity: 0.35,
            })}
            interactive={false}
          />
        )}

        {/* Layer 2: Colored region overlays — always visible for context */}
        {regionsGeo && (
          <GeoJSON
            key={regionKey}
            data={regionsGeo}
            style={regionOverlayStyle}
            {...(level === 'country' ? { onEachFeature: onEachRegion } : {})}
          />
        )}

        {/* Layer 3: Soft bokeh glow halos at region centroids — country level */}
        {level === 'country' && regionsArr.map((r) => {
          const colors = REGION_COLORS[r.name];
          if (!colors) return null;
          return (
            <Marker
              key={`glow-${r.id}`}
              position={[r.center[1], r.center[0]]}
              icon={createGlowIcon(colors.fill, r.id, 180)}
              interactive={false}
            />
          );
        })}

        {/* Layer 4: District boundaries — shown at region level */}
        {regionDistricts && level === 'region' && (
          <GeoJSON
            key={districtKey}
            data={regionDistricts}
            style={districtStyle}
            onEachFeature={onEachDistrict}
          />
        )}

        {/* Layer 5: Selected district highlight */}
        {selectedDistrictGeo && (level === 'district' || level === 'branch') && (
          <GeoJSON
            key={`selected-${selectedDistrictId}`}
            data={selectedDistrictGeo}
            style={selectedDistrictStyle}
          />
        )}

      </MapContainer>
    </div>
  );
}

export default memo(UgandaMap);
