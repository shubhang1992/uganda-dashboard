import { memo, useState, useCallback } from 'react';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard } from '../../contexts/DashboardContext';
import { DISTRICTS, BRANCHES, getChildEntities, getEntityById } from '../../data/mockData';
import styles from './UgandaMap.module.css';

const EASE = [0.16, 1, 0.3, 1];
const GEO_URL = '/uganda-topo.json';
const NEXT_LEVEL = { country: 'region', region: 'district', district: 'branch', branch: 'agent' };

// Brand-aligned region colors (indigo palette)
const REGION_FILLS = {
  Central: 'rgba(94, 99, 168, 0.22)',
  Eastern: 'rgba(47, 143, 157, 0.2)',
  Northern: 'rgba(41, 40, 103, 0.18)',
  Western: 'rgba(217, 220, 242, 0.45)',
};

const REGION_FILLS_HOVER = {
  Central: 'rgba(94, 99, 168, 0.35)',
  Eastern: 'rgba(47, 143, 157, 0.32)',
  Northern: 'rgba(41, 40, 103, 0.3)',
  Western: 'rgba(217, 220, 242, 0.6)',
};

const CENTER = [32.3, 1.3];

const REGION_ZOOM = {
  'r-central': { center: [32.2, 0.2], zoom: 3 },
  'r-eastern': { center: [33.8, 1.2], zoom: 2.5 },
  'r-northern': { center: [32.3, 3.0], zoom: 2 },
  'r-western': { center: [30.3, -0.2], zoom: 2.5 },
};

function getStatusColor(rate) {
  if (rate >= 75) return '#2E8B57';
  if (rate >= 50) return '#E6A817';
  return '#DC3545';
}

function MapDot({ coordinates, name, activeRate, size, onClick }) {
  const color = getStatusColor(activeRate);
  return (
    <Marker coordinates={coordinates}>
      <motion.g
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      >
        <motion.circle
          r={size * 3}
          fill={color}
          opacity={0.12}
          animate={{ r: [size * 2.5, size * 3.5, size * 2.5], opacity: [0.12, 0.06, 0.12] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
        <circle r={size * 1.8} fill={color} opacity={0.2} />
        <circle r={size} fill={color} opacity={0.85} />
        <circle r={size * 0.35} fill="white" opacity={0.7} />
      </motion.g>
      <text textAnchor="middle" y={-size - 6} className={styles.dotLabel}>
        {name}
      </text>
    </Marker>
  );
}

function UgandaMap() {
  const { level, selectedIds, drillDown } = useDashboard();
  const [tooltip, setTooltip] = useState(null);
  const nextLevel = NEXT_LEVEL[level];

  const parentId = level === 'country' ? 'ug' : selectedIds[level];
  const children = nextLevel ? getChildEntities(level, parentId) : [];

  // Compute zoom center and level based on drill state
  let zoomCenter = CENTER;
  let zoomLevel = 1;

  if (level === 'region' && selectedIds.region) {
    const cfg = REGION_ZOOM[selectedIds.region];
    if (cfg) { zoomCenter = cfg.center; zoomLevel = cfg.zoom; }
  } else if (level === 'district' && selectedIds.district) {
    const district = DISTRICTS[selectedIds.district];
    if (district) { zoomCenter = district.center; zoomLevel = 5; }
  } else if (level === 'branch' && selectedIds.branch) {
    const branch = BRANCHES[selectedIds.branch];
    if (branch) { zoomCenter = branch.center; zoomLevel = 8; }
  } else if (level === 'agent' && selectedIds.agent) {
    const agent = getEntityById('agent', selectedIds.agent);
    if (agent?.center) { zoomCenter = agent.center; zoomLevel = 10; }
  }

  const handleMouseEnter = useCallback((e, geo) => {
    setTooltip({
      x: e.clientX,
      y: e.clientY,
      name: geo.properties?.name,
      region: geo.properties?.region,
    });
  }, []);

  const handleMouseMove = useCallback((e) => {
    setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
  }, []);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  return (
    <div className={styles.mapContainer}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{
          center: CENTER,
          scale: 5500,
        }}
        className={styles.map}
        width={800}
        height={800}
      >
        <ZoomableGroup
          center={zoomCenter}
          zoom={zoomLevel}
          minZoom={0.8}
          maxZoom={12}
          translateExtent={[[0, -100], [800, 900]]}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const region = geo.properties?.region;
                const fillColor = REGION_FILLS[region] || 'rgba(200, 205, 220, 0.3)';
                const hoverColor = REGION_FILLS_HOVER[region] || 'rgba(41, 40, 103, 0.2)';

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    className={styles.geography}
                    fill={fillColor}
                    style={{
                      default: { outline: 'none', fill: fillColor },
                      hover: { outline: 'none', fill: hoverColor, strokeWidth: 1.2 },
                      pressed: { outline: 'none', fill: hoverColor },
                    }}
                    onMouseEnter={(e) => handleMouseEnter(e, geo)}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                  />
                );
              })
            }
          </Geographies>

          <AnimatePresence>
            {children.map((child) => (
              <MapDot
                key={child.id}
                coordinates={child.center}
                name={child.name}
                activeRate={child.metrics?.activeRate || 80}
                size={level === 'country' ? 4 : level === 'region' ? 3 : 2}
                onClick={nextLevel ? () => drillDown(nextLevel, child.id) : undefined}
              />
            ))}
          </AnimatePresence>
        </ZoomableGroup>
      </ComposableMap>

      {/* Zoom controls */}
      <div className={styles.zoomControls}>
        <button className={styles.zoomBtn} title="Zoom functionality is via scroll wheel & drag">
          <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M9 6.5v5M6.5 9h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {tooltip && (
        <div className={styles.tooltip} style={{ left: tooltip.x, top: tooltip.y }}>
          <span className={styles.tooltipName}>{tooltip.name}</span>
          <span className={styles.tooltipRegion}>{tooltip.region} Region</span>
        </div>
      )}
    </div>
  );
}

export default memo(UgandaMap);
